import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  Alert,
  Animated,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import {
  Share2,
  PieChart,
  ArrowUpRight,
  Calendar,
  Users,
  User,
} from 'lucide-react-native';
import { storeManager, formatCurrency, initSupabaseRealtime } from '../../lib/mockData';
import { isSupabaseConfigured } from '../../lib/supabase';
import { Sale } from '../../types/database';
import { PageLockGuard } from '../../lib/PageLockGuard';

export default function ReportsScreen() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [selectedFilter, setSelectedFilter] = useState<'today' | 'week' | 'all'>('today');
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [loadingAdmin, setLoadingAdmin] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const contentFadeAnim = useRef(new Animated.Value(1)).current;

  // Determine if current user is admin-level (sees all data)
  const checkAdminMode = useCallback(() => {
    const user = storeManager.getCurrentUser();
    const isAdmin =
      user?.role === 'Администратор' ||
      user?.role === 'Суперадминистратор' ||
      storeManager.isSuperAdmin(user ?? undefined);
    setIsAdminMode(isAdmin);
    return isAdmin;
  }, []);

  const refreshReports = useCallback(async () => {
    const admin = checkAdminMode();
    if (admin) {
      setLoadingAdmin(true);
      try {
        const allReceipts = await storeManager.getAllReceiptsFromSupabase();
        setSales(storeManager.receiptsToSales(allReceipts));
      } catch (e) {
        setSales(storeManager.getSales());
      } finally {
        setLoadingAdmin(false);
      }
    } else {
      setSales(storeManager.getSales());
      storeManager.syncReceiptsFromSupabase();
    }
  }, [checkAdminMode]);

  useFocusEffect(
    useCallback(() => {
      refreshReports();
    }, [refreshReports])
  );

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();

    refreshReports();
    if (isSupabaseConfigured) {
      initSupabaseRealtime();
    }
    const unsubscribe = storeManager.subscribe(() => {
      refreshReports();
    });
    return () => unsubscribe();
  }, [refreshReports]);

  const handleFilterChange = (filter: 'today' | 'week' | 'all') => {
    contentFadeAnim.setValue(0.5);
    setSelectedFilter(filter);
    Animated.timing(contentFadeAnim, {
      toValue: 1,
      duration: 250,
      useNativeDriver: true,
    }).start();
  };

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const sevenDaysAgo = startOfToday - 6 * 24 * 3600 * 1000;

  const filteredSales = sales.filter((s) => {
    const saleTime = new Date(s.sale_date).getTime();
    if (selectedFilter === 'today') return saleTime >= startOfToday;
    if (selectedFilter === 'week') return saleTime >= sevenDaysAgo;
    return true;
  });

  const activeSales = filteredSales.map((s) => {
    const effectiveQty = Math.max(0, s.quantity - (s.returned_quantity || 0));
    const effectiveAmount = effectiveQty * s.unit_price;
    return {
      ...s,
      effectiveQty,
      effectiveAmount,
      isFullyReturned: s.is_returned || effectiveQty === 0,
    };
  });

  const totalRevenue = activeSales.reduce((sum, s) => sum + s.effectiveAmount, 0);
  const totalCount = activeSales.filter(s => !s.isFullyReturned).length;
  const avgCheck = totalCount > 0 ? Math.round(totalRevenue / totalCount) : 0;

  const cashTotal = activeSales.filter((s) => s.payment_method === 'cash').reduce((sum, s) => sum + s.effectiveAmount, 0);
  const cardTotal = activeSales.filter((s) => s.payment_method === 'card').reduce((sum, s) => sum + s.effectiveAmount, 0);
  const transferTotal = activeSales.filter((s) => s.payment_method === 'transfer').reduce((sum, s) => sum + s.effectiveAmount, 0);

  // Breakdown by cashier (admin mode only)
  const cashierBreakdown = React.useMemo(() => {
    if (!isAdminMode) return [];
    const map = new Map<string, { userId: string; revenue: number; count: number }>();
    activeSales.forEach((s) => {
      if (s.isFullyReturned) return;
      const key = s.user_id || 'unknown';
      const existing = map.get(key) || { userId: key, revenue: 0, count: 0 };
      existing.revenue += s.effectiveAmount;
      existing.count += 1;
      map.set(key, existing);
    });
    const users = storeManager.getUsers();
    return Array.from(map.values())
      .sort((a, b) => b.revenue - a.revenue)
      .map((item) => {
        const user = users.find((u) => u.id === item.userId);
        return {
          ...item,
          name: user?.name || user?.email?.split('@')[0] || 'Кассир',
        };
      });
  }, [activeSales, isAdminMode]);

  const handleExport = () => {
    const adminNote = isAdminMode ? '\n📊 Режим: ВСЕ кассиры' : '';
    Alert.alert(
      'Отчёт сформирован',
      `Итоговая выручка: ${formatCurrency(totalRevenue)}\nВсего позиций: ${totalCount}\nСредний чек: ${formatCurrency(avgCheck)}${adminNote}\n\nТекст отчёта готов к отправке в Telegram / WhatsApp.`,
      [{ text: 'Отлично' }]
    );
  };

  return (
    <PageLockGuard pageId="reports" pageName="Отчёты">
      <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
        <ScrollView contentContainerStyle={styles.contentContainer}>

          {/* Admin Mode Badge */}
          {isAdminMode && (
            <View style={styles.adminBadge}>
              <Users size={14} color="#FFFFFF" />
              <Text style={styles.adminBadgeText}>
                Режим администратора — отчёты всех кассиров
              </Text>
            </View>
          )}

          {/* Time Filter Pills */}
          <View style={styles.filterRow}>
            <TouchableOpacity
              style={[styles.filterChip, selectedFilter === 'today' && styles.filterChipActive]}
              onPress={() => handleFilterChange('today')}
              activeOpacity={0.8}
            >
              <Text style={[styles.filterText, selectedFilter === 'today' && styles.filterTextActive]}>
                За Сегодня
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.filterChip, selectedFilter === 'week' && styles.filterChipActive]}
              onPress={() => handleFilterChange('week')}
              activeOpacity={0.8}
            >
              <Text style={[styles.filterText, selectedFilter === 'week' && styles.filterTextActive]}>
                За Неделю
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.filterChip, selectedFilter === 'all' && styles.filterChipActive]}
              onPress={() => handleFilterChange('all')}
              activeOpacity={0.8}
            >
              <Text style={[styles.filterText, selectedFilter === 'all' && styles.filterTextActive]}>
                Вся История
              </Text>
            </TouchableOpacity>
          </View>

          {loadingAdmin ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color="#059669" />
              <Text style={styles.loadingText}>Загрузка всех отчётов...</Text>
            </View>
          ) : (
            <Animated.View style={{ opacity: contentFadeAnim }}>
              {/* Main Revenue Metric Card */}
              <View style={styles.mainStatCard}>
                <View style={styles.statHeaderRow}>
                  <Text style={styles.statLabel}>
                    {isAdminMode ? 'Общая Выручка (все кассиры)' : 'Общая Выручка'}
                  </Text>
                  <View style={styles.badgeLiveReports}>
                    <View style={styles.dotLive} />
                    <Text style={styles.badgeLiveText}>
                      {isSupabaseConfigured ? 'LIVE SUPABASE' : 'ОФЛАЙН'}
                    </Text>
                  </View>
                </View>
                <Text style={styles.statAmount}>{formatCurrency(totalRevenue)}</Text>
                <View style={styles.statDivider} />
                <View style={styles.subStatsRow}>
                  <View style={styles.subStatCol}>
                    <Text style={styles.subStatLabel}>Проданных товаров</Text>
                    <Text style={styles.subStatVal}>{totalCount}</Text>
                  </View>
                  <View style={styles.subStatCol}>
                    <Text style={styles.subStatLabel}>Средний чек</Text>
                    <Text style={styles.subStatVal}>{formatCurrency(avgCheck)}</Text>
                  </View>
                </View>
              </View>

              {/* Cashier Breakdown (admin only) */}
              {isAdminMode && cashierBreakdown.length > 0 && (
                <View style={styles.card}>
                  <View style={styles.cardHeader}>
                    <Users size={18} color="#059669" />
                    <Text style={styles.cardTitle}>Выручка по кассирам</Text>
                  </View>
                  {cashierBreakdown.map((cashier) => (
                    <View key={cashier.userId} style={styles.cashierRow}>
                      <View style={styles.cashierIconBg}>
                        <User size={14} color="#059669" />
                      </View>
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={styles.cashierName}>{cashier.name}</Text>
                        <Text style={styles.cashierSub}>{cashier.count} продаж</Text>
                      </View>
                      <Text style={styles.cashierRevenue}>{formatCurrency(cashier.revenue)}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Breakdown by Payment Methods */}
              <View style={styles.card}>
                <View style={styles.cardHeader}>
                  <PieChart size={18} color="#059669" />
                  <Text style={styles.cardTitle}>Разбивка по способам оплаты</Text>
                </View>

                <View style={styles.paymentMethodRow}>
                  <View style={styles.paymentMethodCard}>
                    <Text style={styles.pmLabel}>Наличные</Text>
                    <Text style={styles.pmValue}>{formatCurrency(cashTotal)}</Text>
                    <View style={[styles.pmBar, { backgroundColor: '#10B981', width: '100%' }]} />
                  </View>

                  <View style={styles.paymentMethodCard}>
                    <Text style={styles.pmLabel}>Карты (Humo/Uzcard)</Text>
                    <Text style={styles.pmValue}>{formatCurrency(cardTotal)}</Text>
                    <View style={[styles.pmBar, { backgroundColor: '#3B82F6', width: '100%' }]} />
                  </View>

                  <View style={styles.paymentMethodCard}>
                    <Text style={styles.pmLabel}>Переводы</Text>
                    <Text style={styles.pmValue}>{formatCurrency(transferTotal)}</Text>
                    <View style={[styles.pmBar, { backgroundColor: '#8B5CF6', width: '100%' }]} />
                  </View>
                </View>
              </View>

              {/* Detailed Transaction Log */}
              <View style={styles.card}>
                <View style={styles.cardHeaderBetween}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Calendar size={18} color="#059669" />
                    <Text style={styles.cardTitle}>История Транзакций</Text>
                  </View>
                  <TouchableOpacity style={styles.exportBtn} onPress={handleExport}>
                    <Share2 size={14} color="#059669" />
                    <Text style={styles.exportBtnText}>Экспорт</Text>
                  </TouchableOpacity>
                </View>

                {activeSales.length === 0 && (
                  <Text style={styles.emptyTx}>Нет транзакций за выбранный период</Text>
                )}

                {activeSales.map((sale) => (
                  <View key={sale.id} style={styles.txRow}>
                    <View
                      style={[
                        styles.txIconBg,
                        sale.isFullyReturned && { backgroundColor: '#FEE2E2' },
                      ]}
                    >
                      <ArrowUpRight
                        size={18}
                        color={sale.isFullyReturned ? '#DC2626' : '#059669'}
                      />
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={styles.txName}>{sale.product_name}</Text>
                      <Text style={styles.txDate}>
                        {new Date(sale.sale_date).toLocaleTimeString('ru-RU', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}{' '}
                        • {sale.quantity} шт •{' '}
                        {sale.payment_method === 'cash'
                          ? 'Наличные'
                          : sale.payment_method === 'card'
                          ? 'Карта'
                          : 'Перевод'}
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.txPrice,
                        sale.isFullyReturned && {
                          color: '#DC2626',
                          textDecorationLine: 'line-through',
                        },
                      ]}
                    >
                      {sale.isFullyReturned
                        ? 'Возвращён'
                        : `+${formatCurrency(sale.effectiveAmount)}`}
                    </Text>
                  </View>
                ))}
              </View>
            </Animated.View>
          )}
        </ScrollView>
      </Animated.View>
    </PageLockGuard>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  contentContainer: {
    padding: 16,
  },
  adminBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#1D4ED8',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 14,
  },
  adminBadgeText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
  },
  loadingBox: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: 14,
  },
  loadingText: {
    color: '#6B7280',
    fontSize: 14,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  filterChip: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  filterChipActive: {
    backgroundColor: '#059669',
    borderColor: '#047857',
  },
  filterText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4B5563',
  },
  filterTextActive: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  mainStatCard: {
    backgroundColor: '#047857',
    borderRadius: 18,
    padding: 20,
    marginBottom: 16,
  },
  statLabel: {
    color: '#D1FAE5',
    fontSize: 13,
    fontWeight: '600',
  },
  statAmount: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: 'bold',
    marginVertical: 8,
  },
  statDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    marginVertical: 12,
  },
  subStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  subStatCol: {
    flex: 1,
  },
  subStatLabel: {
    color: '#A7F3D0',
    fontSize: 12,
  },
  subStatVal: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
    marginTop: 2,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  cardHeaderBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#111827',
  },
  cashierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  cashierIconBg: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#ECFDF5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cashierName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
  },
  cashierSub: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 1,
  },
  cashierRevenue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#059669',
  },
  paymentMethodRow: {
    gap: 10,
  },
  paymentMethodCard: {
    backgroundColor: '#F9FAFB',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  pmLabel: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
  },
  pmValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#111827',
    marginVertical: 4,
  },
  pmBar: {
    height: 4,
    borderRadius: 2,
  },
  exportBtn: {
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
  exportBtnText: {
    fontSize: 12,
    color: '#047857',
    fontWeight: 'bold',
  },
  emptyTx: {
    textAlign: 'center',
    color: '#9CA3AF',
    fontSize: 14,
    paddingVertical: 20,
  },
  txRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  txIconBg: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#ECFDF5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  txName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  txDate: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  txPrice: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#059669',
  },
  statHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  badgeLiveReports: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 6,
  },
  dotLive: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#34D399',
  },
  badgeLiveText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: 'bold',
  },
});
