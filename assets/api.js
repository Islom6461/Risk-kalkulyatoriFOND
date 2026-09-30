/* =============================================================
   API — backend bilan bog'lanish + zaxira (localStorage) rejimi

   Backend ishga tushsa (python backend/app.py → :8000):
     • haqiqiy foydalanuvchilar bazasi (SQLite)
     • parollar xesh bilan saqlanadi
     • signallar serverdan olinadi / yuboriladi

   Backend ishlamasa — ilova xatosiz localStorage rejimida ishlaydi.
   ============================================================= */
const Api = (() => {

  const state = { online: false, base: CFG.API.base, token: null, probed: false, lastError: null };
  const subs = [];
  function onChange(fn) { subs.push(fn); return () => { const i = subs.indexOf(fn); if (i >= 0) subs.splice(i, 1); }; }
  function emit() { subs.forEach(f => { try { f(state); } catch (e) { console.error(e); } }); }

  function setOnline(v, err) {
    if (state.online !== v || state.lastError !== (err || null)) {
      state.online = v; state.lastError = err || null;
      emit();
    }
  }

  /* ---------------- parol xeshi (faqat zaxira rejim uchun) ---------------- */
  async function sha256(txt) {
    if (!('crypto' in window) || !crypto.subtle) return 'plain:' + btoa(unescape(encodeURIComponent(txt)));
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(txt));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  function salt() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }

  /* ---------------- HTTP ---------------- */
  async function req(path, opts) {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), CFG.API.timeoutMs);
    const o = Object.assign({ headers: {} }, opts || {});
    o.headers = Object.assign({}, o.headers);
    /* Content-Type faqat tana bo'lsa qo'shiladi — aks holda GET so'rovlari
       CORS preflight'ni majburlaydi (health check shu sababdan xato berardi) */
    if (o.body != null) o.headers['Content-Type'] = 'application/json';
    if (state.token) o.headers['Authorization'] = 'Bearer ' + state.token;
    try {
      const r = await fetch(state.base + path, Object.assign({}, o, { signal: ctl.signal }));
      const txt = await r.text();
      let j = null;
      try { j = txt ? JSON.parse(txt) : null; } catch (e) { j = { error: txt.slice(0, 200) }; }
      if (!r.ok) {
        const msg = (j && (j.error || j.message)) || ('HTTP ' + r.status);
        const e = new Error(msg); e.status = r.status; throw e;
      }
      setOnline(true);
      return j;
    } finally { clearTimeout(to); }
  }

  /* ---------------- backend ni aniqlash ---------------- */
  async function probe() {
    if (!CFG.API.enabled) { setOnline(false, 'backend o\'chirilgan'); return false; }
    try {
      const j = await req('/api/health');
      state.probed = true;
      if (j && j.status === 'ok') { setOnline(true); return true; }
      setOnline(false, 'noto\'g\'ri javob');
      return false;
    } catch (e) {
      state.probed = true;
      setOnline(false, 'server topilmadi');
      return false;
    }
  }

  function setToken(t) {
    state.token = t || null;
    if (t) U.lsSet('za_islamic_token', t); else U.lsDel('za_islamic_token');
  }

  function token() {
    if (!state.token) {
      const t = U.lsGet('za_islamic_token', null);
      if (t) state.token = t;
    }
    return state.token;
  }

  /* =========================================================
     RO'YXATDAN O'TISH / KIRISH
     ========================================================= */
  async function register(data) {
    data.email = String(data.email || '').trim().toLowerCase();
    if (!data.name || !data.email) throw new Error('Ism va email to\'ldirilishi shart');
    if (!data.password || data.password.length < 6) throw new Error('Parol kamida 6 belgidan iborat bo\'lishi kerak');

    if (state.online) {
      const j = await req('/api/auth/register', { method: 'POST', body: JSON.stringify(data) });
      setToken(j.token);
      return { user: j.user, token: j.token, mode: 'backend' };
    }

    /* ---- zaxira rejim ---- */
    const users = U.lsGet(CFG.NET.keys.users, []) || [];
    if (users.find(u => u.email === data.email)) throw new Error('Bu email allaqachon ro\'yxatdan o\'tgan');
    const user = {
      id: '#ZA-' + Math.random().toString(36).slice(2, 8).toUpperCase(),
      name: data.name,
      email: data.email,
      phone: data.phone || '—',
      registered: new Date().toISOString().slice(0, 10),
      tier: 'Bepul',
      balance: 0,
      _salt: salt(),
      _hash: await sha256(data.password + salt())
    };
    user._hash = await sha256(data.password + user._salt);
    users.push(user);
    U.lsSet(CFG.NET.keys.users, users);
    return { user: stripUser(user), mode: 'local' };
  }

  async function login(email, password) {
    email = String(email || '').trim().toLowerCase();

    if (state.online) {
      const j = await req('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      setToken(j.token);
      return { user: j.user, token: j.token, mode: 'backend' };
    }

    const users = U.lsGet(CFG.NET.keys.users, []) || [];
    const u = users.find(x => x.email === email);
    if (!u) throw new Error('Email yoki parol noto\'g\'ri');
    const h = await sha256(password + (u._salt || ''));
    if (u._hash && u._hash !== h) throw new Error('Email yoki parol noto\'g\'ri');
    if (!u._hash) { /* eski formatdagi (ochiq) parol */
      if (u.password !== password) throw new Error('Email yoki parol noto\'g\'ri');
    }
    return { user: stripUser(u), mode: 'local' };
  }

  function stripUser(u) {
    const c = Object.assign({}, u);
    delete c.password; delete c._hash; delete c._salt;
    return c;
  }

  /** Backendga ulangan bo'lsa — profilni serverdan yangilash */
  async function me() {
    if (!state.online || !token()) return null;
    try {
      const j = await req('/api/auth/me');
      return j.user || null;
    } catch (e) { return null; }
  }

  function logout() {
    setToken(null);
    U.lsDel(CFG.NET.keys.session);
  }

  /* =========================================================
     SIGNALLAR — server bilan sinxronlash
     ========================================================= */
  async function pushSignals(list) {
    if (!state.online) return false;
    try { await req('/api/signals/bulk', { method: 'POST', body: JSON.stringify({ signals: list }) }); return true; }
    catch (e) { return false; }
  }

  async function fetchSignals() {
    if (!state.online) return null;
    try { const j = await req('/api/signals'); return j.signals || []; }
    catch (e) { return null; }
  }

  /** Narx proksi — backend orqali (kerak bo'lsa) */
  async function market() {
    if (!state.online) return null;
    try { return await req('/api/market/quotes'); } catch (e) { return null; }
  }

  /** Iqtisodiy kalendar proksi */
  async function calendar() {
    if (!state.online) return null;
    try { return await req('/api/calendar'); } catch (e) { return null; }
  }

  /* ---------------- boshqaruv ---------------- */
  function start() {
    token();
    if (CFG.API.probeOnBoot) {
      probe().then(ok => { if (ok) fetchSignals(); });
      setInterval(() => probe(), 30000);
    }
  }

  return {
    start, probe, register, login, me, logout,
    pushSignals, fetchSignals, market, calendar,
    state, setToken, token, onChange, stripUser
  };
})();