import AsyncStorage from '@react-native-async-storage/async-storage';
import { Product, Sale, UserAccount, UserRole, CartItem, Receipt, ReceiptItem, PaymentMethod } from '../types/database';
import { isSupabaseConfigured, supabase } from './supabase';
import { extractGtinFromDataMatrix } from './barcodeLookup';

const USERS_STORAGE_KEY = '@hozmag_users_v3';
const CURRENT_USER_KEY = '@hozmag_current_user_v3';

const getProductStorageKey = (userId?: string) => `@hozmag_products_v3_${userId || 'guest'}`;
const getReceiptStorageKey = (userId?: string) => `@hozmag_receipts_v3_${userId || 'guest'}`;

export const DEFAULT_SUPERADMIN: UserAccount = {
  id: 'superadmin-root',
  name: 'Владелец (SuperAdmin)',
  email: 'admin@hozmag.uz',
  role: 'Суперадминистратор',
  store_name: 'Хозмаг Учёт',
  is_superadmin: true,
  is_blocked: false,
  blocked_pages: [],
  created_at: new Date().toISOString(),
};

export const ROLE_PERMISSIONS: Record<UserRole, { allowedPages: string[]; blockedPages: string[]; label: string; description: string }> = {
  'Кассир': {
    allowedPages: ['warehouse', 'scanner', 'returns'],
    blockedPages: ['index', 'reports'],
    label: 'Кассир',
    description: '1) Склад, 2) Касса, 3) Возврат',
  },
  'Администратор': {
    allowedPages: ['index', 'reports'],
    blockedPages: ['warehouse', 'scanner', 'returns'],
    label: 'Администратор',
    description: '1) Главная (Дашборд), 2) Отчеты',
  },
  'Менеджер': {
    allowedPages: ['index', 'warehouse', 'scanner', 'reports'],
    blockedPages: ['returns'],
    label: 'Менеджер',
    description: 'Главная, Склад, Касса, Отчеты',
  },
  'Суперадминистратор': {
    allowedPages: ['index', 'warehouse', 'scanner', 'returns', 'reports'],
    blockedPages: [],
    label: 'Суперадминистратор',
    description: 'Полный доступ ко всем разделам',
  },
};

export const getEffectiveBlockedPages = (user?: UserAccount | null): string[] => {
  if (!user) return [];
  if (
    user.is_superadmin ||
    user.role === 'Суперадминистратор' ||
    user.email?.toLowerCase() === 'admin@hozmag.uz' ||
    user.email?.toLowerCase().includes('superadmin')
  ) {
    return [];
  }
  if (Array.isArray(user.blocked_pages) && user.blocked_pages.length > 0) {
    return user.blocked_pages;
  }
  if (user.role === 'Кассир') {
    return ['index', 'reports'];
  }
  if (user.role === 'Администратор') {
    return ['warehouse', 'scanner', 'returns'];
  }
  if (user.role === 'Менеджер') {
    return ['returns'];
  }
  return [];
};

export const INITIAL_PRODUCTS: Product[] = [];
export const INITIAL_USERS: UserAccount[] = [DEFAULT_SUPERADMIN];
export const INITIAL_RECEIPTS: Receipt[] = [];

export const CATEGORIES = [
  'Все',
  'Напитки и Продукты',
  'Бытовая химия',
  'Инструменты',
  'Сантехника',
  'Малярные товары',
  'Крепеж',
  'Электротовары',
  'Разное',
];

export const UNITS = ['шт', 'кг', 'л', 'метр', 'упак', 'рулон', 'коробка'];

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('ru-RU', {
    style: 'decimal',
    maximumFractionDigits: 0,
  }).format(amount) + ' сум';
}

let currentProducts: Product[] = [];
let currentReceipts: Receipt[] = [];
let currentUsers: UserAccount[] = [DEFAULT_SUPERADMIN];
let currentUser: UserAccount | null = DEFAULT_SUPERADMIN;
let subscribers: (() => void)[] = [];
let receiptCounter = 1001;

// Helper to save current user's products and receipts locally
const persistUserData = async (userId?: string, prods?: Product[], recs?: Receipt[]) => {
  const targetUser = userId || currentUser?.id || 'guest';
  const targetProds = prods !== undefined ? prods : currentProducts;
  const targetRecs = recs !== undefined ? recs : currentReceipts;
  try {
    await Promise.all([
      AsyncStorage.setItem(getProductStorageKey(targetUser), JSON.stringify(targetProds)),
      AsyncStorage.setItem(getReceiptStorageKey(targetUser), JSON.stringify(targetRecs)),
      AsyncStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(currentUsers)),
      AsyncStorage.setItem(CURRENT_USER_KEY, JSON.stringify(currentUser)),
    ]);
  } catch (e) {
    console.log('Error saving to AsyncStorage:', e);
  }
};

