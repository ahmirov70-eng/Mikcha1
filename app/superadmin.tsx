import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Modal,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import {
  ShieldAlert,
  ShieldCheck,
  UserPlus,
  Trash2,
  Lock,
  Unlock,
  Sliders,
  Search,
  Users,
  Store,
  Mail,
  KeyRound,
  CheckCircle2,
  X,
  Eye,
  EyeOff,
  Package,
  ShoppingCart,
  RotateCcw,
  BarChart3,
  Sparkles,
  Copy,
  Save,
  LogIn,
  RefreshCw,
  Database,
  Cloud,
  LayoutDashboard,
} from 'lucide-react-native';
import { storeManager, ROLE_PERMISSIONS } from '../lib/mockData';
import { isSupabaseConfigured } from '../lib/supabase';
import { UserAccount, UserRole } from '../types/database';

const AVAILABLE_PAGES = [
  { id: 'index', label: 'Главная', icon: LayoutDashboard, desc: 'Дашборд, показатели выручки и сводка' },
  { id: 'warehouse', label: 'Склад', icon: Package, desc: 'Управление товарами, приёмка и остатки' },
  { id: 'scanner', label: 'Касса', icon: ShoppingCart, desc: 'Сканирование товаров и оформление чеков' },
  { id: 'returns', label: 'Возвраты', icon: RotateCcw, desc: 'История чеков и возврат товаров' },
  { id: 'reports', label: 'Отчёты', icon: BarChart3, desc: 'Выручка, статистика продаж и аналитика' },
];

