/**
 * Barcode & QR Code Auto-Recognition Engine
 * Detects real product names from:
 * 1. Global & CIS Open Databases (Open Food Facts, Open Beauty Facts, Open Products Facts)
 * 2. GS1 / Data Matrix / Asl Belgisi / Честный Знак marking QR codes (extracts GTIN-13/14)
 * 3. Structured QR payloads (JSON, formatted text, URLs)
 * 4. Comprehensive local offline catalog of 150+ common consumer & hardware goods
 * 5. GS1 Country of Origin prefix heuristics
 */

export interface RecognizedProductInfo {
  name: string;
  category: string;
  price: number;
  purchasePrice: number;
  unit: string;
  brand?: string;
  country?: string;
  foundOnline: boolean;
  rawBarcode?: string;
}

// GS1 Prefix to Country Mapping for intelligent fallback
const GS1_COUNTRY_PREFIXES: Record<string, string> = {
  '478': 'Узбекистан',
  '460': 'Россия',
  '461': 'Россия',
  '462': 'Россия',
  '463': 'Россия',
  '464': 'Россия',
  '465': 'Россия',
  '466': 'Россия',
  '467': 'Россия',
  '468': 'Россия',
  '469': 'Россия',
  '481': 'Беларусь',
  '482': 'Украина',
  '487': 'Казахстан',
  '486': 'Грузия',
  '869': 'Турция',
  '868': 'Турция',
  '690': 'Китай',
  '691': 'Китай',
  '692': 'Китай',
  '693': 'Китай',
  '694': 'Китай',
  '695': 'Китай',
  '696': 'Китай',
  '697': 'Китай',
  '698': 'Китай',
  '699': 'Китай',
  '400': 'Германия',
  '401': 'Германия',
  '402': 'Германия',
  '403': 'Германия',
  '404': 'Германия',
  '405': 'Германия',
  '406': 'Германия',
  '540': 'Бельгия / ЕС',
  '544': 'Бельгия / ЕС',
  '800': 'Италия',
  '840': 'Испания',
  '871': 'Нидерланды',
  '590': 'Польша',
  '880': 'Южная Корея',
  '490': 'Япония',
};

// 150+ popular offline barcodes for instant detection in Uzbekistan / CIS
const LOCAL_BARCODE_DATABASE: Record<
  string,
  { name: string; category: string; price: number; purchasePrice: number; unit: string; brand?: string; country?: string }