// Helper to load state for active user on startup
const loadLocalData = async () => {
  try {
    const [storedUsers, storedCurUser] = await Promise.all([
      AsyncStorage.getItem(USERS_STORAGE_KEY),
      AsyncStorage.getItem(CURRENT_USER_KEY),
    ]);

    if (storedUsers) {
      currentUsers = JSON.parse(storedUsers);
      if (!currentUsers.some(u => u.email.toLowerCase() === 'admin@hozmag.uz')) {
        currentUsers.unshift(DEFAULT_SUPERADMIN);
      }
    } else {
      currentUsers = [DEFAULT_SUPERADMIN];
    }

    if (storedCurUser) {
      currentUser = JSON.parse(storedCurUser);
    } else {
      currentUser = DEFAULT_SUPERADMIN;
    }

    const userId = currentUser?.id || 'guest';
    const [storedProds, storedRecs] = await Promise.all([
      AsyncStorage.getItem(getProductStorageKey(userId)),
      AsyncStorage.getItem(getReceiptStorageKey(userId)),
    ]);

    currentProducts = storedProds ? JSON.parse(storedProds) : [];
    currentReceipts = storedRecs ? JSON.parse(storedRecs) : [];
    storeManager.notify();
  } catch (e) {
    console.log('Error loading from AsyncStorage:', e);
  }
};

// Initialize local cache immediately
loadLocalData();

