/* =============================================================
   ZA_ISLAMIC — ilova logikasi (UI)
   ============================================================= */
(() => {
'use strict';

/* ================= 0) Yordamchilar ================= */
const $  = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));

function toast(msg, type) {
  const box = $('#toasts');
  const el = document.createElement('div');
  el.className = 'toast ' + (type || '');
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, 3600);
}

function openModal(title, html) {
  $('#modalTitle').textContent = title;
  $('#modalBody').innerHTML = html;
  $('#modalOverlay').classList.add('active');
  document.body.style.overflow = 'hidden';
}
function closeModal() {
  $('#modalOverlay').classList.remove('active');
  document.body.style.overflow = '';
  $('#modalBody').innerHTML = '';
  tvWidget = null;
}
$('#modalOverlay').addEventListener('click', e => { if (e.target === this) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

window.togglePassword = function (id, btn) {
  const i = document.getElementById(id);
  if (i.type === 'password') { i.type = 'text'; btn.textContent = '🙈'; }
  else { i.type = 'password'; btn.textContent = '👁️'; }
};

/* ================= 1) Sessiya / Auth ================= */
const S = { user: null, theme: 'dark', tab: 'dashboard', chartInit: false, tvWidget: null };

function isGuest() { return !S.user || S.user.isGuest; }

function showAuthError(m) {
  const el = $('#authError'); el.textContent = m; el.classList.add('active');
  $('#authOk').classList.remove('active');
  setTimeout(() => el.classList.remove('active'), 5200);
}
function showAuthOk(m) {
  const el = $('#authOk'); el.textContent = m; el.classList.add('active');
  $('#authError').classList.remove('active');
}

function saveSession() {
  if (S.user) U.lsSet(CFG.NET.keys.session, S.user); else U.lsDel(CFG.NET.keys.session);
}

function restoreSession() {
  try {
    const s = U.lsGet(CFG.NET.keys.session, null);
    if (s && s.id) { S.user = s; closeAuth(); }
  } catch (e) { /* xato e'tiborsiz */ }
  applyAccess();
}

function closeAuth() { $('#authOverlay').classList.remove('active'); }
window.openAuth = function () { $('#authOverlay').classList.add('active'); };

/* Signal bo'limiga kirish nazorati */
function applyAccess() {
  const guest = isGuest();
  $('#signalLocked').style.display  = guest ? 'block' : 'none';
  $('#signalContent').style.display = guest ? 'none' : 'block';
  $('#signalBtn').classList.toggle('locked', guest);
  if (!guest) renderSignals();
}

$$('.auth-tab').forEach(t => t.addEventListener('click', function () {
  $$('.auth-tab').forEach(x => x.classList.remove('active'));
  $$('.auth-form').forEach(f => f.classList.remove('active'));
  this.classList.add('active');
  $('#' + this.dataset.auth + 'Form').classList.add('active');
  $('#authError').classList.remove('active');
  $('#authOk').classList.remove('active');
}));

$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const email = $('#loginEmail').value.trim();
  const password = $('#loginPassword').value;
  const btn = e.target.querySelector('.auth-btn');
  btn.disabled = true; btn.textContent = 'Tekshirilmoqda…';
  try {
    const r = await Api.login(email, password);
    S.user = Object.assign({}, r.user, { lastLogin: new Date().toISOString() });
    saveSession();
    showAuthOk('✅ Xush kelibsiz, ' + S.user.name + '!');
    setTimeout(() => { closeAuth(); applyAccess(); renderProfile(); }, 450);
    toast('Muvaffaqiyatli kirish', 'info');
    $('#loginPassword').value = '';
  } catch (err) {
    showAuthError('❌ ' + err.message);
  } finally {
    btn.disabled = false; btn.textContent = 'Kirish';
  }
});

$('#registerForm').addEventListener('submit', async e => {
  e.preventDefault();
  const name = $('#regName').value.trim();
  const email = $('#regEmail').value.trim();
  const phone = $('#regPhone').value.trim();
  const p1 = $('#regPassword').value;
  const p2 = $('#regPassword2').value;
  if (p1 !== p2) return showAuthError('❌ Parollar mos kelmadi!');
  if (p1.length < 6) return showAuthError('❌ Parol kamida 6 belgidan iborat bo\'lishi kerak!');
  const btn = e.target.querySelector('.auth-btn');
  btn.disabled = true; btn.textContent = 'Yuborilmoqda…';
  try {
    const r = await Api.register({ name, email, phone, password: p1 });
    S.user = Object.assign({}, r.user, { lastLogin: new Date().toISOString() });
    saveSession();
    showAuthOk('✅ Ro\'yxatdan o\'tdingiz, ' + S.user.name + '!');
    e.target.reset();
    setTimeout(() => { closeAuth(); applyAccess(); renderProfile(); }, 500);
    toast(r.mode === 'backend' ? 'Serverga saqlandi' : 'Mahalliy saqlandi (backend yo\'q)', 'info');
  } catch (err) {
    showAuthError('❌ ' + err.message);
  } finally {
    btn.disabled = false; btn.textContent = 'Ro\'yxatdan o\'tish';
  }
});

window.loginAsGuest = function () {
  S.user = {
    id: '#GUEST-' + Math.random().toString(36).slice(2, 6).toUpperCase(),
    name: 'Mehmon', email: 'guest@za_islamic.uz', phone: '—',
    registered: new Date().toISOString().slice(0, 10),
    tier: 'Mehmon', balance: 0, isGuest: true
  };
  saveSession(); closeAuth(); applyAccess(); renderProfile();
};

window.logoutUser = function () {
  if (!confirm('Hisobdan chiqishni xohlaysizmi?')) return;
  Api.logout();
  S.user = null; saveSession();
  $('#loginEmail').value = ''; $('#loginPassword').value = '';
  openAuth(); applyAccess(); renderProfile();
};

/* ================= 2) Tablar va mavzu ================= */
$$('.sidebar-btn').forEach(b => b.addEventListener('click', function () {
  const tab = this.dataset.tab;
  if (tab === 'signal' && isGuest()) {
    $$('.sidebar-btn').forEach(x => x.classList.remove('active'));
    $$('.tab-content').forEach(x => x.classList.remove('active'));
    this.classList.add('active');
    $('#signal').classList.add('active');
    S.tab = 'signal'; applyAccess(); return;
  }
  $$('.sidebar-btn').forEach(x => x.classList.remove('active'));
  $$('.tab-content').forEach(x => x.classList.remove('active'));
  this.classList.add('active');
  $('#' + tab).classList.add('active');
  S.tab = tab;
  if (tab === 'chart') setTimeout(initChart, 120);
  if (tab === 'profile') renderProfile();
  if (tab === 'risk') calcRisk();
}));

function setTheme(t) {
  S.theme = t;
  document.documentElement.setAttribute('data-theme', t === 'light' ? 'light' : '');
  $('#themeToggle').textContent = t === 'dark' ? '🌙' : '☀️';
  U.lsSet(CFG.NET.keys.prefs, Object.assign(U.lsGet(CFG.NET.keys.prefs, {}), { theme: t }));
  if (S.chartInit) { S.chartInit = false; $('#tvchart').innerHTML = ''; initChart(); }
}
$('#themeToggle').addEventListener('click', () => setTheme(S.theme === 'dark' ? 'light' : 'dark'));

