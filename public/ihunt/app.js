(function () {
  const { html, raw, el, toast, modal, confirmBox, dropzone, gallery, wireGallery, localDate, localDateTime, fmtDate, fmtTime, fmtDateTime, initials, stationIcon, statusChip, busy, orbs, ago, faceSvg, faceLegend, faceFeatures } = UI;
  const app = document.getElementById('app');
  const api = UI.makeApi('/api/police', () => showLogin());
  const state = { officer: null, meta: null, station: 'mine', tab: 'add', stats: null, peopleView: 'register' };

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
    if (['add', 'today', 'pending', 'inventory', 'people'].includes(hashTab)) state.tab = hashTab;
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
          <button class="tab" data-tab="people">🧑 People</button>
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
      else if (state.tab === 'people') await renderPeople(panel);
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

  const PERSON_SAMPLES = ['police-found-person-cctv.jpg', 'police-found-person-2.jpg'];
  const PEOPLE_VIEWS = [['register', '➕ Register found person'], ['care', '🧑 People in care'], ['reunions', '🤝 Reunion requests'], ['missing', '🔭 Missing reports']];

  async function renderPeople(panel) {
    const s = await api(`/people/stats?${q()}`);
    const counts = { care: s.in_care, reunions: s.reunions_pending + s.reunions_approved, missing: s.missing_open };
    panel.innerHTML = html`<div class="people-head fade-in">
        <nav class="subtabs">${PEOPLE_VIEWS.map(([k, l]) => html`<button class="subtab ${state.peopleView === k ? 'on' : ''}" data-v="${k}">${l}${raw(counts[k] != null ? html` <span class="count">${counts[k]}</span>` : '')}</button>`)}</nav>
        <span class="spacer"></span><span class="chip">🫂 ${s.reunited} reunited</span>
      </div><div id="pp" style="margin-top:18px"></div>`;
    panel.querySelectorAll('.subtab').forEach((b) => b.addEventListener('click', () => { state.peopleView = b.dataset.v; renderPeople(panel); }));
    const pp = panel.querySelector('#pp');
    if (state.peopleView === 'care') await renderInCare(pp);
    else if (state.peopleView === 'reunions') await renderReunions(pp);
    else if (state.peopleView === 'missing') await renderMissing(pp);
    else renderRegister(pp, panel);
  }

  function renderRegister(pp, panel) {
    const o = state.officer;
    const defStation = state.station === 'mine' || state.station === 'all' ? o.station_id : Number(state.station);
    pp.innerHTML = html`<form class="form-grid fade-in" id="personForm">
      <div class="card stack">
        <h3>Found / unidentified person</h3>
        <div class="grid cols-2">
          <label class="field"><span>Station / location in care</span>
            <select class="input" name="station_id" required>${state.meta.stations.map((st) => html`<option value="${st.id}" ${raw(st.id === defStation ? 'selected' : '')}>${stationIcon(st.type)} ${st.name}</option>`)}</select></label>
          <label class="field"><span>Date &amp; time found</span><input class="input" type="datetime-local" name="found_at" max="${localDateTime()}" value="${localDateTime()}" required></label>
        </div>
        <div class="grid cols-2">
          <label class="field"><span>Where found</span><input class="input" name="found_location" maxlength="200" placeholder="e.g. Platform 6 waiting room"></label>
          <label class="field"><span>Name (if known)</span><input class="input" name="name" maxlength="80" placeholder="Leave blank if unidentified"></label>
        </div>
        <div class="grid cols-2">
          <label class="field"><span>Approx. age</span><input class="input" type="number" name="approx_age" min="1" max="109" placeholder="AI can suggest"></label>
          <label class="field"><span>Gender</span><select class="input" name="gender"><option value="">Not recorded</option><option value="female">Female</option><option value="male">Male</option></select></label>
        </div>
        <label class="field"><span>Condition &amp; care status</span><input class="input" name="condition" maxlength="200" placeholder="e.g. Safe — with child-care staff"></label>
        <label class="field"><span>Appearance &amp; circumstances</span><textarea class="input" name="description" maxlength="1000" placeholder="Clothing, language, what they said, belongings…"></textarea></label>
        <div class="row"><span class="spacer"></span><button type="reset" class="btn ghost">Clear</button><button type="submit" class="btn primary lg">💾 Register &amp; run face match</button></div>
      </div>
      <div class="stack">
        <div class="card">
          <div class="row" style="margin-bottom:12px"><h3>Photos</h3><span class="spacer"></span><span class="chip" id="photoCount">0 / 5</span></div>
          <div id="dz"></div>
          <div class="muted tiny" style="margin-top:12px">Demo photos (AI-generated faces):</div>
          <div class="sample-strip">${PERSON_SAMPLES.map((x) => html`<button type="button" data-sample="${x}"><img src="/demo-photos/${x}" alt=""></button>`)}</div>
        </div>
        <div class="ai-box" id="faceBox"><h4>🧠 Face AI</h4><p class="muted small" style="margin-top:6px">Add a photo and the face AI will detect the face, map 68 facial landmarks and estimate age.</p></div>
      </div>
    </form>`;
    const form = pp.querySelector('#personForm');
    let timer = null;
    let estimate = null;
    const box = pp.querySelector('#faceBox');
    const dz = dropzone(pp.querySelector('#dz'), {
      hint: 'Drop clear photos of the person',
      onChange: (files) => {
        pp.querySelector('#photoCount').textContent = `${files.length} / 5`;
        clearTimeout(timer);
        if (files.length) timer = setTimeout(() => analyze(files), 350);
      },
    });
    pp.querySelectorAll('[data-sample]').forEach((b) => b.addEventListener('click', () => dz.addUrl(`/demo-photos/${b.dataset.sample}`)));

    async function analyze(files) {
      box.innerHTML = '<h4>🧠 Face AI</h4><div class="row" style="margin-top:10px"><span class="spin" style="border:2px solid rgba(124,156,255,.3);border-top-color:#7c9cff;width:18px;height:18px;border-radius:50%;animation:spin .8s linear infinite"></span><span class="muted small">Detecting faces &amp; landmarks…</span></div>';
      const fd = new FormData();
      files.forEach((f) => fd.append('photos', f));
      try {
        const { analyses } = await api('/people/analyze', { form: fd });
        const urls = files.map((f) => URL.createObjectURL(f));
        const faces = analyses.map((a) => a.faces[0]).filter(Boolean);
        estimate = faces.length ? { age: Math.round(faces.reduce((t, f) => t + f.age, 0) / faces.length), gender: faces[0].gender } : null;
        box.innerHTML = html`<h4>🧠 Face AI <span class="spacer"></span><span class="chip ${faces.length ? 'ok' : 'bad'} tiny">${faces.length} of ${analyses.length} photo${analyses.length > 1 ? 's' : ''} with a face</span></h4>
          <div class="fa-grid" style="margin-top:12px">${analyses.map((a, i) => faceSvg({ ...a, url: urls[i] }))}</div>
          <div style="margin-top:10px">${raw(faceLegend())}</div>
          ${raw(faces[0] ? html`<div style="margin-top:10px">${raw(faceFeatures(faces[0]))}</div><button type="button" class="btn primary sm" style="margin-top:12px" id="applyFace">✨ Use AI age &amp; gender estimate</button>` : '<p class="small" style="margin-top:10px;color:var(--bad)">No face detected — use a clear, front-facing photo.</p>')}`;
        const ap = box.querySelector('#applyFace');
        if (ap) ap.addEventListener('click', () => { form.approx_age.value = estimate.age; form.gender.value = estimate.gender; toast('AI estimate applied — please verify', 'ok'); });
      } catch (err) {
        box.innerHTML = html`<h4>🧠 Face AI</h4><p class="muted small" style="margin-top:6px">${err.message}</p>`;
      }
    }

    form.addEventListener('reset', () => setTimeout(() => { dz.clear(); form.found_at.value = localDateTime(); }, 0));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!dz.files.length) return toast('Please add at least one photo of the person', 'bad');
      if (form.found_at.value > localDateTime()) return toast('The found date/time cannot be in the future', 'bad');
      const fd = new FormData(form);
      dz.files.forEach((f) => fd.append('photos', f));
      const btn = form.querySelector('button[type=submit]');
      busy(btn, true, 'Registering & face-matching…');
      try {
        const { person, matches } = await api('/people/persons', { form: fd });
        busy(btn, false);
        form.reset();
        const m = modal({
          title: 'Person registered',
          wide: matches.length > 0,
          body: html`<div class="success-burst"><div class="big">✅</div><h3 style="margin-top:8px">${person.display_name}</h3>
            <p class="muted small" style="margin-top:6px">${stationIcon(person.station.type)} ${person.station.name} · ${person.photos.length} photo${person.photos.length > 1 ? 's' : ''} face-indexed</p></div>
            ${raw(matches.length ? html`<div class="ai-box" style="margin-top:16px"><b>🔔 ${matches.length} famil${matches.length > 1 ? 'ies were' : 'y was'} notified of a possible match</b><div class="muted small">The face AI compared this person with every open missing-person report on iSeek.</div>
              ${matches.map((x) => html`<div class="face-pair" style="margin-top:14px"><div>${raw(x.report.photos[x.query_photo || 0] ? faceSvg(x.report.photos[x.query_photo || 0], { crop: true }) : html`<div class="muted small">“${x.report.description}”</div>`)}<div class="cap">Family photo · ${x.report.user_name}</div></div>
                <div class="vs">${x.confidence}%</div><div>${raw(faceSvg(person.photos[x.best_photo || 0], { crop: true, face: x.target_face }))}<div class="cap">${x.report.name || 'Reported person'}</div></div></div>`)}</div>` : '<p class="muted small" style="margin-top:12px;text-align:center">No open family reports match yet — families searching later will find this person.</p>')}`,
          foot: html`<button class="btn ghost" data-close>Register another</button><button class="btn primary" data-care>View people in care</button>`,
        });
        m.$('[data-care]').addEventListener('click', () => { m.close(); state.peopleView = 'care'; renderPeople(panel); });
      } catch (err) {
        busy(btn, false);
        toast(err.message, 'bad');
      }
    });
  }

  async function renderInCare(pp, status = 'in_care') {
    const { persons } = await api(`/people/persons?${q({ status })}`);
    pp.innerHTML = html`<div class="filters fade-in"><select class="input" id="pStatus" style="max-width:220px"><option value="in_care">In care</option><option value="reunited">Reunited</option></select><span class="spacer"></span><span class="chip">${persons.length} ${persons.length === 1 ? 'person' : 'people'}</span></div><div class="grid auto" id="pg"></div>`;
    pp.querySelector('#pStatus').value = status;
    pp.querySelector('#pStatus').addEventListener('change', (e) => renderInCare(pp, e.target.value));
    const grid = pp.querySelector('#pg');
    if (!persons.length) grid.innerHTML = '<div class="card empty-state" style="grid-column:1/-1"><div class="big">🧑</div><p class="muted">Nobody registered here.</p></div>';
    persons.forEach((p) => {
      const c = el(html`<div class="inv-card person-card fade-in"><div class="pic">${raw(faceSvg(p.photos[0], { crop: true }))}${raw(statusChip(p.status))}</div>
        <div class="body"><b>${p.display_name}</b><div class="muted small" style="margin-top:4px">${p.age ? `~${p.age} yrs` : 'Age unknown'}${p.gender ? ` · ${p.gender}` : ''} · ${fmtDate(p.found_at)}</div>
        <div class="muted tiny" style="margin-top:6px">📍 ${p.found_location || p.station.name}</div></div></div>`);
      c.addEventListener('click', () => openPersonPolice(p, () => renderInCare(pp, status)));
      grid.appendChild(c);
    });
  }

  function openPersonPolice(p, onChange) {
    const m = modal({
      title: html`🧑 ${p.display_name}`,
      wide: true,
      body: html`<div class="grid cols-2"><div class="stack"><div id="pmain">${raw(faceSvg(p.photos[0]))}</div>
          ${raw(p.photos.length > 1 ? html`<div class="row" style="gap:8px">${p.photos.map((ph, i) => html`<button type="button" class="thumb-face" data-i="${i}">${raw(faceSvg(ph, { crop: true }))}</button>`)}</div>` : '')}${raw(faceLegend())}</div>
        <div class="stack"><div class="row wrap">${raw(statusChip(p.status))}</div>
          <dl class="kv"><dt>Age</dt><dd>${p.age ? `~${p.age}` : '—'}${p.age_source === 'ai' ? ' (AI estimate)' : ''}${p.ai_age && p.age_source !== 'ai' ? ` · AI est. ${p.ai_age}` : ''}</dd><dt>Gender</dt><dd>${p.gender || '—'}${p.gender_source === 'ai' ? ' (AI estimate)' : ''}</dd>
            <dt>Found</dt><dd>${fmtDateTime(p.found_at)}</dd><dt>Where</dt><dd>${p.found_location || '—'}</dd><dt>Condition</dt><dd>${p.condition || '—'}</dd><dt>In care at</dt><dd>${p.station.name}</dd><dt>Registered by</dt><dd>${p.officer ? `${p.officer.name} · ${p.officer.badge}` : '—'}</dd></dl>
          ${raw(p.description ? html`<p class="small">${p.description}</p>` : '')}
          ${raw(p.photos[0] && p.photos[0].faces[0] ? faceFeatures(p.photos[0].faces[0]) : '')}</div></div>`,
      foot: p.status === 'in_care' ? html`<button class="btn ghost" data-close>Close</button><button class="btn ok" data-reunited>🫂 Mark reunited</button>` : html`<button class="btn ghost" data-close>Close</button>`,
    });
    m.el.querySelectorAll('.thumb-face').forEach((b) => b.addEventListener('click', () => { m.$('#pmain').innerHTML = faceSvg(p.photos[Number(b.dataset.i)]); }));
    const r = m.$('[data-reunited]');
    if (r) r.addEventListener('click', async () => {
      try { await api(`/people/persons/${p.id}/reunited`, { method: 'POST' }); m.close(); toast('Marked as reunited', 'ok'); onChange(); } catch (err) { toast(err.message, 'bad'); }
    });
  }

  async function renderReunions(pp) {
    const [{ reunions: pending }, { reunions: approved }] = await Promise.all([api(`/people/reunions?${q({ status: 'pending' })}`), api(`/people/reunions?${q({ status: 'approved' })}`)]);
    const all = [...pending, ...approved];
    if (!all.length) {
      pp.innerHTML = '<div class="card empty-state fade-in"><div class="big">🤝</div><h3>No reunion requests</h3><p class="muted" style="margin-top:6px">Families request a verified meeting from iSeek after a possible face match.</p></div>';
      return;
    }
    pp.innerHTML = '<div id="list"></div>';
    const list = pp.querySelector('#list');
    all.forEach((r) => {
      const fam = r.report && r.report.photos[0];
      const card = el(html`<article class="req reunion fade-in">
        <div class="pic-pair face-pair">${raw(fam ? html`<div>${raw(faceSvg(fam, { crop: true }))}<div class="cap">Family photo</div></div>` : '<div class="muted small">No family photo</div>')}<div class="vs">${r.match_score ? `${Math.round(r.match_score)}%` : 'VS'}</div><div>${raw(r.person ? faceSvg(r.person.photos[0], { crop: true }) : '')}<div class="cap">In care</div></div></div>
        <div class="mid">
          <div class="row wrap" style="gap:8px">${raw(statusChip(r.status === 'completed' ? 'reunited' : r.status))}<span class="muted tiny">requested ${ago(r.created_at)}</span></div>
          <h3 style="margin-top:10px">${r.person ? r.person.display_name : 'Person'}${r.report && r.report.name ? html` <span class="muted small">· reported as “${r.report.name}”</span>` : ''}</h3>
          <div class="proof"><b>Relation: ${r.relation}</b>${r.proof}</div>
          <div class="row wrap small" style="margin-top:12px;gap:16px"><span>👤 <b>${r.user_name}</b> <span class="muted">@${r.user_username}</span></span><span>📞 ${r.contact_phone || r.user_phone || '—'}</span><span>✉️ ${r.user_email || '—'}</span></div>
          <div class="review-note" style="margin-top:12px"><span>🛡️</span><div>Face similarity is a lead, not proof. Verify photo ID and relationship documents before releasing the person.</div></div>
        </div>
        <div class="side">
          <div><div class="muted tiny" style="text-transform:uppercase;letter-spacing:.06em;font-weight:600">Requested meeting</div>
            <div class="when">${fmtDate(r.scheduled_at)}</div><div class="when" style="color:var(--gold)">${fmtTime(r.scheduled_at)}</div>
            <div class="muted tiny" style="margin-top:4px">${stationIcon(r.station_type)} ${r.station_name}</div></div>
          <div class="row" style="margin-top:auto">${raw(r.status === 'pending' ? '<button class="btn ok" style="flex:1" data-act="approve">✔ Approve</button><button class="btn bad" style="flex:1" data-act="reject">✕ Reject</button>' : '<button class="btn ok" style="flex:1" data-act="complete">🫂 Identity verified — reunited</button>')}</div>
        </div></article>`);
      card.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', async () => {
        const act = b.dataset.act;
        const conf = {
          approve: { title: 'Approve meeting', message: `${r.user_name} will be invited to meet on ${fmtDateTime(r.scheduled_at)} to verify identity.`, ok: 'Approve', input: { label: 'Note to family (optional)', placeholder: 'e.g. Please bring the birth certificate' } },
          reject: { title: 'Reject request', message: `Decline ${r.user_name}'s reunion request.`, ok: 'Reject', danger: true, input: { label: 'Reason (shared with family)', placeholder: 'e.g. Relationship could not be established' } },
          complete: { title: 'Confirm reunion', message: `Confirm you verified ${r.user_name}'s photo ID and relationship, and the person has been reunited.`, ok: 'Confirm reunion' },
        }[act];
        const res = await confirmBox(conf);
        if (!res) return;
        try {
          await api(`/people/reunions/${r.id}/${act}`, { body: { note: res.value } });
          toast({ approve: 'Meeting approved — family notified', reject: 'Request declined — family notified', complete: 'Reunited — family notified' }[act], 'ok');
          refresh();
        } catch (err) { toast(err.message, 'bad'); }
      }));
      list.appendChild(card);
    });
  }

  async function renderMissing(pp) {
    const { reports } = await api('/people/missing');
    pp.innerHTML = html`<p class="muted small fade-in" style="margin-bottom:14px">Open missing-person reports filed by families on iSeek. Every person you register is automatically face-matched against these.</p><div class="grid auto" id="mg"></div>`;
    const grid = pp.querySelector('#mg');
    if (!reports.length) grid.innerHTML = '<div class="card empty-state" style="grid-column:1/-1"><p class="muted">No open reports.</p></div>';
    reports.forEach((r) => {
      grid.appendChild(el(html`<div class="card fade-in stack">
        ${raw(r.photos.length ? faceSvg(r.photos[0], { crop: true }) : html`<div class="quote">“${r.description}”</div>`)}
        <div class="row wrap">${raw(statusChip(r.status))}<span class="chip">${r.mode === 'photo' ? '📸 Face' : '💬 Description'}</span></div>
        <div><b>${r.name || 'Name not given'}</b><div class="muted small">${[r.age ? `${r.age} yrs` : '', r.gender || '', r.last_seen_location ? `last seen ${r.last_seen_location}` : ''].filter(Boolean).join(' · ') || '—'}</div></div>
        <div class="muted tiny">Reported by ${r.user_name}${r.relation ? ` (${r.relation})` : ''} · 📞 ${r.user_phone || '—'} · ${ago(r.created_at)}</div></div>`));
    });
  }

  api('/me', { allow401: true })
    .then(({ officer }) => { state.officer = officer; return boot(); })
    .catch(() => showLogin());
})();