export const storeManager = {
  getProducts: () => currentProducts,
  getReceipts: () => currentReceipts,

  // Robust barcode matcher that finds product regardless of GTIN-13/14 or leading zeroes
  findProductByBarcode: (rawBarcode: string): Product | undefined => {
    if (!rawBarcode) return undefined;
    const cleanRaw = rawBarcode.trim();
    const gtin = extractGtinFromDataMatrix(cleanRaw);
    const targetCode = (gtin || cleanRaw).trim();
    const rawDigits = cleanRaw.replace(/\D/g, '');
    const targetDigits = targetCode.replace(/\D/g, '');

    return currentProducts.find((p) => {
      if (!p.barcode) return false;
      const pClean = p.barcode.trim();
      const pDigits = pClean.replace(/\D/g, '');

      // 1. Direct match
      if (pClean === targetCode || pClean === cleanRaw) return true;
      if (gtin && pClean === gtin) return true;

      // 2. Exact digits match (if digits present)
      if (pDigits && targetDigits && pDigits === targetDigits) return true;
      if (pDigits && rawDigits && pDigits === rawDigits) return true;

      // 3. Leading zero variance (e.g. 04823063100025 vs 4823063100025)
      if (pDigits && targetDigits) {
        const pNoZero = pDigits.replace(/^0+/, '');
        const targetNoZero = targetDigits.replace(/^0+/, '');
        if (pNoZero && targetNoZero && pNoZero === targetNoZero) return true;
      }

      // 4. Substring inclusion for formatted QR payloads
      if (cleanRaw.includes(pClean) || (gtin && cleanRaw.includes(gtin))) return true;

      return false;
    });
  },

  // Backward compatibility
  getSales: (): Sale[] => {
    const salesList: Sale[] = [];
    currentReceipts.forEach((r) => {
      r.items.forEach((item) => {
        salesList.push({
          id: `${r.id}-${item.id}`,
          user_id: r.user_id,
          product_id: item.product_id,
          product_name: item.product_name,
          quantity: item.quantity,
          unit_price: item.unit_price,
          total_price: item.subtotal,
          payment_method: r.payment_method,
          sale_date: r.created_at,
          is_returned: item.returned_quantity >= item.quantity,
          returned_quantity: item.returned_quantity,
        });
      });
    });
    return salesList;
  },

  getUsers: () => currentUsers,
  getCurrentUser: () => currentUser,

  isSuperAdmin: (user?: UserAccount | null): boolean => {
    const target = user !== undefined ? user : currentUser;
    if (!target) return false;
    return Boolean(
      target.is_superadmin ||
      target.role === 'Суперадминистратор' ||
      target.email.toLowerCase() === 'admin@hozmag.uz' ||
      target.email.toLowerCase().includes('superadmin')
    );
  },

  getEffectiveBlockedPages: (user?: UserAccount | null): string[] => {
    return getEffectiveBlockedPages(user !== undefined ? user : currentUser);
  },

  isPageBlocked: (pageId: string, user?: UserAccount | null): boolean => {
    const target = user !== undefined ? user : currentUser;
    if (!target) return false;
    if (storeManager.isSuperAdmin(target)) return false;
    return storeManager.getEffectiveBlockedPages(target).includes(pageId);
  },

  syncUsersFromSupabase: async () => {
    if (!isSupabaseConfigured) return;
    try {
      console.log('[Supabase] Fetching profiles from database...');
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.log('Error syncing users from Supabase profiles table:', error.message);
        return;
      }

      if (data) {
        console.log(`[Supabase] Successfully loaded ${data.length} profiles from database.`);
        const dbUsers: UserAccount[] = data.map((p) => {
          let blockedPages: string[] = [];
          if (Array.isArray(p.blocked_pages)) {
            blockedPages = p.blocked_pages;
          } else if (typeof p.blocked_pages === 'string') {
            try {
              blockedPages = JSON.parse(p.blocked_pages);
            } catch {
              blockedPages = p.blocked_pages.replace(/[{}]/g, '').split(',').filter(Boolean);
            }
          }

          const isSuper = Boolean(
            p.is_superadmin ||
            p.role === 'Суперадминистратор' ||
            p.email?.toLowerCase() === 'admin@hozmag.uz' ||
            p.email?.toLowerCase().includes('superadmin')
          );

          return {
            id: p.id,
            name: p.name || p.email?.split('@')[0] || 'Пользователь',
            email: p.email || '',
            password: p.password_plain || p.password || '123456',
            role: (p.role || (isSuper ? 'Суперадминистратор' : 'Кассир')) as UserRole,
            store_name: p.store_name || 'Хозмаг Учёт',
            is_superadmin: isSuper,
            is_blocked: Boolean(p.is_blocked),
            blocked_pages: blockedPages,
            created_at: p.created_at || new Date().toISOString(),
          };
        });

        // Always guarantee default superadmin is available so system is never locked out
        const hasSuper = dbUsers.some(
          (u) => u.is_superadmin || u.email.toLowerCase() === DEFAULT_SUPERADMIN.email.toLowerCase()
        );
        if (!hasSuper) {
          dbUsers.unshift(DEFAULT_SUPERADMIN);
        }

        currentUsers = dbUsers;
        if (currentUser) {
          const match = dbUsers.find(
            (u) => u.id === currentUser?.id || u.email.toLowerCase() === currentUser?.email?.toLowerCase()
          );
          if (match) {
            currentUser = match;
          }
        }
        persistUserData();
        storeManager.notify();
      }
    } catch (e) {
      console.log('Exception syncing users from Supabase:', e);
    }
  },

  toggleBlockUser: async (userId: string, isBlocked: boolean) => {
    currentUsers = currentUsers.map((u) => {
      if (u.id === userId) {
        return { ...u, is_blocked: isBlocked };
      }
      return u;
    });

    if (currentUser?.id === userId) {
      currentUser.is_blocked = isBlocked;
    }

    persistUserData();
    storeManager.notify();

    if (isSupabaseConfigured && !userId.startsWith('user-')) {
      try {
        await supabase.from('profiles').update({ is_blocked: isBlocked }).eq('id', userId);
      } catch (e) {
        console.log('Supabase block user error:', e);
      }
    }
  },

  updateUserCredentials: async (
    userId: string,
    updates: {
      name?: string;
      email?: string;
      password?: string;
      role?: UserRole;
      store_name?: string;
      is_blocked?: boolean;
      blocked_pages?: string[];
    }
  ) => {
    currentUsers = currentUsers.map((u) => {
      if (u.id === userId) {
        return {
          ...u,
          ...updates,
        };
      }
      return u;
    });

    if (currentUser?.id === userId) {
      currentUser = {
        ...currentUser,
        ...updates,
      };
    }

    persistUserData();
    storeManager.notify();

    if (isSupabaseConfigured && !userId.startsWith('user-')) {
      try {
        const payload: any = {};
        if (updates.name !== undefined) payload.name = updates.name.trim();
        if (updates.email !== undefined) payload.email = updates.email.trim().toLowerCase();
        if (updates.password !== undefined) payload.password_plain = updates.password.trim();
        if (updates.role !== undefined) payload.role = updates.role;
        if (updates.store_name !== undefined) payload.store_name = updates.store_name.trim();
        if (updates.is_blocked !== undefined) payload.is_blocked = updates.is_blocked;
        if (updates.blocked_pages !== undefined) payload.blocked_pages = updates.blocked_pages;

        await supabase.from('profiles').update(payload).eq('id', userId);
      } catch (e) {
        console.log('Supabase updateUserCredentials error:', e);
      }
    }
  },

  setBlockedPages: async (userId: string, blockedPages: string[]) => {
    currentUsers = currentUsers.map((u) => {
      if (u.id === userId) {
        return { ...u, blocked_pages: blockedPages };
      }
      return u;
    });

    if (currentUser?.id === userId) {
      currentUser.blocked_pages = blockedPages;
    }

    persistUserData();
    storeManager.notify();

    if (isSupabaseConfigured && !userId.startsWith('user-')) {
      try {
        await supabase.from('profiles').update({ blocked_pages: blockedPages }).eq('id', userId);
      } catch (e) {
        console.log('Supabase set blocked pages error:', e);
      }
    }
  },

  deleteUser: async (userId: string) => {
    const isDeletingCurrent = currentUser?.id === userId;
    currentUsers = currentUsers.filter((u) => u.id !== userId);

    try {
      await Promise.all([
        AsyncStorage.removeItem(getProductStorageKey(userId)),
        AsyncStorage.removeItem(getReceiptStorageKey(userId)),
      ]);
    } catch (e) {
      console.log('AsyncStorage remove error:', e);
    }

    if (isDeletingCurrent) {
      currentUser = null;
      currentProducts = [];
      currentReceipts = [];
      await persistUserData('guest', [], []);
    } else {
      persistUserData();
    }

    storeManager.notify();

    if (isSupabaseConfigured && !userId.startsWith('user-')) {
      try {
        // Try RPC first for complete cascade deletion
        const { error: rpcErr } = await supabase.rpc('delete_user_account', { target_user_id: userId });
        if (rpcErr) {
          // Fallback direct profile delete
          await supabase.from('receipt_items').delete().eq('user_id', userId);
          await supabase.from('receipts').delete().eq('user_id', userId);
          await supabase.from('products').delete().eq('user_id', userId);
          await supabase.from('profiles').delete().eq('id', userId);
        }
      } catch (e) {
        console.log('Supabase delete user exception:', e);
      }
    }
  },

  createUserBySuperAdmin: async (userData: {
    name: string;
    email: string;
    password?: string;
    role: UserRole;
    store_name: string;
    blocked_pages?: string[];
    is_superadmin?: boolean;
  }) => {
    let createdUserId = `user-${Date.now()}`;
    const cleanEmail = userData.email.trim().toLowerCase();
    const cleanPassword = userData.password?.trim() || '123456';
    const effectiveBlocked = (userData.blocked_pages && userData.blocked_pages.length > 0)
      ? userData.blocked_pages
      : (ROLE_PERMISSIONS[userData.role]?.blockedPages || []);

    if (isSupabaseConfigured) {
      try {
        // 1. Create auth user in Supabase Auth
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: cleanEmail,
          password: cleanPassword,
          options: {
            data: {
              name: userData.name.trim(),
              role: userData.role,
              store_name: userData.store_name.trim(),
            },
          },
        });

        if (!authError && authData.user) {
          createdUserId = authData.user.id;
        }

        // 2. Insert or update in profiles table
        await supabase.from('profiles').upsert({
          id: createdUserId,
          name: userData.name.trim(),
          email: cleanEmail,
          role: userData.role,
          store_name: userData.store_name.trim(),
          is_superadmin: Boolean(userData.is_superadmin),
          is_blocked: false,
          blocked_pages: effectiveBlocked,
          password_plain: cleanPassword,
        });

        await storeManager.syncUsersFromSupabase();
      } catch (e) {
        console.log('Supabase create user error (non-fatal):', e);
      }
    }

    const newUser: UserAccount = {
      id: createdUserId,
      name: userData.name.trim(),
      email: cleanEmail,
      password: cleanPassword,
      role: userData.role,
      store_name: userData.store_name.trim(),
      is_superadmin: Boolean(userData.is_superadmin),
      is_blocked: false,
      blocked_pages: effectiveBlocked,
      created_at: new Date().toISOString(),
    };

    currentUsers = [newUser, ...currentUsers.filter((u) => u.email.toLowerCase() !== cleanEmail)];
    persistUserData();
    storeManager.notify();
    return newUser;
  },

  syncProductsFromSupabase: async () => {
    if (!isSupabaseConfigured) return;
    try {
      let query = supabase
        .from('products')
        .select('*')
        .order('created_at', { ascending: false });

      const activeUserId = currentUser?.id;
      if (activeUserId && !activeUserId.startsWith('user-')) {
        query = query.eq('user_id', activeUserId);
      }

      const { data, error } = await query;
      if (!error && data) {
        const remoteProducts: Product[] = data.map((p) => ({
          id: p.id,
          user_id: p.user_id,
          name: p.name,
          price: Number(p.price) || 0,
          purchase_price: Number(p.purchase_price) || 0,
          stock_quantity: Number(p.stock_quantity) || 0,
          barcode: p.barcode || '',
          category: p.category || 'Разное',
          unit: p.unit || 'шт',
          image_url: p.image_url || undefined,
          brand: p.brand || undefined,
          created_at: p.created_at || new Date().toISOString(),
        }));

        currentProducts = remoteProducts;
        if (activeUserId) {
          persistUserData(activeUserId, currentProducts, currentReceipts);
        }
        storeManager.notify();
      } else if (error) {
        console.log('Error syncing products from Supabase:', error.message);
      }
    } catch (e) {
      console.log('Exception syncing products from Supabase:', e);
    }
  },

  syncReceiptsFromSupabase: async () => {
    if (!isSupabaseConfigured) return;
    try {
      let query = supabase
        .from('receipts')
        .select('*, receipt_items(*)')
        .order('created_at', { ascending: false });

      const activeUserId = currentUser?.id;
      if (activeUserId && !activeUserId.startsWith('user-')) {
        query = query.eq('user_id', activeUserId);
      }

      const { data, error } = await query;
      if (!error && data) {
        const dbReceipts: Receipt[] = data.map((r: any) => ({
          id: r.id,
          user_id: r.user_id,
          receipt_number: r.receipt_number,
          total_amount: Number(r.total_amount) || 0,
          payment_method: r.payment_method || 'cash',
          is_fully_returned: Boolean(r.is_fully_returned),
          created_at: r.created_at || new Date().toISOString(),
          items: (r.receipt_items || []).map((it: any) => ({
            id: it.id,
            product_id: it.product_id,
            product_name: it.product_name,
            quantity: Number(it.quantity) || 1,
            unit_price: Number(it.unit_price) || 0,
            subtotal: Number(it.subtotal) || 0,
            unit: it.unit || 'шт',
            returned_quantity: Number(it.returned_quantity) || 0,
          })),
        }));

        currentReceipts = dbReceipts;
        if (activeUserId) {
          persistUserData(activeUserId, currentProducts, currentReceipts);
        }
        storeManager.notify();
      } else if (error) {
        console.log('Error syncing receipts from Supabase:', error.message);
      }
    } catch (e) {
      console.log('Exception syncing receipts from Supabase:', e);
    }
  },

  syncAll: async () => {
    await Promise.all([
      storeManager.syncUsersFromSupabase(),
      storeManager.syncProductsFromSupabase(),
      storeManager.syncReceiptsFromSupabase(),
    ]);
  },

  subscribe: (callback: () => void) => {
    subscribers.push(callback);
    return () => {
      subscribers = subscribers.filter((cb) => cb !== callback);
    };
  },

  notify: () => {
    subscribers.forEach((cb) => cb());
  },

  registerUser: async (userData: Omit<UserAccount, 'id' | 'created_at'>, customId?: string) => {
    // 1. Persist current active user's data before creating/switching
    if (currentUser?.id) {
      await persistUserData(currentUser.id, currentProducts, currentReceipts);
    }

    const newUser: UserAccount = {
      ...userData,
      id: customId || `user-${Date.now()}`,
      created_at: new Date().toISOString(),
    };
    currentUsers = [newUser, ...currentUsers.filter(u => u.email.toLowerCase() !== newUser.email.toLowerCase())];
    currentUser = newUser;
    // New account starts completely fresh with empty products & receipts
    currentProducts = [];
    currentReceipts = [];
    await persistUserData(newUser.id, currentProducts, currentReceipts);
    storeManager.notify();
    return newUser;
  },

  loginUser: async (emailOrUser: string | UserAccount) => {
    // 1. Persist current active user's data before switching
    if (currentUser?.id) {
      await persistUserData(currentUser.id, currentProducts, currentReceipts);
    }

    let found: UserAccount | undefined;
    if (typeof emailOrUser === 'string') {
      found = currentUsers.find((u) => u.email.toLowerCase() === emailOrUser.toLowerCase());
    } else {
      found = emailOrUser;
      currentUsers = [
        found,
        ...currentUsers.filter((u) => u.id !== found!.id && u.email.toLowerCase() !== found!.email.toLowerCase()),
      ];
    }

    if (found) {
      if (found.is_blocked) {
        throw new Error('Аккаунт заблокирован. Свяжитесь с администратором для разблокировки аккаунта.');
      }
      currentUser = found;
      // Load this target user's isolated local products & receipts
      const [storedProds, storedRecs] = await Promise.all([
        AsyncStorage.getItem(getProductStorageKey(found.id)),
        AsyncStorage.getItem(getReceiptStorageKey(found.id)),
      ]);
      currentProducts = storedProds ? JSON.parse(storedProds) : [];
      currentReceipts = storedRecs ? JSON.parse(storedRecs) : [];
      await persistUserData(found.id, currentProducts, currentReceipts);
      storeManager.notify();
      await storeManager.syncProductsFromSupabase();
      await storeManager.syncReceiptsFromSupabase();
      return found;
    }
    return null;
  },

  switchUser: async (userId: string) => {
    // 1. Persist current active user's data before switching
    if (currentUser?.id) {
      await persistUserData(currentUser.id, currentProducts, currentReceipts);
    }

    const found = currentUsers.find((u) => u.id === userId);
    if (found) {
      if (found.is_blocked) {
        throw new Error('Этот аккаунт заблокирован суперадминистратором.');
      }
      currentUser = found;
      // Load this target user's isolated local products & receipts
      const [storedProds, storedRecs] = await Promise.all([
        AsyncStorage.getItem(getProductStorageKey(found.id)),
        AsyncStorage.getItem(getReceiptStorageKey(found.id)),
      ]);
      currentProducts = storedProds ? JSON.parse(storedProds) : [];
      currentReceipts = storedRecs ? JSON.parse(storedRecs) : [];
      await persistUserData(found.id, currentProducts, currentReceipts);
      storeManager.notify();
      storeManager.syncProductsFromSupabase();
      storeManager.syncReceiptsFromSupabase();
      return found;
    }
    return null;
  },

  logoutUser: async () => {
    if (currentUser?.id) {
      await persistUserData(currentUser.id, currentProducts, currentReceipts);
    }
    currentUser = null;
    currentProducts = [];
    currentReceipts = [];
    await persistUserData('guest', [], []);
    if (isSupabaseConfigured) {
      try {
        await supabase.auth.signOut();
      } catch (e) {
        console.log('Supabase signOut error:', e);
      }
    }
    storeManager.notify();
  },

  addProduct: async (product: Omit<Product, 'id' | 'created_at'>) => {
    const activeUserId = currentUser?.id || 'guest';
    let createdId = `prod-${Date.now()}`;
    if (isSupabaseConfigured) {
      try {
        const dbUserId = currentUser?.id && !currentUser.id.startsWith('user-') ? currentUser.id : null;
        const payload: any = {
          name: product.name,
          price: product.price,
          purchase_price: product.purchase_price || 0,
          stock_quantity: product.stock_quantity,
          barcode: product.barcode || null,
          category: product.category || 'Разное',
          unit: product.unit || 'шт',
          image_url: product.image_url || null,
          brand: product.brand || null,
          user_id: dbUserId,
        };

        const { data, error } = await supabase.from('products').insert(payload).select().single();

        if (!error && data) {
          createdId = data.id;
        } else if (error) {
          console.log('Supabase add product error:', error.message);
        }
      } catch (e) {
        console.log('Supabase add product exception:', e);
      }
    }

    const newProduct: Product = {
      ...product,
      id: createdId,
      user_id: activeUserId,
      created_at: new Date().toISOString(),
    };
    currentProducts = [newProduct, ...currentProducts.filter(p => p.id !== createdId && (!product.barcode || p.barcode !== product.barcode))];
    persistUserData(activeUserId);
    storeManager.notify();
    return newProduct;
  },

  updateProduct: async (productId: string, updates: Partial<Product>) => {
    const activeUserId = currentUser?.id || 'guest';
    let updated: Product | null = null;
    currentProducts = currentProducts.map((p) => {
      if (p.id === productId || (updates.barcode && p.barcode === updates.barcode)) {
        updated = { ...p, ...updates };
        return updated;
      }
      return p;
    });
    persistUserData(activeUserId);
    storeManager.notify();

    if (isSupabaseConfigured) {
      try {
        const payload: any = {};
        if (updates.name !== undefined) payload.name = updates.name;
        if (updates.price !== undefined) payload.price = updates.price;
        if (updates.purchase_price !== undefined) payload.purchase_price = updates.purchase_price;
        if (updates.stock_quantity !== undefined) payload.stock_quantity = updates.stock_quantity;
        if (updates.barcode !== undefined) payload.barcode = updates.barcode;
        if (updates.category !== undefined) payload.category = updates.category;
        if (updates.unit !== undefined) payload.unit = updates.unit;
        if (updates.image_url !== undefined) payload.image_url = updates.image_url;
        if (updates.brand !== undefined) payload.brand = updates.brand;

        if (productId.startsWith('prod-')) {
          if (updates.barcode) {
            await supabase.from('products').update(payload).eq('barcode', updates.barcode);
          }
        } else {
          await supabase.from('products').update(payload).eq('id', productId);
        }
      } catch (e) {
        console.log('Supabase update product error:', e);
      }
    }
    return updated;
  },

  updateStock: async (productId: string, delta: number) => {
    const activeUserId = currentUser?.id || 'guest';
    let targetQuantity = 0;
    currentProducts = currentProducts.map((p) => {
      if (p.id === productId) {
        targetQuantity = Math.max(0, p.stock_quantity + delta);
        return { ...p, stock_quantity: targetQuantity };
      }
      return p;
    });
    persistUserData(activeUserId);
    storeManager.notify();

    if (isSupabaseConfigured) {
      try {
        if (productId.startsWith('prod-')) {
          const item = currentProducts.find(p => p.id === productId);
          if (item?.barcode) {
            await supabase.from('products').update({ stock_quantity: targetQuantity }).eq('barcode', item.barcode);
          }
        } else {
          await supabase.from('products').update({ stock_quantity: targetQuantity }).eq('id', productId);
        }
      } catch (e) {
        console.log('Supabase update stock error:', e);
      }
    }
  },

  deleteProduct: async (productId: string) => {
    const activeUserId = currentUser?.id || 'guest';
    currentProducts = currentProducts.filter(p => p.id !== productId);
    persistUserData(activeUserId);
    storeManager.notify();
    if (isSupabaseConfigured) {
      try {
        if (!productId.startsWith('prod-')) {
          await supabase.from('products').delete().eq('id', productId);
        }
      } catch (e) {
        console.log('Supabase delete product error:', e);
      }
    }
  },

  // Single transaction process checkout -> Creates 1 Receipt for all items
  processCheckout: (cart: CartItem[], paymentMethod: PaymentMethod): Receipt => {
    const activeUserId = currentUser?.id || 'guest';
    const now = new Date().toISOString();
    const receiptId = `rec-${Date.now()}`;
    const num = (receiptCounter++).toString();

    const items: ReceiptItem[] = cart.map((item, idx) => {
      // Deduct warehouse stock
      storeManager.updateStock(item.product.id, -item.quantity);

      return {
        id: `item-${idx}-${Date.now()}`,
        product_id: item.product.id,
        product_name: item.product.name,
        quantity: item.quantity,
        unit_price: item.product.price,
        subtotal: item.subtotal,
        unit: item.product.unit || 'шт',
        returned_quantity: 0,
      };
    });

    const totalAmount = cart.reduce((sum, item) => sum + item.subtotal, 0);

    const newReceipt: Receipt = {
      id: receiptId,
      user_id: activeUserId,
      receipt_number: num,
      items,
      total_amount: totalAmount,
      payment_method: paymentMethod,
      created_at: now,
      is_fully_returned: false,
    };

    currentReceipts = [newReceipt, ...currentReceipts];
    persistUserData(activeUserId);
    storeManager.notify();

    if (isSupabaseConfigured) {
      (async () => {
        try {
          const dbUserId = currentUser?.id && !currentUser.id.startsWith('user-') ? currentUser.id : null;
          const recPayload: any = {
            receipt_number: num,
            total_amount: totalAmount,
            payment_method: paymentMethod,
            is_fully_returned: false,
            user_id: dbUserId,
          };

          const { data: recData, error: recErr } = await supabase.from('receipts').insert(recPayload).select().single();

          if (recData?.id) {
            const receiptItemsPayload = items.map(it => ({
              receipt_id: recData.id,
              product_id: it.product_id?.startsWith('prod-') ? null : it.product_id,
              product_name: it.product_name,
              quantity: it.quantity,
              unit_price: it.unit_price,
              subtotal: it.subtotal,
              unit: it.unit,
              returned_quantity: 0,
            }));
            await supabase.from('receipt_items').insert(receiptItemsPayload);
          } else if (recErr) {
            console.log('Supabase receipt insert error:', recErr.message);
          }
        } catch (e) {
          console.log('Supabase receipt exception:', e);
        }
      })();
    }

    return newReceipt;
  },

  // Return full receipt (all items returned)
  returnReceipt: (receiptId: string) => {
    const activeUserId = currentUser?.id || 'guest';
    currentReceipts = currentReceipts.map((r) => {
      if (r.id === receiptId) {
        const updatedItems = r.items.map((item) => {
          const unreturned = item.quantity - item.returned_quantity;
          if (unreturned > 0 && item.product_id) {
            storeManager.updateStock(item.product_id, unreturned);
          }
          return {
            ...item,
            returned_quantity: item.quantity,
          };
        });

        return {
          ...r,
          items: updatedItems,
          is_fully_returned: true,
        };
      }
      return r;
    });
    persistUserData(activeUserId);
    storeManager.notify();

    if (isSupabaseConfigured && !receiptId.startsWith('rec-')) {
      (async () => {
        try {
          await supabase.from('receipts').update({ is_fully_returned: true }).eq('id', receiptId);
          const rec = currentReceipts.find(r => r.id === receiptId);
          if (rec) {
            for (const item of rec.items) {
              if (!item.id.startsWith('item-')) {
                await supabase.from('receipt_items').update({ returned_quantity: item.quantity }).eq('id', item.id);
              }
            }
          }
        } catch (e) {
          console.log('Supabase return receipt error:', e);
        }
      })();
    }
  },

  // Return specific item inside a receipt by count (1 or N)
  returnReceiptItem: (receiptId: string, itemId: string, countToReturn: number = 1) => {
    const activeUserId = currentUser?.id || 'guest';
    let targetReturnedQty = 0;
    let targetIsFullyReturned = false;

    currentReceipts = currentReceipts.map((r) => {
      if (r.id === receiptId) {
        let allItemsReturned = true;

        const updatedItems = r.items.map((item) => {
          if (item.id === itemId) {
            const availableToReturn = item.quantity - item.returned_quantity;
            const actualReturn = Math.min(availableToReturn, countToReturn);

            if (actualReturn > 0) {
              if (item.product_id) {
                storeManager.updateStock(item.product_id, actualReturn);
              }
              const newReturned = item.returned_quantity + actualReturn;
              targetReturnedQty = newReturned;
              if (newReturned < item.quantity) {
                allItemsReturned = false;
              }
              return {
                ...item,
                returned_quantity: newReturned,
              };
            }
          }

          if (item.returned_quantity < item.quantity) {
            allItemsReturned = false;
          }

          return item;
        });

        targetIsFullyReturned = allItemsReturned;
        return {
          ...r,
          items: updatedItems,
          is_fully_returned: allItemsReturned,
        };
      }
      return r;
    });
    persistUserData(activeUserId);
    storeManager.notify();

    if (isSupabaseConfigured) {
      (async () => {
        try {
          if (!itemId.startsWith('item-')) {
            await supabase.from('receipt_items').update({ returned_quantity: targetReturnedQty }).eq('id', itemId);
          }
          if (!receiptId.startsWith('rec-') && targetIsFullyReturned) {
            await supabase.from('receipts').update({ is_fully_returned: true }).eq('id', receiptId);
          }
        } catch (e) {
          console.log('Supabase return item error:', e);
        }
      })();
    }
  },

  getDayRevenue: (year: number, month: number, day: number) => {
    return currentReceipts
      .filter((r) => {
        const d = new Date(r.created_at);
        return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day;
      })
      .reduce((sum, r) => {
        const receiptActiveAmount = r.items.reduce((itemSum, item) => {
          const effectiveQty = Math.max(0, item.quantity - item.returned_quantity);
          return itemSum + effectiveQty * item.unit_price;
        }, 0);
        return sum + receiptActiveAmount;
      }, 0);
  },

  getYesterdayRevenue: () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return storeManager.getDayRevenue(
      yesterday.getFullYear(),
      yesterday.getMonth(),
      yesterday.getDate()
    );
  },

  getRevenueGrowthPercentage: () => {
    const today = storeManager.getTodayRevenue();
    const yesterday = storeManager.getYesterdayRevenue();
    if (yesterday === 0) {
      return today > 0 ? 100 : 0;
    }
    return Math.round(((today - yesterday) / yesterday) * 100);
  },

  getTodayRevenue: () => {
    const now = new Date();
    return storeManager.getDayRevenue(now.getFullYear(), now.getMonth(), now.getDate());
  },

  getTodaySalesCount: () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const d = now.getDate();
    return currentReceipts.filter((r) => {
      const rd = new Date(r.created_at);
      return rd.getFullYear() === y && rd.getMonth() === m && rd.getDate() === d && !r.is_fully_returned;
    }).length;
  },

  // ─── Admin: load ALL receipts (all users) from Supabase ───────────────────
  getAllReceiptsFromSupabase: async (): Promise<Receipt[]> => {
    if (!isSupabaseConfigured) {
      // Offline fallback: return current user's receipts
      return currentReceipts;
    }
    try {
      const { data, error } = await supabase
        .from('receipts')
        .select('*, receipt_items(*)')
        .order('created_at', { ascending: false });

      if (!error && data) {
        return data.map((r: any): Receipt => ({
          id: r.id,
          user_id: r.user_id,
          receipt_number: r.receipt_number,
          total_amount: Number(r.total_amount) || 0,
          payment_method: r.payment_method || 'cash',
          is_fully_returned: Boolean(r.is_fully_returned),
          created_at: r.created_at || new Date().toISOString(),
          items: (r.receipt_items || []).map((it: any) => ({
            id: it.id,
            product_id: it.product_id,
            product_name: it.product_name,
            quantity: Number(it.quantity) || 1,
            unit_price: Number(it.unit_price) || 0,
            subtotal: Number(it.subtotal) || 0,
            unit: it.unit || 'шт',
            returned_quantity: Number(it.returned_quantity) || 0,
          })),
        }));
      }
    } catch (e) {
      console.log('getAllReceiptsFromSupabase error:', e);
    }
    return currentReceipts;
  },

  // Convert receipts array → Sale[] (same shape as getSales)
  receiptsToSales: (receipts: Receipt[]): Sale[] => {
    const salesList: Sale[] = [];
    receipts.forEach((r) => {
      r.items.forEach((item) => {
        salesList.push({
          id: `${r.id}-${item.id}`,
          user_id: r.user_id,
          product_id: item.product_id,
          product_name: item.product_name,
          quantity: item.quantity,
          unit_price: item.unit_price,
          total_price: item.subtotal,
          payment_method: r.payment_method,
          sale_date: r.created_at,
          is_returned: item.returned_quantity >= item.quantity,
          returned_quantity: item.returned_quantity,
        });
      });
    });
    return salesList;
  },
};