/* ================= 3) Real vaqt holat paneli ================= */
const live = { assetsSig: '' };
function initLivebar() {
  setInterval(() => {
    $('#liveClock').textContent = new Date().toLocaleTimeString('sv-SE');
    const st = Market.status();
    const dot = $('#liveDot');
    dot.className = 'dot ' + (st.online ? 'on' : 'off');
    $('#liveState').textContent = st.online ? 'REAL VAQT' : 'Ulanish uzildi';
    $('#liveAgo').textContent = st.lastTick ? U.fmtAgo(st.lastTick) : '—';
    $('#liveCount').textContent = st.count;
    const cs = $('#cryptoSrc');
    if (cs) cs.textContent = st.mode === 'ws+http' ? 'Binance WebSocket (sub-sekund push)' : 'TradingView Scanner (5 s)';
  }, 1000);

  Market.onStatus(st => {
    const api = $('#liveApi');
    if (Api.state.online) { api.textContent = 'Server: ulangan'; api.style.color = 'var(--green)'; }
    else { api.textContent = 'Server: yo\'q (local rejim)'; api.style.color = 'var(--yellow)'; }
  });

  $('#pollSelect').addEventListener('change', function () {
    const ms = parseInt(this.value, 10);
    Market.setIntervalMs(ms);
    U.lsSet(CFG.NET.keys.prefs, Object.assign(U.lsGet(CFG.NET.keys.prefs, {}), { poll: ms }));
    toast(ms === 0 ? 'Avtomatik yangilanish to\'xtatildi' : 'Yangilanish: ' + (ms / 1000) + ' soniya', 'info');
  });
  $('#refreshBtn').addEventListener('click', () => {
    Market.refreshPrices();
    Market.refreshCandles();
    toast('Narxlar yangilanmoqda…', 'info');
  });

  const p = U.lsGet(CFG.NET.keys.prefs, {});
  if (p.poll != null) { $('#pollSelect').value = String(p.poll); Market.setIntervalMs(p.poll); }
}

/* ================= 4) Dashboard ================= */
let lastPrices = {};

function sparkline(id, w, h) {
  const hist = Market.history(id);
  if (hist.length < 2) return '';
  const v = hist.slice(-60).map(x => x[1]);
  const mn = Math.min(...v), mx = Math.max(...v), rg = (mx - mn) || 1;
  const pts = v.map((y, i) => {
    const x = (i / (v.length - 1)) * w;
    const yy = h - ((y - mn) / rg) * h;
    return x.toFixed(1) + ',' + yy.toFixed(1);
  }).join(' ');
  const up = v[v.length - 1] >= v[0];
  /* SVG presentation attribute'ida CSS o'zgaruvchilari ishlamaydi →
     aniq rang qiymatlari kerak */
  const col = up ? '#4CAF50' : '#F44336';
  const idg = 'sg' + id;
  return `<svg class="asset-item-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
    <defs><linearGradient id="${idg}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${col}" stop-opacity=".38"/><stop offset="100%" stop-color="${col}" stop-opacity="0"/>
    </linearGradient></defs>
    <polygon points="0,${h} ${pts} ${w},${h}" fill="url(#${idg})"></polygon>
    <polyline points="${pts}" fill="none" stroke="${col}" stroke-width="1.6"
      stroke-linejoin="round" stroke-linecap="round"></polyline>
  </svg>`;
}

function renderAssets() {
  const box = $('#assetSections');
  let sig = '';
  CFG.GROUPS.forEach(g => {
    sig += g.id + '|' + g.items.map(i => i.id).join(',');
  });
  if (sig !== live.assetsSig) {
    live.assetsSig = sig;
    box.innerHTML = CFG.GROUPS.map(g => `
      <div class="asset-section ${g.id}-section">
        <div class="asset-section-title" style="color:${g.color}">${g.icon} ${g.title}<span class="cnt" id="cnt-${g.id}">${g.items.length}</span></div>
        <div class="asset-list" id="list-${g.id}">
          ${g.items.map(() => '<div class="skeleton"></div>').join('')}
        </div>
      </div>`).join('');
  }

  CFG.GROUPS.forEach(g => {
    const list = $('#list-' + g.id);
    if (!list) return;
    let ok = 0;
    let html = g.items.map(it => {
      const q = Market.get(it.id);
      if (!q || !q.price) {
        return `<div class="asset-item" style="opacity:.45;cursor:default"><div><div class="asset-item-name">${it.name}</div><div class="asset-item-change">kutilmoqda…</div></div><div class="asset-item-price">—</div></div>`;
      }
      ok++;
      const chg = q.chg == null ? 0 : q.chg;
      const cls = chg > 0.0001 ? 'positive' : (chg < -0.0001 ? 'negative' : 'neutral');
      const arrow = chg > 0.0001 ? '▲' : (chg < -0.0001 ? '▼' : '▬');
      const prev = lastPrices[it.id];
      const flash = (prev != null && q.price > prev) ? 'flash-up' : (prev != null && q.price < prev ? 'flash-down' : '');
      return `<div class="asset-item ${flash}" data-asset="${it.id}" title="${it.name} — bosing">
        <div style="min-width:0">
          <div class="asset-item-name">${it.name}</div>
          <div class="asset-item-change ${cls}">${arrow} ${Math.abs(chg).toFixed(2)}%${q.stale ? ' <span style="opacity:.7">(kesh)</span>' : ''}</div>
        </div>
        ${sparkline(it.id, 74, 26)}
        <div class="asset-item-price">${U.fmtPrice(it.id, q.price)}</div>
      </div>`;
    }).join('');
    list.innerHTML = html;
    const c = $('#cnt-' + g.id);
    if (c) c.textContent = `${ok}/${g.items.length}`;
  });

  /* eski narxlarni eslab qolish (flash uchun) */
  const q = Market.all();
  Object.keys(q).forEach(k => { lastPrices[k] = q[k].price; });
}

document.addEventListener('click', e => {
  const row = e.target.closest('.asset-item[data-asset]');
  if (row) openAsset(row.dataset.asset);
});

