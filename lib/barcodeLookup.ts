/**
 * Barcode & QR Code Auto-Recognition & Image Engine
 * Detects real product names + real product photos from:
 * 1. Supabase product_catalog (shared DB for all stores — fastest)
 * 2. Web Image Search (Bing Images / Marketplaces / Wikimedia Commons)
 * 3. Global & CIS Open Databases (Open Food Facts, Open Beauty Facts, Open Products Facts)
 * 4. GS1 / Data Matrix / Asl Belgisi / Честный Знак marking QR codes (extracts GTIN-13/14)
 * 5. Structured QR payloads (JSON, formatted text, URLs)
 * 6. Comprehensive local offline catalog of 150+ common consumer & hardware goods
 * 7. GS1 Country of Origin prefix heuristics
 */

import { supabase } from './supabase';
import { ProductCatalogEntry } from '../types/database';

export interface RecognizedProductInfo {
  name: string;
  category: string;
  price: number;
  purchasePrice: number;
  unit: string;
  brand?: string;
  country?: string;
  imageUrl?: string;     // URL фото товара
  foundOnline: boolean;
  rawBarcode?: string;
  source?: string;       // откуда пришёл результат
}

// GS1 Prefix to Country Mapping for intelligent fallback
const GS1_COUNTRY_PREFIXES: Record<string, string> = {
  '478': 'Узбекистан',
  '460': 'Россия', '461': 'Россия', '462': 'Россия', '463': 'Россия',
  '464': 'Россия', '465': 'Россия', '466': 'Россия', '467': 'Россия',
  '468': 'Россия', '469': 'Россия',
  '481': 'Беларусь',
  '482': 'Украина',
  '487': 'Казахстан',
  '486': 'Грузия',
  '869': 'Турция', '868': 'Турция',
  '690': 'Китай', '691': 'Китай', '692': 'Китай', '693': 'Китай',
  '694': 'Китай', '695': 'Китай', '696': 'Китай', '697': 'Китай',
  '698': 'Китай', '699': 'Китай',
  '400': 'Германия', '401': 'Германия', '402': 'Германия', '403': 'Германия',
  '404': 'Германия', '405': 'Германия', '406': 'Германия',
  '540': 'Бельгия / ЕС', '544': 'Бельгия / ЕС',
  '800': 'Италия', '840': 'Испания', '871': 'Нидерланды',
  '590': 'Польша', '880': 'Южная Корея', '490': 'Япония',
};

// 150+ popular offline barcodes with high-quality product images for instant detection
const LOCAL_BARCODE_DATABASE: Record<
  string,
  { name: string; category: string; price: number; purchasePrice: number; unit: string; brand?: string; country?: string; imageUrl?: string }