// Realtime subscription setup
let isRealtimeInitialized = false;

export const initSupabaseRealtime = () => {
  if (!isSupabaseConfigured || isRealtimeInitialized) return;
  isRealtimeInitialized = true;

  try {
    const channelName = 'schema-db-changes-' + Date.now();
    supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'products' },
        (payload) => {
          console.log('[Supabase Realtime] products update:', payload.eventType);
          storeManager.syncProductsFromSupabase();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'receipts' },
        (payload) => {
          console.log('[Supabase Realtime] receipts update:', payload.eventType);
          storeManager.syncReceiptsFromSupabase();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'receipt_items' },
        (payload) => {
          console.log('[Supabase Realtime] receipt_items update:', payload.eventType);
          storeManager.syncReceiptsFromSupabase();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles' },
        (payload) => {
          console.log('[Supabase Realtime] profiles update:', payload.eventType);
          storeManager.syncUsersFromSupabase();
        }
      )
      .subscribe((status) => {
        console.log('[Supabase Realtime] status:', status);
      });
  } catch (e) {
    console.log('Error initializing Supabase Realtime:', e);
  }
};

// Initial sync with Supabase and start Realtime listener
if (isSupabaseConfigured) {
  storeManager.syncAll();
  initSupabaseRealtime();
}