function openAsset(id) {
  const it = U.byId[id];
  if (!it) return;
  const q = Market.get(id);
  const p = q ? q.price : null;
  const chg = q && q.chg != null ? q.chg : 0;
  const cls = chg > 0 ? 'var(--green)' : (chg < 0 ? 'var(--red)' : 'var(--text-dim)');
  const sc = Signals.analyse(it);
  const verdictText = sc ? (sc.action === 'none' ? 'Kutish 😐' : sc.action) : '—';
  const verdictColor = !sc || sc.action === 'none' ? 'var(--text-dim)' : (sc.action === 'BUY' ? 'var(--green)' : 'var(--red)');

  const tv = it.tv;
  const ind = Market.indicators(id) || {};
  const fmtI = (v, d) => v == null ? '—' : Number(v).toFixed(d == null ? 2 : d);

  const html = `
    <div class="live-big">
      <div class="px" id="modalPx">${U.fmtPrice(id, p)}</div>
      <div class="ch" style="color:${cls}" id="modalCh">${chg > 0 ? '▲' : (chg < 0 ? '▼' : '▬')} ${Math.abs(chg).toFixed(2)}% (24 soat)</div>
    </div>
    <div id="modalChart"></div>
    <div class="modal-info">
      <div class="modal-info-row"><span class="modal-info-label">Aktiv:</span><span class="modal-info-value">${it.name}</span></div>
      <div class="modal-info-row"><span class="modal-info-label">Kategoriya:</span><span class="modal-info-value">${it.groupTitle}</span></div>
      <div class="modal-info-row"><span class="modal-info-label">Manba:</span><span class="modal-info-value">${q ? q.source : '—'}</span></div>
      <div class="modal-info-row"><span class="modal-info-label">Kunlik o'zgarish:</span><span class="modal-info-value" style="color:${cls}">${U.fmtPct(chg, true)}</span></div>
      <div class="modal-info-row"><span class="modal-info-label">Kunlik diapazon:</span><span class="modal-info-value">${U.fmtPrice(id, q ? q.low : null)} — ${U.fmtPrice(id, q ? q.high : null)}</span></div>
      <div class="modal-info-row"><span class="modal-info-label">Yangilangan:</span><span class="modal-info-value" id="modalTs">${q ? U.fmtAgo(q.ts) : '—'}</span></div>
    </div>

    <div class="modal-info">
      <div class="modal-info-row"><span class="modal-info-label">📊 Texnik tavsiya:</span>
        <span class="modal-info-value" style="color:${verdictColor}">${verdictText}${sc ? ' (' + (sc.score > 0 ? '+' : '') + sc.score + ')' : ''}</span></div>
      <div class="modal-info-row"><span class="modal-info-label">RSI(14 · 1 soat):</span><span class="modal-info-value">${fmtI(ind.rsi, 1)}</span></div>
      <div class="modal-info-row"><span class="modal-info-label">ATR(14 · 4 soat):</span><span class="modal-info-value">${sc && sc.atr ? U.fmtPrice(id, sc.atr) + (sc.atrPct != null ? ' (' + sc.atrPct.toFixed(2) + '%)' : '') : '—'}</span></div>
      <div class="modal-info-row"><span class="modal-info-label">MACD (1 soat):</span><span class="modal-info-value">${ind.macd != null ? fmtI(ind.macd, it.dig + 1) : '—'} / signal ${ind.macdSignal != null ? fmtI(ind.macdSignal, it.dig + 1) : '—'} ${ind.macd != null && ind.macdSignal != null ? (ind.macd > ind.macdSignal ? '<span style="color:var(--green)">▲</span>' : '<span style="color:var(--red)">▼</span>') : ''}</span></div>
      <div class="modal-info-row"><span class="modal-info-label">EMA9 / EMA21:</span><span class="modal-info-value">${ind.ema9 != null ? U.fmtPrice(id, ind.ema9) : '—'} / ${ind.ema21 != null ? U.fmtPrice(id, ind.ema21) : '—'}</span></div>
      <div class="modal-info-row"><span class="modal-info-label">SMA(50):</span><span class="modal-info-value">${ind.sma50 != null ? U.fmtPrice(id, ind.sma50) : '—'}</span></div>
      <div class="modal-info-row"><span class="modal-info-label">Stochastic %K/%D:</span><span class="modal-info-value">${ind.stochK != null ? fmtI(ind.stochK, 1) : '—'} / ${ind.stochD != null ? fmtI(ind.stochD, 1) : '—'}</span></div>
      <div class="modal-info-row"><span class="modal-info-label">Bollinger:</span><span class="modal-info-value">${ind.bbLower != null ? U.fmtPrice(id, ind.bbLower) : '—'} — ${ind.bbUpper != null ? U.fmtPrice(id, ind.bbUpper) : '—'}</span></div>
    </div>

    ${sc && sc.why.length ? `<div class="modal-desc"><b>📊 Tahlil sabablari:</b><br>${sc.why.map(w => '• ' + U.esc(w)).join('<br>')}</div>` : ''}
    ${sc && sc.note ? `<div class="warn-box">⚠️ ${U.esc(sc.note)}</div>` : ''}
    <div style="text-align:center;margin-top:14px">
      <button class="btn sm" onclick="addSignalPrefill('${id}')">➕ Bu aktivga signal qo'shish</button>
    </div>`;

  openModal(it.name, html);
  setTimeout(() => initModalChart(tv), 200);

  /* modal ichida narxni jonli yangilash */
  const iv = setInterval(() => {
    if (!$('#modalOverlay').classList.contains('active')) { clearInterval(iv); return; }
    const qq = Market.get(id);
    if (!qq) return;
    const px = $('#modalPx');
    if (px) {
      px.textContent = U.fmtPrice(id, qq.price);
      px.classList.remove('flash-up', 'flash-down');
      void px.offsetWidth;
      px.classList.add(qq.dir === 'up' ? 'flash-up' : (qq.dir === 'down' ? 'flash-down' : ''));
    }
    const ts = $('#modalTs'); if (ts) ts.textContent = U.fmtAgo(qq.ts);
  }, 3000);
}

/* ================= 5) Signallar ================= */
let sigFilter = 'all';
let lastSigHtml = '';

function statusText(st) {
  return { active: '🟡 Faol', tp: '✅ TP', sl: '❌ SL', pending: '🔵 Kutilmoqda', expired: '⚪ Muddati tugadi' }[st] || st;
}
function sourceTag(s) {
  if (s.source === 'auto') return '<span class="tag tag-auto">Avtomatik</span>';
  if (s.source === 'mine' || s.source === 'user') return '<span class="tag tag-mine">Sizniki</span>';
  return '<span class="tag tag-manual">Qo\'lda</span>';
}