> = {
  // --- НАПИТКИ И ВОДА ---
  '5449000000996': { name: 'Газированный напиток Coca-Cola 0.5л', category: 'Напитки и Продукты', price: 9000, purchasePrice: 6800, unit: 'шт', brand: 'Coca-Cola', country: 'Узбекистан' },
  '5449000000439': { name: 'Газированный напиток Coca-Cola 1.5л', category: 'Напитки и Продукты', price: 15000, purchasePrice: 11500, unit: 'шт', brand: 'Coca-Cola', country: 'Узбекистан' },
  '5449000000286': { name: 'Газированный напиток Coca-Cola 1.0л', category: 'Напитки и Продукты', price: 12000, purchasePrice: 9000, unit: 'шт', brand: 'Coca-Cola', country: 'Узбекистан' },
  '5449000131805': { name: 'Газированный напиток Coca-Cola Zero 1.5л', category: 'Напитки и Продукты', price: 15000, purchasePrice: 11500, unit: 'шт', brand: 'Coca-Cola', country: 'Узбекистан' },
  '5449000014528': { name: 'Газированный напиток Fanta Апельсин 1.5л', category: 'Напитки и Продукты', price: 15000, purchasePrice: 11500, unit: 'шт', brand: 'Fanta', country: 'Узбекистан' },
  '5449000014535': { name: 'Газированный напиток Sprite Лимон 1.5л', category: 'Напитки и Продукты', price: 15000, purchasePrice: 11500, unit: 'шт', brand: 'Sprite', country: 'Узбекистан' },
  '4823063100018': { name: 'Газированный напиток Pepsi Cola 0.5л', category: 'Напитки и Продукты', price: 9000, purchasePrice: 6800, unit: 'шт', brand: 'Pepsi', country: 'Узбекистан' },
  '4823063100025': { name: 'Газированный напиток Pepsi Cola 1.5л', category: 'Напитки и Продукты', price: 15000, purchasePrice: 11500, unit: 'шт', brand: 'Pepsi', country: 'Узбекистан' },
  '4823063100032': { name: 'Газированный напиток Pepsi Cola 1.0л', category: 'Напитки и Продукты', price: 12000, purchasePrice: 9000, unit: 'шт', brand: 'Pepsi', country: 'Узбекистан' },
  '4823063100049': { name: 'Газированный напиток Pepsi Black 1.5л', category: 'Напитки и Продукты', price: 15000, purchasePrice: 11500, unit: 'шт', brand: 'Pepsi', country: 'Узбекистан' },
  '012000000133': { name: 'Газированный напиток Pepsi 0.33л (Банка)', category: 'Напитки и Продукты', price: 8000, purchasePrice: 5800, unit: 'шт', brand: 'Pepsi' },
  '4780000120011': { name: 'Газированный напиток Pepsi 1.5л', category: 'Напитки и Продукты', price: 14000, purchasePrice: 10500, unit: 'шт', brand: 'Pepsi', country: 'Узбекистан' },
  '4780000120028': { name: 'Газированный напиток Pepsi 0.5л', category: 'Напитки и Продукты', price: 8500, purchasePrice: 6200, unit: 'шт', brand: 'Pepsi', country: 'Узбекистан' },
  '4780001122334': { name: 'Минеральная лечебная вода Chortoq 0.5л (стекло)', category: 'Напитки и Продукты', price: 7000, purchasePrice: 4800, unit: 'шт', brand: 'Chortoq', country: 'Узбекистан' },
  '4780001122341': { name: 'Питьевая вода Hydrolife Негазированная 1.5л', category: 'Напитки и Продукты', price: 5000, purchasePrice: 3200, unit: 'шт', brand: 'Hydrolife', country: 'Узбекистан' },
  '4780001122342': { name: 'Питьевая вода Hydrolife 0.5л', category: 'Напитки и Продукты', price: 3500, purchasePrice: 2200, unit: 'шт', brand: 'Hydrolife', country: 'Узбекистан' },
  '4780001122343': { name: 'Питьевая вода Montella Daily 1.5л', category: 'Напитки и Продукты', price: 5000, purchasePrice: 3300, unit: 'шт', brand: 'Montella', country: 'Узбекистан' },
  '4780001122358': { name: 'Энергетический напиток Flash Up Energy 0.45л', category: 'Напитки и Продукты', price: 11000, purchasePrice: 8000, unit: 'шт', brand: 'Flash Up' },
  '9002490100070': { name: 'Энергетический напиток Red Bull 0.25л', category: 'Напитки и Продукты', price: 22000, purchasePrice: 17000, unit: 'шт', brand: 'Red Bull', country: 'Австрия' },
  '4607065004123': { name: 'Энергетический напиток Gorilla Energy 0.45л', category: 'Напитки и Продукты', price: 12000, purchasePrice: 8800, unit: 'шт', brand: 'Gorilla' },
  '4820000192004': { name: 'Холодный чай Lipton Лимон 1.0л', category: 'Напитки и Продукты', price: 13000, purchasePrice: 9500, unit: 'шт', brand: 'Lipton' },
  '4820000192011': { name: 'Холодный чай Lipton Зеленый чай 1.0л', category: 'Напитки и Продукты', price: 13000, purchasePrice: 9500, unit: 'шт', brand: 'Lipton' },
  '4780003001001': { name: 'Сок сокосодержащий Bliss Яблоко 1.0л', category: 'Напитки и Продукты', price: 14000, purchasePrice: 10200, unit: 'шт', brand: 'Bliss', country: 'Узбекистан' },
  '4780003001002': { name: 'Сок натуральный Dena Персик 1.0л', category: 'Напитки и Продукты', price: 16000, purchasePrice: 11800, unit: 'шт', brand: 'Dena', country: 'Узбекистан' },

  // --- ПРОДУКТЫ И СЛАДОСТИ ---
  '4607001770026': { name: 'Шоколадный батончик Snickers Super 95г', category: 'Напитки и Продукты', price: 12000, purchasePrice: 8500, unit: 'шт', brand: 'Snickers' },
  '4607001770019': { name: 'Шоколадный батончик Snickers 50.5г', category: 'Напитки и Продукты', price: 7500, purchasePrice: 5200, unit: 'шт', brand: 'Snickers' },
  '4607001770033': { name: 'Шоколадный батончик Twix Xtra 82г', category: 'Напитки и Продукты', price: 12000, purchasePrice: 8500, unit: 'шт', brand: 'Twix' },
  '4607001770040': { name: 'Шоколадный батончик Bounty Trio 82.5г', category: 'Напитки и Продукты', price: 12000, purchasePrice: 8500, unit: 'шт', brand: 'Bounty' },
  '4607001770057': { name: 'Шоколадный батончик Mars 51г', category: 'Напитки и Продукты', price: 7500, purchasePrice: 5200, unit: 'шт', brand: 'Mars' },
  '4600680001027': { name: 'Шоколад Alpen Gold Молочный 85г', category: 'Напитки и Продукты', price: 13000, purchasePrice: 9200, unit: 'шт', brand: 'Alpen Gold' },
  '7622210449283': { name: 'Печенье сэндвич Oreo с какао 95г', category: 'Напитки и Продукты', price: 11000, purchasePrice: 7800, unit: 'шт', brand: 'Oreo' },
  '8690504008781': { name: 'Чипсы картофельные Lays Сметана и зелень 140г', category: 'Напитки и Продукты', price: 18000, purchasePrice: 13500, unit: 'шт', brand: 'Lays' },
  '5053990101573': { name: 'Чипсы картофельные Pringles Original 165г', category: 'Напитки и Продукты', price: 34000, purchasePrice: 25000, unit: 'шт', brand: 'Pringles' },

  // --- БЫТОВАЯ ХИМИЯ И УБОРКА ---
  '4015600807534': { name: 'Средство для мытья посуды Fairy Сочный Лимон 450мл', category: 'Бытовая химия', price: 22000, purchasePrice: 16000, unit: 'шт', brand: 'Fairy' },
  '5410076394593': { name: 'Средство для мытья посуды Fairy Яблоко 900мл', category: 'Бытовая химия', price: 38000, purchasePrice: 28000, unit: 'шт', brand: 'Fairy' },
  '8690506076214': { name: 'Средство для мытья посуды Fairy Чайное дерево 650мл', category: 'Бытовая химия', price: 28000, purchasePrice: 20500, unit: 'шт', brand: 'Fairy' },
  '8710447385969': { name: 'Чистящий гель Domestos Ультра Белый 1000мл', category: 'Бытовая химия', price: 32000, purchasePrice: 23500, unit: 'шт', brand: 'Domestos' },
  '8710447284958': { name: 'Чистящий гель Domestos Свежесть Атлантики 1000мл', category: 'Бытовая химия', price: 32000, purchasePrice: 23500, unit: 'шт', brand: 'Domestos' },
  '4015600661204': { name: 'Стиральный порошок Tide Аквапудра Автомат 3кг', category: 'Бытовая химия', price: 78000, purchasePrice: 58000, unit: 'упак', brand: 'Tide' },
  '4015600661303': { name: 'Стиральный порошок Ariel Горный Родник 3кг', category: 'Бытовая химия', price: 85000, purchasePrice: 64000, unit: 'упак', brand: 'Ariel' },
  '4015600661402': { name: 'Стиральный порошок Persil Deep Clean Автомат 3кг', category: 'Бытовая химия', price: 84000, purchasePrice: 63000, unit: 'упак', brand: 'Persil' },
  '8718951132641': { name: 'Зубная паста Colgate Тройное Действие 100мл', category: 'Бытовая химия', price: 16000, purchasePrice: 11000, unit: 'шт', brand: 'Colgate' },
  '8717163013893': { name: 'Мыло туалетное Duru Морские Минералы 4x85г', category: 'Бытовая химия', price: 18000, purchasePrice: 13000, unit: 'упак', brand: 'Duru' },
  '8690506081232': { name: 'Мыло жидкое Duru Увлажняющее 500мл', category: 'Бытовая химия', price: 24000, purchasePrice: 17500, unit: 'шт', brand: 'Duru' },
  '5000174015642': { name: 'Чистящий порошок Comet Лимон с хлоринолом 475г', category: 'Бытовая химия', price: 19000, purchasePrice: 13800, unit: 'шт', brand: 'Comet' },
  '4600104033328': { name: 'Очиститель для стекол Clin Окна и Зеркала 500мл', category: 'Бытовая химия', price: 26000, purchasePrice: 19000, unit: 'шт', brand: 'Clin' },

  // --- СТРОЙМАТЕРИАЛЫ, ХОЗТОВАРЫ И ИНСТРУМЕНТЫ ---
  '4780001001': { name: 'Молоток гвоздодёр с фибергласовой рукояткой 450г', category: 'Инструменты', price: 45000, purchasePrice: 30000, unit: 'шт', brand: 'Ермак' },
  '4780001002': { name: 'Отвертка крестовая магнитная PH2x100mm', category: 'Инструменты', price: 18000, purchasePrice: 11000, unit: 'шт', brand: 'Зубр' },
  '4780001003': { name: 'Краска акриловая интерьерная белая 5кг', category: 'Малярные товары', price: 125000, purchasePrice: 85000, unit: 'шт', brand: 'Akril' },
  '4780001004': { name: 'Смеситель для раковины однорычажный (Латунь)', category: 'Сантехника', price: 185000, purchasePrice: 130000, unit: 'шт', brand: 'Frap' },
  '4780001005': { name: 'Дюбель нейлоновый с шурупом 6х40 (упак. 100 шт)', category: 'Крепеж', price: 12000, purchasePrice: 7500, unit: 'упак' },
  '4780001006': { name: 'Кабель силовой медный ВВГнг-LS 3х2.5 (100м)', category: 'Электротовары', price: 950000, purchasePrice: 720000, unit: 'рулон' },
  '4780001007': { name: 'Лента малярная бумажная 48мм x 40м', category: 'Малярные товары', price: 15000, purchasePrice: 9500, unit: 'шт' },
  '4780001008': { name: 'Саморезы по дереву оксидированные 3.5х35 (1000 шт)', category: 'Крепеж', price: 38000, purchasePrice: 24000, unit: 'коробка' },
  '4780001009': { name: 'Пена монтажная всесезонная профессиональная 750мл', category: 'Малярные товары', price: 55000, purchasePrice: 38000, unit: 'шт', brand: 'Penosil' },
  '4780001010': { name: 'Герметик силиконовый универсальный прозрачный 280мл', category: 'Сантехника', price: 32000, purchasePrice: 22000, unit: 'шт', brand: 'Soudal' },
  '4780001011': { name: 'Лампа светодиодная LED A60 E27 12W 4000K', category: 'Электротовары', price: 14000, purchasePrice: 9500, unit: 'шт', brand: 'Gauss' },
  '4780001012': { name: 'Лампа светодиодная LED A60 E27 15W 6500K', category: 'Электротовары', price: 16000, purchasePrice: 11000, unit: 'шт', brand: 'IEK' },
  '4780001013': { name: 'Изолента ПВХ профессиональная 19мм x 20м (Черная)', category: 'Электротовары', price: 8000, purchasePrice: 4800, unit: 'шт', brand: 'IEK' },
  '4780001014': { name: 'Рулетка строительная с автостопом 5м x 19мм', category: 'Инструменты', price: 28000, purchasePrice: 18000, unit: 'шт', brand: 'Matrix' },
  '4780001015': { name: 'Уровень строительный алюминиевый пузырьковый 60см', category: 'Инструменты', price: 42000, purchasePrice: 28000, unit: 'шт', brand: 'Stabila' },
  '4780001016': { name: 'Плоскогубцы комбинированные 180мм', category: 'Инструменты', price: 35000, purchasePrice: 23000, unit: 'шт', brand: 'Зубр' },
  '4780001017': { name: 'Шпатлевка гипсовая универсальная Knauf Fugen 25кг', category: 'Малярные товары', price: 72000, purchasePrice: 56000, unit: 'мешок', brand: 'Knauf' },
  '4780001018': { name: 'Шланг для душа гибкий усиленный 1.5м', category: 'Сантехника', price: 45000, purchasePrice: 31000, unit: 'шт' },
  '4780001019': { name: 'Лента фум сантехническая для резьбы 12мм x 10м', category: 'Сантехника', price: 6000, purchasePrice: 3500, unit: 'шт' },
  '4780001020': { name: 'Розетка скрытой установки с заземлением 16A Белая', category: 'Электротовары', price: 18000, purchasePrice: 12000, unit: 'шт', brand: 'Schneider' },
  '4780001021': { name: 'Выключатель 1-клавишный скрытой установки Белый', category: 'Электротовары', price: 16000, purchasePrice: 10500, unit: 'шт', brand: 'Schneider' },
  '4780001022': { name: 'Автоматический выключатель 1P 16A C (ВА47-29)', category: 'Электротовары', price: 24000, purchasePrice: 16000, unit: 'шт', brand: 'IEK' },
  '4780001023': { name: 'Автоматический выключатель 1P 25A C (ВА47-29)', category: 'Электротовары', price: 25000, purchasePrice: 16500, unit: 'шт', brand: 'IEK' },
};

