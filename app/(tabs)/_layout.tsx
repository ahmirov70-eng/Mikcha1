import React, { useState, useEffect } from 'react';
import { Tabs, useRouter } from 'expo-router';
import { TouchableOpacity, View, Text, StyleSheet, Platform } from 'react-native';
import { LayoutDashboard, Package, ShoppingCart, RotateCcw, BarChart3, User, ShieldAlert, LogOut } from 'lucide-react-native';
import { storeManager } from '../../lib/mockData';

function ProfileHeaderButton() {
  const router = useRouter();
  const currentUser = storeManager.getCurrentUser();
  const isSuper = storeManager.isSuperAdmin(currentUser);

  return (
    <TouchableOpacity
      onPress={() => router.push('/(tabs)/profile')}
      style={styles.profileBtn}
      activeOpacity={0.7}
    >
      <View style={[styles.profileIconCircle, isSuper && { backgroundColor: '#FEF3C7', borderColor: '#FCD34D' }]}>
        {isSuper ? <ShieldAlert size={18} color="#D97706" /> : <User size={18} color="#047857" />}
      </View>
    </TouchableOpacity>
  );
}

export default function TabsLayout() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState(storeManager.getCurrentUser());

  useEffect(() => {
    setCurrentUser(storeManager.getCurrentUser());
    const unsubscribe = storeManager.subscribe(() => {
      setCurrentUser(storeManager.getCurrentUser());
    });
    return () => unsubscribe();
  }, []);

  const blockedPages = storeManager.getEffectiveBlockedPages(currentUser);
  const isBlocked = Boolean(currentUser?.is_blocked);

  if (isBlocked) {
    return (
      <View style={styles.blockedScreenContainer}>
        <View style={styles.blockedScreenCard}>
          <ShieldAlert size={56} color="#DC2626" />
          <Text style={styles.blockedScreenTitle}>Аккаунт заблокирован</Text>
          <Text style={styles.blockedScreenSub}>
            Свяжитесь с администратором для разблокировки аккаунта.
          </Text>
          <TouchableOpacity
            style={styles.blockedLogoutBtn}
            onPress={() => {
              storeManager.logoutUser();
              router.replace('/auth/login');
            }}
          >
            <LogOut size={18} color="#FFFFFF" />
            <Text style={styles.blockedLogoutBtnText}>Выйти из аккаунта</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: '#047857' },
        headerTintColor: '#FFFFFF',
        headerTitleStyle: { fontWeight: 'bold', fontSize: 18 },
        headerRight: () => <ProfileHeaderButton />,
        tabBarActiveTintColor: '#059669',
        tabBarInactiveTintColor: '#6B7280',
        tabBarStyle: styles.tabBar,
        tabBarItemStyle: styles.tabBarItem,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Главная',
          headerTitle: 'Дашборд',
          href: blockedPages.includes('index') ? null : undefined,
          tabBarIcon: ({ color, focused }) => (
            <View style={[styles.iconContainer, focused && styles.iconContainerActive]}>
              <LayoutDashboard color={color} size={22} strokeWidth={focused ? 2.2 : 1.8} />
            </View>
          ),
          tabBarLabel: ({ color, focused }) => (
            <Text style={[styles.labelText, { color, fontWeight: focused ? '700' : '500' }]}>
              Главная
            </Text>
          ),
        }}
      />

      <Tabs.Screen
        name="warehouse"
        options={{
          title: 'Склад',
          headerTitle: 'Склад и Товары',
          href: blockedPages.includes('warehouse') ? null : undefined,
          tabBarIcon: ({ color, focused }) => (
            <View style={[styles.iconContainer, focused && styles.iconContainerActive]}>
              <Package color={color} size={22} strokeWidth={focused ? 2.2 : 1.8} />
            </View>
          ),
          tabBarLabel: ({ color, focused }) => (
            <Text style={[styles.labelText, { color, fontWeight: focused ? '700' : '500' }]}>
              Склад
            </Text>
          ),
        }}
      />

      {/* Center Action Tab — Касса */}
      <Tabs.Screen
        name="scanner"
        options={{
          title: 'Касса',
          headerTitle: 'Касса',
          href: blockedPages.includes('scanner') ? null : undefined,
          tabBarIcon: ({ color, focused }) => (
            <View style={[styles.cashierBadge, focused && styles.cashierBadgeActive]}>
              <ShoppingCart color={focused ? '#FFFFFF' : '#059669'} size={20} strokeWidth={2.2} />
            </View>
          ),
          tabBarLabel: ({ color, focused }) => (
            <Text style={[styles.labelText, { color: focused ? '#059669' : color, fontWeight: focused ? '700' : '600' }]}>
              Касса
            </Text>
          ),
        }}
      />

      <Tabs.Screen
        name="returns"
        options={{
          title: 'Возвраты',
          headerTitle: 'Возврат Продаж',
          href: blockedPages.includes('returns') ? null : undefined,
          tabBarIcon: ({ color, focused }) => (
            <View style={[styles.iconContainer, focused && styles.iconContainerActive]}>
              <RotateCcw color={color} size={22} strokeWidth={focused ? 2.2 : 1.8} />
            </View>
          ),
          tabBarLabel: ({ color, focused }) => (
            <Text style={[styles.labelText, { color, fontWeight: focused ? '700' : '500' }]}>
              Возвраты
            </Text>
          ),
        }}
      />

      <Tabs.Screen
        name="reports"
        options={{
          title: 'Отчёты',
          headerTitle: 'Отчёты и Аналитика',
          href: blockedPages.includes('reports') ? null : undefined,
          tabBarIcon: ({ color, focused }) => (
            <View style={[styles.iconContainer, focused && styles.iconContainerActive]}>
              <BarChart3 color={color} size={22} strokeWidth={focused ? 2.2 : 1.8} />
            </View>
          ),
          tabBarLabel: ({ color, focused }) => (
            <Text style={[styles.labelText, { color, fontWeight: focused ? '700' : '500' }]}>
              Отчёты
            </Text>
          ),
        }}
      />

      {/* Profile — completely hidden from bottom tab bar via href: null */}
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Профиль',
          headerTitle: 'Профиль',
          headerRight: undefined,
          href: null,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    height: Platform.OS === 'ios' ? 76 : 64,
    paddingBottom: Platform.OS === 'ios' ? 16 : 8,
    paddingTop: 6,
    elevation: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
  },
  tabBarItem: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 2,
  },
  iconContainer: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 18,
  },
  iconContainerActive: {
    backgroundColor: '#ECFDF5',
  },
  cashierBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#ECFDF5',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#059669',
  },
  cashierBadgeActive: {
    backgroundColor: '#059669',
    borderColor: '#047857',
  },
  labelText: {
    fontSize: 11,
    marginTop: 2,
    textAlign: 'center',
  },
  profileBtn: {
    marginRight: 14,
  },
  profileIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#ECFDF5',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
  },
  blockedScreenContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#111827',
    padding: 20,
  },
  blockedScreenCard: {
    backgroundColor: '#1F2937',
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    gap: 12,
    maxWidth: 340,
    borderWidth: 1,
    borderColor: '#374151',
  },
  blockedScreenTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#EF4444',
    marginTop: 6,
  },
  blockedScreenSub: {
    fontSize: 13,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 18,
  },
  blockedLogoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#DC2626',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 10,
  },
  blockedLogoutBtnText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
});
