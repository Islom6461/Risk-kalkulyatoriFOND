/* =============================================================
   Texnik tahlil

   1) TA.scoreFromTV() — TradingView serverda hisoblangan indikatorlardan
      baholash (-10 … +10).  Bu asosiy usul: aniq va tez.
   2) TA.* (sma/ema/rsi/macd/atr/stoch) — o'z mahalliy tariximizdan
      hisoblash (zaxira va sparkline uchun).
   ============================================================= */
const TA = (() => {

  /* ==================== server indikatorlari bilan ==================== */
  /**
   * ind = { rsi, atr, rec, rec15, rec60, macd, macdSignal, ema9, ema21,
   *         sma50, stochK, stochD, bbUpper, bbLower }
   * price = joriy narx
   */
  function scoreFromTV(ind, price, cfg) {
    if (!ind || price == null || !isFinite(price)) return null;
    const why = [];
    let s = 0;

    /* --- 1. Multi-timeframe TradingView tavsiyalari (jami kuch 7.0) --- */
    const recs = [
      { v: ind.rec,    w: 2.0 },
      { v: ind.rec60,  w: 2.0 },
      { v: ind.rec15,  w: 1.5 },
      { v: ind.rec240, w: 1.5 }
    ];
    let recAvg = null, recW = 0;
    recs.forEach(r => {
      if (r.v == null) return;
      s += U.clamp(r.v, -1, 1) * r.w;
      recAvg = (recAvg || 0) + r.v * r.w;
      recW += r.w;
    });
    if (recAvg != null) {
      recAvg = recAvg / recW;
      const lbl = recAvg > 0.35 ? 'kuchli xarid'
                : recAvg < -0.35 ? 'kuchli sotish'
                : recAvg > 0 ? 'yengil xarid moyilligi'
                : recAvg < 0 ? 'yengil sotish moyilligi' : 'neytral';
      why.push(`TradingView (4 timeframe): ${recAvg.toFixed(2)} — ${lbl}`);
    }

    /* --- 2. RSI(14, 1 soat) (kuch 2.0) --- */
    const r = ind.rsi;
    if (r != null) {
      if (r <= cfg.rsiOversold)       { s += 2.0; why.push(`RSI ${r.toFixed(0)} — ortiqcha sotilgan, qaytish kutiladi`); }
      else if (r >= cfg.rsiOverbought) { s -= 2.0; why.push(`RSI ${r.toFixed(0)} — ortiqcha xarid, qaytish kutiladi`); }
      else if (r > 55)                 { s += 0.7; }
      else if (r < 45)                 { s -= 0.7; }
    }

    /* --- 3. MACD (kuch 2.5) --- */
    if (ind.macd != null && ind.macdSignal != null) {
      const d = ind.macd - ind.macdSignal;
      const bp = (d / price) * 10000;
      if (d > 0 && bp > 0.3)       { s += 1.5; why.push('MACD (1s) > signal — bullish'); }
      else if (d < 0 && bp < -0.3) { s -= 1.5; why.push('MACD (1s) < signal — bearish'); }
      else if (d > 0)              { s += 0.5; }
      else if (d < 0)              { s -= 0.5; }
    }
    if (ind.macd15 != null && ind.macdSignal15 != null) {
      const d = ind.macd15 - ind.macdSignal15;
      if (d > 0) s += 0.5; else if (d < 0) s -= 0.5;
    }

    /* --- 4. EMA9 / EMA21 (1 soat, kuch 1.5) --- */
    if (ind.ema9 != null && ind.ema21 != null) {
      const d = ((ind.ema9 - ind.ema21) / ind.ema21) * 100;
      if (d > 0.02)       { s += 1.5; why.push('EMA9 > EMA21 — kuchli trend'); }
      else if (d < -0.02) { s -= 1.5; why.push('EMA9 < EMA21 — zaif trend'); }
    }

    /* --- 5. Narx SMA50 ga nisbatan (kuch 1.0) --- */
    if (ind.sma50 != null) {
      const d = ((price - ind.sma50) / ind.sma50) * 100;
      if (d > 0.05)       { s += 1.0; why.push('Narx SMA50 ustida — bullish'); }
      else if (d < -0.05) { s -= 1.0; why.push('Narx SMA50 ostida — bearish'); }
    }

    /* --- 6. Stochastic (1 soat, kuch 1.0) --- */
    if (ind.stochK != null) {
      if (ind.stochK < 20)       { s += 1.0; why.push(`Stoch ${ind.stochK.toFixed(0)} — past zona`); }
      else if (ind.stochK > 80)  { s -= 1.0; why.push(`Stoch ${ind.stochK.toFixed(0)} — yuqori zona`); }
    }

    /* --- 7. Bollinger bandlar (1 soat, kuch 0.8) --- */
    if (ind.bbUpper != null && ind.bbLower != null) {
      const w = ind.bbUpper - ind.bbLower;
      if (w > 0) {
        const pos = (price - ind.bbLower) / w;
        if (pos < 0.15)      { s += 0.8; why.push('Narx Bollinger past chegarasidan pastda'); }
        else if (pos > 0.85) { s -= 0.8; why.push('Narx Bollinger yuqori chegarasidan yuqorida'); }
      }
    }

    s = Math.max(-10, Math.min(10, s));

    let action = 'none';
    if (s >= cfg.buyThreshold)       action = 'BUY';
    else if (s <= cfg.sellThreshold) action = 'SELL';

    /* ATR samaradorligi tekshiruvi (ATR|240 = 4 soatlik) */
    const atr = ind.atr;
    const atrPct = (atr && price) ? (atr / price) * 100 : null;
    let viable = true, note = '';
    if (atrPct == null || atrPct < cfg.minAtrPct) { viable = false; note = 'Volatillik juda past — signal ishonchsiz'; }
    else if (atrPct > cfg.maxAtrPct)              { viable = false; note = 'Volatillik juda yuqori — xavf katta'; }
    if (!viable) action = 'none';

    return {
      score: Number(s.toFixed(2)),
      action, why, price, atr, atrPct, viable, note, rec: recAvg,
      rsi: r,
      macdHist: (ind.macd != null && ind.macdSignal != null) ? ind.macd - ind.macdSignal : null
    };
  }

  /* ==================== mahalliy hisob-kitob (zaxira) ==================== */
  function sma(v, p) {
    if (!v || v.length < p) return null;
    let s = 0; for (let i = v.length - p; i < v.length; i++) s += v[i];
    return s / p;
  }
  function emaSeries(v, p) {
    if (!v || v.length < p) return [];
    const k = 2 / (p + 1);
    const out = []; let prev = 0;
    for (let i = 0; i < p; i++) prev += v[i];
    prev /= p; out.push(prev);
    for (let i = p; i < v.length; i++) { prev = v[i] * k + prev * (1 - k); out.push(prev); }
    return out;
  }
  function ema(v, p) { const s = emaSeries(v, p); return s.length ? s[s.length - 1] : null; }

  function rsi(v, p = 14) {
    if (!v || v.length < p + 1) return null;
    let g = 0, l = 0;
    for (let i = 1; i <= p; i++) { const d = v[i] - v[i - 1]; if (d >= 0) g += d; else l -= d; }
    let ag = g / p, al = l / p;
    for (let i = p + 1; i < v.length; i++) {
      const d = v[i] - v[i - 1];
      ag = (ag * (p - 1) + (d > 0 ? d : 0)) / p;
      al = (al * (p - 1) + (d < 0 ? -d : 0)) / p;
    }
    if (al === 0) return 100;
    return 100 - 100 / (1 + ag / al);
  }

  function macd(v, fast = 12, slow = 26, sig = 9) {
    if (!v || v.length < slow + sig) return null;
    const ef = emaSeries(v, fast), es = emaSeries(v, slow);
    const off = ef.length - es.length;
    const line = [];
    for (let i = 0; i < es.length; i++) line.push(ef[i + off] - es[i]);
    const sg = emaSeries(line, sig);
    if (!sg.length) return null;
    return { macd: line[line.length - 1], signal: sg[sg.length - 1], hist: line[line.length - 1] - sg[sg.length - 1] };
  }

  function atr(candles, p = 14) {
    if (!candles || candles.length < p + 1) return null;
    const trs = [];
    for (let i = 1; i < candles.length; i++) {
      const c = candles[i], pc = candles[i - 1].close;
      trs.push(Math.max(c.high - c.low, Math.abs(c.high - pc), Math.abs(c.low - pc)));
    }
    if (trs.length < p) return null;
    let a = 0; for (let i = 0; i < p; i++) a += trs[i];
    a /= p;
    for (let i = p; i < trs.length; i++) a = (a * (p - 1) + trs[i]) / p;
    return a;
  }

  function stoch(candles, p = 14) {
    if (!candles || candles.length < p) return null;
    const seg = candles.slice(-p);
    const hi = Math.max(...seg.map(c => c.high));
    const lo = Math.min(...seg.map(c => c.low));
    if (hi === lo) return 50;
    return ((candles[candles.length - 1].close - lo) / (hi - lo)) * 100;
  }

  /** Mahalliy tarixdan signal bahosi (server indikatorlari bo'lmaganda) */
  function scoreLocal(closes, cfg) {
    if (!closes || closes.length < 35) return null;
    const price = closes[closes.length - 1];
    const r = rsi(closes, 14), m = macd(closes), e9 = ema(closes, 9), e21 = ema(closes, 21);
    if (r == null || !m || e9 == null || e21 == null) return null;

    const a = new Array(closes.length).fill(null).map((_, i) => ({ t: i, o: closes[i], h: closes[i], l: closes[i], c: closes[i] }));
    const at = atr(a, 14);
    const k = stoch(a, 14);
    if (at == null) return null;

    const why = [];
    let s = 0;
    if (e9 > e21) { s += 2; why.push('EMA9 > EMA21'); } else { s -= 2; why.push('EMA9 < EMA21'); }
    if (m.hist > 0) { s += 1.5; why.push('MACD bullish'); } else { s -= 1.5; why.push('MACD bearish'); }
    if (r < 32) { s += 2; why.push(`RSI ${r.toFixed(0)} — oversold`); }
    else if (r > 68) { s -= 2; why.push(`RSI ${r.toFixed(0)} — overbought`); }
    else if (r > 55) s += 0.7; else if (r < 45) s -= 0.7;
    if (k != null) { if (k < 20) { s += 1; why.push('Stoch past'); } else if (k > 80) { s -= 1; why.push('Stoch yuqori'); } }
    s = Math.max(-10, Math.min(10, s));
    const atrPct = (at / price) * 100;
    let action = 'none';
    if (atrPct >= cfg.minAtrPct && atrPct <= cfg.maxAtrPct) {
      if (s >= 3) action = 'BUY'; else if (s <= -3) action = 'SELL';
    }
    return { score: Number(s.toFixed(2)), action, why, price, atr: at, atrPct, rsi: r, viable: action !== 'none' };
  }

  return { scoreFromTV, scoreLocal, sma, ema, emaSeries, rsi, macd, atr, stoch };
})();