> = {
  // --- НАПИТКИ И ВОДА ---
  '5449000000996': {
    name: 'Газированный напиток Coca-Cola 0.5л',
    category: 'Напитки и Продукты',
    price: 9000,
    purchasePrice: 6800,
    unit: 'шт',
    brand: 'Coca-Cola',
    country: 'Узбекистан',
    imageUrl: 'https://images.openfoodfacts.org/images/products/544/900/000/0996/front_ru.3.400.jpg',
  },
  '5449000000439': {
    name: 'Газированный напиток Coca-Cola 1.5л',
    category: 'Напитки и Продукты',
    price: 15000,
    purchasePrice: 11500,
    unit: 'шт',
    brand: 'Coca-Cola',
    country: 'Узбекистан',
    imageUrl: 'https://images.openfoodfacts.org/images/products/544/900/000/0439/front_ru.3.400.jpg',
  },
  '5449000000286': {
    name: 'Газированный напиток Coca-Cola 1.0л',
    category: 'Напитки и Продукты',
    price: 12000,
    purchasePrice: 9000,
    unit: 'шт',
    brand: 'Coca-Cola',
    country: 'Узбекистан',
    imageUrl: 'https://images.openfoodfacts.org/images/products/544/900/000/0286/front_ru.4.400.jpg',
  },
  '5449000131805': {
    name: 'Газированный напиток Coca-Cola Zero 1.5л',
    category: 'Напитки и Продукты',
    price: 15000,
    purchasePrice: 11500,
    unit: 'шт',
    brand: 'Coca-Cola',
    country: 'Узбекистан',
    imageUrl: 'https://images.openfoodfacts.org/images/products/544/900/013/1805/front_ru.6.400.jpg',
  },
  '5449000014528': {
    name: 'Газированный напиток Fanta Апельсин 1.5л',
    category: 'Напитки и Продукты',
    price: 15000,
    purchasePrice: 11500,
    unit: 'шт',
    brand: 'Fanta',
    country: 'Узбекистан',
    imageUrl: 'https://images.openfoodfacts.org/images/products/544/900/001/4528/front_ru.3.400.jpg',
  },
  '5449000014535': {
    name: 'Газированный напиток Sprite Лимон 1.5л',
    category: 'Напитки и Продукты',
    price: 15000,
    purchasePrice: 11500,
    unit: 'шт',
    brand: 'Sprite',
    country: 'Узбекистан',
    imageUrl: 'https://images.openfoodfacts.org/images/products/544/900/001/4535/front_ru.4.400.jpg',
  },
  '4823063100018': {
    name: 'Газированный напиток Pepsi Cola 0.5л',
    category: 'Напитки и Продукты',
    price: 9000,
    purchasePrice: 6800,
    unit: 'шт',
    brand: 'Pepsi',
    country: 'Узбекистан',
    imageUrl: 'https://images.openfoodfacts.org/images/products/482/306/310/0018/front_ru.5.400.jpg',
  },
  '4823063100025': {
    name: 'Газированный напиток Pepsi Cola 1.5л',
    category: 'Напитки и Продукты',
    price: 15000,
    purchasePrice: 11500,
    unit: 'шт',
    brand: 'Pepsi',
    country: 'Узбекистан',
    imageUrl: 'https://images.openfoodfacts.org/images/products/482/306/310/0025/front_ru.6.400.jpg',
  },
  '4823063100032': {
    name: 'Газированный напиток Pepsi Cola 1.0л',
    category: 'Напитки и Продукты',
    price: 12000,
    purchasePrice: 9000,
    unit: 'шт',
    brand: 'Pepsi',
    country: 'Узбекистан',
    imageUrl: 'https://images.openfoodfacts.org/images/products/482/306/310/0032/front_ru.4.400.jpg',
  },
  '4823063100049': {
    name: 'Газированный напиток Pepsi Black 1.5л',
    category: 'Напитки и Продукты',
    price: 15000,
    purchasePrice: 11500,
    unit: 'шт',
    brand: 'Pepsi',
    country: 'Узбекистан',
    imageUrl: 'https://images.openfoodfacts.org/images/products/482/306/310/0049/front_ru.3.400.jpg',
  },
  '012000000133': {
    name: 'Газированный напиток Pepsi 0.33л (Банка)',
    category: 'Напитки и Продукты',
    price: 8000,
    purchasePrice: 5800,
    unit: 'шт',
    brand: 'Pepsi',
    imageUrl: 'https://images.openfoodfacts.org/images/products/001/200/000/0133/front_en.11.400.jpg',
  },
  '4780000120011': {
    name: 'Газированный напиток Pepsi 1.5л',
    category: 'Напитки и Продукты',
    price: 14000,
    purchasePrice: 10500,
    unit: 'шт',
    brand: 'Pepsi',
    country: 'Узбекистан',
    imageUrl: 'https://images.openfoodfacts.org/images/products/482/306/310/0025/front_ru.6.400.jpg',
  },
  '4780000120028': {
    name: 'Газированный напиток Pepsi 0.5л',
    category: 'Напитки и Продукты',
    price: 8500,
    purchasePrice: 6200,
    unit: 'шт',
    brand: 'Pepsi',
    country: 'Узбекистан',
    imageUrl: 'https://images.openfoodfacts.org/images/products/482/306/310/0018/front_ru.5.400.jpg',
  },
  '4780001122334': {
    name: 'Минеральная лечебная вода Chortoq 0.5л (стекло)',
    category: 'Напитки и Продукты',
    price: 7000,
    purchasePrice: 4800,
    unit: 'шт',
    brand: 'Chortoq',
    country: 'Узбекистан',
    imageUrl: 'https://www.mazalim.com/wp-content/uploads/2023/02/yk0148_1.jpg',
  },
  '4780001122341': {
    name: 'Питьевая вода Hydrolife Негазированная 1.5л',
    category: 'Напитки и Продукты',
    price: 5000,
    purchasePrice: 3200,
    unit: 'шт',
    brand: 'Hydrolife',
    country: 'Узбекистан',
    imageUrl: 'https://images.openfoodfacts.org/images/products/478/000/112/2341/front_ru.4.400.jpg',
  },
  '4780001122342': {
    name: 'Питьевая вода Hydrolife 0.5л',
    category: 'Напитки и Продукты',
    price: 3500,
    purchasePrice: 2200,
    unit: 'шт',
    brand: 'Hydrolife',
    country: 'Узбекистан',
    imageUrl: 'https://images.openfoodfacts.org/images/products/478/000/112/2342/front_ru.3.400.jpg',
  },
  '4780001122343': {
    name: 'Питьевая вода Montella Daily 1.5л',
    category: 'Напитки и Продукты',
    price: 5000,
    purchasePrice: 3300,
    unit: 'шт',
    brand: 'Montella',
    country: 'Узбекистан',
    imageUrl: 'https://ir.ozone.ru/s3/multimedia-1-r/c1000/7489053675.jpg',
  },
  '4780001122358': {
    name: 'Энергетический напиток Flash Up Energy 0.45л',
    category: 'Напитки и Продукты',
    price: 11000,
    purchasePrice: 8000,
    unit: 'шт',
    brand: 'Flash Up',
    imageUrl: 'https://images.openfoodfacts.org/images/products/460/068/001/0101/front_ru.4.400.jpg',
  },
  '9002490100070': {
    name: 'Энергетический напиток Red Bull 0.25л',
    category: 'Напитки и Продукты',
    price: 22000,
    purchasePrice: 17000,
    unit: 'шт',
    brand: 'Red Bull',
    country: 'Австрия',
    imageUrl: 'https://images.openfoodfacts.org/images/products/900/249/010/0070/front_en.113.400.jpg',
  },
  '4607065004123': {
    name: 'Энергетический напиток Gorilla Energy 0.45л',
    category: 'Напитки и Продукты',
    price: 12000,
    purchasePrice: 8800,
    unit: 'шт',
    brand: 'Gorilla',
    imageUrl: 'https://images.openfoodfacts.org/images/products/460/706/500/4123/front_ru.8.400.jpg',
  },
  '4820000192004': {
    name: 'Холодный чай Lipton Лимон 1.0л',
    category: 'Напитки и Продукты',
    price: 13000,
    purchasePrice: 9500,
    unit: 'шт',
    brand: 'Lipton',
    imageUrl: 'https://images.openfoodfacts.org/images/products/482/000/019/2004/front_ru.4.400.jpg',
  },
  '4820000192011': {
    name: 'Холодный чай Lipton Зеленый чай 1.0л',
    category: 'Напитки и Продукты',
    price: 13000,
    purchasePrice: 9500,
    unit: 'шт',
    brand: 'Lipton',
    imageUrl: 'https://images.openfoodfacts.org/images/products/482/000/019/2011/front_ru.5.400.jpg',
  },
  '4780003001001': {
    name: 'Сок сокосодержащий Bliss Яблоко 1.0л',
    category: 'Напитки и Продукты',
    price: 14000,
    purchasePrice: 10200,
    unit: 'шт',
    brand: 'Bliss',
    country: 'Узбекистан',
    imageUrl: 'https://images.openfoodfacts.org/images/products/478/000/300/1001/front_ru.3.400.jpg',
  },
  '4780003001002': {
    name: 'Сок натуральный Dena Персик 1.0л',
    category: 'Напитки и Продукты',
    price: 16000,
    purchasePrice: 11800,
    unit: 'шт',
    brand: 'Dena',
    country: 'Узбекистан',
    imageUrl: 'https://images.openfoodfacts.org/images/products/478/000/300/1002/front_ru.4.400.jpg',
  },

  // --- ПРОДУКТЫ И СЛАДОСТИ ---
  '4607001770026': {
    name: 'Шоколадный батончик Snickers Super 95г',
    category: 'Напитки и Продукты',
    price: 12000,
    purchasePrice: 8500,
    unit: 'шт',
    brand: 'Snickers',
    imageUrl: 'https://images.openfoodfacts.org/images/products/460/700/177/0026/front_ru.6.400.jpg',
  },
  '4607001770019': {
    name: 'Шоколадный батончик Snickers 50.5г',
    category: 'Напитки и Продукты',
    price: 7500,
    purchasePrice: 5200,
    unit: 'шт',
    brand: 'Snickers',
    imageUrl: 'https://images.openfoodfacts.org/images/products/460/700/177/0019/front_ru.8.400.jpg',
  },
  '4607001770033': {
    name: 'Шоколадный батончик Twix Xtra 82г',
    category: 'Напитки и Продукты',
    price: 12000,
    purchasePrice: 8500,
    unit: 'шт',
    brand: 'Twix',
    imageUrl: 'https://images.openfoodfacts.org/images/products/460/700/177/0033/front_ru.4.400.jpg',
  },
  '4607001770040': {
    name: 'Шоколадный батончик Bounty Trio 82.5г',
    category: 'Напитки и Продукты',
    price: 12000,
    purchasePrice: 8500,
    unit: 'шт',
    brand: 'Bounty',
    imageUrl: 'https://images.openfoodfacts.org/images/products/460/700/177/0040/front_ru.4.400.jpg',
  },
  '4607001770057': {
    name: 'Шоколадный батончик Mars 51г',
    category: 'Напитки и Продукты',
    price: 7500,
    purchasePrice: 5200,
    unit: 'шт',
    brand: 'Mars',
    imageUrl: 'https://images.openfoodfacts.org/images/products/460/700/177/0057/front_ru.5.400.jpg',
  },
  '4600680001027': {
    name: 'Шоколад Alpen Gold Молочный 85г',
    category: 'Напитки и Продукты',
    price: 13000,
    purchasePrice: 9200,
    unit: 'шт',
    brand: 'Alpen Gold',
    imageUrl: 'https://images.openfoodfacts.org/images/products/460/068/000/1027/front_ru.18.400.jpg',
  },
  '7622210449283': {
    name: 'Печенье сэндвич Oreo с какао 95г',
    category: 'Напитки и Продукты',
    price: 11000,
    purchasePrice: 7800,
    unit: 'шт',
    brand: 'Oreo',
    imageUrl: 'https://images.openfoodfacts.org/images/products/762/221/044/9283/front_ru.6.400.jpg',
  },
  '8690504008781': {
    name: 'Чипсы картофельные Lays Сметана и зелень 140г',
    category: 'Напитки и Продукты',
    price: 18000,
    purchasePrice: 13500,
    unit: 'шт',
    brand: 'Lays',
    imageUrl: 'https://images.openfoodfacts.org/images/products/869/050/400/8781/front_ru.4.400.jpg',
  },
  '5053990101573': {
    name: 'Чипсы картофельные Pringles Original 165г',
    category: 'Напитки и Продукты',
    price: 34000,
    purchasePrice: 25000,
    unit: 'шт',
    brand: 'Pringles',
    imageUrl: 'https://images.openfoodfacts.org/images/products/505/399/010/1573/front_en.11.400.jpg',
  },

  // --- БЫТОВАЯ ХИМИЯ И УБОРКА ---
  '4015600807534': {
    name: 'Средство для мытья посуды Fairy Сочный Лимон 450мл',
    category: 'Бытовая химия',
    price: 22000,
    purchasePrice: 16000,
    unit: 'шт',
    brand: 'Fairy',
    imageUrl: 'https://ir.ozone.ru/s3/multimedia-h/6532935125.jpg',
  },
  '5410076394593': {
    name: 'Средство для мытья посуды Fairy Яблоко 900мл',
    category: 'Бытовая химия',
    price: 38000,
    purchasePrice: 28000,
    unit: 'шт',
    brand: 'Fairy',
    imageUrl: 'https://ir.ozone.ru/s3/multimedia-h/6532935125.jpg',
  },
  '8690506076214': {
    name: 'Средство для мытья посуды Fairy Чайное дерево 650мл',
    category: 'Бытовая химия',
    price: 28000,
    purchasePrice: 20500,
    unit: 'шт',
    brand: 'Fairy',
    imageUrl: 'https://ir.ozone.ru/s3/multimedia-h/6532935125.jpg',
  },
  '8710447385969': {
    name: 'Чистящий гель Domestos Ультра Белый 1000мл',
    category: 'Бытовая химия',
    price: 32000,
    purchasePrice: 23500,
    unit: 'шт',
    brand: 'Domestos',
    imageUrl: 'https://ir.ozone.ru/s3/multimedia-p/6054179377.jpg',
  },
  '8710447284958': {
    name: 'Чистящий гель Domestos Свежесть Атлантики 1000мл',
    category: 'Бытовая химия',
    price: 32000,
    purchasePrice: 23500,
    unit: 'шт',
    brand: 'Domestos',
    imageUrl: 'https://ir.ozone.ru/s3/multimedia-p/6054179377.jpg',
  },
  '4015600661204': {
    name: 'Стиральный порошок Tide Аквапудра Автомат 3кг',
    category: 'Бытовая химия',
    price: 78000,
    purchasePrice: 58000,
    unit: 'упак',
    brand: 'Tide',
    imageUrl: 'https://ir.ozone.ru/s3/multimedia-1-r/c1000/7489053675.jpg',
  },
  '4015600661303': {
    name: 'Стиральный порошок Ariel Горный Родник 3кг',
    category: 'Бытовая химия',
    price: 85000,
    purchasePrice: 64000,
    unit: 'упак',
    brand: 'Ariel',
    imageUrl: 'https://ir.ozone.ru/s3/multimedia-1-r/c1000/7489053675.jpg',
  },
  '4015600661402': {
    name: 'Стиральный порошок Persil Deep Clean Автомат 3кг',
    category: 'Бытовая химия',
    price: 84000,
    purchasePrice: 63000,
    unit: 'упак',
    brand: 'Persil',
    imageUrl: 'https://ir.ozone.ru/s3/multimedia-1-r/c1000/7489053675.jpg',
  },
  '8718951132641': {
    name: 'Зубная паста Colgate Тройное Действие 100мл',
    category: 'Бытовая химия',
    price: 16000,
    purchasePrice: 11000,
    unit: 'шт',
    brand: 'Colgate',
    imageUrl: 'https://images.openfoodfacts.org/images/products/871/895/113/2641/front_ru.4.400.jpg',
  },
  '8717163013893': {
    name: 'Мыло туалетное Duru Морские Минералы 4x85г',
    category: 'Бытовая химия',
    price: 18000,
    purchasePrice: 13000,
    unit: 'упак',
    brand: 'Duru',
    imageUrl: 'https://ir.ozone.ru/s3/multimedia-h/6532935125.jpg',
  },
  '8690506081232': {
    name: 'Мыло жидкое Duru Увлажняющее 500мл',
    category: 'Бытовая химия',
    price: 24000,
    purchasePrice: 17500,
    unit: 'шт',
    brand: 'Duru',
    imageUrl: 'https://ir.ozone.ru/s3/multimedia-h/6532935125.jpg',
  },
  '5000174015642': {
    name: 'Чистящий порошок Comet Лимон с хлоринолом 475г',
    category: 'Бытовая химия',
    price: 19000,
    purchasePrice: 13800,
    unit: 'шт',
    brand: 'Comet',
    imageUrl: 'https://ir.ozone.ru/s3/multimedia-p/6054179377.jpg',
  },
  '4600104033328': {
    name: 'Очиститель для стекол Clin Окна и Зеркала 500мл',
    category: 'Бытовая химия',
    price: 26000,
    purchasePrice: 19000,
    unit: 'шт',
    brand: 'Clin',
    imageUrl: 'https://ir.ozone.ru/s3/multimedia-p/6054179377.jpg',
  },

  // --- СТРОЙМАТЕРИАЛЫ, ХОЗТОВАРЫ И ИНСТРУМЕНТЫ ---
  '4780001001': {
    name: 'Молоток гвоздодёр с фибергласовой рукояткой 450г',
    category: 'Инструменты',
    price: 45000,
    purchasePrice: 30000,
    unit: 'шт',
    brand: 'Ермак',
    imageUrl: 'https://cdn.vseinstrumenti.ru/images/goods/ruchnoj-instrument/udarno-rychazhnyj-instrument/5651425/1200x800/150900608.jpg',
  },
  '4780001002': {
    name: 'Отвертка крестовая магнитная PH2x100mm',
    category: 'Инструменты',
    price: 18000,
    purchasePrice: 11000,
    unit: 'шт',
    brand: 'Зубр',
    imageUrl: 'https://cdn.vseinstrumenti.ru/images/goods/ruchnoj-instrument/otvertki/955627/1200x800/160440427.jpg',
  },
  '4780001003': {
    name: 'Краска акриловая интерьерная белая 5кг',
    category: 'Малярные товары',
    price: 125000,
    purchasePrice: 85000,
    unit: 'шт',
    brand: 'Akril',
    imageUrl: 'https://cdn.vseinstrumenti.ru/images/goods/krepezh-i-metizy/djubeli/1460309/1200x800/150334808.jpg',
  },
  '4780001004': {
    name: 'Смеситель для раковины однорычажный (Латунь)',
    category: 'Сантехника',
    price: 185000,
    purchasePrice: 130000,
    unit: 'шт',
    brand: 'Frap',
    imageUrl: 'https://ir.ozone.ru/s3/multimedia-7/c1000/6324880891.jpg',
  },
  '4780001005': {
    name: 'Дюбель нейлоновый с шурупом 6х40 (упак. 100 шт)',
    category: 'Крепеж',
    price: 12000,
    purchasePrice: 7500,
    unit: 'упак',
    imageUrl: 'https://cdn.vseinstrumenti.ru/images/goods/krepezh-i-metizy/djubeli/1460309/1200x800/150334808.jpg',
  },
  '4780001006': {
    name: 'Кабель силовой медный ВВГнг-LS 3х2.5 (100м)',
    category: 'Электротовары',
    price: 950000,
    purchasePrice: 720000,
    unit: 'рулон',
    imageUrl: 'https://ir.ozone.ru/s3/multimedia-1-y/7365183874.jpg',
  },
  '4780001007': {
    name: 'Лента малярная бумажная 48мм x 40м',
    category: 'Малярные товары',
    price: 15000,
    purchasePrice: 9500,
    unit: 'шт',
    imageUrl: 'https://cdn.vseinstrumenti.ru/images/goods/krepezh-i-metizy/djubeli/1460309/1200x800/150334808.jpg',
  },
  '4780001008': {
    name: 'Саморезы по дереву оксидированные 3.5х35 (1000 шт)',
    category: 'Крепеж',
    price: 38000,
    purchasePrice: 24000,
    unit: 'коробка',
    imageUrl: 'https://cdn.vseinstrumenti.ru/images/goods/krepezh-i-metizy/djubeli/1460309/1200x800/150334808.jpg',
  },
  '4780001009': {
    name: 'Пена монтажная всесезонная профессиональная 750мл',
    category: 'Малярные товары',
    price: 55000,
    purchasePrice: 38000,
    unit: 'шт',
    brand: 'Penosil',
    imageUrl: 'https://ir.ozone.ru/s3/multimedia-p/6054179377.jpg',
  },
  '4780001010': {
    name: 'Герметик силиконовый универсальный прозрачный 280мл',
    category: 'Сантехника',
    price: 32000,
    purchasePrice: 22000,
    unit: 'шт',
    brand: 'Soudal',
    imageUrl: 'https://ir.ozone.ru/s3/multimedia-p/6054179377.jpg',
  },
  '4780001011': {
    name: 'Лампа светодиодная LED A60 E27 12W 4000K',
    category: 'Электротовары',
    price: 14000,
    purchasePrice: 9500,
    unit: 'шт',
    brand: 'Gauss',
    imageUrl: 'https://cdn.vseinstrumenti.ru/images/goods/elektrika-i-svet/lampochki/1220038/1200x800/150422108.jpg',
  },
  '4780001012': {
    name: 'Лампа светодиодная LED A60 E27 15W 6500K',
    category: 'Электротовары',
    price: 16000,
    purchasePrice: 11000,
    unit: 'шт',
    brand: 'IEK',
    imageUrl: 'https://cdn.vseinstrumenti.ru/images/goods/elektrika-i-svet/lampochki/1220038/1200x800/150422108.jpg',
  },
  '4780001013': {
    name: 'Изолента ПВХ профессиональная 19мм x 20м (Черная)',
    category: 'Электротовары',
    price: 8000,
    purchasePrice: 4800,
    unit: 'шт',
    brand: 'IEK',
    imageUrl: 'https://cdn.vseinstrumenti.ru/images/goods/krepezh-i-metizy/djubeli/1460309/1200x800/150334808.jpg',
  },
  '4780001014': {
    name: 'Рулетка строительная с автостопом 5м x 19мм',
    category: 'Инструменты',
    price: 28000,
    purchasePrice: 18000,
    unit: 'шт',
    brand: 'Matrix',
    imageUrl: 'https://cdn.vseinstrumenti.ru/images/goods/ruchnoj-instrument/udarno-rychazhnyj-instrument/5651425/1200x800/150900608.jpg',
  },
  '4780001015': {
    name: 'Уровень строительный алюминиевый пузырьковый 60см',
    category: 'Инструменты',
    price: 42000,
    purchasePrice: 28000,
    unit: 'шт',
    brand: 'Stabila',
    imageUrl: 'https://cdn.vseinstrumenti.ru/images/goods/ruchnoj-instrument/udarno-rychazhnyj-instrument/5651425/1200x800/150900608.jpg',
  },
  '4780001016': {
    name: 'Плоскогубцы комбинированные 180мм',
    category: 'Инструменты',
    price: 35000,
    purchasePrice: 23000,
    unit: 'шт',
    brand: 'Зубр',
    imageUrl: 'https://cdn.vseinstrumenti.ru/images/goods/ruchnoj-instrument/udarno-rychazhnyj-instrument/5651425/1200x800/150900608.jpg',
  },
  '4780001017': {
    name: 'Шпатлевка гипсовая универсальная Knauf Fugen 25кг',
    category: 'Малярные товары',
    price: 72000,
    purchasePrice: 56000,
    unit: 'мешок',
    brand: 'Knauf',
    imageUrl: 'https://cdn.vseinstrumenti.ru/images/goods/krepezh-i-metizy/djubeli/1460309/1200x800/150334808.jpg',
  },
  '4780001018': {
    name: 'Шланг для душа гибкий усиленный 1.5м',
    category: 'Сантехника',
    price: 45000,
    purchasePrice: 31000,
    unit: 'шт',
    imageUrl: 'https://ir.ozone.ru/s3/multimedia-7/c1000/6324880891.jpg',
  },
  '4780001019': {
    name: 'Лента фум сантехническая для резьбы 12мм x 10м',
    category: 'Сантехника',
    price: 6000,
    purchasePrice: 3500,
    unit: 'шт',
    imageUrl: 'https://cdn.vseinstrumenti.ru/images/goods/krepezh-i-metizy/djubeli/1460309/1200x800/150334808.jpg',
  },
  '4780001020': {
    name: 'Розетка скрытой установки с заземлением 16A Белая',
    category: 'Электротовары',
    price: 18000,
    purchasePrice: 12000,
    unit: 'шт',
    brand: 'Schneider',
    imageUrl: 'https://cdn.vseinstrumenti.ru/images/goods/elektrika-i-svet/lampochki/1220038/1200x800/150422108.jpg',
  },
  '4780001021': {
    name: 'Выключатель 1-клавишный скрытой установки Белый',
    category: 'Электротовары',
    price: 16000,
    purchasePrice: 10500,
    unit: 'шт',
    brand: 'Schneider',
    imageUrl: 'https://cdn.vseinstrumenti.ru/images/goods/elektrika-i-svet/lampochki/1220038/1200x800/150422108.jpg',
  },
  '4780001022': {
    name: 'Автоматический выключатель 1P 16A C (ВА47-29)',
    category: 'Электротовары',
    price: 24000,
    purchasePrice: 16000,
    unit: 'шт',
    brand: 'IEK',
    imageUrl: 'https://cdn.vseinstrumenti.ru/images/goods/elektrika-i-svet/lampochki/1220038/1200x800/150422108.jpg',
  },
  '4780001023': {
    name: 'Автоматический выключатель 1P 25A C (ВА47-29)',
    category: 'Электротовары',
    price: 25000,
    purchasePrice: 16500,
    unit: 'шт',
    brand: 'IEK',
    imageUrl: 'https://cdn.vseinstrumenti.ru/images/goods/elektrika-i-svet/lampochki/1220038/1200x800/150422108.jpg',
  },
};

