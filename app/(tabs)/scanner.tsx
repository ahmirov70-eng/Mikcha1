import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  FlatList,
  Alert,
  Modal,
  ScrollView,
  TextInput,
  Animated,
  Dimensions,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import {
  ScanBarcode,
  Trash2,
  Plus,
  Minus,
  CreditCard,
  Banknote,
  Send,
  CheckCircle,
  X,
  ShoppingBag,
  Package,
  Search,
  AlertTriangle,
  ChevronDown,
  Camera,
  Sparkles,
  Check,
} from 'lucide-react-native';
import { storeManager, CATEGORIES, formatCurrency, initSupabaseRealtime } from '../../lib/mockData';
import { isSupabaseConfigured } from '../../lib/supabase';
import { Product, CartItem, PaymentMethod } from '../../types/database';
import { playScanBeepSound, playErrorSound, playSuccessSound } from '../../lib/sound';
import { lookupProductByBarcode, extractGtinFromDataMatrix } from '../../lib/barcodeLookup';
import { PageLockGuard } from '../../lib/PageLockGuard';

const CAMERA_HEIGHT = 270;
const SCAN_DELAY_MS = 1500; // 1.5 second delay between scans

export default function ScannerScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isScanning, setIsScanning] = useState(true);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [products, setProducts] = useState<Product[]>(storeManager.getProducts());
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<PaymentMethod>('cash');
  const [isSuccessModalOpen, setIsSuccessModalOpen] = useState(false);
  const [lastTotal, setLastTotal] = useState(0);
  const [scanToast, setScanToast] = useState<{ name: string; price: number } | null>(null);

  // Manual Catalog Picker Modal
  const [isCatalogModalOpen, setIsCatalogModalOpen] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogCategory, setCatalogCategory] = useState('Все');

  // Slide-down animation for camera panel & screen fade
  const slideAnim = useRef(new Animated.Value(-CAMERA_HEIGHT)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const refreshProducts = useCallback(() => {
    setProducts(storeManager.getProducts());
    storeManager.syncProductsFromSupabase();
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshProducts();
    }, [refreshProducts])
  );

  // Subscribe to warehouse stock changes in real time
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();

    refreshProducts();
    if (isSupabaseConfigured) {
      initSupabaseRealtime();
    }
    const unsubscribe = storeManager.subscribe(() => {
      setProducts(storeManager.getProducts());
    });
    return () => unsubscribe();
  }, [refreshProducts]);

  const openCamera = () => {
    if (!permission?.granted) {
      requestPermission();
      return;
    }
    setIsScanning(true);
    setIsCameraOpen(true);
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();
  };

  const closeCamera = () => {
    Animated.timing(slideAnim, {
      toValue: -CAMERA_HEIGHT,
      duration: 280,
      useNativeDriver: true,
    }).start(() => {
      setIsCameraOpen(false);
    });
  };

  // Get how many of a product are already in the cart
  const getCartQty = (productId: string): number => {
    const item = cart.find((c) => c.product.id === productId);
    return item ? item.quantity : 0;
  };

  // Get available stock (warehouse stock minus what's already in cart)
  const getAvailableStock = (product: Product): number => {
    const live = products.find((p) => p.id === product.id);
    const stock = live ? live.stock_quantity : product.stock_quantity;
    return stock - getCartQty(product.id);
  };

  // Handle scanned barcode with continuous auto-recognition (Scanner stays open)
  const handleBarcodeScanned = async (barcodeValue: string) => {
    if (!isScanning) return;
    setIsScanning(false);
    playScanBeepSound();

    const gtin = extractGtinFromDataMatrix(barcodeValue);
    const targetCode = gtin || barcodeValue.trim();
    const foundProduct = storeManager.findProductByBarcode(barcodeValue);

    if (foundProduct) {
      addToCart(foundProduct);
      setScanToast({ name: foundProduct.name, price: foundProduct.price });
      setTimeout(() => setScanToast(null), 2400);
      // 1.5s Cooldown to scan next item without closing camera
      setTimeout(() => setIsScanning(true), SCAN_DELAY_MS);
    } else {
      try {
        const recognized = await lookupProductByBarcode(barcodeValue);
        const codeToSave = recognized.rawBarcode || targetCode;

        Alert.alert(
          'Товар распознан! ✨',
          `«${recognized.name}»\n\nШтрих-код: ${codeToSave}\nКатегория: ${recognized.category}\nЦена: ${formatCurrency(recognized.price)}\n\nТовар еще не заведен на складе. Добавить его на склад (+10 ${recognized.unit}) и сразу в чек?`,
          [
            {
              text: 'Отмена',
              style: 'cancel',
              onPress: () => setTimeout(() => setIsScanning(true), SCAN_DELAY_MS),
            },
            {
              text: 'Добавить и в чек',
              onPress: async () => {
                const newProduct = await storeManager.addProduct({
                  name: recognized.name,
                  price: recognized.price,
                  purchase_price: recognized.purchasePrice,
                  stock_quantity: 10,
                  barcode: codeToSave,
                  category: recognized.category,
                  unit: recognized.unit,
                });
                addToCart(newProduct);
                setScanToast({ name: newProduct.name, price: newProduct.price });
                setTimeout(() => setScanToast(null), 2400);
                setTimeout(() => setIsScanning(true), SCAN_DELAY_MS);
              },
            },
          ]
        );
      } catch {
        Alert.alert(
          'Товар не найден',
          `Товар со штрих-кодом "${targetCode}" отсутствует на складе.`,
          [{ text: 'OK', onPress: () => setTimeout(() => setIsScanning(true), SCAN_DELAY_MS) }]
        );
        playErrorSound();
      }
    }
  };

  const addToCart = (product: Product) => {
    const available = getAvailableStock(product);

    if (available <= 0) {
      playErrorSound();
      const liveProduct = products.find((p) => p.id === product.id);
      const stock = liveProduct ? liveProduct.stock_quantity : 0;
      if (stock <= 0) {
        Alert.alert('Нет на складе', `Товар "${product.name}" отсутствует на складе.`);
      } else {
        Alert.alert(
          'Достигнут лимит',
          `Вы уже добавили все доступные ${stock} ${product.unit} товара "${product.name}".`
        );
      }
      setIsScanning(true);
      return;
    }

    setCart((prevCart) => {
      const existingIdx = prevCart.findIndex((item) => item.product.id === product.id);
      if (existingIdx >= 0) {
        const updated = [...prevCart];
        const newQty = updated[existingIdx].quantity + 1;
        updated[existingIdx] = {
          ...updated[existingIdx],
          quantity: newQty,
          subtotal: newQty * product.price,
        };
        return updated;
      } else {
        return [...prevCart, { product, quantity: 1, subtotal: product.price }];
      }
    });

    setTimeout(() => setIsScanning(true), SCAN_DELAY_MS);
  };

  const updateCartQuantity = (productId: string, delta: number) => {
    setCart((prevCart) =>
      prevCart
        .map((item) => {
          if (item.product.id === productId) {
            const newQty = item.quantity + delta;
            if (newQty <= 0) return null;
            if (delta > 0) {
              const liveProduct = products.find((p) => p.id === productId);
              const stockQty = liveProduct ? liveProduct.stock_quantity : item.product.stock_quantity;
              if (newQty > stockQty) {
                playErrorSound();
                Alert.alert(
                  'Нет на складе',
                  `На складе всего ${stockQty} ${item.product.unit} товара "${item.product.name}".`
                );
                return item;
              }
              playScanBeepSound();
            }
            return { ...item, quantity: newQty, subtotal: newQty * item.product.price };
          }
          return item;
        })
        .filter(Boolean) as CartItem[]
    );
  };

  const removeFromCart = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.product.id !== productId));
  };

  const cartTotal = cart.reduce((sum, item) => sum + item.subtotal, 0);

  const handleCompletePayment = () => {
    if (cart.length === 0) return;
    playSuccessSound();
    setLastTotal(cartTotal);
    storeManager.processCheckout(cart, selectedPayment);
    setIsPaymentModalOpen(false);
    setCart([]);
    setIsSuccessModalOpen(true);
  };

  const filteredCatalog = products.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(catalogSearch.toLowerCase()) ||
      p.barcode.includes(catalogSearch);
    const matchesCat = catalogCategory === 'Все' || p.category === catalogCategory;
    return matchesSearch && matchesCat;
  });

  return (
    <PageLockGuard pageId="scanner" pageName="Касса">
      <Animated.View style={[styles.container, { opacity: fadeAnim }]}>

      {/* ── Slide-down Camera Panel (Stays open during scanning) ── */}
      {isCameraOpen && (
        <Animated.View
          style={[styles.cameraPanel, { transform: [{ translateY: slideAnim }] }]}
        >
          {permission?.granted ? (
            <>
              <CameraView
                style={styles.camera}
                facing="back"
                onBarcodeScanned={({ data }) => isScanning && handleBarcodeScanned(data)}
              />
              {/* Overlay with frame, live toast, and test chips */}
              <View style={styles.cameraOverlay}>
                <View style={styles.scanFrame}>
                  <ScanBarcode size={30} color="#10B981" />
                  <Text style={styles.scanFrameHint}>Наведите на штрих-код или QR</Text>
                </View>

                {/* Live Scan Notification Toast */}
                {scanToast && (
                  <View style={styles.liveScanToast}>
                    <Sparkles size={16} color="#10B981" />
                    <Text style={styles.liveScanToastText} numberOfLines={1}>
                      +1 {scanToast.name} ({formatCurrency(scanToast.price)})
                    </Text>
                  </View>
                )}

                {/* Quick Barcode Simulator Chips */}
                <View style={styles.scannerChipsRow}>
                  <TouchableOpacity
                    style={[styles.scannerChip, { backgroundColor: '#1D4ED8' }]}
                    onPress={() => handleBarcodeScanned('4823063100025')}
                  >
                    <Text style={styles.scannerChipText}>Pepsi 1.5L</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.scannerChip, { backgroundColor: '#DC2626' }]}
                    onPress={() => handleBarcodeScanned('5449000000996')}
                  >
                    <Text style={styles.scannerChipText}>Coca-Cola</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.scannerChip, { backgroundColor: '#059669' }]}
                    onPress={() => handleBarcodeScanned('4015600807534')}
                  >
                    <Text style={styles.scannerChipText}>Fairy</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </>
          ) : (
            <View style={styles.noPermView}>
              <ScanBarcode size={36} color="#9CA3AF" />
              <Text style={styles.noPermText}>Нет доступа к камере</Text>
              <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
                <Text style={styles.permBtnText}>Разрешить камеру</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Close Camera Button */}
          <TouchableOpacity style={styles.closeCameraBtn} onPress={closeCamera}>
            <ChevronDown size={18} color="#FFFFFF" />
            <Text style={styles.closeCameraBtnText}>Свернуть сканер</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* ── Main Cashier Content ── */}
      <View style={[styles.cartSection, isCameraOpen && { marginTop: CAMERA_HEIGHT }]}>

        {/* Header with Quick Scan Button & Clear */}
        <View style={styles.cartHeader}>
          <View style={styles.cartTitleRow}>
            <ShoppingBag size={20} color="#059669" />
            <Text style={styles.cartTitle}>Чек ({cart.length} поз.)</Text>
            <View style={styles.badgeLiveCashier}>
              <View style={styles.dotLive} />
              <Text style={styles.badgeLiveText}>
                {isSupabaseConfigured ? 'REALTIME' : 'ОФЛАЙН'}
              </Text>
            </View>
          </View>
          <View style={styles.headerActions}>
            {cart.length > 0 && (
              <TouchableOpacity onPress={() => setCart([])} style={styles.clearBtn}>
                <Text style={styles.clearCartText}>Очистить</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.headerScanToggle, isCameraOpen && styles.headerScanToggleActive]}
              onPress={isCameraOpen ? closeCamera : openCamera}
            >
              <Camera size={16} color={isCameraOpen ? '#FFFFFF' : '#059669'} />
              <Text style={[styles.headerScanToggleText, isCameraOpen && { color: '#FFFFFF' }]}>
                {isCameraOpen ? 'Скрыть камеру' : 'Сканер'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Cart Items */}
        <FlatList
          data={cart}
          keyExtractor={(item) => item.product.id}
          contentContainerStyle={styles.cartList}
          ListEmptyComponent={
            <View style={styles.emptyCart}>
              <ScanBarcode size={52} color="#E5E7EB" />
              <Text style={styles.emptyCartText}>Корзина пуста</Text>
              <Text style={styles.emptyCartSub}>
                Нажмите «Сканировать» или «Каталог» в правом нижнем углу
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const liveProduct = products.find((p) => p.id === item.product.id);
            const stockQty = liveProduct ? liveProduct.stock_quantity : item.product.stock_quantity;
            const atMaxStock = item.quantity >= stockQty;

            return (
              <View style={styles.cartItemRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cartItemName}>{item.product.name}</Text>
                  <View style={styles.cartItemMeta}>
                    <Text style={styles.cartItemPrice}>
                      {formatCurrency(item.product.price)} × {item.quantity} {item.product.unit}
                    </Text>
                    {atMaxStock && (
                      <View style={styles.stockLimitBadge}>
                        <AlertTriangle size={10} color="#D97706" />
                        <Text style={styles.stockLimitText}>макс. {stockQty}</Text>
                      </View>
                    )}
                  </View>
                </View>

                <View style={styles.cartQtyControls}>
                  <TouchableOpacity
                    style={styles.qtyBtn}
                    onPress={() => updateCartQuantity(item.product.id, -1)}
                  >
                    <Minus size={14} color="#374151" />
                  </TouchableOpacity>
                  <Text style={styles.cartQtyText}>{item.quantity}</Text>
                  <TouchableOpacity
                    style={[styles.qtyBtn, atMaxStock && styles.qtyBtnDisabled]}
                    disabled={atMaxStock}
                    onPress={() => updateCartQuantity(item.product.id, 1)}
                  >
                    <Plus size={14} color={atMaxStock ? '#D1D5DB' : '#374151'} />
                  </TouchableOpacity>
                </View>

                <Text style={styles.cartItemSubtotal}>{formatCurrency(item.subtotal)}</Text>

                <TouchableOpacity style={styles.deleteBtn} onPress={() => removeFromCart(item.product.id)}>
                  <Trash2 size={16} color="#EF4444" />
                </TouchableOpacity>
              </View>
            );
          }}
        />

        {/* ── Floating Action Buttons (Round, In one line, Bottom Right) ── */}
        <View style={styles.floatingButtonsGroup}>
          <TouchableOpacity
            style={styles.floatingCatalogBtn}
            onPress={() => setIsCatalogModalOpen(true)}
            activeOpacity={0.8}
          >
            <Package size={24} color="#2563EB" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.floatingScanBtn}
            onPress={isCameraOpen ? closeCamera : openCamera}
            activeOpacity={0.8}
          >
            <ScanBarcode size={26} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <View style={styles.cartFooter}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Итого:</Text>
            <Text style={styles.totalAmount}>{formatCurrency(cartTotal)}</Text>
          </View>
          <TouchableOpacity
            style={[styles.payBtn, cart.length === 0 && styles.payBtnDisabled]}
            disabled={cart.length === 0}
            onPress={() => setIsPaymentModalOpen(true)}
          >
            <Text style={styles.payBtnText}>
              {cart.length === 0 ? 'Добавьте товары в чек' : `Оплатить — ${formatCurrency(cartTotal)}`}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Catalog Modal ── */}
      <Modal visible={isCatalogModalOpen} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '90%' }]}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Package size={22} color="#2563EB" />
                <Text style={styles.modalTitle}>Выберите товар в чек</Text>
              </View>
              <TouchableOpacity onPress={() => setIsCatalogModalOpen(false)}>
                <X size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <View style={styles.searchBar}>
              <Search size={18} color="#9CA3AF" />
              <TextInput
                style={styles.searchInput}
                placeholder="Поиск товара..."
                value={catalogSearch}
                onChangeText={setCatalogSearch}
              />
            </View>

            <View style={{ marginVertical: 10 }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                {CATEGORIES.map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.catChip, catalogCategory === cat && styles.catChipActive]}
                    onPress={() => setCatalogCategory(cat)}
                  >
                    <Text style={[styles.catChipText, catalogCategory === cat && styles.catChipTextActive]}>
                      {cat}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            <FlatList
              data={filteredCatalog}
              keyExtractor={(item) => item.id}
              contentContainerStyle={{ gap: 8, paddingVertical: 8 }}
              renderItem={({ item }) => {
                const availableStock = getAvailableStock(item);
                const isUnavailable = availableStock <= 0;

                return (
                  <TouchableOpacity
                    style={[styles.catalogItemCard, isUnavailable && styles.catalogItemDisabled]}
                    disabled={isUnavailable}
                    onPress={() => {
                      addToCart(item);
                      setIsCatalogModalOpen(false);
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.catalogItemName, isUnavailable && { color: '#9CA3AF' }]}>
                        {item.name}
                      </Text>
                      <Text style={styles.catalogItemSub}>
                        {item.category} • Доступно: {availableStock} из {item.stock_quantity} {item.unit}
                      </Text>
                    </View>
                    <Text style={[styles.catalogItemPrice, isUnavailable && { color: '#9CA3AF' }]}>
                      {formatCurrency(item.price)}
                    </Text>
                    {isUnavailable ? (
                      <View style={styles.outOfStockBadge}>
                        <Text style={styles.outOfStockText}>Нет</Text>
                      </View>
                    ) : (
                      <View style={styles.addIconBg}>
                        <Plus size={16} color="#FFFFFF" />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        </View>
      </Modal>

      {/* ── Payment Modal ── */}
      <Modal visible={isPaymentModalOpen} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Способ оплаты</Text>
              <TouchableOpacity onPress={() => setIsPaymentModalOpen(false)}>
                <X size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <Text style={styles.checkoutLabel}>Сумма чека:</Text>
            <Text style={styles.checkoutTotal}>{formatCurrency(cartTotal)}</Text>

            <View style={styles.paymentOptions}>
              {[
                { key: 'cash', label: 'Наличными', icon: <Banknote size={24} color={selectedPayment === 'cash' ? '#059669' : '#6B7280'} /> },
                { key: 'card', label: 'Humo / Uzcard', icon: <CreditCard size={24} color={selectedPayment === 'card' ? '#059669' : '#6B7280'} /> },
                { key: 'transfer', label: 'Click / Payme', icon: <Send size={24} color={selectedPayment === 'transfer' ? '#059669' : '#6B7280'} /> },
              ].map((opt) => (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.paymentOption, selectedPayment === opt.key && styles.paymentOptionActive]}
                  onPress={() => setSelectedPayment(opt.key as PaymentMethod)}
                >
                  {opt.icon}
                  <Text style={styles.paymentOptionText}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={styles.confirmPayBtn} onPress={handleCompletePayment}>
              <CheckCircle size={20} color="#FFFFFF" />
              <Text style={styles.confirmPayText}>Завершить продажу</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Success Modal ── */}
      <Modal visible={isSuccessModalOpen} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { alignItems: 'center', paddingVertical: 36 }]}>
            <CheckCircle size={68} color="#10B981" />
            <Text style={styles.successTitle}>Оплата прошла! 🎉</Text>
            <Text style={styles.successSub}>
              Продажа на {formatCurrency(lastTotal)} проведена. Остатки склада обновлены.
            </Text>
            <TouchableOpacity
              style={styles.successCloseBtn}
              onPress={() => setIsSuccessModalOpen(false)}
            >
              <Text style={styles.successCloseText}>Следующий покупатель</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </Animated.View>
    </PageLockGuard>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },

  // ── Camera Slide Panel ──
  cameraPanel: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: CAMERA_HEIGHT,
    zIndex: 100,
    backgroundColor: '#111827',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 20,
  },
  camera: {
    flex: 1,
  },
  cameraOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 40,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanFrame: {
    width: 200,
    height: 110,
    borderWidth: 2,
    borderColor: '#10B981',
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(16,185,129,0.05)',
  },
  scanFrameHint: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '500',
    marginTop: 6,
  },
  scannerChipsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  scannerChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  scannerChipText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: 'bold',
  },
  noPermView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1F2937',
    gap: 10,
  },
  noPermText: {
    color: '#9CA3AF',
    fontSize: 14,
    fontWeight: '600',
  },
  permBtn: {
    backgroundColor: '#059669',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  permBtnText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 13,
  },
  closeCameraBtn: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 40,
    backgroundColor: 'rgba(0,0,0,0.6)',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  closeCameraBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 'bold',
  },

  // ── Cart / Main Screen ──
  cartSection: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  cartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    backgroundColor: '#FFFFFF',
  },
  cartTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cartTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#111827',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  clearBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#FEE2E2',
  },
  clearCartText: {
    fontSize: 12,
    color: '#DC2626',
    fontWeight: 'bold',
  },
  liveScanToast: {
    position: 'absolute',
    top: 10,
    backgroundColor: '#064E3B',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: '#10B981',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 8,
    maxWidth: '90%',
  },
  liveScanToastText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 'bold',
  },
  headerScanToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  headerScanToggleActive: {
    backgroundColor: '#059669',
    borderColor: '#059669',
  },
  headerScanToggleText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#059669',
  },
  floatingButtonsGroup: {
    position: 'absolute',
    bottom: 120,
    right: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    zIndex: 90,
  },
  floatingCatalogBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#BFDBFE',
    shadowColor: '#1D4ED8',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 6,
  },
  floatingScanBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#059669',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.38,
    shadowRadius: 8,
    elevation: 8,
  },

  // ── Cart List ──
  cartList: {
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 110,
    gap: 6,
  },
  emptyCart: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 8,
  },
  emptyCartText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#9CA3AF',
  },
  emptyCartSub: {
    fontSize: 13,
    color: '#D1D5DB',
    textAlign: 'center',
    paddingHorizontal: 30,
  },
  cartItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F9FAFB',
  },
  cartItemName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  cartItemMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  cartItemPrice: {
    fontSize: 12,
    color: '#6B7280',
  },
  stockLimitBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 6,
  },
  stockLimitText: {
    fontSize: 10,
    color: '#B45309',
    fontWeight: 'bold',
  },
  cartQtyControls: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    paddingHorizontal: 2,
    marginHorizontal: 8,
  },
  qtyBtn: {
    width: 30,
    height: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  qtyBtnDisabled: {
    opacity: 0.3,
  },
  cartQtyText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#111827',
    paddingHorizontal: 8,
    minWidth: 28,
    textAlign: 'center',
  },
  cartItemSubtotal: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#059669',
    minWidth: 80,
    textAlign: 'right',
  },
  deleteBtn: {
    padding: 6,
    marginLeft: 4,
  },

  // ── Footer ──
  cartFooter: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  totalLabel: {
    fontSize: 15,
    color: '#4B5563',
    fontWeight: '500',
  },
  totalAmount: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#059669',
  },
  payBtn: {
    backgroundColor: '#059669',
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: 'center',
  },
  payBtnDisabled: {
    backgroundColor: '#D1D5DB',
  },
  payBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },

  // ── Modals ──
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#111827',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 42,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#111827',
  },
  catChip: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  catChipActive: {
    backgroundColor: '#2563EB',
  },
  catChipText: {
    fontSize: 12,
    color: '#4B5563',
  },
  catChipTextActive: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  catalogItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  catalogItemDisabled: {
    opacity: 0.6,
    backgroundColor: '#F3F4F6',
  },
  catalogItemName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  catalogItemSub: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  catalogItemPrice: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#059669',
    marginRight: 10,
  },
  addIconBg: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#059669',
    justifyContent: 'center',
    alignItems: 'center',
  },
  outOfStockBadge: {
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  outOfStockText: {
    color: '#DC2626',
    fontSize: 11,
    fontWeight: 'bold',
  },
  checkoutLabel: {
    fontSize: 13,
    color: '#6B7280',
  },
  checkoutTotal: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#059669',
    marginBottom: 20,
  },
  paymentOptions: {
    gap: 10,
    marginBottom: 20,
  },
  paymentOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
  },
  paymentOptionActive: {
    borderColor: '#059669',
    backgroundColor: '#ECFDF5',
  },
  paymentOptionText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1F2937',
  },
  confirmPayBtn: {
    backgroundColor: '#059669',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  confirmPayText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  successTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#111827',
    marginTop: 16,
  },
  successSub: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 20,
  },
  successCloseBtn: {
    backgroundColor: '#059669',
    paddingHorizontal: 28,
    paddingVertical: 13,
    borderRadius: 14,
    marginTop: 24,
  },
  successCloseText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
  badgeLiveCashier: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    gap: 5,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    marginLeft: 4,
  },
  dotLive: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#059669',
  },
  badgeLiveText: {
    color: '#059669',
    fontSize: 10,
    fontWeight: 'bold',
  },
});