function renderSignals() {
  const list = $('#signalList');
  if (!list || isGuest()) return;
  const all = Signals.all();
  const st = Signals.stats();

  $('#statTotal').textContent   = st.total;
  $('#statActive').textContent  = st.active;
  $('#statPending').textContent = st.pending;
  $('#statTP').textContent      = st.tp;
  $('#statSL').textContent      = st.sl;
  const badge = $('#signalBadge');
  badge.textContent = st.active;
  badge.style.display = st.active > 0 ? 'block' : 'none';

  let f = all;
  if (sigFilter === 'all') f = all;
  else if (sigFilter === 'buy') f = all.filter(s => s.type === 'BUY');
  else if (sigFilter === 'sell') f = all.filter(s => s.type === 'SELL');
  else if (sigFilter === 'auto') f = all.filter(s => s.source === 'auto');
  else f = all.filter(s => s.status === sigFilter);

  if (!f.length) {
    list.innerHTML = `<div class="empty"><div class="empty-icon">📭</div><div class="empty-title">Bu filtrda signal yo'q</div>
      <div class="empty-desc">Avtomatik signal generator har 30 sekundda bozorni tekshiradi.<br>Qo'lda signal qo'shish uchun yuqoridagi tugmani bosing.</div></div>`;
    return;
  }

  const html = f.map(s => {
    const tc = s.type === 'BUY' ? 'buy' : 'sell';
    const pnlCls = s.pnl > 0 ? 'good' : (s.pnl < 0 ? 'bad' : '');
    const pnlTxt = s.pnl ? U.fmtPrice(s.instrument, s.pnl) : '—';
    const dist = [];
    if (s.status === 'active' && s.tp) dist.push(`<span class="pill good">TP gacha ${s.distTP > 0 ? s.distTP.toFixed(2) : '0.00'}%</span>`);
    if (s.status === 'active' && s.sl) dist.push(`<span class="pill bad">SL gacha ${s.distSL > 0 ? s.distSL.toFixed(2) : '0.00'}%</span>`);
    const cardCls = s.status === 'active' ? 'active-signal' : tc;
    const scoreBar = s.score != null ? `<div class="score-bar"><i style="width:${U.clamp(Math.abs(s.score) * 10, 4, 100)}%"></i></div>` : '';
    return `<div class="signal-card ${cardCls}" onclick="openSignalDetail('${s.id}')">
      <div class="signal-header">
        <div class="signal-pair">${U.esc(s.pair)} ${sourceTag(s)}</div>
        <div><span class="signal-type ${tc}">${s.type}</span></div>
      </div>
      <div class="signal-details">
        <div class="signal-detail"><div class="signal-detail-label">Entry</div><div class="signal-detail-value">${s.entry != null ? U.fmtPrice(s.instrument, s.entry) : '—'}</div></div>
        <div class="signal-detail"><div class="signal-detail-label">Joriy</div><div class="signal-detail-value live">${s.price ? U.fmtPrice(s.instrument, s.price) : '—'}</div></div>
        <div class="signal-detail"><div class="signal-detail-label">Stop Loss</div><div class="signal-detail-value" style="color:var(--red)">${s.sl != null ? U.fmtPrice(s.instrument, s.sl) : '—'}</div></div>
        <div class="signal-detail"><div class="signal-detail-label">Take Profit</div><div class="signal-detail-value" style="color:var(--green)">${s.tp != null ? U.fmtPrice(s.instrument, s.tp) : '—'}</div></div>
      </div>
      ${scoreBar}
      <div class="pnl-row">
        <span class="pill ${pnlCls}">📈 P/L: ${pnlTxt}${s.pnlPct ? ' (' + U.fmtPct(s.pnlPct, true) + ')' : ''}</span>
        ${dist.join('')}
      </div>
      <div class="signal-meta">
        <span>🕐 ${U.fmtTime(s.time)} ${s.score != null ? '· baho ' + s.score : ''}</span>
        <span class="signal-status ${s.status}">${statusText(s.status)}</span>
      </div>
    </div>`;
  }).join('');

  if (html !== lastSigHtml) { list.innerHTML = html; lastSigHtml = html; }
  $('#signalUpdated').textContent = '— ' + all.length + ' ta signal, ' + (st.active) + ' ta faol';
}

$$('.signal-filter').forEach(b => b.addEventListener('click', function () {
  $$('.signal-filter').forEach(x => x.classList.remove('active'));
  this.classList.add('active');
  sigFilter = this.dataset.filter;
  renderSignals();
}));