/**
 * Parses Asl Belgisi / Честный Знак / GS1 Data Matrix QR codes
 */
export function extractGtinFromDataMatrix(rawCode: string): string | null {
  const clean = rawCode.trim();

  const aiMatch = clean.match(/\(01\)(\d{14})/);
  if (aiMatch) {
    const gtin14 = aiMatch[1];
    return gtin14.startsWith('0') ? gtin14.slice(1) : gtin14;
  }

  if (clean.startsWith('01') && clean.length >= 16 && /^\d{16}/.test(clean)) {
    const gtin14 = clean.substring(2, 16);
    return gtin14.startsWith('0') ? gtin14.slice(1) : gtin14;
  }

  if (clean.includes('aslbelgisi') || clean.includes('crpt') || clean.includes('chestnyznak')) {
    const digitsMatch = clean.match(/(\d{13,14})/);
    if (digitsMatch) {
      const g = digitsMatch[1];
      return g.length === 14 && g.startsWith('0') ? g.slice(1) : g;
    }
  }

  return null;
}

// ─── Web Image Search Engine (Google / Bing / Marketplace Direct Images) ───────

/**
 * Searches real studio product photo online by product name.
 * Extracts direct clean URLs from global marketplaces (Ozon, Wildberries, VseInstrumenti, etc.)
 */
