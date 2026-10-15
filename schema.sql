-- ========================================================
-- "Хозмаг Учёт" - Полная оптимизированная схема Supabase
-- Для выполнения в Supabase SQL Editor
-- ========================================================

-- 1. Включение расширений для генерации UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ========================================================
-- 2. Таблица: profiles (Профили пользователей магазина)
-- ========================================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'Кассир', -- 'Суперадминистратор', 'Администратор', 'Кассир', 'Менеджер'
    store_name VARCHAR(255) DEFAULT 'Хозмаг Учёт',
    is_superadmin BOOLEAN DEFAULT false,
    is_blocked BOOLEAN DEFAULT false,
    blocked_pages TEXT[] DEFAULT '{}',
    password_plain TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Добавление новых колонок, если таблица уже существовала
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_superadmin BOOLEAN DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS blocked_pages TEXT[] DEFAULT '{}';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS password_plain TEXT;

-- RLS для profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow full access on profiles" ON public.profiles;
CREATE POLICY "Allow full access on profiles" ON public.profiles FOR ALL USING (true) WITH CHECK (true);

-- Триггер: Автоматическое создание профиля при регистрации через Supabase Auth
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, name, email, role, store_name, is_superadmin, is_blocked, blocked_pages, password_plain)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'role', 'Кассир'),
        COALESCE(NEW.raw_user_meta_data->>'store_name', 'Хозмаг Учёт'),
        COALESCE((NEW.raw_user_meta_data->>'is_superadmin')::boolean, false),
        false,
        '{}',
        NEW.raw_user_meta_data->>'password_plain'
    )
    ON CONFLICT (id) DO UPDATE
    SET name = COALESCE(EXCLUDED.name, profiles.name),
        role = COALESCE(EXCLUDED.role, profiles.role),
        store_name = COALESCE(EXCLUDED.store_name, profiles.store_name),
        is_superadmin = COALESCE(EXCLUDED.is_superadmin, profiles.is_superadmin);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Функция удаления аккаунта со всеми данными (RPC)
CREATE OR REPLACE FUNCTION public.delete_user_account(target_user_id UUID)
RETURNS VOID AS $$
BEGIN
    DELETE FROM public.receipt_items WHERE receipt_id IN (SELECT id FROM public.receipts WHERE user_id = target_user_id);
    DELETE FROM public.receipts WHERE user_id = target_user_id;
    DELETE FROM public.products WHERE user_id = target_user_id;
    DELETE FROM public.profiles WHERE id = target_user_id;
    DELETE FROM auth.users WHERE id = target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();

-- ========================================================
-- 3. Таблица: products (Товары на складе)
-- ========================================================
CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    purchase_price NUMERIC(12, 2) DEFAULT 0.00,
    stock_quantity INTEGER NOT NULL DEFAULT 0,
    barcode VARCHAR(100),
    category VARCHAR(100) DEFAULT 'Разное',
    unit VARCHAR(20) DEFAULT 'шт',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Добавление колонки user_id, если таблица уже существовала
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_products_user_id ON public.products(user_id);
CREATE INDEX IF NOT EXISTS idx_products_barcode ON public.products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_user_barcode ON public.products(user_id, barcode);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow full access on products" ON public.products;
CREATE POLICY "Allow full access on products" ON public.products FOR ALL USING (true) WITH CHECK (true);

-- ========================================================
-- 4. Таблицы: receipts и receipt_items (Чеки и проданные позиции)
-- ========================================================
CREATE TABLE IF NOT EXISTS public.receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    receipt_number VARCHAR(50) NOT NULL,
    total_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
    payment_method VARCHAR(50) DEFAULT 'cash', -- 'cash', 'card', 'transfer'
    is_fully_returned BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Добавление колонки user_id, если таблица уже существовала
ALTER TABLE public.receipts ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_receipts_user_id ON public.receipts(user_id);
CREATE INDEX IF NOT EXISTS idx_receipts_created_at ON public.receipts(created_at DESC);

ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow full access on receipts" ON public.receipts;
CREATE POLICY "Allow full access on receipts" ON public.receipts FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.receipt_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_id UUID REFERENCES public.receipts(id) ON DELETE CASCADE,
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    product_name VARCHAR(255) NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_price NUMERIC(12, 2) NOT NULL,
    subtotal NUMERIC(14, 2) NOT NULL,
    unit VARCHAR(20) DEFAULT 'шт',
    returned_quantity INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_receipt_items_receipt_id ON public.receipt_items(receipt_id);
CREATE INDEX IF NOT EXISTS idx_receipt_items_product_id ON public.receipt_items(product_id);

ALTER TABLE public.receipt_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow full access on receipt_items" ON public.receipt_items;
CREATE POLICY "Allow full access on receipt_items" ON public.receipt_items FOR ALL USING (true) WITH CHECK (true);

-- ========================================================
-- 5. Realtime подписка для мгновенного обновления экранов
-- ========================================================
ALTER TABLE public.products REPLICA IDENTITY FULL;
ALTER TABLE public.receipts REPLICA IDENTITY FULL;
ALTER TABLE public.receipt_items REPLICA IDENTITY FULL;
ALTER TABLE public.profiles REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'products'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.products;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'receipts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.receipts;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'receipt_items'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.receipt_items;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'profiles'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
  END IF;
END $$;

-- ========================================================
-- 6. Глобальный каталог товаров с фото и штрихкодами (product_catalog)
-- ========================================================
CREATE TABLE IF NOT EXISTS public.product_catalog (
    barcode       VARCHAR(100) PRIMARY KEY,
    name          VARCHAR(500) NOT NULL,
    brand         VARCHAR(200),
    category      VARCHAR(100) DEFAULT 'Разное',
    unit          VARCHAR(20)  DEFAULT 'шт',
    image_url     TEXT,
    country       VARCHAR(100),
    description   TEXT,
    source        VARCHAR(50)  DEFAULT 'manual',
    verified      BOOLEAN      DEFAULT false,
    created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Колонки с фото в таблице продуктов
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS brand VARCHAR(200);

-- Индексы каталога
CREATE INDEX IF NOT EXISTS idx_product_catalog_barcode ON public.product_catalog(barcode);
CREATE INDEX IF NOT EXISTS idx_product_catalog_name ON public.product_catalog(name);

-- RLS для product_catalog
ALTER TABLE public.product_catalog ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow full access on product_catalog" ON public.product_catalog;
CREATE POLICY "Allow full access on product_catalog" ON public.product_catalog FOR ALL USING (true) WITH CHECK (true);

-- Триггер: если у товара нет фото, автоматически брать из глобального каталога
CREATE OR REPLACE FUNCTION public.sync_product_image_from_catalog()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.image_url IS NULL OR NEW.image_url = '') AND NEW.barcode IS NOT NULL THEN
    SELECT image_url INTO NEW.image_url
    FROM public.product_catalog
    WHERE barcode = NEW.barcode AND image_url IS NOT NULL
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_product_image ON public.products;
CREATE TRIGGER sync_product_image
BEFORE INSERT OR UPDATE ON public.products
FOR EACH ROW
EXECUTE FUNCTION public.sync_product_image_from_catalog();

-- Добавление product_catalog в Realtime
ALTER TABLE public.product_catalog REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'product_catalog'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.product_catalog;
  END IF;
END $$;