export default function SuperadminScreen() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(storeManager.getCurrentUser());
  const [users, setUsers] = useState<UserAccount[]>(storeManager.getUsers());
  const [searchQuery, setSearchQuery] = useState('');
  const [isSuper, setIsSuper] = useState(storeManager.isSuperAdmin());

  // Modal: Create User
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newStoreName, setNewStoreName] = useState('Хозмаг Учёт');
  const [newRole, setNewRole] = useState<UserRole>('Кассир');
  const [newBlockedPages, setNewBlockedPages] = useState<string[]>(['index', 'reports']);
  const [isCreating, setIsCreating] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  // Modal: Selected User Management (Interactive Details Modal)
  const [selectedUser, setSelectedUser] = useState<UserAccount | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editRole, setEditRole] = useState<UserRole>('Кассир');
  const [editStoreName, setEditStoreName] = useState('Хозмаг Учёт');
  const [editIsBlocked, setEditIsBlocked] = useState(false);
  const [editBlockedPages, setEditBlockedPages] = useState<string[]>([]);
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  // Confirm-delete modal (replaces Alert.alert for web compatibility)
  const [confirmDeleteUser, setConfirmDeleteUser] = useState<UserAccount | null>(null);

  // Use a ref to track selectedUser inside refreshData without it being a dep
  const selectedUserRef = React.useRef<UserAccount | null>(null);
  selectedUserRef.current = selectedUser;

  const refreshData = useCallback(async () => {
    setIsSyncing(true);
    try {
      await storeManager.syncUsersFromSupabase();
    } catch (e) {
      console.log('Error refreshing from Supabase:', e);
    } finally {
      setIsSyncing(false);
    }
    const cur = storeManager.getCurrentUser();
    setCurrentUser(cur);
    const allUsers = storeManager.getUsers();
    setUsers(allUsers);
    setIsSuper(storeManager.isSuperAdmin(cur));

    // If a user modal is currently open, keep it in sync with fresh data
    const currentSelected = selectedUserRef.current;
    if (currentSelected) {
      const freshUser = allUsers.find((u) => u.id === currentSelected.id);
      if (freshUser) {
        setSelectedUser(freshUser);
      }
    }
  }, []); // no deps — selectedUser is read via ref

  useFocusEffect(
    useCallback(() => {
      refreshData();
    }, [refreshData])
  );

  // Run once on mount — separate from refreshData to avoid re-subscribing on every render
  useEffect(() => {
    refreshData();
    const unsubscribe = storeManager.subscribe(() => {
      const cur = storeManager.getCurrentUser();
      setCurrentUser(cur);
      const allUsers = storeManager.getUsers();
      setUsers(allUsers);
      setIsSuper(storeManager.isSuperAdmin(cur));
    });
    return () => unsubscribe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Open User Management Modal
  const handleOpenUserModal = (user: UserAccount) => {
    setSelectedUser(user);
    setEditName(user.name);
    setEditEmail(user.email);
    setEditPassword(user.password || '');
    setEditRole(user.role);
    setEditStoreName(user.store_name || 'Хозмаг Учёт');
    setEditIsBlocked(Boolean(user.is_blocked));
    setEditBlockedPages(storeManager.getEffectiveBlockedPages(user));
    setShowEditPassword(false);
  };

  // Security guard: If not superadmin, render restricted view
  if (!isSuper) {
    return (
      <View style={styles.restrictedContainer}>
        <ShieldAlert size={64} color="#EF4444" />
        <Text style={styles.restrictedTitle}>Доступ ограничен</Text>
        <Text style={styles.restrictedSub}>
          Панель суперадминистратора доступна только владельцу системы.
        </Text>
        <TouchableOpacity style={styles.backButton} onPress={() => router.replace('/auth/login')}>
          <LogIn size={18} color="#FFFFFF" />
          <Text style={styles.backButtonText}>Войти как Суперадминистратор</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Filtered Users
  const filteredUsers = users.filter((u) => {
    const q = searchQuery.toLowerCase().trim();
    return (
      u.name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.store_name.toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q)
    );
  });

  const totalUsers = users.length;
  const blockedCount = users.filter((u) => u.is_blocked).length;
  const activeCount = totalUsers - blockedCount;

  // Handler: Save User Changes (Email, Password, Name, Role, Pages, Block status)
  const handleSaveUserChanges = async () => {
    if (!selectedUser) return;
    if (!editName.trim() || !editEmail.trim()) {
      Alert.alert('Ошибка', 'ФИО и Email не могут быть пустыми');
      return;
    }

    setIsSaving(true);
    try {
      await storeManager.updateUserCredentials(selectedUser.id, {
        name: editName.trim(),
        email: editEmail.trim().toLowerCase(),
        password: editPassword.trim(),
        role: editRole,
        store_name: editStoreName.trim() || 'Хозмаг Учёт',
        is_blocked: editIsBlocked,
        blocked_pages: editBlockedPages,
      });

      setSelectedUser((prev) =>
        prev
          ? {
              ...prev,
              name: editName.trim(),
              email: editEmail.trim().toLowerCase(),
              password: editPassword.trim(),
              role: editRole,
              store_name: editStoreName.trim() || 'Хозмаг Учёт',
              is_blocked: editIsBlocked,
              blocked_pages: editBlockedPages,
            }
          : null
      );

      Alert.alert(
        'Данные сохранены! 💾',
        `Изменения для пользователя «${editName.trim()}» успешно обновлены и синхронизированы в RealTime!`
      );
    } catch (err: any) {
      Alert.alert('Ошибка сохранения', err?.message || 'Не удалось сохранить изменения');
    } finally {
      setIsSaving(false);
    }
  };

  // Handler: Instant Toggle Block in Modal
  const handleToggleBlockInModal = async () => {
    if (!selectedUser) return;
    const nextBlocked = !editIsBlocked;
    setEditIsBlocked(nextBlocked);
    await storeManager.toggleBlockUser(selectedUser.id, nextBlocked);
    Alert.alert(
      nextBlocked ? 'Пользователь заблокирован ⛔' : 'Пользователь разблокирован ✅',
      `Аккаунт «${selectedUser.name}» теперь ${nextBlocked ? 'заблокирован' : 'активен'} в RealTime.`
    );
  };

  // Handler: Toggle Individual Page Lock in Modal
  const handleTogglePageLock = (pageId: string) => {
    const isCurrentlyBlocked = editBlockedPages.includes(pageId);
    let nextPages: string[];
    if (isCurrentlyBlocked) {
      nextPages = editBlockedPages.filter((p) => p !== pageId);
    } else {
      nextPages = [...editBlockedPages, pageId];
    }
    setEditBlockedPages(nextPages);
    if (selectedUser) {
      storeManager.setBlockedPages(selectedUser.id, nextPages);
    }
  };

  // Handler: Delete User — opens custom confirm modal (Alert.alert doesn't work on web)
  const handleDeleteUser = (user: UserAccount) => {
    if (user.id === currentUser?.id) {
      Alert.alert('Предупреждение', 'Вы не можете удалить собственный аккаунт суперадминистратора.');
      return;
    }
    setConfirmDeleteUser(user);
  };

  // Handler: Confirm actual deletion after user clicks "Удалить" in the confirm modal
  const handleConfirmDelete = async () => {
    if (!confirmDeleteUser) return;
    const userName = confirmDeleteUser.name;
    setIsDeleting(true);
    try {
      await storeManager.deleteUser(confirmDeleteUser.id);
      setConfirmDeleteUser(null);
      setSelectedUser(null);
      Alert.alert('Успех', `Аккаунт «${userName}» удалён из базы данных.`);
    } catch (e: any) {
      Alert.alert('Ошибка', e?.message || 'Не удалось удалить пользователя');
    } finally {
      setIsDeleting(false);
    }
  };

  // Handler: Copy Credentials helper
  const handleCopyCredentials = (user: UserAccount) => {
    const textToCopy = `Логин: ${user.email}\nПароль: ${user.password || '123456'}`;
    if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(textToCopy);
    }
    Alert.alert(
      'Данные для входа',
      `Логин (Email): ${user.email}\nПароль: ${user.password || '123456'}\n\nДанные скопированы! Вы можете вставить их в форму входа (Login Page).`
    );
  };

  // Handler: Create User via Superadmin
  const handleCreateUser = async () => {
    if (!newName.trim() || !newEmail.trim() || !newPassword.trim()) {
      Alert.alert('Ошибка', 'Заполните все обязательные поля (Имя, Email, Пароль)');
      return;
    }

    setIsCreating(true);
    try {
      const created = await storeManager.createUserBySuperAdmin({
        name: newName.trim(),
        email: newEmail.trim().toLowerCase(),
        password: newPassword.trim(),
        role: newRole,
        store_name: newStoreName.trim() || 'Хозмаг Учёт',
        blocked_pages: newBlockedPages,
        is_superadmin: newRole === 'Суперадминистратор',
      });

      setIsAddModalOpen(false);
      const savedEmail = newEmail.trim().toLowerCase();
      const savedPassword = newPassword.trim();

      setNewName('');
      setNewEmail('');
      setNewPassword('');
      setNewRole('Кассир');
      setNewBlockedPages(['index', 'reports']);

      Alert.alert(
        'Пользователь создан! 🎉',
        `Аккаунт ${created.name} успешно зарегистрирован.\n\nЛогин: ${savedEmail}\nПароль: ${savedPassword}\n\nВы можете скопировать эти данные и использовать на странице логина.`,
        [
          {
            text: 'Скопировать логин/пароль',
            onPress: () => handleCopyCredentials(created),
          },
          { text: 'Отлично' },
        ]
      );
    } catch (err: any) {
      Alert.alert('Ошибка создания', err?.message || 'Не удалось зарегистрировать пользователя');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* ── Top Header / Standalone Web Portal Bar ── */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.portalIconBadge}>
            <ShieldCheck size={26} color="#FFFFFF" />
          </View>
          <View>
            <View style={styles.headerTitleRow}>
              <Text style={styles.headerTitle}>SuperAdmin Портал</Text>
              <View style={styles.realtimeBadge}>
                <View style={styles.realtimeDot} />
                <Text style={styles.realtimeText}>{isSupabaseConfigured ? 'REALTIME LIVE' : 'LOCAL'}</Text>
              </View>
            </View>
            <Text style={styles.headerSub}>
              Центральное управление пользователями, страницами и паролями
            </Text>
          </View>
        </View>

        <View style={styles.headerRight}>
          <TouchableOpacity
            style={[styles.refreshTopBtn, isSyncing && { opacity: 0.7 }]}
            onPress={refreshData}
            activeOpacity={0.8}
            disabled={isSyncing}
          >
            {isSyncing ? (
              <ActivityIndicator size="small" color="#34D399" />
            ) : (
              <RefreshCw size={16} color="#E5E7EB" />
            )}
            <Text style={styles.refreshTopBtnText}>
              {isSyncing ? 'Синхронизация...' : 'Обновить из Supabase'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.logoutBtn}
            onPress={async () => {
              await storeManager.logoutUser();
              router.replace('/auth/login');
            }}
            activeOpacity={0.8}
          >
            <LogIn size={16} color="#FFFFFF" />
            <Text style={styles.logoutBtnText}>Сменить аккаунт</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 60 }}>
        {/* ── Stats Row ── */}
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { borderLeftColor: '#2563EB' }]}>
            <Text style={styles.statLabel}>Всего аккаунтов</Text>
            <Text style={[styles.statValue, { color: '#2563EB' }]}>{totalUsers}</Text>
            <Text style={styles.statHint}>В базе данных</Text>
          </View>
          <View style={[styles.statCard, { borderLeftColor: '#059669' }]}>
            <Text style={styles.statLabel}>Активные пользователи</Text>
            <Text style={[styles.statValue, { color: '#059669' }]}>{activeCount}</Text>
            <Text style={styles.statHint}>Имеют доступ к входу</Text>
          </View>
          <View style={[styles.statCard, { borderLeftColor: '#DC2626' }]}>
            <Text style={styles.statLabel}>Заблокированные</Text>
            <Text style={[styles.statValue, { color: '#DC2626' }]}>{blockedCount}</Text>
            <Text style={styles.statHint}>Вход запрещён</Text>
          </View>
        </View>

        {/* ── Action: Create New User Button ── */}
        <View style={styles.actionBanner}>
          <View style={{ flex: 1 }}>
            <Text style={styles.actionBannerTitle}>Регистрация сотрудников</Text>
            <Text style={styles.actionBannerSub}>
              Создавайте логины и пароли сотрудникам здесь, после чего они могут входить в систему.
            </Text>
          </View>
          <TouchableOpacity
            style={styles.createUserBtn}
            activeOpacity={0.85}
            onPress={() => setIsAddModalOpen(true)}
          >
            <UserPlus size={18} color="#FFFFFF" />
            <Text style={styles.createUserBtnText}>+ Создать пользователя</Text>
          </TouchableOpacity>
        </View>

        {/* ── Search Bar ── */}
        <View style={styles.searchBox}>
          <Search size={18} color="#9CA3AF" />
          <TextInput
            style={styles.searchInput}
            placeholder="Поиск по имени, email, роли или магазину..."
            placeholderTextColor="#9CA3AF"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery ? (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <X size={18} color="#9CA3AF" />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* ── Section Title ── */}
        <View style={styles.sectionHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Users size={20} color="#1F2937" />
            <Text style={styles.sectionTitle}>
              Пользователи системы ({filteredUsers.length})
            </Text>
          </View>
          <Text style={styles.sectionSubHint}>Нажмите на пользователя для управления</Text>
        </View>

        {/* ── User Cards Grid / List ── */}
        {filteredUsers.length === 0 ? (
          <View style={styles.emptyCard}>
            <Users size={48} color="#D1D5DB" />
            <Text style={styles.emptyText}>Пользователи не найдены</Text>
            <Text style={styles.emptySub}>Попробуйте изменить поисковый запрос</Text>
          </View>
        ) : (
          filteredUsers.map((user) => {
            const isMe = user.id === currentUser?.id;
            const isUserSuper = storeManager.isSuperAdmin(user);
            const userBlockedPages = storeManager.getEffectiveBlockedPages(user);
            const userAllowedPages = AVAILABLE_PAGES.filter((p) => !userBlockedPages.includes(p.id));

            return (
              <TouchableOpacity
                key={user.id}
                style={[
                  styles.userCard,
                  user.is_blocked && styles.userCardBlocked,
                  isUserSuper && styles.userCardSuper,
                ]}
                activeOpacity={0.85}
                onPress={() => handleOpenUserModal(user)}
              >
                {/* User Top Info */}
                <View style={styles.userCardTop}>
                  <View
                    style={[
                      styles.userAvatar,
                      user.is_blocked && { backgroundColor: '#FEE2E2' },
                      isUserSuper && { backgroundColor: '#FEF3C7' },
                    ]}
                  >
                    <Text
                      style={[
                        styles.userAvatarText,
                        user.is_blocked && { color: '#DC2626' },
                        isUserSuper && { color: '#D97706' },
                      ]}
                    >
                      {user.name.charAt(0).toUpperCase()}
                    </Text>
                  </View>

                  <View style={{ flex: 1, marginRight: 10 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <Text style={styles.userNameText}>{user.name}</Text>
                      {isMe && (
                        <View style={styles.youBadge}>
                          <Text style={styles.youBadgeText}>ВЫ</Text>
                        </View>
                      )}
                    </View>

                    <View style={styles.userMetaRow}>
                      <Mail size={13} color="#6B7280" />
                      <Text style={styles.userMetaText}>{user.email}</Text>
                    </View>

                    {user.password ? (
                      <View style={styles.userMetaRow}>
                        <KeyRound size={13} color="#6B7280" />
                        <Text style={styles.userMetaPassword}>Пароль: {user.password}</Text>
                      </View>
                    ) : null}

                    <View style={styles.userMetaRow}>
                      <Store size={13} color="#6B7280" />
                      <Text style={styles.userMetaText}>{user.store_name}</Text>
                    </View>

                    <View style={styles.userMetaRow}>
                      <Database size={12} color={!user.id.startsWith('user-') ? '#34D399' : '#94A3B8'} />
                      <Text
                        style={[
                          styles.userMetaText,
                          !user.id.startsWith('user-') && { color: '#34D399', fontWeight: '600' },
                        ]}
                      >
                        {!user.id.startsWith('user-') ? 'Supabase DB ☁️' : 'Локальный'}
                      </Text>
                    </View>
                  </View>

                  {/* Status & Role Badges */}
                  <View style={{ alignItems: 'flex-end', gap: 6 }}>
                    <View
                      style={[
                        styles.statusBadge,
                        user.is_blocked ? styles.statusBadgeBlocked : styles.statusBadgeActive,
                      ]}
                    >
                      <View
                        style={[
                          styles.statusDot,
                          { backgroundColor: user.is_blocked ? '#DC2626' : '#059669' },
                        ]}
                      />
                      <Text
                        style={[
                          styles.statusBadgeText,
                          { color: user.is_blocked ? '#DC2626' : '#059669' },
                        ]}
                      >
                        {user.is_blocked ? 'ЗАБЛОКИРОВАН' : 'АКТИВЕН'}
                      </Text>
                    </View>

                    <View style={styles.roleBadge}>
                      <Text style={styles.roleBadgeText}>{user.role}</Text>
                    </View>
                  </View>
                </View>

                {/* Page Access — показываем РАЗРЕШЁННЫЕ страницы */}
                <View style={styles.blockedPagesSection}>
                  <Text style={styles.blockedPagesLabel}>Доступные разделы:</Text>
                  {isUserSuper ? (
                    <View style={styles.allowedFullBadge}>
                      <CheckCircle2 size={12} color="#D97706" />
                      <Text style={[styles.allAccessText, { color: '#D97706' }]}>Все разделы + SuperAdmin Портал</Text>
                    </View>
                  ) : (
                    <View style={styles.allowedPagesRow}>
                      {userAllowedPages.map((page, idx) => {
                        const IconComp = page.icon;
                        return (
                          <View key={page.id} style={styles.allowedPageChip}>
                            <Text style={styles.allowedPageNum}>{idx + 1})</Text>
                            <IconComp size={12} color="#34D399" />
                            <Text style={styles.allowedPageLabel}>{page.label}</Text>
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>

                {/* Card Footer Hint */}
                <View style={styles.userCardFooter}>
                  <Text style={styles.clickHintText}>⚙️ Нажмите для управления, блокировки и смены пароля →</Text>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      {/* ══════════════════════════════════════════════════════════════════════════ */}
      {/* ── MODAL: Interactive User Management (All 4 Requested Features) ── */}
      {/* ══════════════════════════════════════════════════════════════════════════ */}
      <Modal visible={Boolean(selectedUser)} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContentLarge}>
            {/* Modal Header */}
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={styles.userModalAvatar}>
                  <Text style={styles.userModalAvatarText}>
                    {selectedUser?.name.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View>
                  <Text style={styles.modalTitle}>Управление пользователем</Text>
                  <Text style={styles.modalSubTitle}>{selectedUser?.name} ({selectedUser?.email})</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setSelectedUser(null)} style={styles.modalCloseBtn}>
                <X size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ gap: 18, paddingVertical: 14 }}>
              {/* ── FEATURE 1: Блокировка / Разблокировка пользователя ── */}
              <View style={styles.featureBlock}>
                <View style={styles.featureHeaderRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    {editIsBlocked ? <Lock size={20} color="#DC2626" /> : <Unlock size={20} color="#059669" />}
                    <Text style={styles.featureTitle}>1. Статус доступа (Блокировка)</Text>
                  </View>
                  <TouchableOpacity
                    style={[
                      styles.toggleBigBtn,
                      editIsBlocked ? styles.toggleBigBtnBlocked : styles.toggleBigBtnActive,
                    ]}
                    onPress={handleToggleBlockInModal}
                  >
                    <Text style={styles.toggleBigBtnText}>
                      {editIsBlocked ? '⛔ ЗАБЛОКИРОВАН (Разблокировать)' : '✅ АКТИВЕН (Заблокировать)'}
                    </Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.featureSub}>
                  {editIsBlocked
                    ? 'Пользователь заблокирован: при попытке входа или использовании приложения он получит экран блокировки.'
                    : 'Пользователь активен и может свободно работать в системе.'}
                </Text>
              </View>

              {/* ── FEATURE 2: Отключение страниц (Блокировка доступа к экранам) ── */}
              <View style={styles.featureBlock}>
                <View style={styles.featureHeaderRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Sliders size={20} color="#2563EB" />
                    <Text style={styles.featureTitle}>2. Отключение страниц (Блокировка разделов)</Text>
                  </View>
                </View>
                <Text style={styles.featureSub}>
                  При отключении страницы у пользователя в приложении сразу отобразится экран <Text style={{ fontWeight: 'bold' }}>«Страница заблокирована»</Text> в RealTime:
                </Text>

                <View style={styles.pagesGrid}>
                  {AVAILABLE_PAGES.map((page) => {
                    const isPageBlocked = editBlockedPages.includes(page.id);
                    const IconComp = page.icon;

                    return (
                      <TouchableOpacity
                        key={page.id}
                        style={[
                          styles.pageGridCard,
                          isPageBlocked && styles.pageGridCardBlocked,
                        ]}
                        activeOpacity={0.8}
                        onPress={() => handleTogglePageLock(page.id)}
                      >
                        <View style={styles.pageGridCardTop}>
                          <View
                            style={[
                              styles.pageGridIconBox,
                              isPageBlocked && { backgroundColor: '#FEE2E2' },
                            ]}
                          >
                            <IconComp size={20} color={isPageBlocked ? '#DC2626' : '#059669'} />
                          </View>
                          <View
                            style={[
                              styles.pageStatusPill,
                              isPageBlocked ? styles.pageStatusPillBlocked : styles.pageStatusPillAllowed,
                            ]}
                          >
                            <Text
                              style={[
                                styles.pageStatusPillText,
                                isPageBlocked ? { color: '#DC2626' } : { color: '#059669' },
                              ]}
                            >
                              {isPageBlocked ? '⛔ ЗАБЛОКИРОВАНА' : '✓ ДОСТУПНА'}
                            </Text>
                          </View>
                        </View>
                        <Text style={styles.pageGridLabel}>{page.label}</Text>
                        <Text style={styles.pageGridDesc}>{page.desc}</Text>
                        <Text style={[styles.pageGridHint, isPageBlocked && { color: '#DC2626' }]}>
                          {isPageBlocked ? 'Нажмите, чтобы включить доступ' : 'Нажмите, чтобы отключить'}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* ── FEATURE 3: Изменение паролей, Email и данных ── */}
              <View style={styles.featureBlock}>
                <View style={styles.featureHeaderRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <KeyRound size={20} color="#7C3AED" />
                    <Text style={styles.featureTitle}>3. Редактирование данных и Пароля</Text>
                  </View>
                </View>
                <Text style={styles.featureSub}>
                  Суперадминистратор может задавать и менять Email, пароль и роль для пользователя.
                </Text>

                <View style={styles.formFields}>
                  {/* Name */}
                  <View>
                    <Text style={styles.inputLabel}>ФИО / Имя сотрудника</Text>
                    <TextInput
                      style={styles.modalInput}
                      value={editName}
                      onChangeText={setEditName}
                      placeholder="Имя пользователя"
                    />
                  </View>

                  {/* Email */}
                  <View>
                    <Text style={styles.inputLabel}>Email (Логин для входа)</Text>
                    <TextInput
                      style={styles.modalInput}
                      value={editEmail}
                      onChangeText={setEditEmail}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      placeholder="email@hozmag.uz"
                    />
                  </View>

                  {/* Password with eye */}
                  <View>
                    <Text style={styles.inputLabel}>Пароль учетной записи</Text>
                    <View style={styles.passwordInputContainer}>
                      <TextInput
                        style={[styles.modalInput, { flex: 1, borderTopRightRadius: 0, borderBottomRightRadius: 0 }]}
                        value={editPassword}
                        onChangeText={setEditPassword}
                        secureTextEntry={!showEditPassword}
                        placeholder="Введите новый пароль"
                      />
                      <TouchableOpacity
                        style={styles.passwordToggle}
                        onPress={() => setShowEditPassword(!showEditPassword)}
                      >
                        {showEditPassword ? <EyeOff size={18} color="#6B7280" /> : <Eye size={18} color="#6B7280" />}
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Role */}
                  <View>
                    <Text style={styles.inputLabel}>Роль в системе</Text>
                    <View style={styles.rolePickerRow}>
                      {(['Кассир', 'Администратор', 'Суперадминистратор', 'Менеджер'] as UserRole[]).map((r) => (
                        <TouchableOpacity
                          key={r}
                          style={[styles.roleChip, editRole === r && styles.roleChipActive]}
                          onPress={() => {
                            setEditRole(r);
                            const defaults = ROLE_PERMISSIONS[r]?.blockedPages;
                            if (defaults) {
                              setEditBlockedPages(defaults);
                              if (selectedUser) {
                                storeManager.setBlockedPages(selectedUser.id, defaults);
                              }
                            }
                          }}
                        >
                          <Text style={[styles.roleChipText, editRole === r && styles.roleChipTextActive]}>
                            {r}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <TouchableOpacity
                      style={styles.applyRoleDefaultsBtn}
                      onPress={() => {
                        const defaults = ROLE_PERMISSIONS[editRole]?.blockedPages || [];
                        setEditBlockedPages(defaults);
                        if (selectedUser) {
                          storeManager.setBlockedPages(selectedUser.id, defaults);
                        }
                        Alert.alert('Права обновлены', `Для роли «${editRole}» установлены стандартные права доступа.`);
                      }}
                    >
                      <Sparkles size={14} color="#3B82F6" />
                      <Text style={styles.applyRoleDefaultsText}>Применить стандартные права роли «{editRole}»</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Store Name */}
                  <View>
                    <Text style={styles.inputLabel}>Магазин / Торговая точка</Text>
                    <TextInput
                      style={styles.modalInput}
                      value={editStoreName}
                      onChangeText={setEditStoreName}
                      placeholder="Хозмаг Учёт"
                    />
                  </View>

                  {/* Save Changes Button */}
                  <TouchableOpacity
                    style={[styles.saveChangesBtn, isSaving && { opacity: 0.7 }]}
                    disabled={isSaving}
                    onPress={handleSaveUserChanges}
                  >
                    {isSaving ? (
                      <ActivityIndicator color="#FFFFFF" />
                    ) : (
                      <>
                        <Save size={18} color="#FFFFFF" />
                        <Text style={styles.saveChangesBtnText}>Сохранить изменения (RealTime)</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>
              </View>

              {/* ── FEATURE 4: Быстрый вход и Копирование данных для LOGIN Page ── */}
              <View style={styles.featureBlock}>
                <View style={styles.featureHeaderRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Sparkles size={20} color="#D97706" />
                    <Text style={styles.featureTitle}>4. Данные для входа в систему (Login Page)</Text>
                  </View>
                </View>

                <View style={styles.credentialsBox}>
                  <View style={styles.credRow}>
                    <Text style={styles.credLabel}>Email:</Text>
                    <Text style={styles.credValue}>{editEmail}</Text>
                  </View>
                  <View style={styles.credRow}>
                    <Text style={styles.credLabel}>Пароль:</Text>
                    <Text style={styles.credValue}>{editPassword || '(не задан)'}</Text>
                  </View>
                </View>

                <View style={styles.credActionsRow}>
                  <TouchableOpacity
                    style={styles.copyCredBtn}
                    onPress={() => selectedUser && handleCopyCredentials(selectedUser)}
                  >
                    <Copy size={16} color="#1D4ED8" />
                    <Text style={styles.copyCredBtnText}>Скопировать логин и пароль</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.switchUserModalBtn}
                    onPress={async () => {
                      if (selectedUser) {
                        try {
                          await storeManager.switchUser(selectedUser.id);
                          setSelectedUser(null);
                          router.replace('/(tabs)');
                        } catch (e: any) {
                          Alert.alert('Ошибка', e?.message || 'Не удалось переключиться');
                        }
                      }
                    }}
                  >
                    <LogIn size={16} color="#FFFFFF" />
                    <Text style={styles.switchUserModalBtnText}>Войти как этот пользователь</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* ── FEATURE 5: Удаление пользователя из базы данных ── */}
              {selectedUser && selectedUser.id !== currentUser?.id && (
                <View style={styles.deleteSection}>
                  <TouchableOpacity
                    style={styles.deleteUserFullBtn}
                    onPress={() => handleDeleteUser(selectedUser)}
                  >
                    <Trash2 size={18} color="#FFFFFF" />
                    <Text style={styles.deleteUserFullBtnText}>Удалить аккаунт из базы данных навсегда</Text>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ══════════════════════════════════════════════════════════════════════════ */}
      {/* ── MODAL: Confirm Delete User (web-compatible, replaces Alert.alert) ── */}
      {/* ══════════════════════════════════════════════════════════════════════════ */}
      <Modal visible={Boolean(confirmDeleteUser)} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.confirmDeleteCard}>
            {/* Icon */}
            <View style={styles.confirmDeleteIconCircle}>
              <Trash2 size={32} color="#DC2626" />
            </View>

            <Text style={styles.confirmDeleteTitle}>Удалить аккаунт?</Text>
            <Text style={styles.confirmDeleteSub}>
              Вы действительно хотите навсегда удалить аккаунт{'\n'}
              <Text style={{ fontWeight: 'bold', color: '#111827' }}>
                «{confirmDeleteUser?.name}»
              </Text>{' '}
              ({confirmDeleteUser?.email})?
            </Text>
            <Text style={styles.confirmDeleteWarning}>
              ⚠️ Все данные пользователя будут стёрты безвозвратно из базы данных.
            </Text>

            <View style={styles.confirmDeleteButtons}>
              <TouchableOpacity
                style={styles.confirmCancelBtn}
                onPress={() => setConfirmDeleteUser(null)}
                disabled={isDeleting}
              >
                <Text style={styles.confirmCancelBtnText}>Отмена</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.confirmDeleteBtn, isDeleting && { opacity: 0.6 }]}
                onPress={handleConfirmDelete}
                disabled={isDeleting}
              >
                {isDeleting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Trash2 size={16} color="#FFFFFF" />
                )}
                <Text style={styles.confirmDeleteBtnText}>
                  {isDeleting ? 'Удаление...' : 'Удалить навсегда'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ══════════════════════════════════════════════════════════════════════════ */}
      {/* ── MODAL: Create New User by SuperAdmin ── */}
      {/* ══════════════════════════════════════════════════════════════════════════ */}
      <Modal visible={isAddModalOpen} animationType="slide" transparent>

        <View style={styles.modalOverlay}>
          <View style={styles.modalContentLarge}>
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={styles.createIconBox}>
                  <UserPlus size={22} color="#FFFFFF" />
                </View>
                <View>
                  <Text style={styles.modalTitle}>Регистрация нового пользователя</Text>
                  <Text style={styles.modalSubTitle}>Создание логина и пароля суперадминистратором</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setIsAddModalOpen(false)}>
                <X size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ gap: 14, paddingVertical: 10 }}>
              {/* Name */}
              <View>
                <Text style={styles.inputLabel}>ФИО / Имя сотрудника *</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="Например: Алишер Каримов"
                  value={newName}
                  onChangeText={setNewName}
                />
              </View>

              {/* Email */}
              <View>
                <Text style={styles.inputLabel}>Email (логин для входа) *</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="alisher@hozmag.uz"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  value={newEmail}
                  onChangeText={setNewEmail}
                />
              </View>

              {/* Password */}
              <View>
                <Text style={styles.inputLabel}>Пароль для входа *</Text>
                <View style={styles.passwordInputContainer}>
                  <TextInput
                    style={[styles.modalInput, { flex: 1, borderTopRightRadius: 0, borderBottomRightRadius: 0 }]}
                    placeholder="Например: 123456"
                    secureTextEntry={!showNewPassword}
                    value={newPassword}
                    onChangeText={setNewPassword}
                  />
                  <TouchableOpacity
                    style={styles.passwordToggle}
                    onPress={() => setShowNewPassword(!showNewPassword)}
                  >
                    {showNewPassword ? <EyeOff size={18} color="#6B7280" /> : <Eye size={18} color="#6B7280" />}
                  </TouchableOpacity>
                </View>
              </View>

              {/* Account Type Selection (Выбор типа аккаунта) */}
              <View>
                <Text style={styles.inputLabel}>Выбор типа аккаунта (Роль и Права) *</Text>
                <View style={styles.accountTypeGrid}>
                  {/* Кассир */}
                  <TouchableOpacity
                    style={[
                      styles.accountTypeCard,
                      newRole === 'Кассир' && styles.accountTypeCardActive,
                    ]}
                    activeOpacity={0.8}
                    onPress={() => {
                      setNewRole('Кассир');
                      setNewBlockedPages(['index', 'reports']);
                    }}
                  >
                    <View style={styles.accountTypeHeader}>
                      <View style={[styles.accountTypeIconBg, { backgroundColor: '#ECFDF5' }]}>
                        <ShoppingCart size={20} color="#059669" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                          <Text style={[styles.accountTypeTitle, newRole === 'Кассир' && styles.accountTypeTitleActive]}>
                            Кассир
                          </Text>
                          {newRole === 'Кассир' && <View style={styles.radioSelectedDot} />}
                        </View>
                        <Text style={styles.accountTypeDesc}>1) Склад • 2) Касса • 3) Возврат</Text>
                      </View>
                    </View>
                    <View style={styles.accountPermList}>
                      <Text style={styles.permAllowedItem}>✓ Доступны: Склад, Касса, Возврат</Text>
                      <Text style={styles.permBlockedItem}>⛔ Заблокированы: Главная (Дашборд), Отчёты</Text>
                    </View>
                  </TouchableOpacity>

                  {/* Администратор */}
                  <TouchableOpacity
                    style={[
                      styles.accountTypeCard,
                      newRole === 'Администратор' && styles.accountTypeCardActiveAdmin,
                    ]}
                    activeOpacity={0.8}
                    onPress={() => {
                      setNewRole('Администратор');
                      setNewBlockedPages(['warehouse', 'scanner', 'returns']);
                    }}
                  >
                    <View style={styles.accountTypeHeader}>
                      <View style={[styles.accountTypeIconBg, { backgroundColor: '#EFF6FF' }]}>
                        <BarChart3 size={20} color="#2563EB" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                          <Text style={[styles.accountTypeTitle, newRole === 'Администратор' && styles.accountTypeTitleActiveAdmin]}>
                            Администратор
                          </Text>
                          {newRole === 'Администратор' && <View style={[styles.radioSelectedDot, { backgroundColor: '#2563EB' }]} />}
                        </View>
                        <Text style={styles.accountTypeDesc}>1) Главная • 2) Отчет</Text>
                      </View>
                    </View>
                    <View style={styles.accountPermList}>
                      <Text style={styles.permAllowedItem}>✓ Доступны: Главная (Дашборд), Отчёты</Text>
                      <Text style={styles.permBlockedItem}>⛔ Заблокированы: Склад, Касса, Возврат</Text>
                    </View>
                  </TouchableOpacity>

                  {/* Суперадминистратор */}
                  <TouchableOpacity
                    style={[
                      styles.accountTypeCard,
                      newRole === 'Суперадминистратор' && styles.accountTypeCardActiveSuper,
                    ]}
                    activeOpacity={0.8}
                    onPress={() => {
                      setNewRole('Суперадминистратор');
                      setNewBlockedPages([]);
                    }}
                  >
                    <View style={styles.accountTypeHeader}>
                      <View style={[styles.accountTypeIconBg, { backgroundColor: '#FEF3C7' }]}>
                        <ShieldAlert size={20} color="#D97706" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                          <Text style={[styles.accountTypeTitle, newRole === 'Суперадминистратор' && styles.accountTypeTitleActiveSuper]}>
                            Суперадминистратор
                          </Text>
                          {newRole === 'Суперадминистратор' && <View style={[styles.radioSelectedDot, { backgroundColor: '#D97706' }]} />}
                        </View>
                        <Text style={styles.accountTypeDesc}>Владелец системы</Text>
                      </View>
                    </View>
                    <View style={styles.accountPermList}>
                      <Text style={styles.permAllowedItem}>✓ Полный доступ ко всем 5 разделам</Text>
                      <Text style={styles.permAllowedItem}>✓ Доступ к порталу SuperAdmin</Text>
                    </View>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Store Name */}
              <View>
                <Text style={styles.inputLabel}>Магазин / Торговая точка</Text>
                <TextInput
                  style={styles.modalInput}
                  placeholder="Хозмаг Учёт"
                  value={newStoreName}
                  onChangeText={setNewStoreName}
                />
              </View>

              {/* Block Specific Pages */}
              <View>
                <Text style={styles.inputLabel}>Настройка прав доступа к страницам:</Text>
                <Text style={styles.inputHelperText}>
                  Страницы настроены автоматически по выбранной роли. Вы можете нажать на любую страницу для переключения:
                </Text>
                <View style={styles.pageToggleContainer}>
                  {AVAILABLE_PAGES.map((page) => {
                    const isBlocked = newBlockedPages.includes(page.id);
                    const IconComp = page.icon;
                    return (
                      <TouchableOpacity
                        key={page.id}
                        style={[styles.pageToggleItem, isBlocked && styles.pageToggleItemBlocked]}
                        onPress={() => {
                          if (isBlocked) {
                            setNewBlockedPages(newBlockedPages.filter((p) => p !== page.id));
                          } else {
                            setNewBlockedPages([...newBlockedPages, page.id]);
                          }
                        }}
                      >
                        <IconComp size={16} color={isBlocked ? '#DC2626' : '#059669'} />
                        <Text style={[styles.pageToggleLabel, isBlocked && styles.pageToggleLabelBlocked]}>
                          {page.label} {isBlocked ? '⛔ (Отключена)' : '✓ (Разрешена)'}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Submit Button */}
              <TouchableOpacity
                style={[styles.submitCreateBtn, isCreating && { opacity: 0.7 }]}
                disabled={isCreating}
                onPress={handleCreateUser}
              >
                {isCreating ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <CheckCircle2 size={20} color="#FFFFFF" />
                    <Text style={styles.submitCreateBtnText}>Зарегистрировать пользователя (RealTime)</Text>
                  </>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  header: {
    backgroundColor: '#1E293B',
    paddingTop: Platform.OS === 'ios' ? 50 : 20,
    paddingBottom: 20,
    paddingHorizontal: 24,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  portalIconBadge: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#059669',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  headerSub: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 2,
  },
  realtimeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(5, 150, 105, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#059669',
  },
  realtimeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#34D399',
  },
  realtimeText: {
    color: '#34D399',
    fontSize: 11,
    fontWeight: 'bold',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  refreshTopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#334155',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  refreshTopBtnText: {
    color: '#E2E8F0',
    fontSize: 13,
    fontWeight: '600',
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#DC2626',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  logoutBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 20,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 20,
    flexWrap: 'wrap',
  },
  statCard: {
    flex: 1,
    minWidth: 180,
    backgroundColor: '#1E293B',
    padding: 16,
    borderRadius: 14,
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: '#334155',
  },
  statLabel: {
    fontSize: 13,
    color: '#94A3B8',
    fontWeight: '600',
  },
  statValue: {
    fontSize: 28,
    fontWeight: 'bold',
    marginVertical: 4,
  },
  statHint: {
    fontSize: 11,
    color: '#64748B',
  },
  actionBanner: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 18,
    marginBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#334155',
    flexWrap: 'wrap',
    gap: 14,
  },
  actionBannerTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  actionBannerSub: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 2,
    maxWidth: 600,
  },
  createUserBtn: {
    backgroundColor: '#059669',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  createUserBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 48,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 20,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: '#F8FAFC',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#F8FAFC',
  },
  sectionSubHint: {
    fontSize: 12,
    color: '#94A3B8',
  },
  userCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  userCardBlocked: {
    borderColor: '#EF4444',
    backgroundColor: 'rgba(239, 68, 68, 0.05)',
  },
  userCardSuper: {
    borderColor: '#F59E0B',
  },
  userCardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  userAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  userAvatarText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  userNameText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#F8FAFC',
  },
  youBadge: {
    backgroundColor: '#059669',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  youBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  userMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 3,
  },
  userMetaText: {
    fontSize: 13,
    color: '#94A3B8',
  },
  userMetaPassword: {
    fontSize: 12,
    color: '#FBBF24',
    fontWeight: '600',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  statusBadgeActive: {
    backgroundColor: 'rgba(5, 150, 105, 0.15)',
  },
  statusBadgeBlocked: {
    backgroundColor: 'rgba(220, 38, 38, 0.15)',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  roleBadge: {
    backgroundColor: '#334155',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  roleBadgeText: {
    color: '#CBD5E1',
    fontSize: 11,
    fontWeight: '600',
  },
  blockedPagesSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  blockedPagesLabel: {
    fontSize: 12,
    color: '#94A3B8',
    marginBottom: 6,
  },
  allowedFullBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  allAccessText: {
    fontSize: 12,
    color: '#34D399',
    fontWeight: '600',
  },
  blockedChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  blockedChip: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#EF4444',
  },
  blockedChipText: {
    color: '#F87171',
    fontSize: 11,
    fontWeight: '600',
  },
  userCardFooter: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#334155',
    alignItems: 'flex-end',
  },
  clickHintText: {
    fontSize: 12,
    color: '#38BDF8',
    fontWeight: '500',
  },
  emptyCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 40,
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  emptyText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#94A3B8',
  },
  emptySub: {
    fontSize: 13,
    color: '#64748B',
  },

  // ── Modal Styles ──
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContentLarge: {
    backgroundColor: '#1E293B',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 720,
    maxHeight: '92%',
    borderWidth: 1,
    borderColor: '#334155',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  userModalAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#2563EB',
    justifyContent: 'center',
    alignItems: 'center',
  },
  userModalAvatarText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  createIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#059669',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#F8FAFC',
  },
  modalSubTitle: {
    fontSize: 13,
    color: '#94A3B8',
    marginTop: 2,
  },
  modalCloseBtn: {
    padding: 6,
  },

  // ── Features Blocks Inside Modal ──
  featureBlock: {
    backgroundColor: '#0F172A',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  featureHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 6,
  },
  featureTitle: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#F8FAFC',
  },
  featureSub: {
    fontSize: 12,
    color: '#94A3B8',
    marginBottom: 12,
    lineHeight: 18,
  },
  toggleBigBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  toggleBigBtnActive: {
    backgroundColor: 'rgba(5, 150, 105, 0.2)',
    borderWidth: 1,
    borderColor: '#059669',
  },
  toggleBigBtnBlocked: {
    backgroundColor: 'rgba(220, 38, 38, 0.2)',
    borderWidth: 1,
    borderColor: '#DC2626',
  },
  toggleBigBtnText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#F8FAFC',
  },

  // Pages Grid
  pagesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  pageGridCard: {
    flex: 1,
    minWidth: 140,
    backgroundColor: '#1E293B',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  pageGridCardBlocked: {
    borderColor: '#EF4444',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  pageGridCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  pageGridIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(5, 150, 105, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pageStatusPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  pageStatusPillAllowed: {
    backgroundColor: 'rgba(5, 150, 105, 0.15)',
  },
  pageStatusPillBlocked: {
    backgroundColor: 'rgba(220, 38, 38, 0.15)',
  },
  pageStatusPillText: {
    fontSize: 9,
    fontWeight: 'bold',
  },
  pageGridLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#F8FAFC',
  },
  pageGridDesc: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 2,
    minHeight: 28,
  },
  pageGridHint: {
    fontSize: 10,
    color: '#38BDF8',
    marginTop: 6,
    fontWeight: '600',
  },

  // Form Fields
  formFields: {
    gap: 12,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#CBD5E1',
    marginBottom: 6,
  },
  modalInput: {
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: '#F8FAFC',
  },
  passwordInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  passwordToggle: {
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderLeftWidth: 0,
    borderColor: '#334155',
    borderTopRightRadius: 10,
    borderBottomRightRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  rolePickerRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  roleChip: {
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  roleChipActive: {
    backgroundColor: '#059669',
    borderColor: '#059669',
  },
  roleChipText: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '600',
  },
  roleChipTextActive: {
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  saveChangesBtn: {
    backgroundColor: '#2563EB',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 6,
  },
  saveChangesBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },

  // Credentials Box
  credentialsBox: {
    backgroundColor: '#1E293B',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: '#334155',
    gap: 6,
    marginBottom: 10,
  },
  credRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  credLabel: {
    fontSize: 13,
    color: '#94A3B8',
  },
  credValue: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#F8FAFC',
  },
  credActionsRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  copyCredBtn: {
    flex: 1,
    minWidth: 180,
    backgroundColor: '#EFF6FF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
  },
  copyCredBtnText: {
    color: '#1D4ED8',
    fontSize: 13,
    fontWeight: 'bold',
  },
  switchUserModalBtn: {
    flex: 1,
    minWidth: 180,
    backgroundColor: '#059669',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
  },
  switchUserModalBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 'bold',
  },

  // Delete Section
  deleteSection: {
    marginTop: 10,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  deleteUserFullBtn: {
    backgroundColor: '#DC2626',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
  },
  deleteUserFullBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 'bold',
  },

  // Create Modal Specific
  pageToggleContainer: {
    gap: 8,
  },
  pageToggleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#0F172A',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  pageToggleItemBlocked: {
    borderColor: '#DC2626',
    backgroundColor: 'rgba(220, 38, 38, 0.1)',
  },
  pageToggleLabel: {
    fontSize: 13,
    color: '#CBD5E1',
  },
  pageToggleLabelBlocked: {
    color: '#F87171',
    fontWeight: 'bold',
  },
  submitCreateBtn: {
    backgroundColor: '#059669',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 10,
  },
  submitCreateBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
  },

  // Restricted Access Screen
  restrictedContainer: {
    flex: 1,
    backgroundColor: '#0F172A',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    gap: 16,
  },
  restrictedTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#F8FAFC',
  },
  restrictedSub: {
    fontSize: 14,
    color: '#94A3B8',
    textAlign: 'center',
    maxWidth: 400,
    lineHeight: 20,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#2563EB',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 10,
  },
  backButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },

  // Confirm Delete Modal
  confirmDeleteCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    gap: 12,
    maxWidth: 380,
    width: '90%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 12,
  },
  confirmDeleteIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FECACA',
    marginBottom: 4,
  },
  confirmDeleteTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#111827',
  },
  confirmDeleteSub: {
    fontSize: 14,
    color: '#4B5563',
    textAlign: 'center',
    lineHeight: 20,
  },
  confirmDeleteWarning: {
    fontSize: 12,
    color: '#DC2626',
    textAlign: 'center',
    backgroundColor: '#FEF2F2',
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FECACA',
    lineHeight: 18,
  },
  confirmDeleteButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
    width: '100%',
  },
  confirmCancelBtn: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  confirmCancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  confirmDeleteBtn: {
    flex: 1,
    backgroundColor: '#DC2626',
    paddingVertical: 13,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  confirmDeleteBtnText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  accountTypeGrid: {
    gap: 10,
    marginTop: 4,
  },
  accountTypeCard: {
    backgroundColor: '#1E293B',
    borderWidth: 1.5,
    borderColor: '#334155',
    borderRadius: 14,
    padding: 14,
    gap: 8,
  },
  accountTypeCardActive: {
    borderColor: '#059669',
    backgroundColor: '#064E3B20',
  },
  accountTypeCardActiveAdmin: {
    borderColor: '#2563EB',
    backgroundColor: '#1E40AF20',
  },
  accountTypeCardActiveSuper: {
    borderColor: '#D97706',
    backgroundColor: '#78350F20',
  },
  accountTypeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  accountTypeIconBg: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
  },
  accountTypeTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#F8FAFC',
  },
  accountTypeTitleActive: {
    color: '#34D399',
  },
  accountTypeTitleActiveAdmin: {
    color: '#60A5FA',
  },
  accountTypeTitleActiveSuper: {
    color: '#FBBF24',
  },
  accountTypeDesc: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
  },
  radioSelectedDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#059669',
  },
  accountPermList: {
    gap: 4,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  permAllowedItem: {
    fontSize: 12,
    color: '#34D399',
    fontWeight: '600',
  },
  permBlockedItem: {
    fontSize: 12,
    color: '#F87171',
    fontWeight: '500',
  },
  inputHelperText: {
    fontSize: 12,
    color: '#94A3B8',
    marginBottom: 8,
  },
  applyRoleDefaultsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#3B82F6',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  applyRoleDefaultsText: {
    fontSize: 12,
    color: '#60A5FA',
    fontWeight: '600',
  },
  allowedPagesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 2,
  },
  allowedPageChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#064E3B',
    borderWidth: 1,
    borderColor: '#065F46',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  allowedPageNum: {
    fontSize: 11,
    color: '#6EE7B7',
    fontWeight: 'bold',
  },
  allowedPageLabel: {
    fontSize: 11,
    color: '#34D399',
    fontWeight: '600',
  },
});