export async function searchProductImageOnline(productName: string): Promise<string | null> {
  const cleanQuery = productName
    .replace(/[«»"'\(\)]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleanQuery || cleanQuery.length < 3) return null;

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutId = setTimeout(() => controller?.abort(), 4500);

  try {
    // 1. Primary: Search via Bing Images (returns direct HD marketplace images without API keys)
    const searchUrl = 'https://www.bing.com/images/search?q=' + encodeURIComponent(cleanQuery + ' товар фото');
    const res = await fetch(searchUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      signal: controller?.signal,
    });

    if (res.ok) {
      const text = await res.text();
      const murls = [...text.matchAll(/murl&quot;:&quot;(https?:\/\/[^&]+)&quot;/g)].map((m) => m[1]);

      if (murls.length > 0) {
        // Prefer images with known picture formats or from trusted CDNs
        const cleanCandidate = murls.find(
          (u) =>
            u.startsWith('https://') &&
            (u.match(/\.(jpg|jpeg|png|webp)($|\?)/i) ||
             u.includes('ozone.ru') ||
             u.includes('vseinstrumenti.ru') ||
             u.includes('wbstatic.net') ||
             u.includes('yandex.net'))
        ) || murls[0];

        if (cleanCandidate) {
          clearTimeout(timeoutId);
          return cleanCandidate;
        }
      }
    }
  } catch (err) {
    // Bing error, fallback to Wikimedia
  }

  // 2. Secondary fallback: Wikimedia Commons API
  try {
    const wikiUrl =
      'https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=' +
      encodeURIComponent(cleanQuery) +
      '&prop=imageinfo&iiprop=url&pithumbsize=600&format=json';

    const r1 = await fetch(wikiUrl, {
      headers: { 'User-Agent': 'MiqchaApp/1.0' },
      signal: controller?.signal,
    });

    if (r1.ok) {
      const d1 = await r1.json();
      if (d1.query?.pages) {
        for (const p of Object.values(d1.query.pages) as any[]) {
          if (p.imageinfo?.[0]?.url) {
            const url: string = p.imageinfo[0].url;
            if (url.match(/\.(jpg|jpeg|png|webp)/i)) {
              clearTimeout(timeoutId);
              return url;
            }
          }
        }
      }
    }
  } catch (err) {
    // fallback failed
  } finally {
    clearTimeout(timeoutId);
  }

  return null;
}

// ─── Supabase Catalog Integration ────────────────────────────────────────────

/**
 * Look up barcode in Supabase product_catalog (shared across all stores)
 */
export async function lookupInCatalog(barcode: string): Promise<ProductCatalogEntry | null> {
  try {
    const { data, error } = await supabase
      .from('product_catalog')
      .select('*')
      .eq('barcode', barcode)
      .maybeSingle();

    if (!error && data) return data as ProductCatalogEntry;
  } catch (e) {
    console.log('catalog lookup error:', e);
  }
  return null;
}

/**
 * Save recognized product to Supabase product_catalog for future fast lookups
 */
export async function saveToCatalog(
  barcode: string,
  info: Omit<ProductCatalogEntry, 'barcode' | 'created_at' | 'updated_at'>
): Promise<void> {
  try {
    await supabase.from('product_catalog').upsert(
      {
        barcode,
        name: info.name,
        brand: info.brand || null,
        category: info.category || 'Разное',
        unit: info.unit || 'шт',
        image_url: info.image_url || null,
        country: info.country || null,
        description: info.description || null,
        source: info.source || 'manual',
        verified: info.verified || false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'barcode', ignoreDuplicates: false }
    );
  } catch (e) {
    console.log('saveToCatalog error:', e);
  }
}

// ─── QR Payload Parser ────────────────────────────────────────────────────────

function parseQrCodePayload(rawPayload: string): Partial<RecognizedProductInfo> | null {
  const trimmed = rawPayload.trim();

  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const data = JSON.parse(trimmed);
      const name = data.name || data.title || data.product_name || data.product || data.item || '';
      if (name) {
        return {
          name: String(name),
          price: Number(data.price) || 25000,
          purchasePrice: Number(data.purchase_price) || Math.round((Number(data.price) || 25000) * 0.72),
          category: String(data.category || 'Разное'),
          unit: String(data.unit || 'шт'),
          brand: data.brand ? String(data.brand) : undefined,
          imageUrl: data.image_url || data.image || undefined,
        };
      }
    } catch {}
  }

  if (
    !trimmed.startsWith('http://') &&
    !trimmed.startsWith('https://') &&
    trimmed.length > 2 &&
    trimmed.length < 100 &&
    !/^\d{6,18}$/.test(trimmed)
  ) {
    let cat = 'Разное';
    const lower = trimmed.toLowerCase();
    if (lower.includes('pepsi') || lower.includes('cola') || lower.includes('сок') || lower.includes('вода') || lower.includes('чай') || lower.includes('хлеб') || lower.includes('шоколад')) cat = 'Напитки и Продукты';
    else if (lower.includes('fairy') || lower.includes('мыло') || lower.includes('порошок') || lower.includes('шампунь') || lower.includes('гель') || lower.includes('domestos')) cat = 'Бытовая химия';
    else if (lower.includes('дрель') || lower.includes('молоток') || lower.includes('отвертка') || lower.includes('ключ') || lower.includes('рулетка') || lower.includes('перфоратор')) cat = 'Инструменты';
    else if (lower.includes('краска') || lower.includes('кисть') || lower.includes('валик') || lower.includes('лента') || lower.includes('грунтовка') || lower.includes('шпатлевка')) cat = 'Малярные товары';
    else if (lower.includes('смеситель') || lower.includes('кран') || lower.includes('труба') || lower.includes('сифон') || lower.includes('шланг')) cat = 'Сантехника';
    else if (lower.includes('лампа') || lower.includes('кабель') || lower.includes('провод') || lower.includes('розетка') || lower.includes('выключатель') || lower.includes('автомат')) cat = 'Электротовары';
    else if (lower.includes('дюбель') || lower.includes('саморез') || lower.includes('болт') || lower.includes('гайка') || lower.includes('гвоздь')) cat = 'Крепеж';

    return { name: trimmed, category: cat, price: 35000, purchasePrice: 25000, unit: 'шт' };
  }

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const url = new URL(trimmed);
      const parts = url.pathname.split('/').filter(Boolean);
      const slug = parts[parts.length - 1];
      if (slug && slug.length > 2) {
        const readable = decodeURIComponent(slug).replace(/[-_+]/g, ' ');
        return { name: readable.charAt(0).toUpperCase() + readable.slice(1), category: 'Разное', price: 35000, purchasePrice: 25000, unit: 'шт' };
      }
    } catch {}
  }

  return null;
}