window.openSignalDetail = function (id) {
  const s = Signals.all().find(x => x.id === id);
  if (!s) return;
  const isBuy = s.type === 'BUY';
  const tv = s.tvSymbol || (U.byId[s.instrument] ? U.byId[s.instrument].tv : s.instrument);
  const body = `
    <div class="live-big">
      <div class="px" style="color:${isBuy ? 'var(--green)' : 'var(--red)'}">${isBuy ? '▲ BUY' : '▼ SELL'} ${U.esc(s.pair)}</div>
      <div class="ch" style="color:var(--text-dim);font-weight:normal">${statusText(s.status)} · ${U.fmtTime(s.time)}</div>
    </div>
    <div id="modalChart"></div>
    <div class="signal-detail-grid">
      <div class="signal-detail-item"><div class="signal-detail-label">Entry narxi</div><div class="signal-detail-value">${U.fmtPrice(s.instrument, s.entry)}</div></div>
      <div class="signal-detail-item"><div class="signal-detail-label">Joriy narx</div><div class="signal-detail-value" style="color:var(--blue)" id="sdPx">${s.price ? U.fmtPrice(s.instrument, s.price) : '—'}</div></div>
      <div class="signal-detail-item"><div class="signal-detail-label">Stop Loss</div><div class="signal-detail-value" style="color:var(--red)">${U.fmtPrice(s.instrument, s.sl)}</div></div>
      <div class="signal-detail-item"><div class="signal-detail-label">Take Profit</div><div class="signal-detail-value" style="color:var(--green)">${U.fmtPrice(s.instrument, s.tp)}</div></div>
    </div>
    <div class="modal-info">
      <div class="modal-info-row"><span class="modal-info-label">P/L (hozir):</span><span class="modal-info-value" style="color:${s.pnl >= 0 ? 'var(--green)' : 'var(--red)'}" id="sdPnl">${U.fmtPrice(s.instrument, s.pnl)} (${U.fmtPct(s.pnlPct, true)})</span></div>
      <div class="modal-info-row"><span class="modal-info-label">TP gacha:</span><span class="modal-info-value">${s.tp ? s.distTP.toFixed(2) + '%' : '—'}</span></div>
      <div class="modal-info-row"><span class="modal-info-label">SL gacha:</span><span class="modal-info-value">${s.sl ? s.distSL.toFixed(2) + '%' : '—'}</span></div>
      ${s.score != null ? `<div class="modal-info-row"><span class="modal-info-label">Texnik baho:</span><span class="modal-info-value">${s.score}</span></div>` : ''}
      <div class="modal-info-row"><span class="modal-info-label">Manba:</span><span class="modal-info-value">${s.source === 'auto' ? 'Algoritmik' : (s.source === 'mine' ? 'Sizning' : 'Qo\'lda kiritilgan')}</span></div>
    </div>
    ${s.why && s.why.length ? `<div class="modal-desc"><b>📊 Nima uchun?</b><br>${s.why.map(w => '• ' + U.esc(w)).join('<br>')}</div>`
      : (s.note ? `<div class="modal-desc"><b>📝 Izoh:</b><br>${U.esc(s.note)}</div>` : '')}
    <div style="display:flex;gap:8px;justify-content:center;margin-top:14px;flex-wrap:wrap">
      <button class="btn sm secondary" onclick="closeModal()">Yopish</button>
      ${(s.source === 'mine') ? `<button class="btn sm danger" onclick="removeSignal('${s.id}')">🗑️ O'chirish</button>` : ''}
    </div>`;
  openModal(`${s.pair} — ${s.type} Signal`, body);
  setTimeout(() => initModalChart(tv), 200);

  const iv = setInterval(() => {
    if (!$('#modalOverlay').classList.contains('active')) { clearInterval(iv); return; }
    const f = Signals.all().find(x => x.id === id);
    if (!f) return;
    const px = $('#sdPx'); if (px && f.price) px.textContent = U.fmtPrice(s.instrument, f.price);
    const pl = $('#sdPnl');
    if (pl) { pl.textContent = `${U.fmtPrice(s.instrument, f.pnl)} (${U.fmtPct(f.pnlPct, true)})`; pl.style.color = f.pnl >= 0 ? 'var(--green)' : 'var(--red)'; }
  }, 2500);
};

window.removeSignal = function (id) {
  if (Signals.remove(id)) { toast('Signal o\'chirildi', 'info'); closeModal(); }
};

window.addSignalPrefill = function (instrument) {
  closeModal();
  setTimeout(() => showAddSignal(instrument), 120);
};

function showAddSignal(preset) {
  if (isGuest()) { toast('Signal qo\'shish uchun ro\'yxatdan o\'ting', 'warn'); openAuth(); return; }
  const opts = CFG.GROUPS.map(g => `<optgroup label="${g.title}">` +
    g.items.map(i => `<option value="${i.id}" ${preset === i.id ? 'selected' : ''}>${i.name}</option>`).join('') +
    '</optgroup>').join('');

  const body = `
    <div class="info-box">Signal qo'shsangiz, uning holati (TP/SL) joriy narx bo'yicha <b>har 5 sekundda</b> avtomatik tekshiriladi.</div>
    <div class="risk-grid">
      <div><label>Aktiv:</label><select id="as-inst">${opts}</select></div>
      <div><label>Yo'nalish:</label><select id="as-type"><option value="BUY">🟢 BUY (narx ko'tariladi)</option><option value="SELL">🔴 SELL (narx tushadi)</option></select></div>
    </div>
    <div class="risk-grid">
      <div><label>Entry narxi:</label><input id="as-entry" type="number" step="any" placeholder="Joriy narx"></div>
      <div><label>Stop Loss:</label><input id="as-sl" type="number" step="any" placeholder="SL narxi"></div>
    </div>
    <div class="risk-grid">
      <div><label>Take Profit:</label><input id="as-tp" type="number" step="any" placeholder="TP narxi"></div>
      <div><label>Boshlang'ich holat:</label><select id="as-status"><option value="active" selected>Faol (joriy narxdan kuzatish)</option><option value="pending">Kutilmoqda (Entry narxi kelishini kutadi)</option></select></div>
    </div>
    <label>Izoh:</label>
    <input id="as-note" type="text" placeholder="Qisqa izoh (ixtiyoriy)">
    <div id="as-hint" class="hint">—</div>
    <div style="text-align:center;margin-top:14px">
      <button class="btn" id="as-save">💾 Signalni saqlash</button>
      <button class="btn secondary" onclick="closeModal()">Bekor qilish</button>
    </div>`;

  openModal('➕ Yangi signal qo\'shish', body);

  function upd() {
    const id = $('#as-inst').value;
    const q = Market.price(id);
    const it = U.byId[id];
    if (!$('#as-entry').value && q != null) $('#as-entry').value = q;
    const e = parseFloat($('#as-entry').value), sl = parseFloat($('#as-sl').value), tp = parseFloat($('#as-tp').value);
    let t = `${it ? it.name : id} · 1 pip = ${it ? it.pip : '?'}`;
    if (e && sl) t += ` · SL masofa ${Math.abs(e - sl)}`;
    if (e && tp) t += ` · TP masofa ${Math.abs(e - tp)}`;
    if (e && sl && tp) {
      const risk = Math.abs(e - sl), rew = Math.abs(e - tp);
      const rr = risk ? rew / risk : 0;
      t += ` · Risk/Reward 1:${rr.toFixed(2)}` + (rr >= 2 ? ' ✅' : ' ⚠️');
    }
    $('#as-hint').textContent = t;
  }
  ['#as-inst', '#as-type', '#as-entry', '#as-sl', '#as-tp'].forEach(sel => {
    const el = $(sel); if (el) el.addEventListener('input', upd);
  });
  upd();

  $('#as-save').addEventListener('click', () => {
    const o = {
      instrument: $('#as-inst').value,
      type: $('#as-type').value,
      entry: parseFloat($('#as-entry').value),
      sl: parseFloat($('#as-sl').value),
      tp: parseFloat($('#as-tp').value),
      status: $('#as-status').value,
      note: $('#as-note').value || '',
      source: 'mine'
    };
    if (!o.instrument || !o.entry) return toast('Aktiv va Entry narxini kiriting', 'err');
    if (o.sl != null && o.tp != null) {
      const bad = (o.type === 'BUY' && (o.sl >= o.entry || o.tp <= o.entry)) ||
                  (o.type === 'SELL' && (o.sl <= o.entry || o.tp >= o.entry));
      if (bad) return toast('SL/TP BUY uchun: SL < Entry < TP bo\'lishi kerak', 'err');
    }
    Signals.add(o);
    toast('Signal qo\'shildi ✅', '');
    closeModal();
  });
}
$('#addSignalBtn').addEventListener('click', () => showAddSignal());
$('#rescanBtn').addEventListener('click', () => {
  toast('Bozor tahlil qilinmoqda…', 'info');
  setTimeout(() => {
    const n = Signals.scanAuto();
    toast(n ? `${n} ta yangi avtomatik signal topildi` : 'Hozircha kuchli signal yo\'q', n ? '' : 'warn');
    renderSignals();
  }, 400);
});

/* ================= 6) Grafik ================= */
function fillChartSelects() {
  const sel = $('#chart-symbol');
  sel.innerHTML = CFG.GROUPS.map(g =>
    `<optgroup label="${g.icon} ${g.title}">` +
    g.items.map(i => `<option value="${i.tv}">${i.name}</option>`).join('') +
    '</optgroup>').join('');
  const p = U.lsGet(CFG.NET.keys.prefs, {});
  if (p.symbol) sel.value = p.symbol;
  if (p.interval) $('#chart-interval').value = p.interval;
}

function initChart() {
  if (S.chartInit) return;
  const symbol = $('#chart-symbol').value;
  const interval = $('#chart-interval').value;
  $('#tvchart').innerHTML = '';
  S.tvWidget = new TradingView.widget({
    container_id: 'tvchart', autosize: true, symbol, interval,
    timezone: CFG.TZ, theme: S.theme === 'dark' ? 'dark' : 'light',
    style: '1', locale: 'uz', toolbar_bg: '#f1f3f6',
    enable_publishing: false, hide_side_toolbar: false,
    allow_symbol_change: true, details: true, withdateranges: true,
    save_image: true, hotlist: false,
    studies: ['MASimple@tv-basicstudies', 'RSI@tv-basicstudies', 'MACD@tv-basicstudies']
  });
  S.chartInit = true;
  U.lsSet(CFG.NET.keys.prefs, Object.assign(U.lsGet(CFG.NET.keys.prefs, {}), { symbol, interval }));
}

function initModalChart(symbol) {
  const box = document.getElementById('modalChart');
  if (!box || typeof TradingView === 'undefined') return;
  const id = 'modal_chart_' + Math.random().toString(36).slice(2, 8);
  box.id = id;
  new TradingView.widget({
    container_id: id, autosize: true, symbol,
    interval: '5', timezone: CFG.TZ,
    theme: S.theme === 'dark' ? 'dark' : 'light',
    style: '1', locale: 'uz', hide_side_toolbar: true,
    allow_symbol_change: false, save_image: false, withdateranges: true
  });
}

$('#chart-symbol').addEventListener('change', () => { S.chartInit = false; initChart(); });
$('#chart-interval').addEventListener('change', () => { S.chartInit = false; initChart(); });
$('#fullscreenBtn').addEventListener('click', () => {
  const el = $('#chartContainer');
  if (!document.fullscreenElement) {
    (el.requestFullscreen || el.webkitRequestFullscreen || function () {}).call(el);
  } else { (document.exitFullscreen || document.webkitExitFullscreen || function () {}).call(document); }
});

/* ================= 7) Risk kalkulyator ================= */
const FX_GROUPS = ['forex', 'metal'];

function isFx(id) { const it = U.byId[id]; return it ? FX_GROUPS.includes(it.group) : /^[A-Z]{6}$/.test(id); }

/** 1 birlik asosiy valyutaning 1 USD qiymati */
function quoteToUSD(id) {
  const q = Market.all();
  const get = k => (q[k] ? q[k].price : null);
  if (/JPY$/.test(id)) { const r = get('USDJPY'); return r ? 1 / r : 0.011; }
  if (/^GBP/.test(id)) { const r = get('GBPUSD'); return r || 1.27; }
  if (/^AUD/.test(id)) { const r = get('AUDUSD'); return r || 0.66; }
  if (/^NZD/.test(id)) { const r = get('NZDUSD'); return r || 0.61; }
  if (/^CAD/.test(id)) { const r = get('USDCAD'); return r ? 1 / r : 0.73; }
  if (/^CHF/.test(id)) { const r = get('USDCHF'); return r ? 1 / r : 1.12; }
  return 1;
}

function detectSymbol() {
  const raw = ($('#rc-symbol').value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  let id = raw, it = U.byId[raw];
  if (!it) {
    const hit = Object.keys(U.byId).find(k => U.byId[k].name.replace('/', '') === raw || k === raw);
    if (hit) { id = hit; it = U.byId[hit]; }
  }
  const info = $('#rc-symbol-info');
  if (it) {
    info.innerHTML = `Aktiv turi: <b>${it.groupTitle}</b> · Manba: <b>${it.source}</b>` + (isFx(id) ? ` · 1 lot = <b>${it.group === 'metal' ? '100 oz' : '100 000'}</b>` : ' · 1 birlik = 1 dona');
  } else {
    info.innerHTML = `Aktiv topilmadi — <b>${U.esc(raw) || '—'}</b>. Ro'yxatdan: ${Object.keys(U.byId).slice(0, 6).join(', ')}…`;
  }
  const fx = isFx(id);
  $('#rc-sl-label').textContent = fx ? 'Masofa (pips)' : 'Masofa (punkt)';
  $('#rc-tp-label').textContent = fx ? 'Masofa (pips)' : 'Masofa (punkt)';
  $('#rc-size-label').textContent = fx ? 'Lot hajmi:' : 'Miqdoriyat (dona):';
  $('#rc-size-preset').style.display = fx ? '' : 'none';
  $('#rc-size').style.display = fx ? 'none' : '';
  calcRisk();
}

