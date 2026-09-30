/* =============================================================
   ZA_ISLAMIC / RiskKalkulyatori_FOND — umumiy sozlamalar
   ============================================================= */

const CFG = {
  /* --- Tarmoq --- */
  NET: {
    pollMs: 5000,        /* narx yangilanish sikli (ms) */
    historyMs: 30000,    /* mahalliy tarixni saqlash sikli */
    calendarMs: 600000,  /* kalendar yangilanish sikli (10 daqiqa) */
    signalMs: 5000,      /* signal holatini qayta tekshirish */
    keys: {
      users: 'za_islamic_users',
      session: 'za_islamic_session',
      quotes: 'za_islamic_quotes_cache',
      history: 'za_islamic_history',
      autoSignals: 'za_islamic_auto_signals',
      mySignals: 'za_islamic_my_signals',
      prefs: 'za_islamic_prefs'
    }
  },

  /* --- Backend (ixtiyoriy) ---
     Bo'sh qoldirilsa yoki ishlamasa, ilova to'liq ishlaydi:
     narxlar  → TradingView scanner (to'g'ridan-to'g'ri, CORS ochiq)
     kalendar → data/calendar.json (GitHub Actions tomondan yangilanadi)
     login    → localStorage
     Backend faqat haqiqiy ko'p-foydalanuvchi bazasi uchun kerak. */
  API: {
    base: 'http://127.0.0.1:8000',
    timeoutMs: 2500,
    enabled: true,
    probeOnBoot: true
  },

  /* --- Aktivlar ---
     tv  : TradingView simvoli (scanner uchun)
     pip : 1 pip / 1 punkt = qancha narx birligi
     dig : narxning kasr xonasi                                    */
  GROUPS: [
    {
      id: 'forex', title: 'Forex', icon: '💱', color: 'var(--forex-color)',
      push: 'tradingview',
      items: [
        { id: 'EURUSD', name: 'EUR/USD', tv: 'FX:EURUSD',     pip: 0.0001, dig: 5 },
        { id: 'GBPUSD', name: 'GBP/USD', tv: 'FX:GBPUSD',     pip: 0.0001, dig: 5 },
        { id: 'USDJPY', name: 'USD/JPY', tv: 'FX:USDJPY',     pip: 0.01,   dig: 3 },
        { id: 'AUDUSD', name: 'AUD/USD', tv: 'FX:AUDUSD',     pip: 0.0001, dig: 5 },
        { id: 'USDCAD', name: 'USD/CAD', tv: 'FX:USDCAD',     pip: 0.0001, dig: 5 },
        { id: 'USDCHF', name: 'USD/CHF', tv: 'FX:USDCHF',     pip: 0.0001, dig: 5 },
        { id: 'NZDUSD', name: 'NZD/USD', tv: 'FX:NZDUSD',     pip: 0.0001, dig: 5 },
        { id: 'EURGBP', name: 'EUR/GBP', tv: 'FX:EURGBP',     pip: 0.0001, dig: 5 },
        { id: 'EURJPY', name: 'EUR/JPY', tv: 'FX:EURJPY',     pip: 0.01,   dig: 3 },
        { id: 'GBPJPY', name: 'GBP/JPY', tv: 'FX:GBPJPY',     pip: 0.01,   dig: 3 }
      ]
    },
    {
      id: 'metal', title: 'Metallar', icon: '🥇', color: 'var(--yellow)',
      push: 'tradingview',
      items: [
        { id: 'XAUUSD', name: 'XAU/USD', tv: 'OANDA:XAUUSD', pip: 0.1,  dig: 2 },
        { id: 'XAGUSD', name: 'XAG/USD', tv: 'TVC:SILVER',   pip: 0.01, dig: 3 }
      ]
    },
    {
      id: 'index', title: 'Indekslar', icon: '📊', color: 'var(--blue)',
      push: 'tradingview',
      items: [
        { id: 'SPX500', name: 'S&P 500',   tv: 'SP:SPX',     pip: 1, dig: 2 },
        { id: 'NAS100', name: 'NAS100',    tv: 'NASDAQ:NDX', pip: 1, dig: 2 },
        { id: 'DJI',    name: 'Dow Jones', tv: 'DJ:DJI',     pip: 1, dig: 2 },
        { id: 'DE40',   name: 'DE40',      tv: 'TVC:DE30',   pip: 1, dig: 2 }
      ]
    },
    {
      id: 'crypto', title: 'Kripto', icon: '🪙', color: 'var(--crypto-color)',
      push: 'binance',
      items: [
        { id: 'BTCUSDT',  name: 'BTC/USDT',  tv: 'BINANCE:BTCUSDT',  b: 'BTCUSDT',  pip: 1,      dig: 1 },
        { id: 'ETHUSDT',  name: 'ETH/USDT',  tv: 'BINANCE:ETHUSDT',  b: 'ETHUSDT',  pip: 0.1,    dig: 2 },
        { id: 'BNBUSDT',  name: 'BNB/USDT',  tv: 'BINANCE:BNBUSDT',  b: 'BNBUSDT',  pip: 0.1,    dig: 2 },
        { id: 'SOLUSDT',  name: 'SOL/USDT',  tv: 'BINANCE:SOLUSDT',  b: 'SOLUSDT',  pip: 0.01,   dig: 3 },
        { id: 'XRPUSDT',  name: 'XRP/USDT',  tv: 'BINANCE:XRPUSDT',  b: 'XRPUSDT',  pip: 0.0001, dig: 4 },
        { id: 'ADAUSDT',  name: 'ADA/USDT',  tv: 'BINANCE:ADAUSDT',  b: 'ADAUSDT',  pip: 0.001,  dig: 4 },
        { id: 'DOGEUSDT', name: 'DOGE/USDT', tv: 'BINANCE:DOGEUSDT', b: 'DOGEUSDT', pip: 0.00001,dig: 5 },
        { id: 'DOTUSDT',  name: 'DOT/USDT',  tv: 'BINANCE:DOTUSDT',  b: 'DOTUSDT',  pip: 0.001,  dig: 4 },
        { id: 'LINKUSDT', name: 'LINK/USDT', tv: 'BINANCE:LINKUSDT', b: 'LINKUSDT', pip: 0.01,   dig: 3 },
        { id: 'AVAXUSDT', name: 'AVAX/USDT', tv: 'BINANCE:AVAXUSDT', b: 'AVAXUSDT', pip: 0.01,   dig: 3 }
      ]
    }
  ],

  /* TradingView scanner so'raydagi ustunlar
     Sufiks = timeframe (5/15/60/240 daqiqa; suffiksiz = kunlik) */
  TV_COLUMNS: [
    'close', 'change', 'change_abs', 'high', 'low', 'volume',
    'RSI|60', 'ATR|240',
    'Recommend.All', 'Recommend.All|15', 'Recommend.All|60', 'Recommend.All|240',
    'MACD.macd|60', 'MACD.signal|60', 'MACD.macd|15', 'MACD.signal|15',
    'EMA9|60', 'EMA21|60', 'SMA50|60',
    'Stoch.K|60', 'Stoch.D|60', 'BB.upper|60', 'BB.lower|60'
  ],

  /* --- Avtomatik signal sozlamalari --- */
  AUTO_SIGNAL: {
    rsiOversold: 32,        /* RSI|60 shu qiymatdan past = ortiqcha sotilgan */
    rsiOverbought: 68,      /* RSI|60 shu qiymatdan yuqori = ortiqcha xarid */
    slAtr: 1.5,             /* SL = ATR(4 soat) × 1.5 */
    tpAtr: 3.0,             /* TP = ATR(4 soat) × 3.0  → Risk/Reward 1:2 */
    minAtrPct: 0.02,        /* ATR/narx (%) — juda oqilona likvidlikdan saqlanish */
    maxAtrPct: 8.0,         /* juda yuqori volatillikdan saqlanish */
    buyThreshold: 3,
    sellThreshold: -3,
    onePerInstrument: true,
    maxOpen: 6              /* bir vaqtda faol avtomatik signal chegarasi */
  },

  RISK: { suggested: 1, max: 5, step: 10 },
  TZ: 'Asia/Tashkent'
};

