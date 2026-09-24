import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { Lock, ShieldAlert, ArrowLeft } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { storeManager } from './mockData';

interface PageLockGuardProps {
  pageId: string;
  pageName: string;
  children: React.ReactNode;
}

export function PageLockGuard({ pageId, pageName, children }: PageLockGuardProps) {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState(storeManager.getCurrentUser());

  useEffect(() => {
    setCurrentUser(storeManager.getCurrentUser());
    const unsubscribe = storeManager.subscribe(() => {
      setCurrentUser(storeManager.getCurrentUser());
    });
    return () => unsubscribe();
  }, []);

  const isSuper = storeManager.isSuperAdmin(currentUser);
  const blockedPages = currentUser?.blocked_pages || [];
  const isBlocked = !isSuper && blockedPages.includes(pageId);

  if (isBlocked) {
    return (
      <View style={styles.lockedContainer}>
        <View style={styles.lockIconCircle}>
          <Lock size={44} color="#DC2626" />
        </View>

        <View style={styles.lockBadge}>
          <ShieldAlert size={14} color="#DC2626" />
          <Text style={styles.lockBadgeText}>ДОСТУП ОГРАНИЧЕН</Text>
        </View>

        <Text style={styles.lockedTitle}>Страница заблокирована</Text>
        <Text style={styles.lockedDesc}>
          Суперадминистратор отключил доступ к разделу «{pageName}» для вашего аккаунта ({currentUser?.name || 'Пользователь'}).
        </Text>

        <View style={styles.lockedInfoBox}>
          <Text style={styles.lockedInfoText}>
            Для получения доступа обратитесь к владельцу или суперадминистратору магазина.
          </Text>
        </View>

        <TouchableOpacity style={styles.backBtn} onPress={() => router.replace('/(tabs)')}>
          <ArrowLeft size={18} color="#FFFFFF" />
          <Text style={styles.backBtnText}>Вернуться на главную</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  lockedContainer: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    gap: 12,
  },
  lockIconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FECACA',
    marginBottom: 6,
  },
  lockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  lockBadgeText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#DC2626',
    letterSpacing: 0.5,
  },
  lockedTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#111827',
    textAlign: 'center',
  },
  lockedDesc: {
    fontSize: 14,
    color: '#4B5563',
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 320,
  },
  lockedInfoBox: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 12,
    maxWidth: 320,
    marginTop: 6,
  },
  lockedInfoText: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 16,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#059669',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 12,
  },
  backBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
});
