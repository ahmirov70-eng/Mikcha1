import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TextInput,
  TouchableOpacity,
  Modal,
  Alert,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Image,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import {
  Search,
  Plus,
  Package,
  ScanBarcode,
  X,
  Check,
  Tag,
  DollarSign,
  Sparkles,
  ImageIcon,
} from 'lucide-react-native';
import { storeManager, CATEGORIES, UNITS, formatCurrency, initSupabaseRealtime } from '../../lib/mockData';
import { isSupabaseConfigured } from '../../lib/supabase';
import { Product } from '../../types/database';
import { playScanBeepSound } from '../../lib/sound';
import { lookupProductByBarcode, extractGtinFromDataMatrix, saveToCatalog, searchProductImageOnline } from '../../lib/barcodeLookup';
import { PageLockGuard } from '../../lib/PageLockGuard';

export default function WarehouseScreen() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>(storeManager.getProducts());
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Все');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isScanModalOpen, setIsScanModalOpen] = useState(false);
  const [isScanDetailModalOpen, setIsScanDetailModalOpen] = useState(false);
  const [isScanning, setIsScanning] = useState(true);
  const [permission, requestPermission] = useCameraPermissions();

  // Manual Add Form Fields
  const [name, setName] = useState('');
  const [barcode, setBarcode] = useState('');
  const [price, setPrice] = useState('');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [stock, setStock] = useState('');
  const [category, setCategory] = useState('Инструменты');
  const [unit, setUnit] = useState('шт');

  // Scanned Item Form Fields
  const [scannedBarcode, setScannedBarcode] = useState('');
  const [scanName, setScanName] = useState('');
  const [scanPrice, setScanPrice] = useState('');
  const [scanPurchasePrice, setScanPurchasePrice] = useState('');
  const [scanStock, setScanStock] = useState('1');
  const [scanCategory, setScanCategory] = useState('Инструменты');
  const [scanUnit, setScanUnit] = useState('шт');
  const [scanImageUrl, setScanImageUrl] = useState<string | undefined>(undefined);
  const [scanSource, setScanSource] = useState<string>('');
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [isFoundOnline, setIsFoundOnline] = useState(false);

  const refreshProducts = useCallback(async () => {
    setProducts(storeManager.getProducts());
    await storeManager.syncProductsFromSupabase();
    setProducts(storeManager.getProducts());
  }, []);

  const handlePullRefresh = async () => {
    setIsRefreshing(true);
    await refreshProducts();
    setIsRefreshing(false);
  };

  useFocusEffect(
    useCallback(() => {
      refreshProducts();
    }, [refreshProducts])
  );

  useEffect(() => {
    refreshProducts();
    if (isSupabaseConfigured) {
      initSupabaseRealtime();
    }
    const unsubscribe = storeManager.subscribe(() => {
      setProducts(storeManager.getProducts());
    });
    return () => unsubscribe();
  }, [refreshProducts]);

  // Filter products by search and category
  const filteredProducts = products.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.barcode.includes(searchQuery);
    const matchesCategory =
      selectedCategory === 'Все' || p.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // Handle scanned barcode -> Open Purchase/Info Modal with Auto-Recognition
  const handleBarcodeScanned = async (scannedCode: string) => {
    if (!isScanning) return;
    setIsScanning(false);
    playScanBeepSound();
    setIsScanModalOpen(false);

    const gtin = extractGtinFromDataMatrix(scannedCode);
    const targetCode = gtin || scannedCode.trim();

    setScannedBarcode(targetCode);
    setScanImageUrl(undefined);
    setScanSource('');
    setIsScanDetailModalOpen(true);

    const existing = storeManager.findProductByBarcode(scannedCode);
    if (existing) {
      setScannedBarcode(existing.barcode || targetCode);
      setScanName(existing.name);
      setScanPrice(existing.price.toString());
      setScanPurchasePrice((existing.purchase_price || existing.price * 0.75).toString());
      setScanStock('1');
      setScanCategory(existing.category);
      setScanUnit(existing.unit);
      setScanImageUrl(existing.image_url || undefined);
      setScanSource('local');
      setIsLookingUp(false);
      setIsFoundOnline(true);

      if (!existing.image_url) {
        searchProductImageOnline(existing.name).then((img) => {
          if (img) {
            setScanImageUrl(img);
            storeManager.updateProduct(existing.id, { image_url: img });
            saveToCatalog(existing.barcode, {
              name: existing.name,
              category: existing.category,
              unit: existing.unit,
              image_url: img,
              source: 'web_search',
            }).catch(() => {});
          }
        }).catch(() => {});
      }
    } else {
      setIsLookingUp(true);
      setIsFoundOnline(false);
      setScanName('Определение полного названия товара...');
      setScanPrice('');
      setScanPurchasePrice('');
      setScanStock('1');

      try {
        const recognized = await lookupProductByBarcode(scannedCode);
        setScannedBarcode(recognized.rawBarcode || targetCode);
        setScanName(recognized.name);
        setScanPrice(recognized.price.toString());
        setScanPurchasePrice(recognized.purchasePrice.toString());
        setScanCategory(recognized.category || 'Разное');
        setScanUnit(recognized.unit || 'шт');
        setScanImageUrl(recognized.imageUrl || undefined);
        setScanSource(recognized.source || '');
        setIsFoundOnline(recognized.foundOnline);
      } catch (err) {
        setScanName(`Товар ${targetCode.slice(-4) || targetCode}`);
        setScanPrice('35000');
        setScanPurchasePrice('25000');
        setScanCategory('Разное');
        setScanUnit('шт');
        setScanImageUrl(undefined);
        setScanSource('');
        setIsFoundOnline(false);
      } finally {
        setIsLookingUp(false);
      }
    }
  };

  // Save Scanned Product to Warehouse
  const handleSaveScannedProduct = async () => {
    if (!scanName.trim() || !scanPrice.trim() || !scanStock.trim()) {
      Alert.alert('Ошибка', 'Заполните название, цену продажи и количество');
      return;
    }

    const numPrice = parseFloat(scanPrice);
    const numPurchasePrice = parseFloat(scanPurchasePrice) || numPrice * 0.75;
    const numStock = parseInt(scanStock, 10);

    if (isNaN(numPrice) || isNaN(numStock)) {
      Alert.alert('Ошибка', 'Введите корректные числовые значения');
      return;
    }

    // If user corrected the name — update catalog with corrected name
    if (scannedBarcode && scanName.trim()) {
      saveToCatalog(scannedBarcode, {
        name: scanName.trim(),
        category: scanCategory,
        unit: scanUnit,
        image_url: scanImageUrl,
        source: 'manual',
        verified: true,
      }).catch(() => {});
    }

    const existing = storeManager.findProductByBarcode(scannedBarcode);
    if (existing) {
      await storeManager.updateProduct(existing.id, {
        name: scanName.trim(),
        price: numPrice,
        purchase_price: numPurchasePrice,
        stock_quantity: existing.stock_quantity + numStock,
        category: scanCategory,
        unit: scanUnit,
        barcode: scannedBarcode.trim(),
        image_url: scanImageUrl,
      });
      Alert.alert(
        'Товар обновлен! 🎉',
        `Товар "${scanName.trim()}" успешно обновлен!\nЦена: ${formatCurrency(numPrice)}\nНа складе: ${existing.stock_quantity + numStock} ${scanUnit}`
      );
    } else {
      await storeManager.addProduct({
        name: scanName.trim(),
        price: numPrice,
        purchase_price: numPurchasePrice,
        stock_quantity: numStock,
        barcode: scannedBarcode.trim(),
        category: scanCategory,
        unit: scanUnit,
        image_url: scanImageUrl,
      });
      Alert.alert(
        'Товар добавлен на склад! 🎉',
        `Новый товар "${scanName.trim()}" с ценой ${formatCurrency(numPrice)} успешно сохранен!`
      );
    }

    setIsScanDetailModalOpen(false);
  };

  // Manual Add Product
  const handleAddProduct = async () => {
    if (!name.trim() || !price.trim() || !stock.trim()) {
      Alert.alert('Ошибка', 'Заполните название товара, цену продажи и количество');
      return;
    }

    const numPrice = parseFloat(price);
    const numPurchasePrice = parseFloat(purchasePrice) || numPrice * 0.75;
    const numStock = parseInt(stock, 10);

    if (isNaN(numPrice) || isNaN(numStock)) {
      Alert.alert('Ошибка', 'Введите корректные числовые значения');
      return;
    }

    const targetBarcode = barcode.trim() || `47800${Math.floor(10000 + Math.random() * 90000)}`;
    const existing = storeManager.findProductByBarcode(targetBarcode);

    let autoImageUrl: string | undefined = existing?.image_url;
    if (!autoImageUrl) {
      try {
        autoImageUrl = (await searchProductImageOnline(name.trim())) || undefined;
      } catch {}
    }

    if (existing) {
      await storeManager.updateProduct(existing.id, {
        name: name.trim(),
        price: numPrice,
        purchase_price: numPurchasePrice,
        stock_quantity: existing.stock_quantity + numStock,
        category,
        unit,
        barcode: targetBarcode,
        image_url: autoImageUrl,
      });
      Alert.alert(
        'Товар обновлен! 🎉',
        `Товар "${name.trim()}" успешно обновлен!\nЦена продажи: ${formatCurrency(numPrice)}`
      );
    } else {
      await storeManager.addProduct({
        name: name.trim(),
        price: numPrice,
        purchase_price: numPurchasePrice,
        stock_quantity: numStock,
        barcode: targetBarcode,
        category,
        unit,
        image_url: autoImageUrl,
      });
      // Save to catalog for future lookups
      if (autoImageUrl) {
        saveToCatalog(targetBarcode, {
          name: name.trim(),
          category,
          unit,
          image_url: autoImageUrl,
          source: 'web_search',
        }).catch(() => {});
      }
      Alert.alert(
        'Товар добавлен! 🎉',
        `Товар "${name.trim()}" с ценой ${formatCurrency(numPrice)} добавлен на склад!`
      );
    }

    setName('');
    setBarcode('');
    setPrice('');
    setPurchasePrice('');
    setStock('');
    setIsAddModalOpen(false);
  };

  return (
    <PageLockGuard pageId="warehouse" pageName="Склад">
      <View style={styles.container}>
      {/* Header Actions: Search & Scan & Add */}
      <View style={styles.topControlContainer}>
        <View style={styles.searchBar}>
          <Search size={18} color="#9CA3AF" />
          <TextInput
            style={styles.searchInput}
            placeholder="Поиск по названию или штрих-коду..."
            placeholderTextColor="#9CA3AF"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <X size={16} color="#9CA3AF" />
            </TouchableOpacity>
          ) : null}
        </View>

        <TouchableOpacity
          style={styles.scanButton}
          onPress={() => {
            setIsScanning(true);
            setIsScanModalOpen(true);
          }}
        >
          <ScanBarcode size={18} color="#FFFFFF" />
          <Text style={styles.addButtonText}>Сканировать</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setIsAddModalOpen(true)}
        >
          <Plus size={18} color="#FFFFFF" />
          <Text style={styles.addButtonText}>Добавить</Text>
        </TouchableOpacity>
      </View>

      {/* Category Pills */}
      <View style={styles.categoriesWrapper}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoriesContainer}>
          {CATEGORIES.map((cat) => {
            const isActive = cat === selectedCategory;
            return (
              <TouchableOpacity
                key={cat}
                style={[styles.categoryChip, isActive && styles.categoryChipActive]}
                onPress={() => setSelectedCategory(cat)}
              >
                <Text style={[styles.categoryChipText, isActive && styles.categoryChipTextActive]}>
                  {cat}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Realtime Live Counter Row */}
      <View style={styles.statsBar}>
        <Text style={styles.statsCountText}>
          Товаров: <Text style={{ fontWeight: 'bold', color: '#111827' }}>{filteredProducts.length}</Text>
        </Text>
        <View style={styles.badgeLiveWarehouse}>
          <View style={styles.dotLive} />
          <Text style={styles.badgeLiveText}>
            {isSupabaseConfigured ? 'SUPABASE REALTIME' : 'ОФЛАЙН'}
          </Text>
        </View>
      </View>

      {/* Product List */}
      <FlatList
        data={filteredProducts}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContainer}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handlePullRefresh}
            colors={['#2563EB']}
            tintColor="#2563EB"
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Package size={48} color="#9CA3AF" />
            <Text style={styles.emptyTitle}>Товары не найдены</Text>
            <Text style={styles.emptySub}>
              Попробуйте изменить запрос поиска или добавить новый товар.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const isLowStock = item.stock_quantity <= 5;
          const isOutOfStock = item.stock_quantity === 0;

          return (
            <View style={styles.productCard}>
              {/* Product thumbnail image */}
              {item.image_url ? (
                <Image
                  source={{ uri: item.image_url }}
                  style={styles.productThumb}
                  resizeMode="contain"
                />
              ) : (
                <View style={styles.productThumbPlaceholder}>
                  <Package size={20} color="#9CA3AF" />
                </View>
              )}

              <View style={styles.productMainInfo}>
                <Text style={styles.productName}>{item.name}</Text>
                <Text style={styles.productCategory}>
                  {item.category} • {item.barcode}
                </Text>
                <View style={styles.priceRow}>
                  <Text style={styles.productPrice}>{formatCurrency(item.price)} / {item.unit}</Text>
                  {item.purchase_price && (
                    <Text style={styles.purchasePriceText}>
                      Закуп: {formatCurrency(item.purchase_price)}
                    </Text>
                  )}
                </View>
              </View>

              <View style={styles.stockBadgeCol}>
                <View
                  style={[
                    styles.stockBadge,
                    isOutOfStock
                      ? styles.badgeDanger
                      : isLowStock
                      ? styles.badgeWarning
                      : styles.badgeSuccess,
                  ]}
                >
                  <Text
                    style={[
                      styles.stockBadgeText,
                      isOutOfStock
                        ? styles.textDanger
                        : isLowStock
                        ? styles.textWarning
                        : styles.textSuccess,
                    ]}
                  >
                    {isOutOfStock
                      ? 'Нет на складе'
                      : isLowStock
                      ? `Мало: ${item.stock_quantity} ${item.unit}`
                      : `${item.stock_quantity} ${item.unit}`}
                  </Text>
                </View>
              </View>
            </View>
          );
        }}
      />

      {/* Manual Add Product Modal (Without Barcode Field) */}
      <Modal visible={isAddModalOpen} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Новый товар на склад</Text>
              <TouchableOpacity onPress={() => setIsAddModalOpen(false)}>
                <X size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.formScroll}>
              <Text style={styles.label}>Наименование товара</Text>
              <TextInput
                style={styles.input}
                placeholder="Например: Дрель Ермак 650Вт"
                value={name}
                onChangeText={setName}
              />

              <Text style={styles.label}>Штрих-код / QR-код (необязательно)</Text>
              <TextInput
                style={styles.input}
                placeholder="Например: 4823063100025 (или оставьте пустым для авто)"
                value={barcode}
                onChangeText={setBarcode}
              />

              <View style={styles.formRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Цена покупки (закупка)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="100000"
                    keyboardType="numeric"
                    value={purchasePrice}
                    onChangeText={setPurchasePrice}
                  />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.label}>Цена продажи</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="150000"
                    keyboardType="numeric"
                    value={price}
                    onChangeText={setPrice}
                  />
                </View>
              </View>

              <View style={styles.formRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Количество на складе</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="10"
                    keyboardType="numeric"
                    value={stock}
                    onChangeText={setStock}
                  />
                </View>
              </View>

              <Text style={styles.label}>Единица измерения</Text>
              <View style={styles.pickerRow}>
                {UNITS.map((u) => (
                  <TouchableOpacity
                    key={u}
                    style={[styles.pickerChip, unit === u && styles.pickerChipSelected]}
                    onPress={() => setUnit(u)}
                  >
                    <Text style={[styles.pickerChipText, unit === u && styles.pickerChipTextSelected]}>
                      {u}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>Категория</Text>
              <View style={styles.pickerRow}>
                {CATEGORIES.filter((c) => c !== 'Все').map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.pickerChip, category === cat && styles.pickerChipSelected]}
                    onPress={() => setCategory(cat)}
                  >
                    <Text style={[styles.pickerChipText, category === cat && styles.pickerChipTextSelected]}>
                      {cat}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <TouchableOpacity style={styles.saveBtn} onPress={handleAddProduct}>
              <Check size={20} color="#FFFFFF" />
              <Text style={styles.saveBtnText}>Сохранить товар</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Camera Scan Modal */}
      <Modal visible={isScanModalOpen} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { maxHeight: '90%' }]}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <ScanBarcode size={22} color="#059669" />
                <Text style={styles.modalTitle}>Сканер штрих-кода</Text>
              </View>
              <TouchableOpacity onPress={() => setIsScanModalOpen(false)}>
                <X size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            {/* Camera View */}
            <View style={styles.cameraSection}>
              {permission?.granted ? (
                <>
                  <CameraView
                    style={styles.camera}
                    facing="back"
                    onBarcodeScanned={({ data }) => isScanning && handleBarcodeScanned(data)}
                  />
                  <View style={styles.overlay}>
                    <View style={styles.targetFrame}>
                      <ScanBarcode size={44} color="#10B981" />
                      <Text style={styles.scanTargetHint}>
                        Наведите камеру на штрих-код товара
                      </Text>
                    </View>
                  </View>
                </>
              ) : (
                <View style={styles.noCameraView}>
                  <ScanBarcode size={40} color="#059669" />
                  <Text style={styles.noCameraTitle}>Доступ к камере</Text>
                  <Text style={styles.noCameraSub}>
                    Разрешите использование камеры для сканирования штрих-кода.
                  </Text>
                  <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
                    <Text style={styles.permBtnText}>Включить Камеру</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* Quick Simulator Bar */}
            <View style={styles.simBar}>
              <Text style={styles.simTitle}>Тестовое сканирование (эмулятор):</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.simChipsRow}>
                <TouchableOpacity
                  style={[styles.simChip, { backgroundColor: '#1D4ED8' }]}
                  onPress={() => handleBarcodeScanned('4823063100025')}
                >
                  <Text style={[styles.simChipText, { color: '#FFFFFF' }]}>+ Pepsi 1.5L</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.simChip, { backgroundColor: '#1E40AF' }]}
                  onPress={() => handleBarcodeScanned('4823063100018')}
                >
                  <Text style={[styles.simChipText, { color: '#FFFFFF' }]}>+ Pepsi 0.5L</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.simChip, { backgroundColor: '#DC2626' }]}
                  onPress={() => handleBarcodeScanned('5449000000996')}
                >
                  <Text style={[styles.simChipText, { color: '#FFFFFF' }]}>+ Coca-Cola 0.5L</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.simChip, { backgroundColor: '#059669' }]}
                  onPress={() => handleBarcodeScanned('4015600807534')}
                >
                  <Text style={[styles.simChipText, { color: '#FFFFFF' }]}>+ Fairy 450мл</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.simChip, { backgroundColor: '#7C3AED' }]}
                  onPress={() => handleBarcodeScanned('Газированный напиток Pepsi 1.5 л')}
                >
                  <Text style={[styles.simChipText, { color: '#FFFFFF' }]}>+ QR: Pepsi 1.5L</Text>
                </TouchableOpacity>
                {products.slice(0, 2).map((p) => (
                  <TouchableOpacity key={p.id} style={styles.simChip} onPress={() => handleBarcodeScanned(p.barcode)}>
                    <Text style={styles.simChipText}>+ {p.name.split(' ')[0]}</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  style={[styles.simChip, { backgroundColor: '#059669' }]}
                  onPress={() => handleBarcodeScanned(`47800${Math.floor(10000 + Math.random() * 90000)}`)}
                >
                  <Text style={[styles.simChipText, { color: '#FFFFFF' }]}>+ Новый код</Text>
                </TouchableOpacity>
              </ScrollView>
            </View>

            <TouchableOpacity style={styles.closeScanBtn} onPress={() => setIsScanModalOpen(false)}>
              <Text style={styles.closeScanBtnText}>Закрыть сканер</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Scanned Item Purchase Modal */}
      <Modal visible={isScanDetailModalOpen} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Tag size={22} color="#059669" />
                <Text style={styles.modalTitle}>Информация об отсканированном товаре</Text>
              </View>
              <TouchableOpacity onPress={() => setIsScanDetailModalOpen(false)}>
                <X size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.formScroll}>
              <View style={styles.barcodeBanner}>
                <ScanBarcode size={20} color="#059669" />
                <Text style={styles.barcodeBannerText}>Штрих-код / QR: {scannedBarcode}</Text>
              </View>

              {/* Product Image Preview */}
              {!isLookingUp && scanImageUrl ? (
                <View style={styles.productImageCard}>
                  <Image
                    source={{ uri: scanImageUrl }}
                    style={styles.productImagePreview}
                    resizeMode="contain"
                  />
                  <View style={styles.productImageBadge}>
                    <ImageIcon size={12} color="#6B7280" />
                    <Text style={styles.productImageBadgeText}>Фото товара найдено</Text>
                  </View>
                </View>
              ) : null}

              {isLookingUp ? (
                <View style={styles.autoDetectBanner}>
                  <ActivityIndicator size="small" color="#2563EB" />
                  <Text style={styles.autoDetectText}>Определяем полное название товара в базе данных...</Text>
                </View>
              ) : isFoundOnline ? (
                <View style={styles.detectedBadge}>
                  <Sparkles size={16} color="#059669" />
                  <Text style={styles.detectedBadgeText}>
                    Полное название товара распознано ✨
                    {scanSource === 'catalog' ? ' (каталог)' : scanSource === 'local' ? ' (локальная БД)' : scanSource === 'openfoodfacts' ? ' (Open Food Facts)' : ''}
                  </Text>
                </View>
              ) : null}

              <Text style={styles.label}>Полное наименование товара</Text>
              <TextInput
                style={[styles.input, isFoundOnline && styles.inputSuccess]}
                placeholder="Полное наименование товара"
                value={scanName}
                onChangeText={setScanName}
                editable={!isLookingUp}
              />

              <View style={styles.formRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Цена покупки (закупка)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="35000"
                    keyboardType="numeric"
                    value={scanPurchasePrice}
                    onChangeText={setScanPurchasePrice}
                  />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.label}>Цена продажи</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="50000"
                    keyboardType="numeric"
                    value={scanPrice}
                    onChangeText={setScanPrice}
                  />
                </View>
              </View>

              <Text style={styles.label}>Закупаемое количество</Text>
              <TextInput
                style={styles.input}
                placeholder="1"
                keyboardType="numeric"
                value={scanStock}
                onChangeText={setScanStock}
              />

              <Text style={styles.label}>Единица измерения</Text>
              <View style={styles.pickerRow}>
                {UNITS.map((u) => (
                  <TouchableOpacity
                    key={u}
                    style={[styles.pickerChip, scanUnit === u && styles.pickerChipSelected]}
                    onPress={() => setScanUnit(u)}
                  >
                    <Text style={[styles.pickerChipText, scanUnit === u && styles.pickerChipTextSelected]}>
                      {u}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>Категория</Text>
              <View style={styles.pickerRow}>
                {CATEGORIES.filter((c) => c !== 'Все').map((cat) => (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.pickerChip, scanCategory === cat && styles.pickerChipSelected]}
                    onPress={() => setScanCategory(cat)}
                  >
                    <Text style={[styles.pickerChipText, scanCategory === cat && styles.pickerChipTextSelected]}>
                      {cat}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <TouchableOpacity style={styles.saveBtn} onPress={handleSaveScannedProduct}>
              <Check size={20} color="#FFFFFF" />
              <Text style={styles.saveBtnText}>Добавить / Закупить на склад</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
    </PageLockGuard>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  topControlContainer: {
    flexDirection: 'row',
    padding: 16,
    gap: 8,
    alignItems: 'center',
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 10,
    height: 46,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  searchInput: {
    flex: 1,
    marginLeft: 6,
    fontSize: 13,
    color: '#1F2937',
  },
  scanButton: {
    backgroundColor: '#2563EB',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    height: 46,
    borderRadius: 12,
    gap: 6,
  },
  addButton: {
    backgroundColor: '#059669',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    height: 46,
    borderRadius: 12,
    gap: 6,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 13,
  },
  categoriesWrapper: {
    marginBottom: 8,
  },
  categoriesContainer: {
    paddingHorizontal: 16,
    gap: 8,
  },
  categoryChip: {
    backgroundColor: '#E5E7EB',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
  },
  categoryChipActive: {
    backgroundColor: '#059669',
  },
  categoryChipText: {
    color: '#4B5563',
    fontSize: 13,
    fontWeight: '500',
  },
  categoryChipTextActive: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  listContainer: {
    padding: 16,
    gap: 12,
  },
  productCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 10,
  },
  productThumb: {
    width: 52,
    height: 52,
    borderRadius: 8,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    flexShrink: 0,
  },
  productThumbPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  productMainInfo: {
    flex: 1,
  },
  productName: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#111827',
  },
  productCategory: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 6,
  },
  productPrice: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#059669',
  },
  purchasePriceText: {
    fontSize: 12,
    color: '#6B7280',
  },
  stockBadgeCol: {
    alignItems: 'flex-end',
  },
  stockBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  badgeSuccess: {
    backgroundColor: '#D1FAE5',
  },
  badgeWarning: {
    backgroundColor: '#FEF3C7',
  },
  badgeDanger: {
    backgroundColor: '#FEE2E2',
  },
  stockBadgeText: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  textSuccess: { color: '#047857' },
  textWarning: { color: '#B45309' },
  textDanger: { color: '#B91C1C' },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#374151',
    marginTop: 12,
  },
  emptySub: {
    fontSize: 13,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 4,
    paddingHorizontal: 32,
  },

  // Modal styling
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#111827',
  },
  formScroll: {
    gap: 12,
  },
  barcodeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#ECFDF5',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  barcodeBannerText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#047857',
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  input: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#111827',
  },
  formRow: {
    flexDirection: 'row',
  },
  pickerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pickerChip: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  pickerChipSelected: {
    backgroundColor: '#059669',
  },
  pickerChipText: {
    fontSize: 12,
    color: '#4B5563',
  },
  pickerChipTextSelected: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  saveBtn: {
    backgroundColor: '#059669',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 20,
    gap: 8,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },

  // Camera Section
  cameraSection: {
    height: 220,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#111827',
    marginBottom: 12,
  },
  camera: {
    flex: 1,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  targetFrame: {
    width: 180,
    height: 110,
    borderWidth: 2,
    borderColor: '#10B981',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.05)',
  },
  scanTargetHint: {
    color: '#FFFFFF',
    fontSize: 11,
    marginTop: 6,
    fontWeight: '500',
  },
  noCameraView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    padding: 16,
  },
  noCameraTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#065F46',
    marginTop: 8,
  },
  noCameraSub: {
    fontSize: 12,
    color: '#047857',
    textAlign: 'center',
    marginVertical: 6,
  },
  permBtn: {
    backgroundColor: '#059669',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 4,
  },
  permBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  simBar: {
    backgroundColor: '#F3F4F6',
    padding: 10,
    borderRadius: 10,
    marginBottom: 12,
  },
  simTitle: {
    color: '#6B7280',
    fontSize: 11,
    marginBottom: 6,
    fontWeight: '600',
  },
  simChipsRow: {
    gap: 8,
  },
  simChip: {
    backgroundColor: '#374151',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  simChipText: {
    color: '#A7F3D0',
    fontSize: 12,
    fontWeight: '600',
  },
  closeScanBtn: {
    backgroundColor: '#E5E7EB',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  closeScanBtnText: {
    color: '#374151',
    fontSize: 14,
    fontWeight: 'bold',
  },
  autoDetectBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#EFF6FF',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  autoDetectText: {
    fontSize: 12,
    color: '#1D4ED8',
    fontWeight: '500',
    flex: 1,
  },
  detectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  detectedBadgeText: {
    fontSize: 12,
    color: '#059669',
    fontWeight: 'bold',
  },
  inputSuccess: {
    borderColor: '#10B981',
    backgroundColor: '#F0FDF4',
    fontWeight: 'bold',
  },
  statsBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  statsCountText: {
    fontSize: 13,
    color: '#6B7280',
  },
  badgeLiveWarehouse: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    gap: 6,
    borderWidth: 1,
    borderColor: '#A7F3D0',
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
  productImageCard: {
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 12,
    marginBottom: 12,
  },
  productImagePreview: {
    width: '100%',
    height: 160,
    borderRadius: 8,
  },
  productImageBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  productImageBadgeText: {
    fontSize: 11,
    color: '#6B7280',
  },
});