function calcRisk() {
  const raw = ($('#rc-symbol').value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const id = U.byId[raw] ? raw : (Object.keys(U.byId).find(k => U.byId[k].name.replace('/', '') === raw) || raw);
  const it = U.byId[id];
  const fx = isFx(id);
  const box = $('#rc-result');
  if (!it) { box.innerHTML = '<div class="loading">Aktivni tanlang…</div>'; return; }

  const balance = parseFloat($('#rc-balance').value) || 0;
  const riskPct = parseFloat($('#rc-risk').value) || 1;
  $('#rc-risk-label').textContent = riskPct.toFixed(1) + '%';

  const size = fx ? parseFloat($('#rc-size-preset').value === 'custom' ? $('#rc-size').value : $('#rc-size-preset').value)
                  : parseFloat($('#rc-size').value) || 0;
  const slDist = parseFloat($('#rc-sl').value) || 0;
  const tpDist = parseFloat($('#rc-tp').value) || 0;
  const price = Market.price(id);

  /* 1 pip/1 punkt = qancha dollar */
  let pipValue;      /* 1 pip/1 punkt = $ (pozitsiya birligi uchun) */
  let units;         /* pozitsiya hajmi */
  if (fx) {
    const contract = it.group === 'metal' ? 100 : 100000;
    units = size * contract;
    pipValue = it.pip * contract * quoteToUSD(id);   /* 1 lot uchun $ */
  } else {
    units = size;
    pipValue = 1;                                    /* 1 punkt = $1 / dona */
  }

  const riskUsd = slDist * pipValue;
  const rewardUsd = tpDist * pipValue;
  const rr = riskUsd ? rewardUsd / riskUsd : 0;
  const riskMoney = balance * riskPct / 100;

  let verdict, vcolor;
  if (riskUsd <= 0) { verdict = 'SL masofasini kiriting'; vcolor = 'var(--text-dim)'; }
  else if (riskUsd > riskMoney * 1.05 && riskMoney > 0) { verdict = `⚠️ Xavf ${U.fmtPct(riskUsd / balance * 100, true)} — juda ko'p! Kamaytiring.`; vcolor = 'var(--red)'; }
  else if (riskUsd > riskMoney) { verdict = '⚠️ Tanlangan risk chegaradan biroz katta'; vcolor = 'var(--yellow)'; }
  else if (rr < 1.5) { verdict = '⚠️ Risk/Reward past — kamida 1:2 bo\'lishi kerak'; vcolor = 'var(--yellow)'; }
  else if (rr >= 2 && riskPct <= 2) { verdict = '✅ Yaxshi sozlama — xavf nazoratda'; vcolor = 'var(--green)'; }
  else { verdict = 'ℹ️ Yaxshi, lekin Risk/Reward 1:2+ ga yetkiring'; vcolor = 'var(--blue)'; }

  const maxSize = pipValue > 0 ? riskMoney / pipValue : 0;
  const fmtLots = function (lots) {
    if (lots >= 1) return lots.toFixed(2) + ' lot';
    if (lots >= 0.01) return lots.toFixed(4) + ' lot';
    if (lots > 0) return (lots * 100000).toFixed(2) + ' birlik';
    return '0';
  };

  box.innerHTML = `
    <div class="risk-verdict" style="color:${vcolor}">${U.esc(verdict)}</div>
    <div class="result-row"><span>💵 Joriy narx:</span><span>${price ? U.fmtPrice(id, price) : 'kutilmoqda…'}</span></div>
    <div class="result-row"><span>📐 Pozitsiya hajmi:</span><span>${fx ? size + ' lot' : size.toLocaleString('ru-RU') + ' dona'}${units ? ' (' + units.toLocaleString('ru-RU') + ' birlik)' : ''}</span></div>
    <div class="result-row"><span>📏 1 ${fx ? 'pip' : 'punkt'} qiymati:</span><span>$${pipValue.toFixed(pipValue < 1 ? 6 : 2)}</span></div>
    <div class="result-row"><span>🔴 Xavf (SL):</span><span style="color:${riskUsd > riskMoney ? 'var(--red)' : 'var(--green)'}">$${riskUsd.toFixed(2)} (${balance ? (riskUsd / balance * 100).toFixed(2) : '0.00'}%)</span></div>
    <div class="result-row"><span>🟢 Foyda (TP):</span><span>$${rewardUsd.toFixed(2)}${balance ? ' (' + (rewardUsd / balance * 100).toFixed(2) + '%)' : ''}</span></div>
    <div class="result-row" style="border-top:1px solid var(--border);margin-top:6px;padding-top:6px">
      <span>⚖️ Risk/Reward:</span><span>1 : ${rr.toFixed(2)}</span></div>
    <div class="result-row"><span>🛡️ Xavfsiz chegara:</span><span>$${riskMoney.toFixed(2)} (${riskPct.toFixed(1)}%)</span></div>
    <div class="result-row"><span>🎯 Tavsiya etilgan hajm:</span><span>${fx ? fmtLots(maxSize / (it.group === 'metal' ? 100 : 100000)) : maxSize.toFixed(2) + ' dona'}</span></div>`;

  $('#rc-convert').textContent = price && fx
    ? `${slDist} pip = ${(slDist * it.pip).toFixed(it.digits)} narx · ${tpDist} pip = ${(tpDist * it.pip).toFixed(it.digits)} narx (joriy ${U.fmtPrice(id, price)})`
    : (price ? `${slDist} punkt = $${slDist} / 1 dona · ${tpDist} punkt = $${tpDist} / 1 dona` : 'Narx kutilmoqda…');

  const live = $('#riskLivePrice');
  if (live && price) {
    const q = Market.get(id);
    const cl = q.chg > 0 ? 'var(--green)' : (q.chg < 0 ? 'var(--red)' : 'var(--text-dim)');
    live.innerHTML = `📡 <b>${it.name}</b> — <b style="color:${cl}">${U.fmtPrice(id, price)}</b> (${U.fmtPct(q.chg, true)}) · yangilangan ${U.fmtAgo(q.ts)}`;
  }
}

['#rc-symbol', '#rc-balance', '#rc-sl', '#rc-tp', '#rc-size'].forEach(s => {
  const el = $(s); if (el) el.addEventListener('input', () => { detectSymbol(); });
});
$('#rc-risk').addEventListener('input', calcRisk);
$('#rc-size-preset').addEventListener('change', function () {
  const custom = this.value === 'custom';
  $('#rc-size').style.display = custom ? '' : 'none';
  if (custom) $('#rc-size').focus();
  calcRisk();
});

/* ================= 8) Kalendar ================= */
let calFilter = 'all';
let lastCalHtml = '';

function renderCalendar() {
  const items = Calendar.items();
  const info = Calendar.info();
  $('#calMeta').textContent = info.n
    ? `— ${info.n} ta voqea · ${info.source} · yangilangan ${U.fmtAgo(info.ts)}`
    : (info.err ? '— manba topilmadi' : '— yuklanmoqda…');
  const src = $('#calSource');
  if (src) src.textContent = info.source !== '—' ? info.source : 'ForexFactory';

  let f = items.slice();
  const q = ($('#calSearch').value || '').toLowerCase().trim();
  const now = Date.now();

  if (calFilter === 'high') f = f.filter(x => x.impact === 3);
  else if (calFilter === 'medium') f = f.filter(x => x.impact === 2);
  else if (calFilter === 'low') f = f.filter(x => x.impact === 1);
  else if (calFilter === 'upcoming') f = f.filter(x => x.ts > now);

  /* "Barchasi" rejimida kelgusi voqealar birinchi, keyin o'tganlar (teskari tartibda) */
  if (calFilter === 'all') {
    f = f.filter(x => x.ts >= now).sort((a, b) => a.ts - b.ts)
        .concat(f.filter(x => x.ts < now).sort((a, b) => b.ts - a.ts));
  }

  if (q) f = f.filter(x =>
    x.title.toLowerCase().includes(q) || x.currency.toLowerCase().includes(q) ||
    (x.currency + ' ' + x.title).toLowerCase().includes(q));

  if (!f.length) {
    $('#newsList').innerHTML = `<div class="empty"><div class="empty-icon">📭</div>
      <div class="empty-title">Hech narsa topilmadi</div>
      <div class="empty-desc">Boshqa filtrni tanlang yoki kalendar qayta yuklanmoqda.</div></div>`;
    return;
  }

  const html = f.map(x => {
    const past = x.ts < now;
    const mins = Math.round((x.ts - now) / 60000);
    let cd = '';
    if (!past) {
      if (mins < 60) cd = `⏳ ${mins} daqiqa`;
      else if (mins < 1440) cd = `⏳ ${Math.floor(mins / 60)} soat ${mins % 60} daq`;
      else cd = `📅 ${Math.floor(mins / 1440)} kundan keyin`;
    } else cd = '✅ o\'tgan';
    const stars = x.impact === 3 ? '★★★' : (x.impact === 2 ? '★★☆' : '★☆☆');
    return `<div class="news-card impact-${x.impact} ${past ? 'past' : ''}">
      <div class="news-card-header">
        <div class="news-datetime">
          <span class="news-date-badge">📅 ${x.date}</span>
          <span class="news-time-badge">🕐 ${x.time}</span>
          <span class="countdown">${cd}</span>
        </div>
        <div class="news-impact-stars" style="color:${x.impact === 3 ? '#F44336' : (x.impact === 2 ? '#FFC107' : '#FFA726')}">${stars}</div>
      </div>
      <div class="news-card-body">
        <div class="news-currency-circle cur-${x.currency === 'ALL' ? 'ALL' : x.currency}">${x.currency}<span class="fl">${x.flag}</span></div>
        <div class="news-content">
          <div class="news-event-name">${U.esc(x.title)}</div>
          <div class="news-event-desc">${x.currency} · ${x.impactText} ta'sir</div>
        </div>
      </div>
      <div class="news-card-footer">
        <span>📊 Prognoz: <span class="news-forecast-badge">${U.esc(x.forecast)}</span>
          ${x.previous && x.previous !== '—' ? ` · Oldingi: <b>${U.esc(x.previous)}</b>` : ''}</span>
        <a href="${x.link}" target="_blank" rel="noopener" style="color:var(--blue);text-decoration:none">Batafsil →</a>
      </div>
    </div>`;
  }).join('');

  if (html !== lastCalHtml) { $('#newsList').innerHTML = html; lastCalHtml = html; }
}

$$('.news-filter').forEach(b => b.addEventListener('click', function () {
  $$('.news-filter').forEach(x => x.classList.remove('active'));
  this.classList.add('active');
  calFilter = this.dataset.cfilter;
  renderCalendar();
}));
$('#calSearch').addEventListener('input', renderCalendar);
$('#calRefresh').addEventListener('click', () => { Calendar.load(true); toast('Kalendar yangilanmoqda…', 'info'); });

/* ================= 9) Profil ================= */
function renderProfile() {
  const u = S.user;
  const initials = u && u.name ? u.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : 'ZI';
  $('#profileAvatar').textContent = initials;
  $('#profileName').textContent   = u ? u.name : 'Foydalanuvchi';
  $('#profileStatus').textContent = u ? ((u.tier || 'Bepul') + ' foydalanuvchi') : 'Kiritilmagan';
  $('#userFullName').textContent  = u ? u.name : '—';
  $('#userEmail').textContent     = u ? u.email : '—';
  $('#userPhone').textContent     = u ? (u.phone || '—') : '—';
  $('#userRegistered').textContent= u ? (u.registered || '—') : '—';
  $('#userLastLogin').textContent = u && u.lastLogin ? U.fmtTime(u.lastLogin) : '—';
  $('#userId').textContent        = u ? u.id : '—';
  $('#userTier').textContent      = u ? (u.tier || 'Bepul') : '—';
  $('#userMode').textContent      = Api.state.online ? '☁️ Server (SQLite)' : '💾 Mahalliy (localStorage)';

  const st = Signals.stats();
  $('#profileSignals').textContent = st.total;
  $('#profileWins').textContent    = st.tp;
  $('#profileLosses').textContent  = st.sl;
  $('#profileWinRate').textContent = st.winRate == null ? '—' : st.winRate + '%';

  const hint = $('#authModeHint');
  hint.innerHTML = Api.state.online
    ? '☁️ Backend ulangan — ma\'lumotlar serverda saqlanadi'
    : '💾 Backend yo\'q — ma\'lumotlar shu kompyuterda saqlanadi';
}

window.editProfile = function () {
  if (!S.user) { openAuth(); return; }
  openModal('✏️ Profilni tahrirlash', `
    <div class="risk-grid">
      <div><label>To'liq ism:</label><input id="ep-name" value="${U.esc(S.user.name || '')}"></div>
      <div><label>Telefon:</label><input id="ep-phone" value="${U.esc(S.user.phone || '')}"></div>
    </div>
    <label>Email:</label><input id="ep-email" value="${U.esc(S.user.email || '')}" ${Api.state.online ? 'disabled' : ''}>
    <div style="text-align:center;margin-top:14px"><button class="btn" id="ep-save">💾 Saqlash</button></div>`);
  $('#ep-save').addEventListener('click', () => {
    S.user.name = $('#ep-name').value.trim() || S.user.name;
    S.user.phone = $('#ep-phone').value.trim() || '—';
    if (!Api.state.online) S.user.email = $('#ep-email').value.trim().toLowerCase() || S.user.email;
    saveSession(); renderProfile(); closeModal();
    toast('Profil yangilandi ✅', '');
  });
};

window.showAllUsers = function () {
  const users = U.lsGet(CFG.NET.keys.users, []) || [];
  const rows = users.map(u => `
    <div class="user-row">
      <div class="user-row-avatar">${U.esc((u.name || '?').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2))}</div>
      <div class="user-row-info">
        <div class="user-row-name">${U.esc(u.name)}</div>
        <div class="user-row-email">${U.esc(u.email)}${u.registered ? ' · ' + U.esc(u.registered) : ''}</div>
      </div>
      <span class="user-row-status">${U.esc(u.tier || 'Bepul')}</span>
    </div>`).join('');
  openModal('👥 Foydalanuvchilar (' + users.length + ')', rows
    ? `<div class="users-list">${rows}</div>`
    : '<div class="empty">Hali foydalanuvchilar yo\'q.</div>');
};

window.exportData = function () {
  const data = {
    exportedAt: new Date().toISOString(),
    user: Api.stripUser(S.user || {}),
    settings: U.lsGet(CFG.NET.keys.prefs, {}),
    signals: Signals.all().map(s => ({
      pair: s.pair, type: s.type, entry: s.entry, sl: s.sl, tp: s.tp,
      status: s.status, time: s.time, note: s.note, source: s.source
    })),
    quotes: Market.all()
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'za_islamic_' + new Date().toISOString().slice(0, 10) + '.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  toast('Fayl yuklab olindi 📤', '');
};

window.showAbout = function () {
  openModal('ℹ️ Dastur haqida', `
    <div class="ok-box">✅ <b>Real vaqt rejimi yoqilgan.</b> Narxlar va indikatorlar har 5 sekundda yangilanadi.</div>
    <div class="modal-info">
      <div class="modal-info-row"><span class="modal-info-label">Narx manbai:</span><span class="modal-info-value">TradingView Scanner</span></div>
      <div class="modal-info-row"><span class="modal-info-label">Kripto jonli oqimi:</span><span class="modal-info-value">Binance WebSocket</span></div>
      <div class="modal-info-row"><span class="modal-info-label">Kalendar manbai:</span><span class="modal-info-value">${Calendar.info().source}</span></div>
      <div class="modal-info-row"><span class="modal-info-label">Indikatorlar:</span><span class="modal-info-value">RSI · ATR · MACD · EMA · SMA · Stochastic · Bollinger</span></div>
      <div class="modal-info-row"><span class="modal-info-label">Avtomatik signal tili:</span><span class="modal-info-value">TradingView tavsiyasi + 6 ta indikator</span></div>
    </div>

    <div class="section-title">🔗 Server manzili</div>
    <div class="info-box">
      Narx, signal va kalendar uchun server <b>kerak emas</b> — ular to'g'ridan-to'g'ri ishlaydi.<br>
      Server faqat <b>ro'yxatdan o'tish va umumiy bazа</b> uchun kerak. Boshqa kompyuterdagi
      serverga ulanmoqchi bo'lsangiz, manzilni shu yerga yozing.
    </div>
    <label>Server manzili (masalan: https://backend.example.com)</label>
    <input id="ab-base" value="${U.esc(Api.base())}" placeholder="http://127.0.0.1:8000">
    <div id="ab-status" class="hint">—</div>
    <div style="text-align:center;margin-top:12px">
      <button class="btn sm" id="ab-save">💾 Saqlash va tekshirish</button>
      <button class="btn sm secondary" id="ab-reset">Standartga qaytarish</button>
    </div>

    <div class="warn-box" style="margin-top:18px">⚠️ <b>Ogohlantirish.</b> Avtomatik signallar algoritmik hisob-kitobga asoslanadi —
      bu moliyaviy tavsiya emas. Real savdoda yo'qotish ehtimoli mavjud. Har doim Stop Loss qo'ying va
      balansingizning kichik qismini riskga qo'ying.</div>`);

  const upd = () => {
    const el = $('#ab-status');
    if (!el) return;
    el.textContent = Api.state.online
      ? '✅ Ulangan: ' + Api.base()
      : '❌ Ulangan emas: ' + Api.base() + (Api.state.lastError ? ' — ' + Api.state.lastError : '');
  };
  upd();

  $('#ab-save').addEventListener('click', async function () {
    this.disabled = true; this.textContent = 'Tekshirilmoqda…';
    Api.setBase($('#ab-base').value);
    const ok = await Api.probe();
    upd();
    this.disabled = false; this.textContent = '💾 Saqlash va tekshirish';
    toast(ok ? 'Serverga ulanildi ✅' : 'Serverga ulanib bo\'lmadi ❌', ok ? '' : 'err');
  });

  $('#ab-reset').addEventListener('click', async function () {
    Api.setBase('');
    $('#ab-base').value = Api.base();
    const ok = await Api.probe();
    upd();
    toast(ok ? 'Standart serverga ulanildi ✅' : 'Standart server topilmadi (normal)', ok ? '' : 'warn');
  });
};

/* ================= 10) ishga tushirish ================= */
let booted = false;
function boot() {
  if (booted) return;
  booted = true;

  /* modallardagi onclick uchun global funksiyalar */
  Object.assign(window, {
    closeModal, openAuth, loginAsGuest, logoutUser,
    editProfile, showAllUsers, exportData, showAbout,
    openSignalDetail, removeSignal, addSignalPrefill
  });

  /* mavzu */
  const p = U.lsGet(CFG.NET.keys.prefs, {});
  setTheme(p.theme === 'light' ? 'light' : 'dark');

  /* ro'yxat uchun */
  $('#instrumentList').innerHTML = Object.keys(U.byId).map(k => `<option value="${k}">${U.byId[k].name}</option>`).join('');
  fillChartSelects();

  /* boshqaruvchilar */
  initLivebar();
  restoreSession();

  /* tarmoq */
  Api.start();
  Market.start();
  Calendar.start();
  Signals.start();

  /* render */
  Market.onTick(() => {
    renderAssets();
    renderSignals();
    if (S.tab === 'risk') calcRisk();
  });
  Signals.subscribe(() => { renderSignals(); renderProfile(); });
  Calendar.subscribe(renderCalendar);
  Api.onChange(renderProfile);
  setInterval(renderCalendar, 30000);

  /* backend signallarini yuklash */
  Api.fetchSignals().then(list => { if (list && list.length) Signals.loadServer(list); });

  renderAssets();
  renderSignals();
  renderCalendar();
  renderProfile();

  setTimeout(() => {
    const st = Market.status();
    if (st.online) toast('Real vaqt rejimi yoqilgan ✅ · ' + st.count + ' ta narx', '');
    else toast('Manbalarga ulanmoqda… internetni tekshiring', 'warn');
  }, 2500);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

})();