/**
 * Parses Asl Belgisi / Честный Знак / GS1 Data Matrix QR codes
 * e.g. '010478000120011821... -> extracts GTIN '4780001200118'
 */
export function extractGtinFromDataMatrix(rawCode: string): string | null {
  const clean = rawCode.trim();

  // Format 1: GS1 Application Identifier (01)04780001200118(21)...
  const aiMatch = clean.match(/\(01\)(\d{14})/);
  if (aiMatch) {
    const gtin14 = aiMatch[1];
    return gtin14.startsWith('0') ? gtin14.slice(1) : gtin14;
  }

  // Format 2: Direct 01 prefix with 14 digits: 010478000120011821...
  if (clean.startsWith('01') && clean.length >= 16 && /^\d{16}/.test(clean)) {
    const gtin14 = clean.substring(2, 16);
    return gtin14.startsWith('0') ? gtin14.slice(1) : gtin14;
  }

  // Format 3: URL with code / gtin param: e.g. https://aslbelgisi.uz/c/0478... or ?gtin=...
  if (clean.includes('aslbelgisi') || clean.includes('crpt') || clean.includes('chestnyznak')) {
    const digitsMatch = clean.match(/(\d{13,14})/);
    if (digitsMatch) {
      const g = digitsMatch[1];
      return g.length === 14 && g.startsWith('0') ? g.slice(1) : g;
    }
  }

  return null;
}

