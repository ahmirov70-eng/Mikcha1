import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Alert,
  FlatList,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import {
  User,
  ShieldCheck,
  ShieldAlert,
  Store,
  Mail,
  UserPlus,
  LogOut,
  Calendar,
  ChevronRight,
  Lock,
} from 'lucide-react-native';
import { storeManager } from '../../lib/mockData';
import { UserAccount } from '../../types/database';

export default function ProfileScreen() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(storeManager.getCurrentUser());
  const isSuper = storeManager.isSuperAdmin(currentUser);

  const refreshData = useCallback(() => {
    setCurrentUser(storeManager.getCurrentUser());
    storeManager.syncUsersFromSupabase();
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshData();
    }, [refreshData])
  );

  useEffect(() => {
    refreshData();
    const unsubscribe = storeManager.subscribe(() => {
      setCurrentUser(storeManager.getCurrentUser());
    });
    return () => unsubscribe();
  }, [refreshData]);

  const handleLogout = () => {
    Alert.alert('Выход из аккаунта', 'Вы действительно хотите выйти из системы?', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Выйти',
        style: 'destructive',
        onPress: () => {
          storeManager.logoutUser();
          router.replace('/auth/login');
        },
      },
    ]);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Blocked Account Warning */}
      {currentUser?.is_blocked && (
        <View style={styles.blockedAlertCard}>
          <ShieldAlert size={28} color="#DC2626" />
          <View style={{ flex: 1 }}>
            <Text style={styles.blockedAlertTitle}>Аккаунт заблокирован</Text>
            <Text style={styles.blockedAlertSub}>
              Суперадминистратор ограничил доступ для вашего профиля.
            </Text>
          </View>
        </View>
      )}

      {/* Current Active User Profile Card */}
      {currentUser ? (
        <View style={styles.profileCard}>
          <View style={styles.avatarLarge}>
            <Text style={styles.avatarLargeText}>{currentUser.name[0]}</Text>
          </View>

          <Text style={styles.userName}>{currentUser.name}</Text>
          <View style={[styles.roleBadge, isSuper && { backgroundColor: '#FEF3C7' }]}>
            {isSuper ? (
              <ShieldAlert size={14} color="#D97706" />
            ) : (
              <ShieldCheck size={14} color="#059669" />
            )}
            <Text style={[styles.roleBadgeText, isSuper && { color: '#D97706' }]}>
              {currentUser.role}
            </Text>
          </View>

          <View style={styles.infoDivider} />

          <View style={styles.infoRow}>
            <Mail size={18} color="#6B7280" />
            <Text style={styles.infoText}>{currentUser.email}</Text>
          </View>

          <View style={styles.infoRow}>
            <Store size={18} color="#6B7280" />
            <Text style={styles.infoText}>{currentUser.store_name}</Text>
          </View>

          <View style={styles.infoRow}>
            <Calendar size={18} color="#6B7280" />
            <Text style={styles.infoText}>
              Зарегистрирован:{' '}
              {new Date(currentUser.created_at).toLocaleDateString('ru-RU')}
            </Text>
          </View>

          <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
            <LogOut size={18} color="#EF4444" />
            <Text style={styles.logoutBtnText}>Выйти из аккаунта</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.noUserCard}>
          <User size={48} color="#9CA3AF" />
          <Text style={styles.noUserTitle}>Вы не вошли в систему</Text>
          <TouchableOpacity
            style={styles.loginActionBtn}
            onPress={() => router.push('/auth/login')}
          >
            <Text style={styles.loginActionText}>Войти в аккаунт</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── Superadmin Exclusive Control Panel Button (Visible ONLY to Superadmin) ── */}
      {isSuper && (
        <TouchableOpacity
          style={styles.superadminCardBtn}
          activeOpacity={0.85}
          onPress={() => router.push('/superadmin')}
        >
          <View style={styles.superadminIconCircle}>
            <ShieldAlert size={24} color="#B45309" />
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={styles.superadminBtnTitle}>Панель SuperAdmin</Text>
              <View style={styles.exclusiveBadge}>
                <Text style={styles.exclusiveBadgeText}>ТОЛЬКО ВЫ</Text>
              </View>
            </View>
            <Text style={styles.superadminBtnSub}>
              Блокировка пользователей, управление доступом к страницам и удаление аккаунтов
            </Text>
          </View>
          <ChevronRight size={22} color="#B45309" />
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  content: {
    padding: 16,
    gap: 16,
  },
  profileCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  avatarLarge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#ECFDF5',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 3,
    borderColor: '#A7F3D0',
  },
  avatarLargeText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#059669',
  },
  userName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    marginTop: 6,
  },
  roleBadgeText: {
    color: '#047857',
    fontSize: 13,
    fontWeight: 'bold',
  },
  infoDivider: {
    height: 1,
    backgroundColor: '#F3F4F6',
    width: '100%',
    marginVertical: 16,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
    marginBottom: 10,
  },
  infoText: {
    fontSize: 14,
    color: '#4B5563',
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FEE2E2',
    width: '100%',
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 12,
  },
  logoutBtnText: {
    color: '#DC2626',
    fontSize: 14,
    fontWeight: 'bold',
  },
  noUserCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 30,
    alignItems: 'center',
  },
  noUserTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#4B5563',
    marginTop: 12,
  },
  loginActionBtn: {
    backgroundColor: '#059669',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    marginTop: 16,
  },
  loginActionText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  registerBanner: {
    backgroundColor: '#047857',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  bannerTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
  bannerSub: {
    color: '#A7F3D0',
    fontSize: 12,
    marginTop: 2,
  },
  addAccountBtn: {
    backgroundColor: '#059669',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#34D399',
  },
  addAccountBtnText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 13,
  },
  accountsSection: {
    gap: 10,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#111827',
  },
  usersList: {
    gap: 8,
  },
  userItemCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  userItemActive: {
    borderColor: '#059669',
    backgroundColor: '#ECFDF5',
  },
  userMiniAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  userMiniAvatarActive: {
    backgroundColor: '#059669',
  },
  userMiniAvatarText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#4B5563',
  },
  userMiniAvatarTextActive: {
    color: '#FFFFFF',
  },
  userItemName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  userItemSub: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  activeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  activeTagText: {
    fontSize: 12,
    color: '#059669',
    fontWeight: 'bold',
  },
  switchText: {
    fontSize: 12,
    color: '#2563EB',
    fontWeight: '600',
  },
  blockedAlertCard: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1.5,
    borderColor: '#F87171',
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  blockedAlertTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#DC2626',
  },
  blockedAlertSub: {
    fontSize: 12,
    color: '#991B1B',
    marginTop: 2,
  },
  superadminCardBtn: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1.5,
    borderColor: '#FCD34D',
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#D97706',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  superadminIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FEF3C7',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  superadminBtnTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#92400E',
  },
  superadminBtnSub: {
    fontSize: 11,
    color: '#B45309',
    marginTop: 2,
    lineHeight: 15,
  },
  exclusiveBadge: {
    backgroundColor: '#D97706',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  exclusiveBadgeText: {
    color: '#FFFFFF',
    fontSize: 8,
    fontWeight: 'bold',
  },
});
