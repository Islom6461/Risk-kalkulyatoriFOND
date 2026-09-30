/* =============================================================
   Signals — qo'lda kiritilgan + avtomatik (algoritmik) signallar

   Manbalar:
     • data/signals.json   → qo'lda kiritilgan signallar (har 30 s tekshiriladi)
     • localStorage        → foydalanuvchi qo'shgan signallar
     • Avtomatik           → TradingView indikatorlari + zaxira bo'lyab
                             o'z tariximizdagi RSI/EMA/MACD/Stоch hisoboti
   Holat (TP/SL) joriy narx bo'yicha HAR 5 SONIYADA qayta aniqlanadi.
   ============================================================= */
const Signals = (() => {

  const FILE = 'data/signals.json';

  const state = {
    remote: [],   /* signals.json dan */
    mine: [],     /* foydalanuvchining */
    auto: [],     /* algoritmik */
    server: [],   /* backend dan */
    autoScanTs: 0
  };

  const subs = [];
  function subscribe(fn) { subs.push(fn); return () => { const i = subs.indexOf(fn); if (i >= 0) subs.splice(i, 1); }; }
  function emit() { const a = all(); subs.forEach(f => { try { f(a); } catch (e) { console.error(e); } }); }

  function num(v) { const n = parseFloat(v); return isFinite(n) ? n : null; }

  function normalize(s) {
    if (!s) return null;
    const raw = String(s.instrument || s.pair || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const it = U.byId[raw];
    const instrument = it ? it.id : raw;
    const pair = s.pair || (it ? it.name : raw);
    return {
      id: s.id != null ? String(s.id) : ('m-' + Math.random().toString(36).slice(2, 9)),
      instrument, pair,
      type: String(s.type || 'BUY').toUpperCase() === 'SELL' ? 'SELL' : 'BUY',
      entry: num(s.entry), sl: num(s.sl), tp: num(s.tp),
      status: ['pending', 'active', 'tp', 'sl', 'expired'].includes(s.status) ? s.status : 'pending',
      time: s.time || new Date().toISOString(),
      note: s.note || '',
      tvSymbol: s.tvSymbol || (it ? it.tv : instrument),
      source: s.source || 'manual',
      score: num(s.score),
      why: Array.isArray(s.why) ? s.why : [],
      pnl: 0, pnlPct: 0, distTP: 0, distSL: 0, price: null
    };
  }

  function strip(s) {
    return {
      id: s.id, instrument: s.instrument, pair: s.pair, type: s.type,
      entry: s.entry, sl: s.sl, tp: s.tp, status: s.status,
      time: s.time, note: s.note, tvSymbol: s.tvSymbol,
      source: s.source, score: s.score, why: s.why
    };
  }

  /* ================= ro'yxatlar ================= */
  function all() {
    const list = [...state.remote, ...state.server, ...state.mine, ...state.auto];
    list.sort((a, b) => (b.time || '').localeCompare(a.time || ''));
    return list;
  }

  function stats() {
    const a = all();
    const done = a.filter(s => s.status === 'tp' || s.status === 'sl');
    return {
      total: a.length,
      active: a.filter(s => s.status === 'active').length,
      pending: a.filter(s => s.status === 'pending').length,
      tp: a.filter(s => s.status === 'tp').length,
      sl: a.filter(s => s.status === 'sl').length,
      auto: a.filter(s => s.source === 'auto').length,
      winRate: done.length ? Math.round((done.filter(s => s.status === 'tp').length / done.length) * 100) : null
    };
  }

  /* ================= 1) data/signals.json ================= */
  async function loadFile(force) {
    const url = FILE + '?t=' + (Date.now() % 100000);
    try {
      const ctl = new AbortController();
      const to = setTimeout(() => ctl.abort(), 7000);
      const r = await fetch(url, { signal: ctl.signal, cache: force ? 'reload' : 'default' });
      clearTimeout(to);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      const raw = Array.isArray(j) ? j : (j.signals || []);
      state.remote = raw.map(normalize).filter(Boolean);
      evaluate();
      emit();
      return true;
    } catch (e) {
      console.warn('[Signals] signals.json yuklanmadi:', e.message);
      return false;
    }
  }

  /* ================= 2) localStorage ================= */
  function loadMine() { state.mine = (U.lsGet(CFG.NET.keys.mySignals, []) || []).map(normalize).filter(Boolean); }
  function saveMine() { U.lsSet(CFG.NET.keys.mySignals, state.mine.map(strip)); }
  function loadAuto() { state.auto = (U.lsGet(CFG.NET.keys.autoSignals, []) || []).map(normalize).filter(Boolean); }
  function saveAuto() { U.lsSet(CFG.NET.keys.autoSignals, state.auto.map(strip)); }

  /* ================= 3) qo'shish / o'chirish ================= */
  function add(o) {
    const s = normalize(o);
    if (!s || s.entry == null) return null;
    s.id = (o.source === 'auto' ? 'a-' : 'u-') + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    s.time = o.time || new Date().toISOString();
    s.status = o.status || 'pending';
    s.pair = s.pair || (U.byId[s.instrument] ? U.byId[s.instrument].name : s.instrument);
    s.tvSymbol = s.tvSymbol || (U.byId[s.instrument] ? U.byId[s.instrument].tv : s.instrument);
    if (s.source === 'auto') { state.auto.unshift(s); saveAuto(); }
    else { state.mine.unshift(s); saveMine(); }
    evaluate();
    emit();
    return s;
  }

  function remove(id) {
    let hit = false;
    ['mine', 'auto'].forEach(k => {
      const i = state[k].findIndex(s => s.id === id);
      if (i >= 0) { state[k].splice(i, 1); hit = true; k === 'mine' ? saveMine() : saveAuto(); }
    });
    if (hit) { evaluate(); emit(); }
    return hit;
  }

  function loadServer(list) {
    if (!Array.isArray(list)) return;
    state.server = list.map(normalize).filter(Boolean);
    evaluate();
    emit();
  }

  /* ================= 4) holatni joriy narx bo'yicha baholash ================= */
  function evaluate() {
    const q = Market.all();
    const list = [...state.remote, ...state.server, ...state.mine, ...state.auto];
    const now = Date.now();

    list.forEach(s => {
      const quote = q[s.instrument];
      const p = quote ? quote.price : null;
      s.pnl = 0; s.pnlPct = 0; s.distTP = 0; s.distSL = 0; s.price = p;
      if (p == null || s.entry == null) return;

      const isBuy = s.type === 'BUY';
      const rawPnl = isBuy ? (p - s.entry) : (s.entry - p);
      s.pnl = rawPnl;
      s.pnlPct = s.entry ? (rawPnl / s.entry) * 100 : 0;

      if (s.tp) s.distTP = ((isBuy ? s.tp - p : p - s.tp) / p) * 100;
      if (s.sl) s.distSL = ((isBuy ? p - s.sl : s.sl - p) / p) * 100;

      const hitTP = s.tp ? (isBuy ? p >= s.tp : p <= s.tp) : false;
      const hitSL = s.sl ? (isBuy ? p <= s.sl : p >= s.sl) : false;
      const opened = isBuy ? p >= s.entry : p <= s.entry;

      if (hitTP)            s.status = 'tp';
      else if (hitSL)       s.status = 'sl';
      else if (opened)      s.status = 'active';
      else if (s.status !== 'tp' && s.status !== 'sl' && s.status !== 'expired') s.status = 'pending';

      /* 30 kundan eskini "kutilmoqda" da qolmaydi */
      if (s.status === 'pending' && now - new Date(s.time).getTime() > 30 * 86400000) s.status = 'expired';
    });

    saveAuto(); saveMine();
  }

  /* ================= 5) avtomatik signal generatsiyasi ================= */
  function analyse(it) {
    const ind = Market.indicators(it.id);
    const price = Market.price(it.id);
    if (!price) return null;
    const cfg = CFG.AUTO_SIGNAL;
    if (ind) return TA.scoreFromTV(ind, price, cfg);
    /* zaxira: o'z tariximizdan */
    const closes = Market.closesOf(it.id);
    if (closes.length >= 35) return TA.scoreLocal(closes, cfg);
    return null;
  }

  function scanAuto() {
    const cfg = CFG.AUTO_SIGNAL;

    /* 1. barcha aktivlarni tahlil qilib nomzodlarni to'playmiz */
    const candidates = [];
    CFG.GROUPS.forEach(g => {
      g.items.forEach(it => {
        const r = analyse(it);
        if (!r || r.action === 'none' || !r.viable) return;
        candidates.push({ it, r });
      });
    });
    /* eng kuchli signal birinchi */
    candidates.sort((a, b) => Math.abs(b.r.score) - Math.abs(a.r.score));

    /* jami ochiq avtomatik signal soni (har skan alohida hisoblanmasligi kerak) */
    let openCount = state.auto.filter(s => s.status === 'active' || s.status === 'pending').length;
    let created = 0;

    candidates.forEach(c => {
      const it = c.it, r = c.r;

      const existing = state.auto.find(s =>
        s.instrument === it.id && (s.status === 'active' || s.status === 'pending'));

      if (existing) {
        /* yo'nalim o'zgargan bo'lsa — signalni yopamiz */
        if (existing.type !== r.action) {
          existing.status = 'sl';
          existing.note = 'Yo\'nalim o\'zgardi — signal avtomatik yopildi.';
          openCount--;
        }
        return;
      }
      if (openCount >= cfg.maxOpen) return;

      const p = r.price;
      const a = r.atr || (p * 0.005);
      const slD = a * cfg.slAtr;
      const tpD = a * cfg.tpAtr;
      const isBuy = r.action === 'BUY';

      const s = add({
        instrument: it.id,
        pair: it.name,
        type: r.action,
        entry: p,
        sl: isBuy ? (p - slD) : (p + slD),
        tp: isBuy ? (p + tpD) : (p - tpD),
        note: r.why.join(' · '),
        source: 'auto',
        score: r.score,
        why: r.why,
        status: 'active',
        tvSymbol: it.tv
      });
      if (s) { created++; openCount++; }
    });

    state.autoScanTs = Date.now();
    if (created) emit();
    return created;
  }

  function cleanup() {
    const cut = Date.now() - 14 * 86400000;
    const before = state.auto.length;
    state.auto = state.auto.filter(s =>
      (s.status !== 'tp' && s.status !== 'sl') || new Date(s.time).getTime() > cut);
    if (state.auto.length !== before) saveAuto();
  }

  /* ================= ishga tushirish ================= */
  function start() {
    loadMine(); loadAuto();
    loadFile(true);
    setInterval(() => loadFile(false), 30000);
    evaluate(); emit();

    Market.onTick(() => evaluate());
    setInterval(evaluate, CFG.NET.signalMs);
    setInterval(() => scanAuto(), 30000);
    setTimeout(() => { scanAuto(); cleanup(); }, 7000);
  }

  return {
    start, add, remove, all, stats, evaluate, scanAuto, analyse, subscribe,
    loadFile, loadServer, loadAuto, get lastScan() { return state.autoScanTs; }
  };
})();