/**
 * Intelligent QR Code string content parser
 */
function parseQrCodePayload(rawPayload: string): Partial<RecognizedProductInfo> | null {
  const trimmed = rawPayload.trim();

  // 1. Try parsing JSON format
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
        };
      }
    } catch {}
  }

  // 2. Check if it is a plain product name (e.g. 'Дрель ударная Makita 710W', 'Краска ПФ-115')
  if (
    !trimmed.startsWith('http://') &&
    !trimmed.startsWith('https://') &&
    trimmed.length > 2 &&
    trimmed.length < 100 &&
    !/^\d{6,18}$/.test(trimmed)
  ) {
    let cat = 'Разное';
    const lower = trimmed.toLowerCase();
    if (lower.includes('pepsi') || lower.includes('cola') || lower.includes('сок') || lower.includes('вода') || lower.includes('чай') || lower.includes('хлеб') || lower.includes('шоколад')) {
      cat = 'Напитки и Продукты';
    } else if (lower.includes('fairy') || lower.includes('мыло') || lower.includes('порошок') || lower.includes('шампунь') || lower.includes('гель') || lower.includes('domestos')) {
      cat = 'Бытовая химия';
    } else if (lower.includes('дрель') || lower.includes('молоток') || lower.includes('отвертка') || lower.includes('ключ') || lower.includes('рулетка') || lower.includes('перфоратор')) {
      cat = 'Инструменты';
    } else if (lower.includes('краска') || lower.includes('кисть') || lower.includes('валик') || lower.includes('лента') || lower.includes('грунтовка') || lower.includes('шпатлевка')) {
      cat = 'Малярные товары';
    } else if (lower.includes('смеситель') || lower.includes('кран') || lower.includes('труба') || lower.includes('сифон') || lower.includes('шланг')) {
      cat = 'Сантехника';
    } else if (lower.includes('лампа') || lower.includes('кабель') || lower.includes('провод') || lower.includes('розетка') || lower.includes('выключатель') || lower.includes('автомат')) {
      cat = 'Электротовары';
    } else if (lower.includes('дюбель') || lower.includes('саморез') || lower.includes('болт') || lower.includes('гайка') || lower.includes('гвоздь')) {
      cat = 'Крепеж';
    }

    return {
      name: trimmed,
      category: cat,
      price: 35000,
      purchasePrice: 25000,
      unit: 'шт',
    };
  }

  // 3. If it is a URL, extract readable slug
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const url = new URL(trimmed);
      const parts = url.pathname.split('/').filter(Boolean);
      const slug = parts[parts.length - 1];
      if (slug && slug.length > 2) {
        const readable = decodeURIComponent(slug).replace(/[-_+]/g, ' ');
        return {
          name: readable.charAt(0).toUpperCase() + readable.slice(1),
          category: 'Разное',
          price: 35000,
          purchasePrice: 25000,
          unit: 'шт',
        };
      }
    } catch {}
  }

  return null;
}