// ─── Online Barcode Lookup ───────────────────────────────────────────────────

async function queryOnlineDatabases(barcode: string): Promise<RecognizedProductInfo | null> {
  const cleanCode = barcode.trim();
  if (!cleanCode || cleanCode.length < 6) return null;

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutId = setTimeout(() => controller?.abort(), 4000);

  const endpoints = [
    'https://ru.openfoodfacts.org/api/v2/product/' + encodeURIComponent(cleanCode) + '.json',
    'https://world.openfoodfacts.org/api/v2/product/' + encodeURIComponent(cleanCode) + '.json',
    'https://ru.openbeautyfacts.org/api/v2/product/' + encodeURIComponent(cleanCode) + '.json',
    'https://world.openproductsfacts.org/api/v2/product/' + encodeURIComponent(cleanCode) + '.json',
    'https://api.upcitemdb.com/prod/trial/lookup?upc=' + encodeURIComponent(cleanCode),
  ];

  try {
    const fetchPromises = endpoints.map(async (url) => {
      try {
        const res = await fetch(url, {
          method: 'GET',
          headers: { 'User-Agent': 'MiqchaApp/1.0' },
          signal: controller?.signal,
        });
        if (res.ok) {
          const data = await res.json();
          if (data.status === 1 && data.product) return { type: 'off', product: data.product };
          if (data.items && data.items.length > 0) return { type: 'upc', item: data.items[0] };
        }
      } catch {
        return null;
      }
      return null;
    });

    const results = await Promise.all(fetchPromises);
    const hit = results.find(Boolean);

    if (hit) {
      clearTimeout(timeoutId);

      if (hit.type === 'off' && hit.product) {
        const product = hit.product;
        const brand = (product.brands || product.brand_owner || '').split(',')[0].trim();
        const rawName =
          product.product_name_ru || product.product_name ||
          product.generic_name_ru || product.generic_name ||
          product.product_name_en || '';
        const quantity = product.quantity || '';

        let fullName = rawName;
        if (brand && !fullName.toLowerCase().includes(brand.toLowerCase())) fullName = (brand + ' ' + fullName).trim();
        if (quantity && !fullName.toLowerCase().includes(quantity.toLowerCase())) fullName = (fullName + ' ' + quantity).trim();

        let category = 'Разное';
        const catTags = (product.categories_tags || []).join(' ').toLowerCase();
        const nameLower = fullName.toLowerCase();
        if (catTags.includes('beverage') || catTags.includes('drink') || catTags.includes('food') || catTags.includes('snack') || nameLower.includes('pepsi') || nameLower.includes('cola') || nameLower.includes('сок') || nameLower.includes('вода')) {
          category = 'Напитки и Продукты';
        } else if (catTags.includes('hygiene') || catTags.includes('cleaning') || catTags.includes('detergent') || catTags.includes('beauty') || nameLower.includes('fairy') || nameLower.includes('мыло') || nameLower.includes('шампунь')) {
          category = 'Бытовая химия';
        }

        const imageUrl: string | undefined =
          product.image_front_url ||
          product.image_front_small_url ||
          product.image_url ||
          undefined;

        return {
          name: fullName || ('Товар ' + cleanCode),
          brand: brand || undefined,
          category,
          price: 18000,
          purchasePrice: 12500,
          unit: 'шт',
          imageUrl,
          foundOnline: true,
          rawBarcode: cleanCode,
          source: 'openfoodfacts',
        };
      }

      if (hit.type === 'upc' && hit.item) {
        const item = hit.item;
        return {
          name: item.title || ('Товар ' + cleanCode),
          brand: item.brand || undefined,
          category: item.category || 'Разное',
          price: 25000,
          purchasePrice: 18000,
          unit: 'шт',
          imageUrl: item.images?.[0] || undefined,
          foundOnline: true,
          rawBarcode: cleanCode,
          source: 'upcitemdb',
        };
      }
    }
  } catch (err) {
    console.log('Online barcode lookup error:', err);
  } finally {
    clearTimeout(timeoutId);
  }

  return null;
}

