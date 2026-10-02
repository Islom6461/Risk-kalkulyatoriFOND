/* =============================================================
   Lessons — darslar moduli

   Admin dars yozadi / tahrirlaydi / e'lon qiladi va chiqaradi.
   Oddiy foydalanuvchi o'qiydi. Dars "minTier" bo'yicha
   tarifga bog'lanadi (Bepul / Pro / VIP).
   ============================================================= */
const Lessons = (() => {

  const state = { items: [], loaded: false, filter: 'all' };
  const subs = [];
  function subscribe(fn) { subs.push(fn); return () => { const i = subs.indexOf(fn); if (i >= 0) subs.splice(i, 1); }; }
  function emit() { subs.forEach(f => { try { f(); } catch (e) { console.error(e); } }); }

  /* ---------------- kichik markdown render (xavfsiz: HTML o'chiriladi) ---------------- */
  function md(src) {
    if (!src) return '';
    let s = U.esc(src);
    s = s.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
    s = s.replace(/^### (.+)$/gm, '<h4>$1</h4>');
    s = s.replace(/^## (.+)$/gm, '<h3>$1</h3>');
    s = s.replace(/^# (.+)$/gm, '<h2 class="md-h1">$1</h2>');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener">$1</a>');
    s = s.replace(/^&gt;\s?(.*)$/gm, '<blockquote>$1</blockquote>');
    s = s.replace(/^[-*]\s+(.+)$/gm, '<li>$1</li>');
    s = s.replace(/(<li>[\s\S]*?<\/li>)(?!\s*<li>)/g, '<ul>$1</ul>');
    s = s.replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>');
    s = s.replace(/\n{2,}/g, '</p><p>');
    s = s.replace(/\n/g, '<br>');
    return '<p>' + s + '</p>';
  }

  function videoEmbed(url) {
    if (!url) return '';
    let id = '';
    const m = String(url).match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
    if (m) id = m[1];
    if (!id) {
      if (/\.(mp4|webm|ogg)$/i.test(url)) {
        return `<video controls preload="metadata" style="width:100%;border-radius:10px;background:#000" src="${U.esc(url)}"></video>`;
      }
      return `<div class="info-box"><a href="${U.esc(url)}" target="_blank" rel="noopener">🔗 Videoni ochish</a></div>`;
    }
    return `<div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;border-radius:10px;background:#000">
      <iframe style="position:absolute;top:0;left:0;width:100%;height:100%;border:0"
        src="https://www.youtube.com/embed/${U.esc(id)}" allowfullscreen
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowfullscreen></iframe></div>`;
  }

  /* ---------------- ro'yxatni yuklash ---------------- */
  async function load() {
    if (typeof Api === 'undefined' || !Api.state.online) {
      state.items = []; state.loaded = false; emit();
      return [];
    }
    try {
      const j = await Api.call('/api/lessons');
      state.items = j.lessons || [];
      state.loaded = true;
    } catch (e) {
      state.items = []; state.loaded = false;
      console.warn('[Lessons]', e.message);
    }
    emit();
    return state.items;
  }

  /* ---------------- ko'rsatish ---------------- */
  function render() {
    const box = document.getElementById('lessonList');
    const meta = document.getElementById('lessonMeta');
    if (!box) return;

    if (typeof Api === 'undefined' || !Api.state.online) {
      meta.textContent = '— server ulanmagan';
      box.innerHTML = `<div class="empty"><div class="empty-icon">📚</div>
        <div class="empty-title">Darslar serverga ulanishni kutmoqda</div>
        <div class="empty-desc">Narx va signallar baribir ishlaydi.<br>
        Darslarni ko'rish uchun server kerak — <b>Profil → Ma'lumot</b> dan manzilni kiriting.</div></div>`;
      return;
    }

    const cats = {};
    state.items.forEach(l => { cats[l.category || 'Umumiy'] = (cats[l.category || 'Umumiy'] || 0) + 1; });
    meta.textContent = `— ${state.items.length} ta dars` +
      (Object.keys(cats).length ? ' · ' + Object.keys(cats).join(', ') : '');

    const f = state.filter === 'all' ? state.items : state.items.filter(l => (l.category || 'Umumiy') === state.filter);

    box.innerHTML = `
      <div class="lesson-filters">
        <button class="news-filter ${state.filter === 'all' ? 'active' : ''}" data-lf="all">Barchasi</button>
        ${Object.keys(cats).map(c => `<button class="news-filter ${state.filter === c ? 'active' : ''}" data-lf="${U.esc(c)}">${U.esc(c)} (${cats[c]})</button>`).join('')}
      </div>
      <div class="lesson-grid">
        ${f.length ? f.map(l => `
          <div class="lesson-card ${l.locked ? 'locked' : ''}" onclick="openLesson(${l.id})">
            <div class="lesson-card-top">
              <span class="lesson-cat">${U.esc(l.category || 'Umumiy')}</span>
              ${l.minTier && l.minTier !== 'Bepul' ? `<span class="lesson-tier">${U.esc(l.minTier)}</span>` : ''}
              ${l.locked ? '<span class="lesson-lock">🔒</span>' : ''}
            </div>
            <div class="lesson-title">${U.esc(l.title)}</div>
            <div class="lesson-preview">${U.esc(l.preview || l.body || '')}</div>
            <div class="lesson-foot">${l.locked ? '🔒 ' + U.esc(l.minTier) + ' tarifida' : 'O\'qish →'}</div>
          </div>`).join('')
        : '<div class="empty"><div class="empty-icon">📭</div><div class="empty-title">Hali dars qo\'shilmagan</div></div>'}
      </div>`;

    box.querySelectorAll('[data-lf]').forEach(b => b.addEventListener('click', function () {
      state.filter = this.dataset.lf;
      render();
    }));
  }

  /* ---------------- bitta darsni ochish ---------------- */
  window.openLesson = async function (id) {
    const item = state.items.find(x => x.id === id);
    if (!item) return;
    if (item.locked) {
      openModal(item.title, `
        <div class="empty">
          <div class="empty-icon">🔒</div>
          <div class="empty-title">Bu dars ${U.esc(item.minTier)} tarifida</div>
          <div class="empty-desc">Adminga murojaat qiling — tarifni oshirib beradi.</div>
        </div>`);
      return;
    }
    openModal('⏳ Yuklanmoqda...', '<div class="loading">⏳</div>');
    try {
      const j = await Api.call('/api/lessons/' + id);
      const l = j.lesson;
      openModal(l.title, `
        ${videoEmbed(l.videoUrl)}
        <div class="lesson-meta-row">
          <span class="lesson-cat">${U.esc(l.category)}</span>
          ${l.minTier !== 'Bepul' ? `<span class="lesson-tier">${U.esc(l.minTier)}</span>` : ''}
          <span style="font-size:11px;color:var(--text-dim)">yangilangan ${U.fmtTime(l.updatedAt || l.createdAt)}</span>
        </div>
        <div class="lesson-body">${md(l.body)}</div>
        <div style="text-align:center;margin-top:16px">
          <button class="btn sm secondary" onclick="closeModal()">Yopish</button>
        </div>`);
    } catch (e) {
      openModal(item.title, `<div class="warn-box">⚠️ ${U.esc(e.message)}</div>
        <div style="text-align:center"><button class="btn sm" onclick="closeModal()">Yopish</button></div>`);
    }
  };

  /* ================= ADMIN: boshqaruv ================= */
  function adminForm(l) {
    l = l || {};
    const isNew = !l.id;
    return openModal(isNew ? '📚 Yangi dars' : '✏️ Darsni tahrirlash', `
      <label>Sarlavha:</label>
      <input id="ls-title" value="${U.esc(l.title || '')}" placeholder="Masalan: Risk kalkulyator qanday ishlaydi">

      <div class="risk-grid">
        <div>
          <label>Kategoriya:</label>
          <input id="ls-cat" value="${U.esc(l.category || 'Umumiy')}" list="ls-cats">
          <datalist id="ls-cats">
            <option value="Umumiy"><option value="Risk"><option value="Signallar">
            <option value="Texnik tahlil"><option value="Videolar">
          </datalist>
        </div>
        <div>
          <label>Minimal tarif:</label>
          <select id="ls-tier">
            ${['Bepul', 'Pro', 'VIP'].map(t => `<option value="${t}" ${(l.minTier || 'Bepul') === t ? 'selected' : ''}>${t}</option>`).join('')}
          </select>
        </div>
      </div>

      <label>Video havolasi (YouTube / MP4) — ixtiyoriy:</label>
      <input id="ls-video" value="${U.esc(l.videoUrl || '')}" placeholder="https://youtube.com/watch?v=...">

      <label>Dars matni (markdown qo'llab-quvvatlanadi):</label>
      <textarea id="ls-body" rows="12" placeholder="# Sarlavha&#10;&#10;Matn, **qalin** yoki *kursiv*...&#10;&#10;- birinchi punkt&#10;- ikkinchi punkt">${U.esc(l.body || '')}</textarea>

      <div class="risk-grid">
        <div>
          <label>Tartib raqami:</label>
          <input id="ls-order" type="number" value="${l.orderNo || 0}" step="1">
        </div>
        <div>
          <label>Holat:</label>
          <select id="ls-pub">
            <option value="1" ${l.published !== false ? 'selected' : ''}>E'lon qilingan</option>
            <option value="0" ${l.published === false ? 'selected' : ''}>Nashr etilmagan</option>
          </select>
        </div>
      </div>

      <div class="hint">
        Markdown: <code>#</code> sarlavha · <code>**qalin**</code> ·
        <code>*kursiv*</code> · <code>- punkt</code> · <code>&gt; iqtibos</code> ·
        <code>[link](https://...)</code>
      </div>

      <div style="text-align:center;margin-top:14px">
        <button class="btn" id="ls-save">💾 Saqlash</button>
        <button class="btn secondary" onclick="closeModal()">Bekor qilish</button>
      </div>`);

    const save = async () => {
      const payload = {
        title: $('#ls-title').value.trim(),
        category: $('#ls-cat').value.trim() || 'Umumiy',
        minTier: $('#ls-tier').value,
        videoUrl: $('#ls-video').value.trim(),
        body: $('#ls-body').value,
        orderNo: parseInt($('#ls-order').value, 10) || 0,
        published: $('#ls-pub').value === '1'
      };
      if (!payload.title) return toast('Sarlavhani kiriting', 'err');
      try {
        if (isNew) await Api.call('/api/admin/lessons', { method: 'POST', body: JSON.stringify(payload) });
        else await Api.call('/api/admin/lessons/' + l.id, { method: 'PATCH', body: JSON.stringify(payload) });
        toast(isNew ? 'Dars qo\'shildi ✅' : 'Dars yangilandi ✅', '');
        closeModal();
        load();
      } catch (e) { toast('Xato: ' + e.message, 'err'); }
    };
    $('#ls-save').addEventListener('click', save);
    $('#ls-title').focus();
  }

  async function adminManage() {
    if (!perms().canManageLessons) return toast('Faqat admin uchun', 'warn');
    let items = [];
    try { items = (await Api.call('/api/admin/lessons?all=1')).lessons || []; }
    catch (e) { return toast('Xato: ' + e.message, 'err'); }

    openModal('📚 Darslarni boshqarish', `
      <div style="text-align:center;margin-bottom:14px">
        <button class="btn sm" id="lm-new">➕ Yangi dars</button>
      </div>
      ${items.length ? `<div class="lm-list">${items.map(l => `
        <div class="lm-row">
          <div class="lm-info">
            <div class="lm-title">${U.esc(l.title)} ${l.published ? '' : '<span class="tag" style="background:rgba(136,136,136,.2);color:var(--text-dim)">nashr yo\'q</span>'}</div>
            <div class="lm-sub">${U.esc(l.category)} · ${U.esc(l.minTier)} · tartib ${l.orderNo}</div>
          </div>
          <div class="lm-actions">
            <button class="lb-btn" data-edit="${l.id}">✏️</button>
            <button class="lb-btn" data-del="${l.id}">🗑️</button>
          </div>
        </div>`).join('')}</div>`
        : '<div class="empty"><div class="empty-icon">📭</div><div class="empty-title">Darslar yo\'q</div><div class="empty-desc">Yuqoridagi tugma bilan birinchisini qo\'shing.</div></div>'}`);

    $('#lm-new').addEventListener('click', () => adminForm());
    document.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => {
      const l = items.find(x => String(x.id) === b.dataset.edit);
      if (l) adminForm(l);
    }));
    document.querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('Darsni o\'chirishni tasdiqlaysizmi?')) return;
      try {
        await Api.call('/api/admin/lessons/' + b.dataset.del, { method: 'DELETE' });
        toast('Dars o\'chirildi', 'info');
        load(); adminManage();
      } catch (e) { toast('Xato: ' + e.message, 'err'); }
    }));
  }

  /* ---------------- boshlang'ich ---------------- */
  function perms() {
    const u = (typeof S !== 'undefined' && S.user) ? S.user : null;
    const p = u && u.perms ? u.perms : {};
    const local = u && !u.perms ? {
      isAdmin: false, isModerator: false,
      canManageLessons: false, canManageSignals: false,
      canBlockUsers: false, canDeleteUsers: false,
      canChangeRoles: false, canViewAudit: false, canViewStats: false,
      canViewAdmin: false
    } : p;
    local.canViewAdmin = !!(local.isModerator || local.isAdmin);
    return local;
  }

  function start() {
    subscribe(render);
    load();
  }

  return { start, load, render, adminForm, adminManage, md, perms };
})();