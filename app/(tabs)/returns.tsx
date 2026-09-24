import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TouchableOpacity,
  Alert,
  Modal,
  ScrollView,
  TextInput,
  Animated,
  RefreshControl,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import {
  RotateCcw,
  Receipt as ReceiptIcon,
  Search,
  CheckCircle,
  AlertCircle,
  Banknote,
  CreditCard,
  Send,
  PackageCheck,
  X,
  ChevronRight,
  Printer,
  Plus,
  Minus,
} from 'lucide-react-native';
import { storeManager, formatCurrency, initSupabaseRealtime } from '../../lib/mockData';
import { isSupabaseConfigured } from '../../lib/supabase';
import { Receipt, ReceiptItem } from '../../types/database';
import { PageLockGuard } from '../../lib/PageLockGuard';

export default function ReturnsScreen() {
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedReceipt, setSelectedReceipt] = useState<Receipt | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Per-item selected quantity to return (dictionary: itemId -> qty)
  const [itemReturnCounts, setItemReturnCounts] = useState<Record<string, number>>({});

  // Smooth entrance animation
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const refreshReceipts = useCallback(async () => {
    setReceipts(storeManager.getReceipts());
    await storeManager.syncReceiptsFromSupabase();
    setReceipts(storeManager.getReceipts());
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshReceipts();
    }, [refreshReceipts])
  );

  const handlePullRefresh = async () => {
    setIsRefreshing(true);
    await refreshReceipts();
    setIsRefreshing(false);
  };

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 320,
      useNativeDriver: true,
    }).start();

    refreshReceipts();
    if (isSupabaseConfigured) {
      initSupabaseRealtime();
    }
    const unsubscribe = storeManager.subscribe(() => {
      const updated = storeManager.getReceipts();
      setReceipts(updated);
      if (selectedReceipt) {
        const found = updated.find((r) => r.id === selectedReceipt.id);
        if (found) setSelectedReceipt(found);
      }
    });
    return () => unsubscribe();
  }, [selectedReceipt, refreshReceipts]);

  const getItemReturnCount = (itemId: string, maxAvailable: number): number => {
    const val = itemReturnCounts[itemId];
    if (val === undefined || val < 1) return 1;
    if (val > maxAvailable) return maxAvailable;
    return val;
  };

  const changeItemReturnCount = (itemId: string, delta: number, maxAvailable: number) => {
    const current = getItemReturnCount(itemId, maxAvailable);
    const next = Math.max(1, Math.min(maxAvailable, current + delta));
    setItemReturnCounts((prev) => ({ ...prev, [itemId]: next }));
  };

  const filteredReceipts = receipts.filter((r) => {
    const query = searchQuery.toLowerCase();
    const matchesNum = r.receipt_number.includes(query) || r.id.toLowerCase().includes(query);
    const matchesItem = r.items.some((item) => item.product_name.toLowerCase().includes(query));
    return matchesNum || matchesItem;
  });

  const handleReturnFullReceipt = (receipt: Receipt) => {
    Alert.alert(
      'Возврат всего чека',
      `Вы действительно хотите вернуть весь Чек №${receipt.receipt_number} на сумму ${formatCurrency(receipt.total_amount)}?\n\nВсе невозвращённые товары будут зачислены обратно на склад.`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Да, вернуть весь чек',
          style: 'destructive',
          onPress: () => {
            storeManager.returnReceipt(receipt.id);
            Alert.alert('Успех', `Чек №${receipt.receipt_number} полностью возвращён на склад!`);
          },
        },
      ]
    );
  };

  const handleReturnItemQuantity = (receipt: Receipt, item: ReceiptItem) => {
    const maxAvailable = item.quantity - item.returned_quantity;
    if (maxAvailable <= 0) {
      Alert.alert('Информация', 'Все единицы этого товара уже возвращены.');
      return;
    }

    const countToReturn = getItemReturnCount(item.id, maxAvailable);

    Alert.alert(
      'Подтверждение возврата товара',
      `Вернуть ${countToReturn} ${item.unit} товара "${item.product_name}" на склад? (Сумма возврата: ${formatCurrency(countToReturn * item.unit_price)})`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: `Вернуть ${countToReturn} ${item.unit}`,
          onPress: () => {
            storeManager.returnReceiptItem(receipt.id, item.id, countToReturn);
            setItemReturnCounts((prev) => ({ ...prev, [item.id]: 1 }));
            Alert.alert(
              'Успех',
              `${countToReturn} ${item.unit} товара "${item.product_name}" успешно возвращены на склад!`
            );
          },
        },
      ]
    );
  };

  return (
    <PageLockGuard pageId="returns" pageName="Возвраты">
      <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      {/* Search Header */}
      <View style={styles.searchBar}>
        <Search size={18} color="#9CA3AF" />
        <TextInput
          style={styles.searchInput}
          placeholder="Поиск чека по №, названию товара или ID..."
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

      {/* Realtime Live Counter Row */}
      <View style={styles.statsBar}>
        <Text style={styles.statsCountText}>
          Всего чеков: <Text style={{ fontWeight: 'bold', color: '#111827' }}>{filteredReceipts.length}</Text>
        </Text>
        <View style={styles.badgeLiveReturns}>
          <View style={styles.dotLive} />
          <Text style={styles.badgeLiveText}>
            {isSupabaseConfigured ? 'SUPABASE REALTIME' : 'ОФЛАЙН'}
          </Text>
        </View>
      </View>

      {/* Receipts List */}
      <FlatList
        data={filteredReceipts}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handlePullRefresh}
            colors={['#059669']}
            tintColor="#059669"
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyView}>
            <RotateCcw size={48} color="#9CA3AF" />
            <Text style={styles.emptyTitle}>Чеки не найдены</Text>
            <Text style={styles.emptySub}>Здесь отображаются все выданные кассовые чеки</Text>
          </View>
        }
        renderItem={({ item }) => {
          const totalReturnedItems = item.items.reduce((sum, i) => sum + i.returned_quantity, 0);
          const totalQuantity = item.items.reduce((sum, i) => sum + i.quantity, 0);
          const isFullyReturned = item.is_fully_returned || totalReturnedItems >= totalQuantity;
          const isPartiallyReturned = totalReturnedItems > 0 && !isFullyReturned;

          return (
            <TouchableOpacity
              style={[styles.receiptCard, isFullyReturned && styles.receiptCardReturned]}
              onPress={() => setSelectedReceipt(item)}
              activeOpacity={0.7}
            >
              {/* Card Top Row */}
              <View style={styles.cardHeaderRow}>
                <View style={styles.receiptTitleRow}>
                  <ReceiptIcon size={18} color={isFullyReturned ? '#9CA3AF' : '#059669'} />
                  <Text style={styles.receiptNumText}>Чек №{item.receipt_number}</Text>
                </View>
                <Text style={styles.receiptDateText}>
                  {new Date(item.created_at).toLocaleTimeString('ru-RU', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </Text>
              </View>

              {/* Items Summary list preview */}
              <View style={styles.itemsSummaryBox}>
                {item.items.map((i) => (
                  <Text key={i.id} style={styles.summaryItemText} numberOfLines={1}>
                    • {i.product_name} ({i.quantity} {i.unit})
                  </Text>
                ))}
              </View>

              {/* Price & Status Footer Row */}
              <View style={styles.cardFooterRow}>
                <View>
                  <Text style={styles.totalPriceText}>{formatCurrency(item.total_amount)}</Text>
                  <View style={styles.paymentMethodChip}>
                    {item.payment_method === 'cash' ? (
                      <Banknote size={12} color="#059669" />
                    ) : item.payment_method === 'card' ? (
                      <CreditCard size={12} color="#2563EB" />
                    ) : (
                      <Send size={12} color="#D97706" />
                    )}
                    <Text style={styles.paymentMethodText}>
                      {item.payment_method === 'cash'
                        ? 'Наличные'
                        : item.payment_method === 'card'
                        ? 'Карта'
                        : 'Перевод'}
                    </Text>
                  </View>
                </View>

                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                  {isFullyReturned ? (
                    <View style={styles.returnedBadge}>
                      <AlertCircle size={13} color="#DC2626" />
                      <Text style={styles.returnedBadgeText}>Полный возврат</Text>
                    </View>
                  ) : isPartiallyReturned ? (
                    <View style={styles.partialBadge}>
                      <RotateCcw size={13} color="#D97706" />
                      <Text style={styles.partialBadgeText}>Частичный возврат</Text>
                    </View>
                  ) : (
                    <View style={styles.successBadge}>
                      <CheckCircle size={13} color="#047857" />
                      <Text style={styles.successBadgeText}>Оплачен</Text>
                    </View>
                  )}

                  <View style={styles.tapToOpenRow}>
                    <Text style={styles.tapToOpenText}>Открыть чек</Text>
                    <ChevronRight size={14} color="#059669" />
                  </View>
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
      />

      {/* ── Receipt View & Return Modal ── */}
      <Modal visible={!!selectedReceipt} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          {selectedReceipt && (
            <View style={styles.receiptModalContent}>
              {/* Modal Header */}
              <View style={styles.modalHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Printer size={20} color="#059669" />
                  <Text style={styles.modalTitle}>Чек №{selectedReceipt.receipt_number}</Text>
                </View>
                <TouchableOpacity onPress={() => setSelectedReceipt(null)}>
                  <X size={22} color="#6B7280" />
                </TouchableOpacity>
              </View>

              <ScrollView contentContainerStyle={styles.receiptPaper}>
                {/* Store Branding Header */}
                <View style={styles.paperHeader}>
                  <Text style={styles.paperStoreName}>ХОЗМАГ №1 ЦЕНТР</Text>
                  <Text style={styles.paperSub}>КАССОВЫЙ ЧЕК</Text>
                  <Text style={styles.paperMeta}>
                    Дата: {new Date(selectedReceipt.created_at).toLocaleString('ru-RU')}
                  </Text>
                  <Text style={styles.paperMeta}>
                    Оплата:{' '}
                    {selectedReceipt.payment_method === 'cash'
                      ? 'Наличными'
                      : selectedReceipt.payment_method === 'card'
                      ? 'Картой'
                      : 'Переводом'}
                  </Text>
                </View>

                <View style={styles.dashedDivider} />

                {/* Receipt Line Items */}
                <Text style={styles.sectionHeader}>Купленные товары:</Text>

                {selectedReceipt.items.map((item) => {
                  const maxAvailable = item.quantity - item.returned_quantity;
                  const isItemFullyReturned = maxAvailable <= 0;
                  const currentReturnCount = getItemReturnCount(item.id, maxAvailable);

                  return (
                    <View key={item.id} style={styles.receiptItemRow}>
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[
                            styles.itemRowName,
                            isItemFullyReturned && styles.textLineThrough,
                          ]}
                        >
                          {item.product_name}
                        </Text>
                        <Text style={styles.itemRowDetail}>
                          {formatCurrency(item.unit_price)} × {item.quantity} {item.unit} = {formatCurrency(item.subtotal)}
                        </Text>

                        {item.returned_quantity > 0 && (
                          <Text style={styles.itemReturnedText}>
                            Возвращено: {item.returned_quantity} из {item.quantity} {item.unit}
                          </Text>
                        )}
                      </View>

                      {/* Line Item Return Control (+ / - quantity selector & Return button) */}
                      {!isItemFullyReturned && (
                        <View style={styles.itemReturnControlBox}>
                          {maxAvailable > 1 && (
                            <View style={styles.qtyPickerRow}>
                              <TouchableOpacity
                                style={[
                                  styles.qtyPickerBtn,
                                  currentReturnCount <= 1 && styles.qtyPickerBtnDisabled,
                                ]}
                                disabled={currentReturnCount <= 1}
                                onPress={() => changeItemReturnCount(item.id, -1, maxAvailable)}
                              >
                                <Minus size={12} color={currentReturnCount <= 1 ? '#D1D5DB' : '#374151'} />
                              </TouchableOpacity>

                              <Text style={styles.qtyPickerText}>{currentReturnCount}</Text>

                              <TouchableOpacity
                                style={[
                                  styles.qtyPickerBtn,
                                  currentReturnCount >= maxAvailable && styles.qtyPickerBtnDisabled,
                                ]}
                                disabled={currentReturnCount >= maxAvailable}
                                onPress={() => changeItemReturnCount(item.id, 1, maxAvailable)}
                              >
                                <Plus size={12} color={currentReturnCount >= maxAvailable ? '#D1D5DB' : '#374151'} />
                              </TouchableOpacity>
                            </View>
                          )}

                          <TouchableOpacity
                            style={styles.returnOneBtn}
                            onPress={() => handleReturnItemQuantity(selectedReceipt, item)}
                            activeOpacity={0.8}
                          >
                            <RotateCcw size={13} color="#059669" />
                            <Text style={styles.returnOneBtnText}>
                              Вернуть {currentReturnCount} {item.unit}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  );
                })}

                <View style={styles.dashedDivider} />

                {/* Total & Summary */}
                <View style={styles.paperTotalRow}>
                  <Text style={styles.paperTotalLabel}>ИТОГО ПО ЧЕКУ:</Text>
                  <Text style={styles.paperTotalValue}>
                    {formatCurrency(selectedReceipt.total_amount)}
                  </Text>
                </View>
              </ScrollView>

              {/* Bottom Action Footer */}
              <View style={styles.modalFooter}>
                {!selectedReceipt.is_fully_returned && (
                  <TouchableOpacity
                    style={styles.returnAllBtn}
                    onPress={() => handleReturnFullReceipt(selectedReceipt)}
                    activeOpacity={0.8}
                  >
                    <PackageCheck size={18} color="#FFFFFF" />
                    <Text style={styles.returnAllBtnText}>Вернуть весь чек</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={styles.closeModalBtn}
                  onPress={() => setSelectedReceipt(null)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.closeModalBtnText}>Закрыть</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
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
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    margin: 14,
    marginBottom: 6,
    paddingHorizontal: 12,
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#111827',
  },
  listContent: {
    padding: 14,
    gap: 10,
  },
  emptyView: {
    alignItems: 'center',
    paddingVertical: 50,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#4B5563',
    marginTop: 12,
  },
  emptySub: {
    fontSize: 13,
    color: '#9CA3AF',
    marginTop: 4,
  },

  // Receipt Card
  receiptCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 10,
  },
  receiptCardReturned: {
    backgroundColor: '#F9FAFB',
    borderColor: '#F3F4F6',
    opacity: 0.8,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    paddingBottom: 8,
  },
  receiptTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  receiptNumText: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#111827',
  },
  receiptDateText: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  itemsSummaryBox: {
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    padding: 10,
    gap: 4,
  },
  summaryItemText: {
    fontSize: 13,
    color: '#4B5563',
    fontWeight: '500',
  },
  cardFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalPriceText: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#059669',
  },
  paymentMethodChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  paymentMethodText: {
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '500',
  },
  successBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  successBadgeText: {
    fontSize: 11,
    color: '#047857',
    fontWeight: 'bold',
  },
  partialBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  partialBadgeText: {
    fontSize: 11,
    color: '#B45309',
    fontWeight: 'bold',
  },
  returnedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  returnedBadgeText: {
    fontSize: 11,
    color: '#DC2626',
    fontWeight: 'bold',
  },
  tapToOpenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  tapToOpenText: {
    fontSize: 12,
    color: '#059669',
    fontWeight: '600',
  },

  // Modal styling
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  receiptModalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 20,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#111827',
  },
  receiptPaper: {
    backgroundColor: '#FFFDF5',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 14,
    padding: 16,
    gap: 12,
  },
  paperHeader: {
    alignItems: 'center',
    gap: 2,
  },
  paperStoreName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#111827',
    letterSpacing: 1,
  },
  paperSub: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#059669',
  },
  paperMeta: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 1,
  },
  dashedDivider: {
    borderStyle: 'dashed',
    borderWidth: 0.8,
    borderColor: '#D1D5DB',
    marginVertical: 4,
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#374151',
  },
  receiptItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    gap: 8,
  },
  itemRowName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  itemRowDetail: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  itemReturnedText: {
    fontSize: 11,
    color: '#DC2626',
    fontWeight: '600',
    marginTop: 2,
  },
  textLineThrough: {
    textDecorationLine: 'line-through',
    color: '#9CA3AF',
  },
  itemReturnControlBox: {
    alignItems: 'flex-end',
    gap: 6,
  },
  qtyPickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  qtyPickerBtn: {
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  qtyPickerBtnDisabled: {
    opacity: 0.3,
  },
  qtyPickerText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#111827',
    paddingHorizontal: 6,
    minWidth: 20,
    textAlign: 'center',
  },
  returnOneBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  returnOneBtnText: {
    fontSize: 12,
    color: '#047857',
    fontWeight: 'bold',
  },
  paperTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 4,
  },
  paperTotalLabel: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#111827',
  },
  paperTotalValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#059669',
  },
  modalFooter: {
    marginTop: 16,
    gap: 8,
  },
  returnAllBtn: {
    backgroundColor: '#DC2626',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 12,
    gap: 8,
  },
  returnAllBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
  closeModalBtn: {
    backgroundColor: '#F3F4F6',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  closeModalBtnText: {
    color: '#374151',
    fontSize: 14,
    fontWeight: 'bold',
  },
  statsBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  statsCountText: {
    fontSize: 13,
    color: '#6B7280',
  },
  badgeLiveReturns: {
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
});
