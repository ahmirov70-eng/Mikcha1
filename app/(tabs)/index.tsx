import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import {
  TrendingUp,
  ShoppingBag,
  AlertTriangle,
  ScanBarcode,
  PackagePlus,
  ChevronRight,
  Receipt,
  RotateCcw,
  Calendar as CalendarIcon,
  BarChart3,
} from 'lucide-react-native';
import { storeManager, formatCurrency, initSupabaseRealtime } from '../../lib/mockData';
import { isSupabaseConfigured } from '../../lib/supabase';
import { Product, Sale } from '../../types/database';
import { PageLockGuard } from '../../lib/PageLockGuard';

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

export default function DashboardScreen() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [selectedDate, setSelectedDate] = useState<number>(new Date().getDate());

  // Smooth screen entrance animations
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const bannerScale = useRef(new Animated.Value(1)).current;

  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth();
  const currentMonthName = currentDate.toLocaleString('ru-RU', { month: 'long', year: 'numeric' });
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

  const firstDayRaw = new Date(currentYear, currentMonth, 1).getDay();
  const firstDayOffset = (firstDayRaw + 6) % 7;

  const emptyOffsetArray = Array.from({ length: firstDayOffset }, (_, i) => i);
  const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const refreshDashboard = useCallback(() => {
    setProducts(storeManager.getProducts());
    setSales(storeManager.getSales());
    storeManager.syncProductsFromSupabase();
    storeManager.syncReceiptsFromSupabase();
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshDashboard();
    }, [refreshDashboard])
  );

  useEffect(() => {
    // Trigger smooth fade-in
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 350,
      useNativeDriver: true,
    }).start();

    refreshDashboard();
    if (isSupabaseConfigured) {
      initSupabaseRealtime();
    }

    const unsubscribe = storeManager.subscribe(() => {
      setProducts(storeManager.getProducts());
      setSales(storeManager.getSales());
    });

    return () => unsubscribe();
  }, [refreshDashboard]);

  const handleSelectDate = (day: number) => {
    setSelectedDate(day);

    // Spring pulse animation on selection
    bannerScale.setValue(0.96);
    Animated.spring(bannerScale, {
      toValue: 1,
      friction: 6,
      tension: 100,
      useNativeDriver: true,
    }).start();
  };

  const todayRevenue = storeManager.getTodayRevenue();
  const todaySalesCount = storeManager.getTodaySalesCount();
  const lowStockProducts = products.filter((p) => p.stock_quantity <= 5);
  const growthPercentage = storeManager.getRevenueGrowthPercentage();
  const curUser = storeManager.getCurrentUser();
  const effectiveBlocked = storeManager.getEffectiveBlockedPages(curUser);

  const getDayRevenue = (day: number) => {
    return storeManager.getDayRevenue(currentYear, currentMonth, day);
  };

  return (
    <PageLockGuard pageId="index" pageName="Главная">
      <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
        <ScrollView contentContainerStyle={styles.contentContainer}>
          {/* Revenue Header Banner */}
          <View style={styles.revenueCard}>
            <View style={styles.revenueHeader}>
              <Text style={styles.revenueLabel}>Выручка за сегодня</Text>
              <View style={styles.badgeLive}>
                <View style={styles.dotLive} />
                <Text style={styles.badgeLiveText}>{isSupabaseConfigured ? 'LIVE SUPABASE' : 'LIVE'}</Text>
              </View>
            </View>
            <Text style={styles.revenueAmount}>{formatCurrency(todayRevenue)}</Text>
            <View style={styles.revenueMetaRow}>
              <View style={styles.metaBadge}>
                <ShoppingBag size={14} color="#D1FAE5" />
                <Text style={styles.metaText}>{todaySalesCount} чеков сегодня</Text>
              </View>
              <View style={styles.metaBadge}>
                <TrendingUp size={14} color="#D1FAE5" />
                <Text style={styles.metaText}>
                  {growthPercentage >= 0 ? `+${growthPercentage}%` : `${growthPercentage}%`} к прошлому дню
                </Text>
              </View>
            </View>
          </View>

          {/* Quick Action Shortcuts */}
          <View style={styles.quickActionsRow}>
            {!effectiveBlocked.includes('scanner') && (
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: '#059669' }]}
                onPress={() => router.push('/scanner')}
                activeOpacity={0.8}
              >
                <ScanBarcode size={20} color="#FFFFFF" />
                <Text style={styles.actionBtnText}>Касса</Text>
              </TouchableOpacity>
            )}

            {!effectiveBlocked.includes('warehouse') && (
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: '#2563EB' }]}
                onPress={() => router.push('/warehouse')}
                activeOpacity={0.8}
              >
                <PackagePlus size={20} color="#FFFFFF" />
                <Text style={styles.actionBtnText}>Склад</Text>
              </TouchableOpacity>
            )}

            {!effectiveBlocked.includes('returns') && (
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: '#D97706' }]}
                onPress={() => router.push('/returns')}
                activeOpacity={0.8}
              >
                <RotateCcw size={20} color="#FFFFFF" />
                <Text style={styles.actionBtnText}>Возвраты</Text>
              </TouchableOpacity>
            )}

            {!effectiveBlocked.includes('reports') && (
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: '#7C3AED' }]}
                onPress={() => router.push('/reports')}
                activeOpacity={0.8}
              >
                <BarChart3 size={20} color="#FFFFFF" />
                <Text style={styles.actionBtnText}>Отчёты</Text>
              </TouchableOpacity>
            )}
          </View>

        {/* Low Stock Alert */}
        {lowStockProducts.length > 0 && (
          <TouchableOpacity
            style={styles.alertBox}
            onPress={() => router.push('/warehouse')}
            activeOpacity={0.8}
          >
            <AlertTriangle size={20} color="#D97706" />
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.alertTitle}>Внимание! Мало товаров на складе</Text>
              <Text style={styles.alertSub}>
                Заканчиваются {lowStockProducts.length} наименований (например: {lowStockProducts[0]?.name})
              </Text>
            </View>
            <ChevronRight size={18} color="#D97706" />
          </TouchableOpacity>
        )}

        {/* Redesigned Calendar Card */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <CalendarIcon size={20} color="#059669" />
              <Text style={styles.cardTitle}>Календарь продаж</Text>
            </View>
            <Text style={styles.monthSubtitle}>{currentMonthName}</Text>
          </View>

          {/* Weekday Labels Header */}
          <View style={styles.weekdaysHeaderRow}>
            {WEEKDAYS.map((wd) => (
              <Text key={wd} style={styles.weekdayLabel}>
                {wd}
              </Text>
            ))}
          </View>

          {/* Days Grid */}
          <View style={styles.calendarGrid}>
            {emptyOffsetArray.map((_, index) => (
              <View key={`empty-${index}`} style={styles.calendarCellWrapper} />
            ))}

            {daysArray.map((day) => {
              const today = currentDate.getDate();
              const isToday = day === today;
              const isFuture = day > today;
              const isSelected = day === selectedDate;
              const dayRev = getDayRevenue(day);

              return (
                <View key={day} style={styles.calendarCellWrapper}>
                  <TouchableOpacity
                    style={[
                      styles.calendarCell,
                      isToday && styles.cellToday,
                      isSelected && styles.cellSelected,
                      isFuture && styles.cellFuture,
                    ]}
                    onPress={() => handleSelectDate(day)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.cellDayText,
                        isToday && styles.textToday,
                        isSelected && styles.textSelected,
                        isFuture && styles.textFuture,
                      ]}
                    >
                      {day}
                    </Text>
                    {!isFuture && (
                      <Text
                        style={[
                          styles.cellRevenueText,
                          isSelected && styles.textSelected,
                        ]}
                        numberOfLines={1}
                      >
                        {Math.round(dayRev / 1000)}k
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>

          {/* Selected Day Revenue Detail Banner with Spring animation */}
          <Animated.View style={[styles.dayBreakdownBox, { transform: [{ scale: bannerScale }] }]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.dayBreakdownTitle}>
                Выручка за {selectedDate} {currentMonthName.split(' ')[0]}:
              </Text>
              <Text style={styles.dayBreakdownValue}>
                {selectedDate > currentDate.getDate()
                  ? '— (Будущий день)'
                  : formatCurrency(getDayRevenue(selectedDate))}
              </Text>
            </View>
            {selectedDate === currentDate.getDate() && (
              <View style={styles.todayBadge}>
                <Text style={styles.todayBadgeText}>Сегодня</Text>
              </View>
            )}
          </Animated.View>
        </View>

        {/* Recent Sales Feed */}
        <View style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTitle}>Последние продажи</Text>
            <TouchableOpacity onPress={() => router.push('/returns')}>
              <Text style={styles.linkText}>Все чеки</Text>
            </TouchableOpacity>
          </View>

          {sales.slice(0, 4).map((sale) => {
            const isReturned = sale.is_returned;
            return (
              <View key={sale.id} style={styles.saleItemRow}>
                <View
                  style={[
                    styles.saleIconBg,
                    isReturned && { backgroundColor: '#FEE2E2' },
                  ]}
                >
                  {isReturned ? (
                    <RotateCcw size={18} color="#DC2626" />
                  ) : (
                    <Receipt size={18} color="#059669" />
                  )}
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.saleProductName}>{sale.product_name}</Text>
                  <Text style={styles.saleMeta}>
                    {sale.quantity} шт • {sale.payment_method === 'cash' ? 'Наличные' : 'Карта'}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.salePrice,
                    isReturned && { color: '#DC2626', textDecorationLine: 'line-through' },
                  ]}
                >
                  {isReturned ? 'Возвращён' : `+${formatCurrency(sale.total_price)}`}
                </Text>
              </View>
            );
          })}
        </View>
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
    gap: 14,
  },
  revenueCard: {
    backgroundColor: '#047857',
    borderRadius: 20,
    padding: 20,
  },
  revenueHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  revenueLabel: {
    color: '#D1FAE5',
    fontSize: 14,
    fontWeight: '600',
  },
  badgeLive: {
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
  revenueAmount: {
    color: '#FFFFFF',
    fontSize: 30,
    fontWeight: 'bold',
    marginVertical: 10,
  },
  revenueMetaRow: {
    flexDirection: 'row',
    gap: 10,
  },
  metaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    gap: 6,
  },
  metaText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '500',
  },
  quickActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 14,
    gap: 6,
  },
  actionBtnText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 13,
  },
  alertBox: {
    backgroundColor: '#FEF3C7',
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  alertTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#92400E',
  },
  alertSub: {
    fontSize: 12,
    color: '#B45309',
    marginTop: 2,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#111827',
  },
  monthSubtitle: {
    fontSize: 13,
    color: '#059669',
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  weekdaysHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    paddingBottom: 6,
  },
  weekdayLabel: {
    width: '14.28%',
    textAlign: 'center',
    fontSize: 12,
    fontWeight: 'bold',
    color: '#6B7280',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -2,
  },
  calendarCellWrapper: {
    width: '14.28%',
    padding: 2,
  },
  calendarCell: {
    height: 48,
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#F3F4F6',
  },
  cellToday: {
    borderColor: '#059669',
    backgroundColor: '#ECFDF5',
  },
  cellSelected: {
    backgroundColor: '#059669',
    borderColor: '#047857',
  },
  cellDayText: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#374151',
  },
  cellRevenueText: {
    fontSize: 9,
    color: '#6B7280',
    marginTop: 2,
  },
  textToday: {
    color: '#059669',
  },
  textSelected: {
    color: '#FFFFFF',
  },
  cellFuture: {
    backgroundColor: '#FAFAFA',
    opacity: 0.6,
  },
  textFuture: {
    color: '#9CA3AF',
  },
  dayBreakdownBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    padding: 14,
    borderRadius: 12,
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  dayBreakdownTitle: {
    fontSize: 12,
    color: '#047857',
    fontWeight: '600',
  },
  dayBreakdownValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#059669',
    marginTop: 2,
  },
  todayBadge: {
    backgroundColor: '#059669',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  todayBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: 'bold',
  },
  linkText: {
    fontSize: 13,
    color: '#2563EB',
    fontWeight: '600',
  },
  saleItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  saleIconBg: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#ECFDF5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  saleProductName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  saleMeta: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  salePrice: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#059669',
  },
});
