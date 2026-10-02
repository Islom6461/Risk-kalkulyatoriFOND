/* =============================================================
   Admin — boshqaruv paneli

   • Statistika (foydalanuvchilar, bloklangan, darslar, signallar)
   • Foydalanuvchilar: rol, tarif, bloklash, chiqarish, izoh
   • Audit log — kim nima qilgani
   Faqat admin (va ba'zi amallar moderator) uchun.
   ============================================================= */
const Admin = (() => {

  const state = { users: [], stats: null, audit: [], tiers: [], roles: [], q: '' };

  /* ------------------------------------------------------------------ */
  function can() {
    const u = (typeof S !== 'undefined' && S.user) ? S.user : null;
    const p = (u && u.perms) ? u.perms : {};
    return {
      isAdmin: !!p.isAdmin,
      isMod: !!p.isModerator,
      view: !!(p.isAdmin || p.isModerator),
      block: !!p.canBlockUsers,
      del: !!p.canDeleteUsers,
      roles: !!p.canChangeRoles,
      lessons: !!p.canManageLessons,
      signals: !!p.canManageSignals,
      audit: !!p.canViewAudit,
      stats: !!p.canViewStats,
      me: u ? u.id : null,
      myTier: (u && u.tier) || 'Bepul'
    };
  }

  async function loadAll() {
    if (!can().view) return;
    try {
      const [st, us, au] = await Promise.all([
        can().stats  ? Api.call('/api/admin/stats')     : Promise.resolve(null),
        Api.call('/api/admin/users' + (state.q ? '?q=' + encodeURIComponent(state.q) : '')),
        can().audit  ? Api.call('/api/admin/audit?limit=60') : Promise.resolve(null)
      ]);
      state.stats = st;
      state.users = us.users || [];
      state.tiers = us.tiers || ['Bepul', 'Pro', 'VIP'];
      state.roles = us.roles || ['user', 'moderator', 'admin'];
      state.audit = (au && au.log) || [];
      render();
    } catch (e) {
      toast('Admin ma\'lumotini yuklab bo\'lmadi: ' + e.message, 'err');
    }
  }

  /* ------------------------------------------------------------------ */
  function render() {
    const box = document.getElementById('adminBox');
    if (!box) return;
    const c = can();

    if (!c.view) {
      box.innerHTML = `<div class="empty"><div class="empty-icon">🔒</div>
        <div class="empty-title">Admin paneliga kirish huquqingiz yo'q</div>
        <div class="empty-desc">Bu bo'lim faqat admin va moderatorlar uchun.</div></div>`;
      return;
    }

    const s = state.stats;

    /* ---- statistika ---- */
    const cards = c.stats && s ? `
      <div class="signal-stats" style="margin-bottom:16px">
        <div class="signal-stat"><div class="signal-stat-label">Foydalanuvchi</div><div class="signal-stat-value">${s.users}</div></div>
        <div class="signal-stat"><div class="signal-stat-label">Bugun</div><div class="signal-stat-value" style="color:var(--blue)">${s.newToday}</div></div>
        <div class="signal-stat"><div class="signal-stat-label">Bloklangan</div><div class="signal-stat-value" style="color:var(--red)">${s.blocked}</div></div>
        <div class="signal-stat"><div class="signal-stat-label">Dars</div><div class="signal-stat-value" style="color:var(--yellow)">${s.lessons}</div></div>
        <div class="signal-stat"><div class="signal-stat-label">Signal</div><div class="signal-stat-value" style="color:var(--green)">${s.signals}</div></div>
      </div>` : '';

    /* ---- tez amallar ---- */
    const tools = `
      <div class="signal-toolbar">
        <input id="ad-q" type="search" placeholder="🔍 Ism yoki email" value="${U.esc(state.q)}" style="width:230px;margin:0;padding:7px 11px;font-size:12px">
        <button class="lb-btn" id="ad-search">🔍 Qidirish</button>
        <div style="flex:1"></div>
        ${c.lessons ? '<button class="lb-btn" id="ad-lessons">📚 Darslar</button>' : ''}
        ${c.signals ? '<button class="lb-btn" id="ad-signals">🎯 Signal boshqaruvi</button>' : ''}
        <button class="lb-btn" id="ad-refresh">🔄</button>
      </div>`;

    /* ---- foydalanuvchilar ---- */
    const rows = state.users.length ? state.users.map(u => {
      const isMe = u.id === c.me;
      const roleTag = u.perms.role === 'admin' ? '<span class="tag tag-auto">ADMIN</span>'
        : (u.perms.role === 'moderator' ? '<span class="tag tag-manual">MODERATOR</span>' : '');
      const tierTag = u.tier === 'Bepul' ? '' : `<span class="tag tag-mine">${U.esc(u.tier)}</span>`;
      const blk = u.blocked ? '<span class="tag" style="background:rgba(244,67,54,.18);color:var(--red)">BLOKLANGAN</span>' : '';
      return `<div class="user-row" style="flex-wrap:wrap;gap:10px">
        <div class="user-row-avatar">${U.esc((u.name || '?').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2))}</div>
        <div class="user-row-info">
          <div class="user-row-name">${U.esc(u.name)} ${roleTag} ${tierTag} ${blk} ${isMe ? '<span class="tag">siz</span>' : ''}</div>
          <div class="user-row-email">${U.esc(u.email)} · ${U.esc(u.phone || '—')} · ${U.esc(u.registered)}</div>
          ${u.blocked && u.blockedReason ? `<div class="user-row-email" style="color:var(--red)">Sabab: ${U.esc(u.blockedReason)}</div>` : ''}
          ${u.note ? `<div class="user-row-email" style="color:var(--yellow)">📝 ${U.esc(u.note)}</div>` : ''}
        </div>
        <div class="lm-actions">
          ${c.roles && !isMe ? `<select class="ad-sel" data-role="${u.id}" title="Rol">
            ${state.roles.map(r => `<option value="${r}" ${u.perms.role === r ? 'selected' : ''}>${r}</option>`).join('')}
          </select>` : ''}
          ${c.roles ? `<select class="ad-sel" data-tier="${u.id}" title="Tarif">
            ${state.tiers.map(t => `<option value="${t}" ${u.tier === t ? 'selected' : ''}>${t}</option>`).join('')}
          </select>` : ''}
          <button class="lb-btn" data-note="${u.id}">📝</button>
          ${c.block && !isMe ? (u.blocked
            ? `<button class="lb-btn" data-unblock="${u.id}" title="Blokdan chiqarish">🔓</button>`
            : `<button class="lb-btn" data-block="${u.id}" title="Bloklash">🚫</button>`) : ''}
          ${c.del && !isMe ? `<button class="lb-btn" data-delete="${u.id}" title="Tizimdan chiqarish">🗑️</button>` : ''}
        </div>
      </div>`;
    }).join('') : `<div class="empty"><div class="empty-icon">👥</div><div class="empty-title">Foydalanuvchi topilmadi</div></div>`;

    /* ---- audit ---- */
    const auditRows = c.audit && state.audit.length ? `
      <div class="section-title">🕐 Amallar tarixi (audit)</div>
      <div class="audit-list">${state.audit.map(a => `
        <div class="audit-row">
          <span class="audit-time">${U.fmtTime(a.ts)}</span>
          <span class="audit-act">${U.esc(a.action)}</span>
          <span class="audit-detail">${U.esc(a.detail || a.target || '')}</span>
        </div>`).join('')}</div>` : '';

    box.innerHTML = cards + tools +
      `<div class="users-list">${rows}</div>` + auditRows;

    /* ---- hodisalar ---- */
    const $q = document.getElementById('ad-q');
    if ($q) $q.addEventListener('keydown', e => { if (e.key === 'Enter') { state.q = $q.value.trim(); loadAll(); } });
    const sr = document.getElementById('ad-search');
    if (sr) sr.addEventListener('click', () => { state.q = $q.value.trim(); loadAll(); });
    const rf = document.getElementById('ad-refresh');
    if (rf) rf.addEventListener('click', loadAll);
    const lb = document.getElementById('ad-lessons');
    if (lb) lb.addEventListener('click', () => Lessons.adminManage());
    const sg = document.getElementById('ad-signals');
    if (sg) sg.addEventListener('click', manageSignals);

    box.querySelectorAll('[data-role]').forEach(sel => sel.addEventListener('change', async () => {
      try {
        await Api.call('/api/admin/users/' + sel.dataset.role, { method: 'PATCH', body: JSON.stringify({ role: sel.value }) });
        toast('Rol yangilandi: ' + sel.value, '');
        loadAll();
      } catch (e) { toast('Xato: ' + e.message, 'err'); loadAll(); }
    }));
    box.querySelectorAll('[data-tier]').forEach(sel => sel.addEventListener('change', async () => {
      try {
        await Api.call('/api/admin/users/' + sel.dataset.tier, { method: 'PATCH', body: JSON.stringify({ tier: sel.value }) });
        toast('Tarif yangilandi: ' + sel.value, '');
        loadAll();
      } catch (e) { toast('Xato: ' + e.message, 'err'); loadAll(); }
    }));
    box.querySelectorAll('[data-note]').forEach(b => b.addEventListener('click', () => noteUser(b.dataset.note)));
    box.querySelectorAll('[data-block]').forEach(b => b.addEventListener('click', () => blockUser(b.dataset.block, true)));
    box.querySelectorAll('[data-unblock]').forEach(b => b.addEventListener('click', () => blockUser(b.dataset.unblock, false)));
    box.querySelectorAll('[data-delete]').forEach(b => b.addEventListener('click', () => deleteUser(b.dataset.delete)));
  }

  /* ------------------------------------------------------------------ */
  function blockUser(id, block) {
    const u = state.users.find(x => x.id === id);
    if (!u) return;
    if (!block) {
      if (!confirm(U.esc(u.name) + ' ni blokdan chiqarishni tasdiqlaysizmi?')) return;
      Api.call(`/api/admin/users/${id}/unblock`, { method: 'POST', body: '{}' })
        .then(() => { toast('Blokdan chiqarildi ✅', ''); loadAll(); })
        .catch(e => toast('Xato: ' + e.message, 'err'));
      return;
    }
    openModal('🚫 Foydalanuvchini bloklash', `
      <div class="warn-box">
        <b>${U.esc(u.name)}</b> (${U.esc(u.email)}) bloklanadi.<br><br>
        • Kirish imkoniyati yo'qoladi<br>
        • Hozirgi sessiyasi darhol uziladi<br>
        • Darslarni ko'ra olmaydi<br>
        • Bloklanish sababini yozib qo'yamiz — foydalanuvchi shuni ko'radi
      </div>
      <label>Sabab (foydalanuvchiga ko'rinadi):</label>
      <input id="bl-reason" placeholder="Masalan: Shartnomani buzish, spam yuborish...">
      <div style="text-align:center;margin-top:14px">
        <button class="btn danger" id="bl-ok">🚫 Bloklash</button>
        <button class="btn secondary" onclick="closeModal()">Bekor qilish</button>
      </div>`);
    $('#bl-ok').addEventListener('click', async () => {
      const reason = $('#bl-reason').value.trim();
      try {
        await Api.call(`/api/admin/users/${id}/block`, { method: 'POST', body: JSON.stringify({ reason }) });
        toast('Foydalanuvchi bloklandi 🚫', '');
        closeModal(); loadAll();
      } catch (e) { toast('Xato: ' + e.message, 'err'); }
    });
    $('#bl-reason').focus();
  }

  function deleteUser(id) {
    const u = state.users.find(x => x.id === id);
    if (!u) return;
    if (!confirm('⚠️ ' + U.esc(u.name) + ' ni butunlay tizimdan chiqarishni tasdiqlaysizmi?\n\nBu amalni qaytarib bo\'lmaydi.')) return;
    Api.call(`/api/admin/users/${id}`, { method: 'DELETE' })
      .then(() => { toast('Foydalanuvchi tizimdan chiqarildi', 'info'); loadAll(); })
      .catch(e => toast('Xato: ' + e.message, 'err'));
  }

  function noteUser(id) {
    const u = state.users.find(x => x.id === id);
    if (!u) return;
    openModal('📝 Foydalanuvchi izohi', `
      <div class="info-box"><b>${U.esc(u.name)}</b><br>${U.esc(u.email)}</div>
      <label>Izoh (faqat adminlar ko'radi):</label>
      <textarea id="nt-note" rows="5" placeholder="Masalan: Vipga o'tdi, to'lov qildi...">${U.esc(u.note || '')}</textarea>
      <div style="text-align:center;margin-top:14px">
        <button class="btn" id="nt-save">💾 Saqlash</button>
        <button class="btn secondary" onclick="closeModal()">Bekor qilish</button>
      </div>`);
    $('#nt-save').addEventListener('click', async () => {
      try {
        await Api.call('/api/admin/users/' + id, { method: 'PATCH', body: JSON.stringify({ note: $('#nt-note').value }) });
        toast('Izoh saqlandi', '');
        closeModal(); loadAll();
      } catch (e) { toast('Xato: ' + e.message, 'err'); }
    });
  }

  /* ------------------------------------------------------------------ */
  async function manageSignals() {
    let list = [];
    try { list = (await Api.call('/api/signals?limit=100')).signals || []; }
    catch (e) { return toast('Xato: ' + e.message, 'err'); }

    const instOpts = CFG.GROUPS.map(g => `<optgroup label="${g.title}">` +
      g.items.map(i => `<option value="${i.id}">${i.name}</option>`).join('') + '</optgroup>').join('');

    openModal('🎯 Signal boshqaruvi', `
      <div class="info-box">Bu signal <b>barcha foydalanuvchilarga</b> ko'rinadi va holati real vaqtda kuzatiladi.</div>
      <div class="risk-grid">
        <div><label>Aktiv:</label><select id="sg-inst">${instOpts}</select></div>
        <div><label>Yo'nalish:</label><select id="sg-type"><option value="BUY">🟢 BUY</option><option value="SELL">🔴 SELL</option></select></div>
      </div>
      <div class="risk-grid">
        <div><label>Entry:</label><input id="sg-entry" type="number" step="any"></div>
        <div><label>Stop Loss:</label><input id="sg-sl" type="number" step="any"></div>
      </div>
      <div class="risk-grid">
        <div><label>Take Profit:</label><input id="sg-tp" type="number" step="any"></div>
        <div><label>Holat:</label><select id="sg-status"><option value="pending">Kutilmoqda</option><option value="active">Faol</option></select></div>
      </div>
      <label>Izoh:</label><input id="sg-note" placeholder="Nega bu signal?">
      <div id="sg-hint" class="hint">—</div>
      <div style="text-align:center;margin-top:12px">
        <button class="btn" id="sg-save">💾 Signalni yuborish</button>
      </div>

      <div class="section-title">📋 Yuborilgan signallar (${list.length})</div>
      ${list.length ? `<div class="lm-list" style="max-height:280px;overflow:auto">${list.map(s => `
        <div class="lm-row">
          <div class="lm-info">
            <div class="lm-title">${U.esc(s.pair)} <span class="signal-type ${s.type === 'BUY' ? 'buy' : 'sell'}">${s.type}</span></div>
            <div class="lm-sub">Entry ${s.entry} · SL ${s.sl} · TP ${s.tp} · ${U.esc(s.status)} · ${U.fmtTime(s.time)}</div>
          </div>
          <div class="lm-actions">
            <button class="lb-btn" data-sdel="${s.id}">🗑️</button>
          </div>
        </div>`).join('')}</div>`
        : '<div class="hint">Hali signal yuborilmagan.</div>'}`);

    const upd = () => {
      const id = $('#sg-inst').value;
      const p = Market.price(id);
      if (p != null && !$('#sg-entry').value) $('#sg-entry').value = p;
      const e = parseFloat($('#sg-entry').value), sl = parseFloat($('#sg-sl').value), tp = parseFloat($('#sg-tp').value);
      let t = (U.byId[id] ? U.byId[id].name : id) + (p != null ? ' · joriy ' + U.fmtPrice(id, p) : '');
      if (e && sl && tp) {
        const rr = Math.abs(tp - e) / Math.abs(e - sl);
        t += ' · Risk/Reward 1:' + rr.toFixed(2) + (rr >= 2 ? ' ✅' : ' ⚠️');
      }
      $('#sg-hint').textContent = t;
    };
    ['#sg-inst', '#sg-type', '#sg-entry', '#sg-sl', '#sg-tp'].forEach(s => {
      const el = $(s); if (el) el.addEventListener('input', upd);
    });
    upd();

    $('#sg-save').addEventListener('click', async () => {
      const o = {
        instrument: $('#sg-inst').value, pair: (U.byId[$('#sg-inst').value] || {}).name,
        type: $('#sg-type').value,
        entry: parseFloat($('#sg-entry').value), sl: parseFloat($('#sg-sl').value),
        tp: parseFloat($('#sg-tp').value), status: $('#sg-status').value,
        note: $('#sg-note').value, source: 'manual'
      };
      if (!o.entry) return toast('Entry kiriting', 'err');
      try {
        await Api.call('/api/signals', { method: 'POST', body: JSON.stringify(o) });
        toast('Signal yuborildi — hamma ko\'radi ✅', '');
        closeModal();
        Api.fetchSignals().then(l => { if (l) Signals.loadServer(l); });
      } catch (e) { toast('Xato: ' + e.message, 'err'); }
    });

    document.querySelectorAll('[data-sdel]').forEach(b => b.addEventListener('click', async () => {
      if (!confirm('Signalni o\'chirishni tasdiqlaysizmi?')) return;
      try {
        await Api.call('/api/signals/' + b.dataset.sdel, { method: 'DELETE' });
        toast('Signal o\'chirildi', 'info');
        closeModal(); manageSignals();
      } catch (e) { toast('Xato: ' + e.message, 'err'); }
    }));
  }

  return { loadAll, render, manageSignals, can, state };
})();