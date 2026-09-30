/* =============================================================
   Calendar — real iqtisodiy kalendar

   3 ta manba (birinchi ishlashini to'xtatadi):
     1) Backend  GET /api/calendar          — lokal Flask server ishlayotgan bo'lsa
     2) Fayl     data/calendar.json         — GitHub Pages / statik hosting uchun
     3) To'g'ri  nfs.faireconomy.media      — faqat CORS ruxsat bergan muhitda
   ============================================================= */
const Calendar = (() => {

  const DIRECT = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';
  const FILE = 'data/calendar.json';
  const IMPACT_MAP = { High: 3, Medium: 2, Low: 1, Holiday: 1 };
  const IMPACT_TEXT = { 3: '🔴 Yuqori', 2: '🟡 O\'rta', 1: '🟠 Past' };

  const FLAG = {
    USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧', JPY: '🇯🇵', AUD: '🇦🇺', CAD: '🇨🇦',
    CHF: '🇨🇭', CNY: '🇨🇳', NZD: '🇳🇿', RUB: '🇷🇺', INR: '🇮🇳', BRL: '🇧🇷',
    MXN: '🇲🇽', ZAR: '🇿🇦', SGD: '🇸🇬', HKD: '🇭🇰', KRW: '🇰🇷', TRY: '🇹🇷',
    SEK: '🇸🇪', NOK: '🇳🇴', DKK: '🇩🇰', PLN: '🇵🇱', CZK: '🇨🇿', HUF: '🇭🇺',
    ILS: '🇮🇱', THB: '🇹🇭', MYR: '🇲🇾', IDR: '🇮🇩', PHP: '🇵🇭', VND: '🇻🇳',
    RON: '🇷🇴', UAH: '🇺🇦', ALL: '🏳️'
  };

  const state = { items: [], ts: 0, ok: false, err: null, source: '—' };
  const subs = [];
  function subscribe(fn) { subs.push(fn); return () => { const i = subs.indexOf(fn); if (i >= 0) subs.splice(i, 1); }; }
  function emit() { subs.forEach(f => { try { f(state.items); } catch (e) { console.error(e); } }); }

  /* ---------------- o'zgartirish ---------------- */
  function build(raw, source, stampTs) {
    const items = [];
    raw.forEach(x => {
      const cur = String(x.currency || x.country || 'ALL').toUpperCase().slice(0, 3);
      const imp = x.impact != null ? Number(x.impact) : (IMPACT_MAP[x.impactRaw || x.impact] || 1);
      const ts = x.ts != null ? Number(x.ts) : new Date(x.date).getTime();
      if (!ts || !isFinite(ts)) return;
      const dt = new Date(ts);
      items.push({
        id: (cur + '_' + ts + '_' + (x.title || '')).slice(0, 60),
        currency: cur,
        flag: FLAG[cur] || '🏳️',
        title: x.title || '—',
        impact: imp,
        impactText: IMPACT_TEXT[imp] || '🟠 Past',
        forecast: x.forecast || '—',
        previous: x.previous || '',
        ts,
        date: U.tzDate(dt),
        time: U.tzTime(dt),
        link: 'https://www.forexfactory.com/calendar'
      });
    });
    items.sort((a, b) => a.ts - b.ts);
    state.items = items;
    state.ts = stampTs || Date.now();
    state.ok = items.length > 0;
    state.source = source;
    state.err = null;
    emit();
    return items.length;
  }

  async function fromBackend() {
    if (typeof Api === 'undefined' || !Api.state.online) return 0;
    const j = await Api.calendar();
    if (!j || !Array.isArray(j.items) || !j.items.length) return 0;
    return build(j.items, 'Backend', j.ts);
  }

  async function fromFile(force) {
    const r = await fetch(FILE + '?t=' + (Date.now() % 100000), { cache: force ? 'reload' : 'default' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json();
    const raw = Array.isArray(j) ? j : (j.items || []);
    if (!raw.length) return 0;
    return build(raw, 'data/calendar.json', j.ts ? Number(j.ts) : null);
  }

  async function fromDirect() {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), 9000);
    try {
      const r = await fetch(DIRECT, { signal: ctl.signal });
      clearTimeout(to);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return build(await r.json(), 'ForexFactory (to\'g\'ridan-to\'g\'ri)');
    } finally { clearTimeout(to); }
  }

  /* ---------------- bitta urinish ---------------- */
  async function load(force) {
    const errs = [];
    for (const fn of [fromBackend, fromFile, fromDirect]) {
      try {
        const n = await fn(force);
        if (n > 0) return true;
        errs.push(fn.name + ': bo\'sh');
      } catch (e) { errs.push(fn.name + ': ' + e.message); }
    }
    state.err = errs.join(' | ');
    console.warn('[Calendar] barcha manbalar ishlamadi:', state.err);
    emit();
    return false;
  }

  function items()     { return state.items; }
  function info()      { return { ts: state.ts, ok: state.ok, err: state.err, n: state.items.length, source: state.source }; }
  function upcoming()  { const n = Date.now(); return state.items.filter(x => x.ts > n - 2 * 3600000); }
  function highImpact(){ return state.items.filter(x => x.impact === 3); }

  function start() {
    load(true);
    setInterval(() => load(false), CFG.NET.calendarMs);
  }

  return { start, load, items, info, upcoming, highImpact, subscribe, IMPACT_TEXT };
})();