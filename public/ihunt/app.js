(function () {
  const { html, raw, el, toast, modal, confirmBox, dropzone, gallery, wireGallery, localDate, localDateTime, fmtDate, fmtTime, fmtDateTime, initials, stationIcon, statusChip, busy, orbs, ago } = UI;
  const app = document.getElementById('app');
  const api = UI.makeApi('/api/police', () => showLogin());
  const state = { officer: null, meta: null, station: 'mine', tab: 'add', stats: null };

  const DEMO = [
    ['officer.james', 'James Carter', 'Central PS'],
    ['officer.anita', 'Anita Sharma', 'Central PS'],
    ['officer.omar', 'Omar Farooq', 'Northside PS'],
    ['officer.lena', 'Lena Brooks', 'Harbor Point PS'],
    ['officer.diego', 'Diego Alvarez', 'Westfield PS'],
    ['officer.kate', 'Kate Nguyen', 'Riverside PS'],
    ['airport.desk', 'Ravi Menon', 'Airport L&F'],
    ['techpark.security', 'Grace Lee', 'TechPark Security'],
    ['railway.office', 'Samuel Okafor', 'Railway LPO'],
  ];
  const SAMPLES = ['police-found-dji-drone.jpg', 'police-found-drone-2.jpg'];

  orbs();

  const stationParam = () => (state.station === 'mine' ? state.officer.station_id : state.station);
  const q = (extra = {}) => new URLSearchParams({ station_id: stationParam(), date: localDate(), ...extra }).toString();

  function showLogin() {
    state.officer = null;
    app.innerHTML = html`<div class="login-wrap">
      <section class="login-hero">
        <div class="brand"><span class="logo">🛡️</span>iHunt</div>
        <div>
          <span class="chip accent"><span class="dot pulse"></span>AI-assisted found-property desk</span>
          <h1>Every found item,<br><em>back with its owner.</em></h1>
          <p class="muted" style="max-width:520px;font-size:1.05rem">iHunt is the command center for police stations, airports, transit and corporate security desks. Log found property in seconds — our vision AI indexes every photo so citizens searching on iSeek can find it instantly.</p>
          <div class="hero-feats">
            <div class="hero-feat"><span class="i">📸</span><div><b>Snap &amp; auto-tag</b><div class="muted small">Upload up to 5 photos — AI suggests the category, colour and title.</div></div></div>
            <div class="hero-feat"><span class="i">🔔</span><div><b>Instant owner alerts</b><div class="muted small">Matching lost reports are notified the moment an item is logged.</div></div></div>
            <div class="hero-feat"><span class="i">📅</span><div><b>Verified hand-overs</b><div class="muted small">Review ownership proof, approve pickups and run today's schedule.</div></div></div>
          </div>
        </div>
        <div class="muted tiny" style="margin-top:30px">Looking for something you lost? <a href="/iseek/">Open iSeek →</a></div>
      </section>
      <section class="login-panel">
        <div class="card pad-lg login-card fade-in">
          <div class="shield">🛡️</div>
          <h2 style="margin-top:18px">Officer sign in</h2>
          <p class="muted small" style="margin-top:6px">Authorized personnel only.</p>
          <form class="stack" style="margin-top:22px" id="login">
            <label class="field"><span>Username</span><input class="input" name="username" autocomplete="username" placeholder="officer.james" required></label>
            <label class="field"><span>Password</span><input class="input" name="password" type="password" autocomplete="current-password" placeholder="••••••••" required></label>
            <button class="btn primary block lg" type="submit">Sign in to iHunt</button>
          </form>
          <div style="margin-top:24px">
            <div class="row" style="margin-bottom:10px"><b class="small">Demo accounts</b><span class="spacer"></span><span class="chip">password: ihunt@123</span></div>
            <div class="demo-list">${DEMO.map(([u, n, s]) => html`<button type="button" class="demo-acc" data-u="${u}"><b>${n}</b><small>${s}</small></button>`)}</div>
          </div>
        </div>
      </section>
    </div>`;
    const form = app.querySelector('#login');
    app.querySelectorAll('.demo-acc').forEach((b) => b.addEventListener('click', () => {
      form.username.value = b.dataset.u;
      form.password.value = 'ihunt@123';
      form.requestSubmit();
    }));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = form.querySelector('button[type=submit]');
      busy(btn, true, 'Signing in…');
      try {
        const { officer } = await api('/login', { body: { username: form.username.value, password: form.password.value }, allow401: true });
        state.officer = officer;
        await boot();
      } catch (err) {
        toast(err.message, 'bad');
        busy(btn, false);
      }
    });
  }

  async function boot() {
    if (!state.meta) state.meta = await api('/meta');
    const hashTab = location.hash.replace('#', '');
    if (['add', 'today', 'pending', 'inventory'].includes(hashTab)) state.tab = hashTab;
    renderShell();
  }

  function stationName(id) {
    const s = state.meta.stations.find((x) => x.id === Number(id));
    return s ? s.name : 'All locations';
  }

  function renderShell() {
    const o = state.officer;
    app.innerHTML = html`
      <header class="topbar"><div class="inner">
        <div class="brand"><span class="logo">🛡️</span>iHunt</div>
        <span class="chip accent small" style="margin-left:6px"><span class="dot pulse"></span>AI online</span>
        <span class="spacer"></span>
        <select class="input" id="stationSel" style="width:auto;padding:8px 36px 8px 12px;font-size:.88rem">
          <option value="mine">📍 My location</option>
          <option value="all">🌐 All locations</option>
          ${state.meta.stations.map((s) => html`<option value="${s.id}">${stationIcon(s.type)} ${s.name}</option>`)}
        </select>
        <div class="row" style="gap:10px">
          <div class="avatar">${initials(o.name)}</div>
          <div class="small" style="line-height:1.2"><b>${o.name}</b><div class="muted tiny">${o.rank} · ${o.badge}</div></div>
        </div>
        <button class="btn ghost sm" id="logout">Sign out</button>
      </div></header>
      <main class="container">
        <div class="welcome fade-in">
          <div>
            <div class="station-pill">${stationIcon(o.station_type)} ${o.station_name}</div>
            <h2 style="margin-top:10px">Good ${greet()}, ${o.name.split(' ')[0]}</h2>
            <p class="muted">${new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · Viewing <b id="viewing"></b></p>
          </div>
        </div>
        <div class="stats" id="stats">${[1, 2, 3, 4, 5].map(() => '<div class="stat skeleton" style="height:92px"></div>')}</div>
        <nav class="tabs" id="tabs">
          <button class="tab" data-tab="add">➕ Add found item</button>
          <button class="tab" data-tab="today">📅 Today's appointments <span class="count" data-c="today">·</span></button>
          <button class="tab" data-tab="pending">⏳ Pending requests <span class="count" data-c="pending">·</span></button>
          <button class="tab" data-tab="inventory">📦 Inventory</button>
        </nav>
        <section id="panel" style="margin-top:22px"></section>
      </main>
      <div class="footer">iHunt · part of the iSeek · iHunt lost &amp; found network</div>`;
    const sel = app.querySelector('#stationSel');
    sel.value = String(state.station);
    sel.addEventListener('change', () => { state.station = sel.value; refresh(); });
    app.querySelector('#logout').addEventListener('click', async () => { await api('/logout', { method: 'POST' }); showLogin(); });
    app.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => { state.tab = t.dataset.tab; history.replaceState(null, '', `#${state.tab}`); refresh(); }));
    refresh();
  }

  function greet() {
    const h = new Date().getHours();
    return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
  }

  async function refresh() {
    app.querySelector('#viewing').textContent = state.station === 'all' ? 'all locations' : stationName(stationParam());
    app.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === state.tab));
    loadStats();
    const panel = app.querySelector('#panel');
    panel.innerHTML = '<div class="skeleton" style="height:320px"></div>';
    try {
      if (state.tab === 'add') renderAdd(panel);
      else if (state.tab === 'today') await renderToday(panel);
      else if (state.tab === 'pending') await renderPending(panel);
      else await renderInventory(panel);
    } catch (err) {
      panel.innerHTML = html`<div class="card empty-state"><div class="big">⚠️</div><p>${err.message}</p></div>`;
    }
  }

  async function loadStats() {
    const s = await api(`/stats?${q()}`);
    state.stats = s;
    const cards = [
      ['📦', s.available, 'Awaiting owners'],
      ['⏳', s.pending, 'Pending requests'],
      ['📅', s.today, "Today's pickups"],
      ['🤝', s.returned, 'Returned to owners'],
      ['🔭', s.searching, 'Citizens AI-watching'],
    ];
    const box = app.querySelector('#stats');
    if (!box) return;
    box.innerHTML = cards.map(([i, n, l]) => html`<div class="stat fade-in"><div class="l">${i} ${l}</div><div class="n">${n}</div></div>`).join('');
    app.querySelector('[data-c=today]').textContent = s.today;
    app.querySelector('[data-c=pending]').textContent = s.pending;
  }

  function renderAdd(panel) {
    const o = state.officer;
    const defStation = state.station === 'mine' || state.station === 'all' ? o.station_id : Number(state.station);
    panel.innerHTML = html`<form class="form-grid fade-in" id="addForm">
      <div class="card stack">
        <h3>Item details</h3>
        <div class="grid cols-2">
          <label class="field"><span>Police station / location</span>
            <select class="input" name="station_id" required>${state.meta.stations.map((s) => html`<option value="${s.id}" ${raw(s.id === defStation ? 'selected' : '')}>${stationIcon(s.type)} ${s.name}</option>`)}</select></label>
          <label class="field"><span>Item category</span>
            <select class="input" name="category" required><option value="">Select a category…</option>${state.meta.categories.map((c) => html`<option value="${c.name}">${c.icon} ${c.name}</option>`)}</select></label>
        </div>
        <div class="grid cols-2">
          <label class="field"><span>Date &amp; time found</span><input class="input" type="datetime-local" name="found_at" max="${localDateTime()}" value="${localDateTime()}" required></label>
          <label class="field"><span>Where it was found</span><input class="input" name="found_location" placeholder="e.g. Platform 4 bench, Bus route 12" maxlength="200"></label>
        </div>
        <label class="field"><span>Short title</span><input class="input" name="title" placeholder="e.g. Black leather wallet with metro card" maxlength="120"></label>
        <label class="field"><span>Description &amp; identifying marks</span><textarea class="input" name="description" maxlength="1000" placeholder="Brand, colour, contents, scratches, stickers… (avoid disclosing secret details only the owner would know)"></textarea></label>
        <div class="row"><span class="spacer"></span><button type="reset" class="btn ghost">Clear</button><button type="submit" class="btn primary lg">💾 Submit found item</button></div>
      </div>
      <div class="stack">
        <div class="card">
          <div class="row" style="margin-bottom:12px"><h3>Photos</h3><span class="spacer"></span><span class="chip" id="photoCount">0 / 5</span></div>
          <div id="dz"></div>
          <div class="muted tiny" style="margin-top:12px">No photo handy? Try a sample:</div>
          <div class="sample-strip">${SAMPLES.map((s) => html`<button type="button" data-sample="${s}"><img src="/demo-photos/${s}" alt=""></button>`)}</div>
        </div>
        <div class="ai-box" id="aiBox">
          <h4>🤖 Vision AI assistant</h4>
          <p class="muted small" style="margin-top:6px">Add photos and the AI will look at them and suggest the category, colours and a title.</p>
        </div>
      </div>
    </form>`;
    const form = panel.querySelector('#addForm');
    let aiTimer = null;
    const dz = dropzone(panel.querySelector('#dz'), {
      hint: 'Drop photos of the found item',
      onChange: (files) => {
        panel.querySelector('#photoCount').textContent = `${files.length} / 5`;
        clearTimeout(aiTimer);
        if (files.length) aiTimer = setTimeout(() => suggest(files), 350);
        else panel.querySelector('#aiBox').innerHTML = '<h4>🤖 Vision AI assistant</h4><p class="muted small" style="margin-top:6px">Add photos and the AI will look at them and suggest the category, colours and a title.</p>';
      },
    });
    panel.querySelectorAll('[data-sample]').forEach((b) => b.addEventListener('click', () => dz.addUrl(`/demo-photos/${b.dataset.sample}`)));
    let lastSuggestion = null;

    async function suggest(files) {
      const box = panel.querySelector('#aiBox');
      box.innerHTML = '<h4>🤖 Vision AI assistant</h4><div class="row" style="margin-top:10px"><span class="spin" style="border-color:rgba(124,156,255,.3);border-top-color:#7c9cff;width:18px;height:18px;border-width:2px;border-style:solid;border-radius:50%;animation:spin .8s linear infinite"></span><span class="muted small">Looking at the photos…</span></div>';
      const fd = new FormData();
      files.forEach((f) => fd.append('photos', f));
      try {
        const { suggestion } = await api('/ai/suggest', { form: fd });
        lastSuggestion = suggestion;
        box.innerHTML = html`<h4>🤖 Vision AI assistant <span class="spacer"></span><span class="chip ok tiny">analysed ${files.length} photo${files.length > 1 ? 's' : ''}</span></h4>
          <p class="small" style="margin-top:8px">I think this is: <b>${suggestion.title}</b></p>
          <div style="margin-top:10px">${suggestion.categories.map((c) => html`<div class="row small" style="gap:8px;margin-top:6px"><span style="width:170px">${c.name}</span><div class="ai-bar" style="flex:1"><i style="width:${Math.round(c.prob * 100)}%"></i></div><span class="muted tiny" style="width:36px;text-align:right">${Math.round(c.prob * 100)}%</span></div>`)}</div>
          <div class="ai-cats">${suggestion.colors.map((c) => html`<span class="chip">🎨 ${c}</span>`)}</div>
          <button type="button" class="btn primary sm" style="margin-top:14px" id="applyAi">✨ Apply suggestion</button>`;
        box.querySelector('#applyAi').addEventListener('click', applySuggestion);
        if (!form.category.value) applySuggestion(true);
      } catch (err) {
        box.innerHTML = html`<h4>🤖 Vision AI assistant</h4><p class="muted small" style="margin-top:6px">${err.message}</p>`;
      }
    }
    function applySuggestion(silent) {
      if (!lastSuggestion) return;
      form.category.value = lastSuggestion.category;
      if (!form.title.value) form.title.value = lastSuggestion.title;
      if (!form.description.value) form.description.value = lastSuggestion.description;
      if (silent !== true) toast('AI suggestion applied — review before submitting', 'ok');
    }

    form.addEventListener('reset', () => setTimeout(() => { dz.clear(); form.found_at.value = localDateTime(); }, 0));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!dz.files.length) return toast('Please upload at least one photo of the item', 'bad');
      if (form.found_at.value > localDateTime()) return toast('The found date/time cannot be in the future', 'bad');
      const fd = new FormData(form);
      dz.files.forEach((f) => fd.append('photos', f));
      const btn = form.querySelector('button[type=submit]');
      busy(btn, true, 'Saving & AI-indexing…');
      try {
        const { item, notified } = await api('/items', { form: fd });
        busy(btn, false);
        form.reset();
        loadStats();
        const m = modal({
          title: 'Item logged successfully',
          body: html`<div class="success-burst"><div class="big">✅</div>
            <h3 style="margin-top:8px">${item.title}</h3>
            <p class="muted small" style="margin-top:6px">${item.icon} ${item.category} · ${item.station.name}</p>
            <p style="margin-top:14px">Stored in the database with <b>${item.photos.length}</b> photo${item.photos.length > 1 ? 's' : ''} and indexed by the vision AI${item.colors.length ? ` (detected colours: ${item.colors.join(', ')})` : ''}.</p>
            ${raw(notified ? html`<div class="ai-box" style="margin-top:16px;text-align:left"><b>🔔 ${notified} citizen${notified > 1 ? 's were' : ' was'} notified</b><div class="muted small">The AI matched this item to ${notified > 1 ? 'open lost reports' : 'an open lost report'} on iSeek and sent an alert.</div></div>` : '<p class="muted small" style="margin-top:12px">It is now searchable on iSeek. Owners will be alerted if their report matches.</p>')}</div>`,
          foot: html`<button class="btn ghost" data-close>Log another item</button><button class="btn primary" data-inv>View inventory</button>`,
        });
        m.$('[data-inv]').addEventListener('click', () => { m.close(); state.tab = 'inventory'; refresh(); });
      } catch (err) {
        busy(btn, false);
        toast(err.message, 'bad');
      }
    });
  }

  async function renderToday(panel) {
    const { appointments } = await api(`/appointments/today?${q()}`);
    const now = localDateTime();
    if (!appointments.length) {
      panel.innerHTML = html`<div class="card empty-state fade-in"><div class="big">🗓️</div><h3>No pickups scheduled today</h3><p class="muted" style="margin-top:6px">Approved collection appointments for ${fmtDate(localDate())} will appear here.</p></div>`;
      return;
    }
    const done = appointments.filter((a) => a.status === 'completed').length;
    const noShows = appointments.filter((a) => a.status === 'no_show').length;
    panel.innerHTML = html`<div class="row wrap fade-in" style="margin-bottom:14px"><h3>${fmtDate(localDate())}</h3><span class="chip">${appointments.length} appointment${appointments.length > 1 ? 's' : ''}</span><span class="chip ok">${done} collected</span>${raw(noShows ? html`<span class="chip bad">${noShows} no-show</span>` : '')}</div>
      <div id="list"></div>`;
    const list = panel.querySelector('#list');
    let nextMarked = false;
    appointments.forEach((a) => {
      const upcoming = a.status === 'approved' && a.scheduled_at >= now.slice(0, 16);
      const isNext = upcoming && !nextMarked;
      if (isNext) nextMarked = true;
      const row = el(html`<div class="appt fade-in ${a.status !== 'approved' ? 'done' : ''} ${isNext ? 'now' : ''}">
        <div class="time">${fmtTime(a.scheduled_at)}<small>${isNext ? '⭐ Up next' : a.status === 'approved' && !upcoming ? 'Awaiting' : ''}</small></div>
        <div class="pic">${raw(a.item_photo ? html`<img src="${a.item_photo}" alt="">` : '')}</div>
        <div>
          <div class="row wrap" style="gap:8px"><b>${a.item_title}</b>${raw(statusChip(a.status))}</div>
          <div class="small" style="margin-top:4px">👤 <b>${a.user_name}</b> <span class="muted">@${a.user_username}</span> · 📞 ${a.contact_phone || a.user_phone || '—'} · ✉️ ${a.user_email || '—'}</div>
          <div class="muted small" style="margin-top:4px">${stationIcon(a.station_type)} ${a.station_name} · 🧾 Proof: ${a.ownership_proof}</div>
        </div>
        <div class="actions">${raw(a.status === 'approved' ? html`<button class="btn ok sm" data-act="complete">✔ Handed over</button><button class="btn bad sm" data-act="no-show">No-show</button>` : '')}</div>
      </div>`);
      row.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', async () => {
        const act = b.dataset.act;
        const ok = await confirmBox({
          title: act === 'complete' ? 'Confirm hand-over' : 'Mark as no-show',
          message: act === 'complete' ? `Confirm that ${a.user_name} collected "${a.item_title}" after showing a valid photo ID.` : `${a.user_name} did not turn up. The item will become available again.`,
          ok: act === 'complete' ? 'Confirm hand-over' : 'Mark no-show',
          danger: act !== 'complete',
        });
        if (!ok) return;
        try {
          await api(`/appointments/${a.id}/${act}`, { method: 'POST' });
          toast(act === 'complete' ? 'Item handed over — owner notified' : 'Marked as no-show — owner notified', 'ok');
          refresh();
        } catch (err) { toast(err.message, 'bad'); }
      }));
      list.appendChild(row);
    });
  }

  async function renderPending(panel) {
    const { appointments } = await api(`/appointments/pending?${q()}`);
    if (!appointments.length) {
      panel.innerHTML = html`<div class="card empty-state fade-in"><div class="big">🎉</div><h3>All caught up</h3><p class="muted" style="margin-top:6px">There are no pending collection requests ${state.station === 'all' ? '' : 'for this location'}.</p></div>`;
      return;
    }
    panel.innerHTML = '<div id="list"></div>';
    const list = panel.querySelector('#list');
    appointments.forEach((a) => {
      const score = a.match_score ? Math.round(a.match_score) : null;
      const card = el(html`<article class="req fade-in">
        <div class="pic">${raw(a.item_photo ? html`<img src="${a.item_photo}" alt="">` : '')}</div>
        <div class="mid">
          <div class="row wrap" style="gap:8px"><span class="chip">${a.item_category}</span>${raw(statusChip('pending'))}<span class="muted tiny">requested ${ago(a.created_at)}</span></div>
          <h3 style="margin-top:10px">${a.item_title}</h3>
          <div class="muted small" style="margin-top:4px">Found ${fmtDateTime(a.item_found_at)}${a.item_found_location ? ` · ${a.item_found_location}` : ''}</div>
          <div class="proof"><b>Ownership proof from claimant</b>${a.ownership_proof}</div>
          <div class="row wrap small" style="margin-top:12px;gap:16px">
            <span>👤 <b>${a.user_name}</b> <span class="muted">@${a.user_username}</span></span>
            <span>📞 ${a.contact_phone || a.user_phone || '—'}</span><span>✉️ ${a.user_email || '—'}</span>
          </div>
        </div>
        <div class="side">
          <div><div class="muted tiny" style="text-transform:uppercase;letter-spacing:.06em;font-weight:600">Requested pickup</div>
            <div class="when">${fmtDate(a.scheduled_at)}</div><div class="when" style="color:var(--gold)">${fmtTime(a.scheduled_at)}</div>
            <div class="muted tiny" style="margin-top:4px">${stationIcon(a.station_type)} ${a.station_name}</div></div>
          ${raw(score ? html`<div class="row"><div class="score-ring" style="--p:${score}"><span>${score}%</span></div><div class="small muted">AI match between the claimant's search and this item</div></div>` : '')}
          <div class="row" style="margin-top:auto"><button class="btn ok" style="flex:1" data-act="approve">✔ Approve</button><button class="btn bad" style="flex:1" data-act="reject">✕ Reject</button></div>
        </div>
      </article>`);
      card.querySelector('[data-act=approve]').addEventListener('click', async () => {
        const r = await confirmBox({ title: 'Approve appointment', message: `${a.user_name} will be notified to collect "${a.item_title}" on ${fmtDateTime(a.scheduled_at)}. Other pending claims for this item will be declined.`, ok: 'Approve', input: { label: 'Note to claimant (optional)', placeholder: 'e.g. Please bring the purchase receipt' } });
        if (!r) return;
        try { await api(`/appointments/${a.id}/approve`, { body: { note: r.value } }); toast('Appointment approved — claimant notified', 'ok'); refresh(); } catch (err) { toast(err.message, 'bad'); }
      });
      card.querySelector('[data-act=reject]').addEventListener('click', async () => {
        const r = await confirmBox({ title: 'Reject request', message: `Decline ${a.user_name}'s request for "${a.item_title}".`, ok: 'Reject request', danger: true, input: { label: 'Reason (shared with claimant)', placeholder: 'e.g. Ownership details did not match' } });
        if (!r) return;
        try { await api(`/appointments/${a.id}/reject`, { body: { note: r.value } }); toast('Request rejected — claimant notified', 'ok'); refresh(); } catch (err) { toast(err.message, 'bad'); }
      });
      list.appendChild(card);
    });
  }

  async function renderInventory(panel, status = '') {
    const { items } = await api(`/items?${q(status ? { status } : {})}`);
    panel.innerHTML = html`<div class="filters fade-in">
        <input class="input" id="invSearch" placeholder="🔎 Filter by title, category, location…">
        <select class="input" id="invStatus"><option value="">All statuses</option><option value="available">Available</option><option value="reserved">Reserved</option><option value="returned">Returned</option></select>
        <span class="spacer"></span><span class="chip">${items.length} item${items.length === 1 ? '' : 's'}</span>
      </div><div class="grid auto" id="inv"></div>`;
    panel.querySelector('#invStatus').value = status;
    panel.querySelector('#invStatus').addEventListener('change', (e) => renderInventory(panel, e.target.value));
    const grid = panel.querySelector('#inv');
    const draw = (filter) => {
      const f = filter.toLowerCase();
      const shown = items.filter((i) => !f || `${i.title} ${i.category} ${i.found_location} ${i.station_name} ${i.description}`.toLowerCase().includes(f));
      grid.innerHTML = shown.length ? '' : '<div class="card empty-state" style="grid-column:1/-1"><div class="big">📭</div><p class="muted">No items here yet.</p></div>';
      shown.forEach((i) => {
        const c = el(html`<div class="inv-card fade-in">
          <div class="pic">${raw(i.photo ? html`<img src="${i.photo}" alt="" loading="lazy">` : '')}${raw(statusChip(i.status))}</div>
          <div class="body"><b>${i.title}</b><div class="muted small" style="margin-top:4px">${i.category} · ${fmtDate(i.found_at)}</div>
          <div class="muted tiny" style="margin-top:6px">📍 ${i.found_location || i.station_name}${i.pending_requests ? ` · ⏳ ${i.pending_requests} request${i.pending_requests > 1 ? 's' : ''}` : ''}</div></div></div>`);
        c.addEventListener('click', () => openItem(i.id));
        grid.appendChild(c);
      });
    };
    panel.querySelector('#invSearch').addEventListener('input', (e) => draw(e.target.value));
    draw('');
  }

  async function openItem(id) {
    const { item } = await api(`/items/${id}`);
    const m = modal({
      title: html`${item.icon} ${item.title}`,
      wide: true,
      body: html`<div class="grid cols-2">${raw(gallery(item.photos))}<div class="stack">
        <div class="row wrap">${raw(statusChip(item.status))}<span class="chip">${item.category}</span>${item.colors.map((c) => html`<span class="chip">🎨 ${c}</span>`)}</div>
        <p>${item.description || 'No description.'}</p>
        <dl class="kv"><dt>Found</dt><dd>${fmtDateTime(item.found_at)}</dd><dt>Where</dt><dd>${item.found_location || '—'}</dd><dt>Held at</dt><dd>${item.station.name}</dd><dt>AI caption</dt><dd>${item.ai_caption || '—'}</dd></dl>
      </div></div>`,
    });
    wireGallery(m.el);
  }

  api('/me', { allow401: true })
    .then(({ officer }) => { state.officer = officer; return boot(); })
    .catch(() => showLogin());
})();
