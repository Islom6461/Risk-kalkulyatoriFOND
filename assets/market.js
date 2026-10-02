/* =============================================================
   Market — real vaqt rejimidagi narx dvigyori

   Asosiy manba: TradingView scanner
     • 1 ta POST so'rovi bilan BARCHA aktivlar (Forex/Metall/Indеks/Kripto)
     • CORS ochiq → brauzerdan to'g'ridan-to'g'ri ishlaydi (backend kerak emas)
     • Narx + 24 soatlik o'zgarish + RSI/ATR/MACD/EMA/Stоch/BB (server hisoblangan)

   Qo'shimcha: Binance WebSocket — kripto uchun sub-sekund "push" narxlar
   Zaxira: localStorage keshi (internet uzilsa ham narxlar ko'rinadi)
   Sparkline: o'zimiz to'plagan narx tarixi (localStorage)
   ============================================================= */
const Market = (() => {

  const TV_SCAN = 'https://scanner.tradingview.com/global/scan';
  const BINANCE_WS = 'wss://stream.binance.com:9443/ws/!miniTicker@arr';
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0 Safari/537.36';

  const state = {
    quotes: {},   /* id -> {price, prev, chg, chgAbs, high, low, vol, ind, ts, dir, source, stale} */
    hist: {},     /* id -> [[t, close], ...]  (sparkline uchun) */
    errors: 0,
    online: false,
    lastTick: 0,
    running: false,
    ws: null,
    wsOk: false,
    viaBackend: false
  };

  const tickSubs = [], statusSubs = [];
  let priceTimer = null, saveTimer = null;

  const TV_TO_ID = {};
  CFG.GROUPS.forEach(g => g.items.forEach(i => { TV_TO_ID[i.tv] = i.id; }));

  /* ---------------- obuna bo'lish ---------------- */
  function onTick(fn)   { tickSubs.push(fn);   return () => { const i = tickSubs.indexOf(fn);   if (i >= 0) tickSubs.splice(i, 1); }; }
  function onStatus(fn) { statusSubs.push(fn); return () => { const i = statusSubs.indexOf(fn); if (i >= 0) statusSubs.splice(i, 1); }; }
  function emitTick()   { const s = state; tickSubs.forEach(f => { try { f(s.quotes); } catch (e) { console.error(e); } }); }
  function emitStatus() { const s = status(); statusSubs.forEach(f => { try { f(s); } catch (e) { console.error(e); } }); }

  function setOnline(v) { if (state.online !== v) { state.online = v; emitStatus(); } }

  function status() {
    return {
      online: state.online,
      lastTick: state.lastTick,
      errors: state.errors,
      mode: state.viaBackend ? 'backend' : (state.wsOk ? 'ws+http' : 'http'),
      count: Object.keys(state.quotes).length
    };
  }

  /* ---------------- yordamchilar ---------------- */
  function itemsOf(pred) {
    const r = [];
    CFG.GROUPS.forEach(g => g.items.forEach(i => { if (!pred || pred(i, g)) r.push(i); }));
    return r;
  }
  function cryptoItems() { return itemsOf(i => !!i.b); }

  function putQuote(id, patch) {
    if (patch.price == null || !isFinite(patch.price) || patch.price <= 0) return;
    const q = state.quotes[id];
    const dir = q && q.price != null
      ? (patch.price > q.price ? 'up' : (patch.price < q.price ? 'down' : q.dir))
      : 'flat';
    state.quotes[id] = Object.assign({}, q, patch, { id, dir, ts: Date.now(), stale: false });
  }

  /* ---------------- 1) TradingView scanner ---------------- */
  async function fetchTV() {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), 12000);
    try {
      /* Muhim: Content-Type: application/json qo'yish CORS preflight talab qiladi va
         TradingView preflight'da faqat Referer/Accept ga ruxsat beradi.
         'text/plain' esa CORS-safe → preflight umuman yuborilmaydi.
         Scanner JSON body'ni har qanday Content-Type'da o'qiydi. */
      const r = await fetch(TV_SCAN, {
        method: 'POST',
        signal: ctl.signal,
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify({
          symbols: { query: { types: [] }, tickers: Object.keys(TV_TO_ID) },
          columns: CFG.TV_COLUMNS
        })
      });
      if (!r.ok) throw new Error('scanner HTTP ' + r.status);
      const j = await r.json();
      const data = j.data || [];
      if (!data.length) throw new Error('bo\'sh javob');

      data.forEach(item => {
        const id = TV_TO_ID[item.s];
        if (!id) return;
        const d = item.d;
        const v = {};
        CFG.TV_COLUMNS.forEach((c, i) => { v[c] = d[i]; });

        const ind = {
          rsi:  v['RSI|60'],
          atr:  v['ATR|240'],
          rec:  v['Recommend.All'],
          rec15:  v['Recommend.All|15'],
          rec60:  v['Recommend.All|60'],
          rec240: v['Recommend.All|240'],
          macd: v['MACD.macd|60'],
          macdSignal: v['MACD.signal|60'],
          macd15: v['MACD.macd|15'],
          macdSignal15: v['MACD.signal|15'],
          ema9:  v['EMA9|60'],
          ema21: v['EMA21|60'],
          sma50: v['SMA50|60'],
          stochK: v['Stoch.K|60'],
          stochD: v['Stoch.D|60'],
          bbUpper: v['BB.upper|60'],
          bbLower: v['BB.lower|60']
        };

        putQuote(id, {
          price: v['close'],
          prev:  v['close'] != null && v['change_abs'] != null ? v['close'] - v['change_abs'] : null,
          chg:   v['change'],
          chgAbs: v['change_abs'],
          high:  v['high'],
          low:   v['low'],
          vol:   v['volume'],
          ind,
          source: 'tradingview'
        });
        pushHistory(id, v['close']);
      });
      return data.length;
    } finally { clearTimeout(to); }
  }

  /* ---------------- 2) Binance WebSocket (kripto push) ---------------- */
  function connectWS() {
    if (!('WebSocket' in window)) return;
    try {
      const ws = new WebSocket(BINANCE_WS);
      const boot = setTimeout(() => { try { ws.close(); } catch (e) {} }, 7000);

      ws.onopen = () => { state.wsOk = true; state.ws = ws; clearTimeout(boot); emitStatus(); };
      ws.onmessage = ev => {
        if (!state.wsOk) return;              /* hali ochiq bo'lmagan bo'lsa, polling ishlaydi */
        try {
          const arr = JSON.parse(ev.data);
          if (!Array.isArray(arr)) return;
          const map = {};
          cryptoItems().forEach(i => { map[i.b] = i.id; });
          let touched = false;
          arr.forEach(t => {
            const id = map[t.s];
            if (!id) return;
            const q = state.quotes[id] || {};
            const price = parseFloat(t.c);
            if (!isFinite(price)) return;
            /* 24 soatlik o'zgarishni saqlab qolamiz, faqat narx yangilanadi */
            putQuote(id, { price, source: 'binance-ws' });
            touched = true;
          });
          if (touched) { state.lastTick = Date.now(); emitTick(); }
        } catch (e) { /* xotirjam */ }
      };
      ws.onerror = () => { state.wsOk = false; };
      ws.onclose = () => {
        state.wsOk = false; state.ws = null; clearTimeout(boot);
        setTimeout(() => { if (state.running) connectWS(); }, 10000);
      };
    } catch (e) { state.wsOk = false; }
  }

  /* ---------------- 3) zaxira: backend proksi ---------------- */
  async function fetchViaBackend() {
    if (typeof Api === 'undefined' || !Api.state.online) return 0;
    const j = await Api.market();
    if (!j || !j.quotes) return 0;
    let n = 0;
    Object.keys(j.quotes).forEach(id => {
      const q = j.quotes[id];
      if (!q || q.price == null) return;
      putQuote(id, {
        price: q.price, chg: q.chg, chgAbs: q.chgAbs,
        high: q.high, low: q.low, vol: q.vol,
        ind: q.ind || null,
        source: q.source || 'backend'
      });
      pushHistory(id, q.price);
      n++;
    });
    return n;
  }

  /* ---------------- 4) narx sikli ----------------
     Birinchi navbatda BACKEND orqali (keshli) — barcha foydalanuvchi bitta
     so'rovdan foydalanadi va manba 100x kam yuklanadi.
     Backend ishlamasa — to'g'ridan-to'g'ri (TradingView, CORS ochiq). */
  async function refreshPrices() {
    let n = 0;
    /* 1) backend orqali */
    if (typeof Api !== 'undefined' && Api.state.online) {
      try {
        n = await fetchViaBackend();
        if (n) {
          state.viaBackend = true;
          state.errors = 0;
          state.lastTick = Date.now();
          setOnline(true);
          emitTick();
          return;
        }
      } catch (e) { /* backend javob bermadi — to'g'ridan-to'g'ri urinib ko'ramiz */ }
    }
    /* 2) to'g'ridan-to'g'ri */
    try {
      n = await fetchTV();
      state.viaBackend = false;
      state.errors = 0;
    } catch (e) {
      console.warn('[Market] narx xatosi:', e.message);
      state.errors++;
      Object.keys(state.quotes).forEach(k => { state.quotes[k].stale = true; });
      if (state.errors >= 3) setOnline(false);
      emitStatus();
      return;
    }
    state.lastTick = Date.now();
    setOnline(n > 0);
    emitTick();
  }

  /* ---------------- 5) mahalliy narx tarixi (sparkline) ---------------- */
  function pushHistory(id, price) {
    if (price == null || !isFinite(price)) return;
    const arr = state.hist[id] || (state.hist[id] = []);
    const now = Date.now();
    const last = arr[arr.length - 1];
    if (last && now - last[0] < 10000) { last[1] = price; return; }  /* 10 s dan kichik bo'lsa yangilama */
    arr.push([now, price]);
    if (arr.length > 400) arr.splice(0, arr.length - 400);           /* ~66 daqiqalik tarix */
  }

  function saveHistory() {
    U.lsSet(CFG.NET.keys.history, state.hist);
    U.lsSet(CFG.NET.keys.quotes, state.quotes);
  }

  function loadCache() {
    const h = U.lsGet(CFG.NET.keys.history, null);
    if (h && typeof h === 'object') state.hist = h;
    const q = U.lsGet(CFG.NET.keys.quotes, null);
    if (q && typeof q === 'object') {
      Object.keys(q).forEach(k => {
        if (q[k] && q[k].price) state.quotes[k] = Object.assign({}, q[k], { stale: true });
      });
    }
  }

  /* ---------------- boshqaruv ---------------- */
  function start() {
    if (state.running) return;
    state.running = true;
    loadCache();
    connectWS();
    refreshPrices();
    setTimeout(refreshPrices, 2500);

    priceTimer = setInterval(refreshPrices, CFG.NET.pollMs);
    saveTimer  = setInterval(saveHistory, CFG.NET.historyMs);

    /* har soniyada holat (soat, "yangilangan", ulash) */
    setInterval(() => {
      const st = status();
      if (st.lastTick && Date.now() - st.lastTick > CFG.NET.pollMs * 5) setOnline(false);
      emitStatus();
    }, 1000);

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) refreshPrices();
    });
    window.addEventListener('beforeunload', saveHistory);
  }

  function stop() {
    state.running = false;
    clearInterval(priceTimer);
    clearInterval(saveTimer);
    if (state.ws) { try { state.ws.close(); } catch (e) {} }
  }

  function setIntervalMs(ms) {
    if (priceTimer) clearInterval(priceTimer);
    if (ms > 0) priceTimer = setInterval(refreshPrices, ms);
    return ms;
  }

  /* ---------------- o'qish ---------------- */
  function price(id)   { const q = state.quotes[id]; return q ? q.price : null; }
  function get(id)      { return state.quotes[id] || null; }
  function indicators(id) { const q = state.quotes[id]; return (q && q.ind) ? q.ind : null; }
  function history(id) { return state.hist[id] || []; }
  function closesOf(id) { return (state.hist[id] || []).map(x => x[1]); }
  function all()       { return state.quotes; }

  return {
    start, stop, setIntervalMs, refreshPrices,
    onTick, onStatus, status, price, get, indicators, history, closesOf, all
  };
})();