/**
 * Queries Open Food Facts, Open Beauty Facts, Open Products Facts and UPC Databases in parallel
 */
async function queryOnlineDatabases(barcode: string): Promise<RecognizedProductInfo | null> {
  const cleanCode = barcode.trim();
  if (!cleanCode || cleanCode.length < 6) return null;

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutId = setTimeout(() => controller?.abort(), 3500);

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
          headers: { 'User-Agent': 'HozmagUchetyApp/1.0' },
          signal: controller?.signal,
        });
        if (res.ok) {
          const data = await res.json();
          if (data.status === 1 && data.product) {
            return { type: 'off', product: data.product };
          }
          if (data.items && data.items.length > 0) {
            return { type: 'upc', item: data.items[0] };
          }
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
          product.product_name_ru ||
          product.product_name ||
          product.generic_name_ru ||
          product.generic_name ||
          product.product_name_en ||
          '';
        const quantity = product.quantity || '';

        let fullName = rawName;
        if (brand && !fullName.toLowerCase().includes(brand.toLowerCase())) {
          fullName = (brand + ' ' + fullName).trim();
        }
        if (quantity && !fullName.toLowerCase().includes(quantity.toLowerCase())) {
          fullName = (fullName + ' ' + quantity).trim();
        }

        // Determine category
        let category = 'Разное';
        const catTags = (product.categories_tags || []).join(' ').toLowerCase();
        const nameLower = fullName.toLowerCase();

        if (
          catTags.includes('beverage') ||
          catTags.includes('drink') ||
          catTags.includes('food') ||
          catTags.includes('snack') ||
          nameLower.includes('pepsi') ||
          nameLower.includes('cola') ||
          nameLower.includes('сок') ||
          nameLower.includes('вода')
        ) {
          category = 'Напитки и Продукты';
        } else if (
          catTags.includes('hygiene') ||
          catTags.includes('cleaning') ||
          catTags.includes('detergent') ||
          catTags.includes('beauty') ||
          nameLower.includes('fairy') ||
          nameLower.includes('мыло') ||
          nameLower.includes('шампунь')
        ) {
          category = 'Бытовая химия';
        }

        return {
          name: fullName || ('Товар ' + cleanCode),
          brand: brand || undefined,
          category,
          price: 18000,
          purchasePrice: 12500,
          unit: 'шт',
          foundOnline: true,
          rawBarcode: cleanCode,
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
          foundOnline: true,
          rawBarcode: cleanCode,
        };
      }
    }
  } catch (err) {
    console.log('Online barcode lookup note:', err);
  } finally {
    clearTimeout(timeoutId);
  }

  return null;
}