/* ================= Yordamchilar ================= */
const U = {
  all() {
    const m = {};
    CFG.GROUPS.forEach(g => g.items.forEach(i => {
      m[i.id] = Object.assign({ group: g.id, groupTitle: g.title, push: g.push }, i);
    }));
    return m;
  },
  byId: null,

  fmtPrice(id, p) {
    const it = U.byId[id];
    if (p == null || !isFinite(p)) return '—';
    const d = it ? it.dig : 4;
    return Number(p).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  },

  fmtCompact(p) {
    if (p == null || !isFinite(p)) return '—';
    const a = Math.abs(p);
    if (a >= 1000) return Number(p).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (a >= 1) return Number(p).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
    return Number(p).toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 6 });
  },

  fmtPct(p, sign) {
    if (p == null || !isFinite(p)) return '—';
    const v = Number(p);
    return (sign && v > 0 ? '+' : '') + v.toFixed(2) + '%';
  },

  fmtTime(d) {
    const t = (d instanceof Date) ? d : new Date(d);
    const p = n => String(n).padStart(2, '0');
    return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())} ${p(t.getHours())}:${p(t.getMinutes())}`;
  },

  fmtAgo(ts) {
    if (!ts) return '—';
    const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
    if (s < 5) return 'hozir';
    if (s < 60) return s + ' sn oldin';
    if (s < 3600) return Math.round(s / 60) + ' daqiqa oldin';
    if (s < 86400) return Math.round(s / 3600) + ' soat oldin';
    return Math.round(s / 86400) + ' kun oldin';
  },

  tzDate(d) { return new Date(d).toLocaleDateString('sv-SE', { timeZone: CFG.TZ }); },
  tzTime(d) { return new Date(d).toLocaleTimeString('sv-SE', { timeZone: CFG.TZ, hour: '2-digit', minute: '2-digit' }); },

  esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  },

  clamp(v, a, b) { return Math.max(a, Math.min(b, v)); },

  lsGet(key, def) {
    try { const v = localStorage.getItem(key); return v == null ? def : JSON.parse(v); }
    catch (e) { return def; }
  },
  lsSet(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; } catch (e) { return false; }
  },
  lsDel(key) { try { localStorage.removeItem(key); } catch (e) {} }
};

U.byId = U.all();