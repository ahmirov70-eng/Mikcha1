export type PaymentMethod = 'cash' | 'card' | 'transfer';

export interface Product {
  id: string;
  user_id?: string;
  name: string;
  price: number;
  purchase_price?: number;
  stock_quantity: number;
  barcode: string;
  category: string;
  unit: string;
  image_url?: string;   // URL фото товара из каталога
  brand?: string;
  created_at?: string;
}

export interface ProductCatalogEntry {
  barcode: string;
  name: string;
  brand?: string;
  category: string;
  unit: string;
  image_url?: string;
  country?: string;
  description?: string;
  source?: string;      // 'openfoodfacts' | 'upcitemdb' | 'local' | 'manual'
  verified?: boolean;
  created_at?: string;
  updated_at?: string;
}


export interface ReceiptItem {
  id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  unit: string;
  returned_quantity: number;
}

export interface Receipt {
  id: string;
  user_id?: string;
  receipt_number: string;
  items: ReceiptItem[];
  total_amount: number;
  payment_method: PaymentMethod;
  created_at: string;
  is_fully_returned?: boolean;
}

export interface Sale {
  id: string;
  user_id?: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  payment_method: PaymentMethod;
  sale_date: string;
  created_at?: string;
  is_returned?: boolean;
  returned_quantity?: number;
}

export interface DailySummary {
  id: string;
  summary_date: string;
  total_revenue: number;
  total_transactions: number;
  created_at?: string;
}

export interface CartItem {
  product: Product;
  quantity: number;
  subtotal: number;
}

export interface CategorySummary {
  category: string;
  count: number;
  totalValue: number;
}

export type UserRole = 'Суперадминистратор' | 'Администратор' | 'Кассир' | 'Менеджер';

export interface UserAccount {
  id: string;
  name: string;
  email: string;
  password?: string;
  role: UserRole;
  store_name: string;
  is_superadmin?: boolean;
  is_blocked?: boolean;
  blocked_pages?: string[]; // e.g. ['warehouse', 'reports', 'returns', 'scanner']
  created_at: string;
}