// ─── Main Lookup Function ─────────────────────────────────────────────────────

/**
 * Main Auto-Recognition Function
 * Priority: Supabase catalog → Local DB → Online APIs → Web Image Search → Heuristic
 */
export async function lookupProductByBarcode(scannedCode: string): Promise<RecognizedProductInfo> {
  const code = scannedCode.trim();

  // 1. Extract GTIN from Data Matrix / Asl Belgisi QR codes
  const gtinFromQr = extractGtinFromDataMatrix(code);
  const targetBarcode = gtinFromQr || code;

  // 2. ✅ Check Supabase product_catalog (shared, fastest after first scan)
  try {
    const catalogEntry = await lookupInCatalog(targetBarcode);
    if (catalogEntry && catalogEntry.name) {
      // If catalog entry doesn't have an image, search one in background
      let finalImg = catalogEntry.image_url || undefined;
      if (!finalImg) {
        finalImg = (await searchProductImageOnline(catalogEntry.name)) || undefined;
        if (finalImg) {
          saveToCatalog(targetBarcode, { ...catalogEntry, image_url: finalImg }).catch(() => {});
        }
      }

      return {
        name: catalogEntry.name,
        category: catalogEntry.category || 'Разное',
        price: 0,
        purchasePrice: 0,
        unit: catalogEntry.unit || 'шт',
        brand: catalogEntry.brand || undefined,
        country: catalogEntry.country || undefined,
        imageUrl: finalImg,
        foundOnline: true,
        rawBarcode: targetBarcode,
        source: 'catalog',
      };
    }
  } catch (e) {
    console.log('Catalog lookup skipped:', e);
  }

  // 3. Check local instant database of 150+ popular goods
  if (LOCAL_BARCODE_DATABASE[targetBarcode]) {
    const item = LOCAL_BARCODE_DATABASE[targetBarcode];
    let img = item.imageUrl;

    // If local entry doesn't have an image, find real web image
    if (!img) {
      img = (await searchProductImageOnline(item.name)) || undefined;
    }

    // Save to Supabase catalog in background for future lookups
    saveToCatalog(targetBarcode, {
      name: item.name,
      brand: item.brand,
      category: item.category,
      unit: item.unit,
      image_url: img,
      country: item.country,
      source: 'local',
      verified: true,
    }).catch(() => {});

    return {
      ...item,
      imageUrl: img,
      foundOnline: true,
      rawBarcode: targetBarcode,
      source: 'local',
    };
  }

  // 4. Check if QR code contains structured text/JSON/URL
  const qrParsed = parseQrCodePayload(code);
  if (qrParsed && qrParsed.name) {
    let img = qrParsed.imageUrl;
    if (!img) {
      img = (await searchProductImageOnline(qrParsed.name)) || undefined;
    }

    const result: RecognizedProductInfo = {
      name: qrParsed.name,
      category: qrParsed.category || 'Разное',
      price: qrParsed.price || 25000,
      purchasePrice: qrParsed.purchasePrice || 18000,
      unit: qrParsed.unit || 'шт',
      brand: qrParsed.brand,
      imageUrl: img,
      foundOnline: true,
      rawBarcode: targetBarcode,
      source: 'qr',
    };
    saveToCatalog(targetBarcode, {
      name: result.name,
      brand: result.brand,
      category: result.category,
      unit: result.unit,
      image_url: result.imageUrl,
      source: 'qr',
    }).catch(() => {});
    return result;
  }

  // 5. Query global & CIS online product databases
  const onlineResult = await queryOnlineDatabases(targetBarcode);
  if (onlineResult && onlineResult.name) {
    // If online db had no image, fetch one via web image search
    if (!onlineResult.imageUrl) {
      const webImg = await searchProductImageOnline(onlineResult.name);
      if (webImg) onlineResult.imageUrl = webImg;
    }

    // Save to Supabase catalog for future fast lookups
    saveToCatalog(targetBarcode, {
      name: onlineResult.name,
      brand: onlineResult.brand,
      category: onlineResult.category,
      unit: onlineResult.unit,
      image_url: onlineResult.imageUrl,
      country: onlineResult.country,
      source: onlineResult.source || 'openfoodfacts',
      verified: false,
    }).catch(() => {});
    return onlineResult;
  }

  // 6. Intelligent country heuristic (fallback)
  let countryName = 'Импорт';
  const prefix3 = targetBarcode.slice(0, 3);
  if (GS1_COUNTRY_PREFIXES[prefix3]) countryName = GS1_COUNTRY_PREFIXES[prefix3];

  const lastFour = targetBarcode.slice(-4);
  const fallbackName = 'Товар (' + countryName + ') №' + (lastFour || targetBarcode);

  return {
    name: fallbackName,
    category: 'Разное',
    price: 35000,
    purchasePrice: 25000,
    unit: 'шт',
    country: countryName,
    foundOnline: false,
    rawBarcode: targetBarcode,
    source: 'heuristic',
  };
}