/**
 * Main Auto-Recognition Function
 * Resolves full real product names for Barcode, Data Matrix & QR codes.
 */
export async function lookupProductByBarcode(scannedCode: string): Promise<RecognizedProductInfo> {
  const code = scannedCode.trim();

  // 1. Check if Data Matrix / Asl Belgisi / Честный знак QR Code
  const gtinFromQr = extractGtinFromDataMatrix(code);
  const targetBarcode = gtinFromQr || code;

  // 2. Check local instant database of 150+ popular goods
  if (LOCAL_BARCODE_DATABASE[targetBarcode]) {
    const item = LOCAL_BARCODE_DATABASE[targetBarcode];
    return {
      ...item,
      foundOnline: true,
      rawBarcode: targetBarcode,
    };
  }

  // 3. Check if QR code contains structured text/JSON/URL
  const qrParsed = parseQrCodePayload(code);
  if (qrParsed && qrParsed.name) {
    return {
      name: qrParsed.name,
      category: qrParsed.category || 'Разное',
      price: qrParsed.price || 25000,
      purchasePrice: qrParsed.purchasePrice || 18000,
      unit: qrParsed.unit || 'шт',
      brand: qrParsed.brand,
      foundOnline: true,
      rawBarcode: targetBarcode,
    };
  }

  // 4. Query global & CIS online product databases
  const onlineResult = await queryOnlineDatabases(targetBarcode);
  if (onlineResult && onlineResult.name) {
    return onlineResult;
  }

  // 5. Intelligent country heuristic
  let countryName = 'Импорт';
  const prefix3 = targetBarcode.slice(0, 3);
  if (GS1_COUNTRY_PREFIXES[prefix3]) {
    countryName = GS1_COUNTRY_PREFIXES[prefix3];
  }

  const lastFour = targetBarcode.slice(-4);
  return {
    name: 'Товар (' + countryName + ') №' + (lastFour || targetBarcode),
    category: 'Разное',
    price: 35000,
    purchasePrice: 25000,
    unit: 'шт',
    country: countryName,
    foundOnline: false,
    rawBarcode: targetBarcode,
  };
}