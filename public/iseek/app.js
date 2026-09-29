(function () {
  const { html, raw, el, esc, toast, modal, confirmBox, dropzone, gallery, wireGallery, localDate, localDateTime, fmtDate, fmtTime, fmtDateTime, initials, stationIcon, statusChip, mapLink, busy, orbs, ago, faceSvg, faceLegend, faceFeatures, geometryTable } = UI;
  const app = document.getElementById('app');
  const api = UI.makeApi('/api/user', () => showAuth());
  const state = { user: null, unread: 0, meta: null, lastSearch: null };
  const NOT_FOUND = 'Your item has not been found yet. We will let you know when the item is found by sending a notification.';

  const DEMO = [
    ['john', 'John Miller'], ['priya', 'Priya Patel'], ['ahmed', 'Ahmed Khan'],
    ['maria', 'Maria Garcia'], ['chen', 'Chen Wei'], ['sara', 'Sara Johnson'],
  ];
  const SAMPLES = [
    'lost-green-iphone.jpg', 'lost-blue-backpack.jpg', 'lost-nikon-camera.jpg', 'lost-red-honda-civic.jpg', 'lost-white-fiat-suv.jpg',
    'lost-teddy-bear.jpg', 'lost-guitar.jpg', 'lost-house-keys.jpg', 'lost-airpods.jpg', 'lost-dji-drone.jpg',
  ];
  const EXAMPLES = [
    'I lost my green iPhone with three cameras',
    'Navy blue backpack with school notebooks',
    'Red hatchback car, Honda',
    'Nikon DSLR camera',
    "My kid's teddy bear wearing a red sweater",
    'Ford car key fob',
    'Gold necklace',
    'Silver MacBook laptop',
    'Brown leather cowboy boots',
  ];
  const ROUTES = ['home', 'photo', 'describe', 'people', 'family', 'requests', 'alerts', 'reports'];

  orbs();

  function showAuth(mode = 'login') {
    state.user = null;
    app.innerHTML = html`<div class="auth">
      <section class="auth-hero">
        <div class="brand"><span class="logo">🔍</span>iSeek</div>
        <h1>Lost something?<br><span class="grad-text">Let AI find it.</span></h1>
        <p class="muted" style="max-width:520px;font-size:1.08rem">Upload a photo or simply describe your item. iSeek's vision AI searches every item handed in at police stations, airports, railway offices and corporate security desks — and alerts you the moment it turns up.</p>
        <div class="row wrap" style="margin-top:18px">
          <span class="chip accent">📸 Photo search</span><span class="chip accent">💬 Describe it</span><span class="chip accent">🔔 Found alerts</span><span class="chip accent">📅 Book pickup</span>
        </div>
        <div class="float-cards">
          <div class="fc"><img src="/demo-photos/lost-teddy-bear.jpg" alt=""><b>Teddy bear</b><span class="chip ok">✓ 98% match</span></div>
          <div class="fc"><img src="/demo-photos/lost-green-iphone.jpg" alt=""><b>Green iPhone</b><span class="chip ok">✓ Central PS</span></div>
          <div class="fc"><img src="/demo-photos/lost-nikon-camera.jpg" alt=""><b>Nikon camera</b><span class="chip accent">📅 Pickup booked</span></div>
        </div>
      </section>
      <section class="auth-panel">
        <div class="card pad-lg auth-card fade-in">
          <div class="seg"><button data-m="login" class="${mode === 'login' ? 'on' : ''}">Sign in</button><button data-m="register" class="${mode === 'register' ? 'on' : ''}">Create account</button></div>
          ${raw(mode === 'login' ? loginForm() : registerForm())}
          <div class="muted tiny" style="margin-top:20px;text-align:center">Police or security staff? <a href="/ihunt/">Go to iHunt →</a></div>
        </div>
      </section>
    </div>`;
    app.querySelectorAll('.seg button').forEach((b) => b.addEventListener('click', () => showAuth(b.dataset.m)));
    const form = app.querySelector('form');
    app.querySelectorAll('.demo-acc').forEach((b) => b.addEventListener('click', () => {
      form.username.value = b.dataset.u;
      form.password.value = 'iseek@123';
      form.requestSubmit();
    }));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = form.querySelector('button[type=submit]');
      busy(btn, true, mode === 'login' ? 'Signing in…' : 'Creating account…');
      try {
        const body = Object.fromEntries(new FormData(form).entries());
        const { user } = await api(mode === 'login' ? '/login' : '/register', { body, allow401: true });
        state.user = user;
        if (mode === 'register') toast(`Welcome to iSeek, ${user.name.split(' ')[0]}!`, 'ok');
        await boot();
      } catch (err) {
        toast(err.message, 'bad');
        busy(btn, false);
      }
    });
  }

  function loginForm() {
    return html`<h2>Welcome back</h2><p class="muted small" style="margin-top:6px">Sign in to search and track your lost items.</p>
      <form class="stack" style="margin-top:20px">
        <label class="field"><span>Username</span><input class="input" name="username" autocomplete="username" placeholder="john" required></label>
        <label class="field"><span>Password</span><input class="input" name="password" type="password" autocomplete="current-password" placeholder="••••••••" required></label>
        <button class="btn primary block lg" type="submit">Sign in</button>
      </form>
      <div style="margin-top:22px">
        <div class="row" style="margin-bottom:10px"><b class="small">Demo accounts</b><span class="spacer"></span><span class="chip">password: iseek@123</span></div>
        <div class="demo-list">${DEMO.map(([u, n]) => html`<button type="button" class="demo-acc" data-u="${u}"><b>${n}</b><small>@${u}</small></button>`)}</div>
      </div>`;
  }

  function registerForm() {
    return html`<h2>Create your account</h2><p class="muted small" style="margin-top:6px">Free for everyone. We only share your contact details with the desk holding your item.</p>
      <form class="stack" style="margin-top:20px">
        <label class="field"><span>Full name</span><input class="input" name="name" required maxlength="80" placeholder="Jane Doe"></label>
        <div class="grid cols-2">
          <label class="field"><span>Username</span><input class="input" name="username" required pattern="[a-zA-Z0-9._\\-]{3,30}" placeholder="jane.doe"></label>
          <label class="field"><span>Password</span><input class="input" name="password" type="password" required minlength="6" placeholder="min 6 characters"></label>
        </div>
        <div class="grid cols-2">
          <label class="field"><span>Email</span><input class="input" name="email" type="email" placeholder="jane@example.com"></label>
          <label class="field"><span>Phone</span><input class="input" name="phone" placeholder="+1 555 0000"></label>
        </div>
        <button class="btn primary block lg" type="submit">Create account</button>
      </form>`;
  }

  async function boot() {
    const me = await api('/me');
    state.user = me.user;
    state.unread = me.unread;
    if (!state.meta) state.meta = await api('/meta');
    renderShell();
    window.onhashchange = route;
    route();
  }

  function renderShell() {
    const u = state.user;
    app.innerHTML = html`<header class="topbar"><div class="inner">
        <a class="brand" href="#home" style="color:inherit"><span class="logo">🔍</span>iSeek</a>
        <nav class="nav-links">
          <a href="#home" data-r="home">Home</a><a href="#photo" data-r="photo">Photo search</a><a href="#describe" data-r="describe">Describe</a><a href="#people" data-r="people">Find a person</a>
          <a href="#requests" data-r="requests">My appointments</a><a href="#reports" data-r="reports">AI watchlist</a>
        </nav>
        <span class="spacer"></span>
        <button class="icon-btn" id="bell" title="Notifications">🔔<span class="badge ${state.unread ? '' : 'hidden'}" id="unread">${state.unread}</span></button>
        <div class="row" style="gap:10px"><div class="avatar">${initials(u.name)}</div><div class="small" style="line-height:1.2"><b>${u.name}</b><div class="muted tiny">@${u.username}</div></div></div>
        <button class="btn ghost sm" id="logout">Sign out</button>
      </div></header>
      <main class="container" id="view"></main>
      <div class="footer">iSeek · connected to police stations, airport, railway and corporate lost &amp; found desks via iHunt</div>`;
    app.querySelector('#bell').addEventListener('click', () => { location.hash = 'alerts'; });
    app.querySelector('#logout').addEventListener('click', async () => { await api('/logout', { method: 'POST' }); window.onhashchange = null; history.replaceState(null, '', '/iseek/'); showAuth(); });
  }

  function setUnread(n) {
    state.unread = n;
    const b = app.querySelector('#unread');
    if (!b) return;
    b.textContent = n;
    b.classList.toggle('hidden', !n);
  }

  async function route() {
    const r = ROUTES.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'home';
    app.querySelectorAll('.nav-links a').forEach((a) => a.classList.toggle('on', a.dataset.r === r));
    const view = app.querySelector('#view');
    window.scrollTo({ top: 0 });
    try {
      if (r === 'home') await renderHome(view);
      else if (r === 'photo') renderPhotoSearch(view);
      else if (r === 'describe') renderTextSearch(view);
      else if (r === 'people') renderPeople(view);
      else if (r === 'family') await renderFamily(view);
      else if (r === 'requests') await renderRequests(view);
      else if (r === 'alerts') await renderAlerts(view);
      else if (r === 'reports') await renderReports(view);
    } catch (err) {
      view.innerHTML = html`<div class="card empty-state"><div class="big">⚠️</div><p>${err.message}</p></div>`;
    }
  }

  async function renderHome(view) {
    const [ap, rp, me] = await Promise.all([api('/appointments'), api('/reports'), api('/me')]);
    setUnread(me.unread);
    const upcoming = ap.appointments.filter((a) => ['pending', 'approved'].includes(a.status));
    const watching = rp.reports.filter((r) => r.status === 'searching').length;
    const next = ap.appointments.filter((a) => a.status === 'approved').sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))[0];
    view.innerHTML = html`<section class="hero fade-in">
        <span class="chip" style="background:rgba(255,255,255,.18);color:#fff"><span class="dot pulse"></span>AI search is online</span>
        <h2 style="margin-top:14px">Hi ${state.user.name.split(' ')[0]}, what are we looking for today?</h2>
        <p>Choose how you'd like to search. Our AI compares your photos or words with every item handed in across the network and shows you where it's held.</p>
        ${raw(next ? html`<div style="position:relative;margin-top:18px;display:inline-flex;gap:10px;align-items:center;background:rgba(255,255,255,.16);padding:10px 14px;border-radius:14px">📅 <span>Next pickup: <b>${next.item_title}</b> · ${fmtDateTime(next.scheduled_at)} at ${next.station_name}</span></div>` : '')}
      </section>
      <section class="options">
        <button class="option fade-in" data-go="photo"><div class="oi">📸</div><h3>Find by uploading a photo</h3><p class="muted" style="margin-top:6px">Upload up to 5 photos of your item — or a similar one. The vision AI looks at shape, colour and details to find it.</p><div class="go">Start photo search →</div><div class="deco">📷</div></button>
        <button class="option teal fade-in" data-go="describe"><div class="oi">💬</div><h3>Find by describing the item</h3><p class="muted" style="margin-top:6px">Tell us what it looks like in your own words. The AI imagines the item and compares it to every photo in the database.</p><div class="go">Describe my item →</div><div class="deco">✍️</div></button>
        <button class="option person fade-in" data-go="people"><div class="oi">🧑</div><div><h3>Find a missing person</h3><p class="muted" style="margin-top:6px">Upload a photo of a missing family member. The face AI maps 68 facial landmarks and compares them with people found by police, airport, railway and security staff.</p><div class="go">Start a face search →</div></div><div class="deco">🫂</div></button>
      </section>
      <section class="quick">
        <div class="card fade-in" data-go="requests"><div class="muted small">📅 Active appointments</div><div class="n">${upcoming.length}</div><div class="muted tiny">${upcoming.filter((a) => a.status === 'pending').length} awaiting approval</div></div>
        <div class="card fade-in" data-go="reports"><div class="muted small">🔭 Items the AI is watching for</div><div class="n">${watching}</div><div class="muted tiny">You'll be notified when found</div></div>
        <div class="card fade-in" data-go="alerts"><div class="muted small">🔔 Unread notifications</div><div class="n">${me.unread}</div><div class="muted tiny">Matches &amp; appointment updates</div></div>
      </section>`;
    view.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => { location.hash = b.dataset.go; }));
  }

  function renderPhotoSearch(view) {
    view.innerHTML = html`<a class="back" href="#home">← Back to home</a>
      <div class="page-head"><div><h2>📸 Find by photo</h2><p class="muted">Upload up to 5 photos of your lost item, then click <b>Find</b>.</p></div></div>
      <div class="search-layout">
        <div class="card fade-in">
          <div id="dz"></div>
          <div class="muted tiny" style="margin-top:14px">Try a demo photo (simulated owner snapshots):</div>
          <div class="sample-strip">${SAMPLES.map((s) => html`<button type="button" data-sample="${s}" title="${s.replace('lost-', '').replace('.jpg', '').replace(/-/g, ' ')}"><img src="/demo-photos/${s}" alt=""></button>`)}</div>
          <button class="btn primary block lg" id="find" style="margin-top:18px" disabled>🔍 Find my item</button>
        </div>
        <div id="results">${raw(introPanel('photo'))}</div>
      </div>`;
    const btn = view.querySelector('#find');
    const dz = dropzone(view.querySelector('#dz'), { hint: 'Drop photos of your item here', onChange: (f) => { btn.disabled = !f.length; } });
    view.querySelectorAll('[data-sample]').forEach((b) => b.addEventListener('click', () => dz.addUrl(`/demo-photos/${b.dataset.sample}`)));
    btn.addEventListener('click', async () => {
      const fd = new FormData();
      dz.files.forEach((f) => fd.append('photos', f));
      const previews = dz.files.map((f) => URL.createObjectURL(f));
      busy(btn, true, 'AI is searching…');
      await runSearch(view.querySelector('#results'), () => api('/search/photo', { form: fd }), { kind: 'photo', previews });
      busy(btn, false);
    });
  }

  function renderTextSearch(view) {
    view.innerHTML = html`<a class="back" href="#home">← Back to home</a>
      <div class="page-head"><div><h2>💬 Find by description</h2><p class="muted">Describe the item — type, colour, brand, anything distinctive.</p></div></div>
      <div class="search-layout">
        <div class="card fade-in">
          <label class="field"><span>Describe your item</span><textarea class="input" id="desc" rows="5" maxlength="1000" placeholder="e.g. A navy blue JanSport backpack with a laptop sleeve and a star keychain"></textarea></label>
          <div class="muted tiny" style="margin-top:12px">Try an example:</div>
          <div class="examples">${EXAMPLES.map((e) => html`<button type="button">${e}</button>`)}</div>
          <button class="btn primary block lg" id="find" style="margin-top:18px">🔍 Find my item</button>
        </div>
        <div id="results">${raw(introPanel('text'))}</div>
      </div>`;
    const ta = view.querySelector('#desc');
    const btn = view.querySelector('#find');
    view.querySelectorAll('.examples button').forEach((b) => b.addEventListener('click', () => { ta.value = b.textContent; ta.focus(); }));
    const go = async () => {
      const description = ta.value.trim();
      if (description.length < 3) return toast('Please describe your item in a few words', 'bad');
      busy(btn, true, 'AI is searching…');
      await runSearch(view.querySelector('#results'), () => api('/search/text', { body: { description } }), { kind: 'text', description });
      busy(btn, false);
    };
    btn.addEventListener('click', go);
    ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) go(); });
  }

  function introPanel(kind) {
    const steps = kind === 'photo'
      ? [['👁️', 'Vision AI looks at your photos', 'Identifies the item type, colours and visual fingerprint'], ['🧬', 'Builds a 512-d visual embedding', 'A numeric signature of what your item looks like'], ['🔎', 'Compares with every found item', 'Across police, airport, railway and corporate desks'], ['📍', 'Shows where it is held', 'With address, hours, phone and pickup booking']]
      : [['📖', 'Language AI reads your description', 'Understands the type of item, colours and brand'], ['🎨', 'Imagines what it looks like', 'Projects your words into the same space as photos'], ['🔎', 'Visually compares every found item', 'Text-to-image similarity + keyword matching'], ['📍', 'Shows where it is held', 'With address, hours, phone and pickup booking']];
    return html`<div class="card fade-in"><h3>How the AI agent searches</h3><ul class="trace" style="margin-top:10px">${steps.map(([i, t, d]) => html`<li class="show"><span class="ti">${i}</span><div><b>${t}</b><div class="muted small">${d}</div></div></li>`)}</ul></div>`;
  }

  async function runSearch(box, call, ctx) {
    const visual = ctx.kind === 'photo'
      ? html`<div class="scan">${ctx.previews.map((p) => html`<img src="${p}" alt="">`)}<div class="grid-ov"></div></div>`
      : html`<div class="scan text"><div>“${ctx.description}”</div><div class="grid-ov"></div></div>`;
    const pending = ctx.kind === 'photo'
      ? ['Uploading photos securely', 'Vision AI is looking at your photos', 'Extracting visual features', 'Comparing with found items across the network']
      : ['Reading your description', 'Understanding item type & colour', 'Imagining what the item looks like', 'Comparing with found items across the network'];
    box.innerHTML = html`<div class="card fade-in">${raw(visual)}<ul class="trace" id="tr" style="margin-top:14px">${pending.map((p) => html`<li><span class="ti"><span class="spin" style="border-color:rgba(109,76,255,.25);border-top-color:#6d4cff"></span></span><div><b>${p}</b></div></li>`)}</ul></div>`;
    const lis = [...box.querySelectorAll('#tr li')];
    let k = 0;
    const tick = setInterval(() => { if (k < lis.length) lis[k++].classList.add('show'); }, 380);
    let data;
    try {
      [data] = await Promise.all([call(), new Promise((r) => setTimeout(r, 1500))]);
    } catch (err) {
      clearInterval(tick);
      box.innerHTML = html`<div class="card empty-state"><div class="big">⚠️</div><p>${err.message}</p></div>`;
      return;
    }
    clearInterval(tick);
    state.lastSearch = { ...data, ctx };
    renderResults(box, data, ctx);
  }

  function traceCard(data) {
    return html`<details class="card flat" style="margin-top:18px"><summary style="cursor:pointer;font-weight:700">🤖 AI agent reasoning · ${data.ms} ms</summary>
      <ul class="trace" style="margin-top:8px">${data.trace.map((t) => html`<li class="show"><span class="ti">${t.icon}</span><div><b>${t.title}</b>${raw(t.detail ? html`<div class="muted small">${t.detail}</div>` : '')}</div></li>`)}</ul></details>`;
  }

  function analysisChips(data) {
    const a = data.analysis || {};
    const cats = (a.categories || []).map((c) => (typeof c === 'string' ? c : `${c.name} ${Math.round(c.prob * 100)}%`)).slice(0, 2);
    const colors = (a.colors || []).map((c) => (typeof c === 'string' ? c : c.name)).slice(0, 2);
    return html`<div class="row wrap" style="gap:6px">${a.caption ? raw(html`<span class="chip accent">👁️ AI sees: ${a.caption}</span>`) : ''}${cats.map((c) => html`<span class="chip">🏷️ ${c}</span>`)}${colors.map((c) => html`<span class="chip">🎨 ${c}</span>`)}</div>`;
  }

  function confColor(c) { return c >= 80 ? '#16a34a' : c >= 60 ? '#6d4cff' : '#d97706'; }

  function renderResults(box, data, ctx) {
    if (!data.found) {
      box.innerHTML = html`<div class="fade-in"><div class="notfound">
          <div class="big">🕵️</div>
          <h3>${NOT_FOUND}</h3>
          <p class="muted" style="margin-top:10px">We've saved your ${ctx.kind === 'photo' ? `photo${ctx.previews.length > 1 ? 's' : ''}` : 'description'} to your AI watchlist. Every new item logged by police, airport or security staff is automatically compared against it.</p>
          <div class="row wrap" style="justify-content:center;margin-top:18px"><span class="chip">${raw(statusChip('searching'))}</span></div>
          <div style="margin-top:14px">${raw(analysisChips(data))}</div>
          <div class="row" style="justify-content:center;margin-top:20px"><a class="btn ghost" href="#reports">View my watchlist</a><a class="btn primary" href="#home">Back to home</a></div>
        </div>${raw(traceCard(data))}</div>`;
      return;
    }
    box.innerHTML = html`<div class="fade-in">
      <div class="row wrap" style="margin-bottom:14px"><h3>${data.matches.length} possible match${data.matches.length > 1 ? 'es' : ''} found</h3><span class="spacer"></span>${raw(analysisChips(data))}</div>
      <div id="ml"></div>
      <div class="card flat" style="margin-top:18px;text-align:center"><b>None of these is yours?</b><p class="muted small" style="margin-top:4px">Save this search and we'll notify you as soon as a matching item is handed in.</p><button class="btn ghost" id="watch" style="margin-top:12px">🔔 Notify me when it's found</button></div>
      ${raw(traceCard(data))}</div>`;
    const ml = box.querySelector('#ml');
    data.matches.forEach((m, idx) => ml.appendChild(matchCard(m, idx, data)));
    box.querySelector('#watch').addEventListener('click', async (e) => {
      try {
        await api(`/reports/${data.report_id}/activate`, { method: 'POST' });
        e.target.disabled = true;
        e.target.textContent = '✓ Added to your AI watchlist';
        toast(NOT_FOUND, 'ok');
      } catch (err) { toast(err.message, 'bad'); }
    });
  }

  function stationBlock(st) {
    return html`<div class="station"><div class="si">${stationIcon(st.type)}</div><div>
      <b>${st.name}</b><div class="small">${st.address}, ${st.city}</div>
      <div class="muted small" style="margin-top:4px">🕘 ${st.hours} · 📞 <a href="tel:${st.phone}">${st.phone}</a> · ✉️ <a href="mailto:${st.email}">${st.email}</a></div>
      <a class="small" href="${mapLink(st)}" target="_blank" rel="noopener" style="font-weight:600;display:inline-block;margin-top:6px">🗺️ Open in Maps</a></div></div>`;
  }

  function matchCard(m, idx, data) {
    const photo = m.photos[m.best_photo || 0] || m.photos[0];
    const card = el(html`<article class="match fade-in ${idx === 0 ? 'best' : ''}" style="animation-delay:${idx * 80}ms">
      <div class="pic">${raw(photo ? html`<img src="${photo}" alt="">` : '')}<span class="rank">${idx === 0 ? '⭐ Best match' : `#${idx + 1}`}</span>${raw(m.photos.length > 1 ? html`<span class="more">📷 ${m.photos.length} photos</span>` : '')}</div>
      <div class="body">
        <div class="row" style="align-items:flex-start">
          <div style="flex:1"><div class="row wrap" style="gap:6px"><span class="chip">${m.icon} ${m.category}</span>${m.colors.map((c) => html`<span class="chip">🎨 ${c}</span>`)}</div>
            <h3 style="margin-top:8px;font-size:1.25rem">${m.title}</h3>
            <div class="muted small" style="margin-top:2px">Found ${fmtDateTime(m.found_at)}${m.found_location ? ` · ${m.found_location}` : ''}</div></div>
          <div style="text-align:center"><div class="conf" style="--p:${m.confidence};--c:${confColor(m.confidence)}"><span>${m.confidence}%</span></div><div class="muted tiny" style="margin-top:4px">AI match</div></div>
        </div>
        ${raw(m.description ? html`<p class="small">${m.description}</p>` : '')}
        <div class="reason">🤖 ${m.reason}</div>
        ${raw(stationBlock(m.station))}
        <div class="row wrap"><button class="btn ghost sm" data-view>View photos</button><span class="spacer"></span><button class="btn primary" data-book>✋ This is mine — book pickup</button></div>
      </div></article>`);
    card.querySelector('[data-view]').addEventListener('click', () => openItem(m));
    card.querySelector('[data-book]').addEventListener('click', () => bookFlow(m, data));
    return card;
  }

  function openItem(item, data) {
    const m = modal({
      title: html`${item.icon} ${item.title}`,
      wide: true,
      body: html`<div class="grid cols-2">${raw(gallery(item.photos))}<div class="stack">
        <div class="row wrap">${raw(statusChip(item.status))}<span class="chip">${item.category}</span>${item.colors.map((c) => html`<span class="chip">🎨 ${c}</span>`)}</div>
        ${raw(item.description ? html`<p>${item.description}</p>` : '')}
        <dl class="kv"><dt>Found</dt><dd>${fmtDateTime(item.found_at)}</dd><dt>Where</dt><dd>${item.found_location || '—'}</dd></dl>
        ${raw(stationBlock(item.station))}
      </div></div>`,
      foot: item.status === 'available' ? html`<button class="btn ghost" data-close>Close</button><button class="btn primary" data-book>✋ This is mine — book pickup</button>` : html`<button class="btn ghost" data-close>Close</button>`,
    });
    wireGallery(m.el);
    const b = m.$('[data-book]');
    if (b) b.addEventListener('click', () => { m.close(); bookFlow(item, data); });
  }

  function bookFlow(item, data) {
    const minDate = localDate();
    const maxD = new Date();
    maxD.setDate(maxD.getDate() + 30);
    const m = modal({
      title: '📅 Book a pickup appointment',
      body: html`<div class="row" style="gap:14px;align-items:flex-start">
          <img src="${item.photos[item.best_photo || 0] || item.photos[0]}" alt="" style="width:92px;height:92px;object-fit:cover;border-radius:14px">
          <div><b>${item.title}</b><div class="muted small">${stationIcon(item.station.type)} ${item.station.name}</div><div class="muted tiny">🕘 ${item.station.hours}</div></div>
        </div>
        <form class="stack" style="margin-top:18px" id="bk">
          <label class="field"><span>Pickup date</span><input class="input" type="date" name="date" min="${minDate}" max="${localDate(maxD)}" required></label>
          <div><div class="muted tiny" style="font-weight:600;text-transform:uppercase;letter-spacing:.04em">Pickup time</div><div class="slots" id="slots"><span class="muted small">Choose a date to see available times</span></div></div>
          <label class="field"><span>How can you prove it's yours?</span><textarea class="input" name="proof" required minlength="5" maxlength="1000" placeholder="e.g. Serial number, lock-screen photo, contents, scratches, receipt — details not visible in the photos"></textarea></label>
          <label class="field"><span>Contact phone</span><input class="input" name="phone" value="${state.user.phone || ''}" placeholder="+1 555 0000"></label>
          <div class="muted tiny">🪪 Bring a government photo ID. Officers verify ownership before handing over the item.</div>
        </form>`,
      foot: html`<button class="btn ghost" data-close>Cancel</button><button class="btn primary" data-submit>Request appointment</button>`,
    });
    const form = m.$('#bk');
    const slotsBox = m.$('#slots');
    let chosen = null;
    const loadSlots = async () => {
      chosen = null;
      if (!form.date.value) return;
      slotsBox.innerHTML = '<span class="muted small">Loading…</span>';
      const { slots } = await api(`/stations/${item.station.id}/slots?date=${form.date.value}`);
      const now = localDateTime();
      const usable = slots.map((s) => ({ ...s, past: `${form.date.value}T${s.time}` <= now }));
      if (!usable.some((s) => s.available && !s.past)) { slotsBox.innerHTML = '<span class="muted small">No free slots on this day — please pick another date.</span>'; return; }
      slotsBox.innerHTML = usable.map((s) => html`<button type="button" class="slot" data-t="${s.time}" ${raw(!s.available || s.past ? 'disabled' : '')}>${fmtTime(`${form.date.value}T${s.time}`)}</button>`).join('');
      slotsBox.querySelectorAll('.slot').forEach((b) => b.addEventListener('click', () => {
        chosen = b.dataset.t;
        slotsBox.querySelectorAll('.slot').forEach((x) => x.classList.toggle('on', x === b));
      }));
    };
    form.date.addEventListener('change', loadSlots);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    form.date.value = localDate(tomorrow);
    loadSlots();
    m.$('[data-submit]').addEventListener('click', async (e) => {
      if (!form.date.value || !chosen) return toast('Please choose a pickup date and time', 'bad');
      if (form.proof.value.trim().length < 5) return toast('Please describe how you can prove the item is yours', 'bad');
      busy(e.currentTarget, true, 'Sending…');
      const btn = e.currentTarget;
      try {
        await api('/appointments', {
          body: {
            item_id: item.id,
            scheduled_at: `${form.date.value}T${chosen}`,
            now: localDateTime(),
            ownership_proof: form.proof.value.trim(),
            contact_phone: form.phone.value.trim(),
            match_score: item.confidence,
            report_id: data && data.report_id,
          },
        });
        m.close();
        const done = modal({
          title: 'Request sent',
          body: html`<div style="text-align:center"><div style="font-size:3rem">📨</div><h3 style="margin-top:8px">Your pickup request is with ${item.station.name}</h3>
            <p class="muted" style="margin-top:8px">Requested for <b>${fmtDateTime(`${form.date.value}T${chosen}`)}</b>. An officer will review your ownership proof — you'll get a notification once it's approved.</p></div>`,
          foot: html`<button class="btn ghost" data-close>Close</button><a class="btn primary" href="#requests" data-close>View my appointments</a>`,
        });
        done.$('a[href="#requests"]').addEventListener('click', () => done.close());
      } catch (err) {
        busy(btn, false);
        toast(err.message, 'bad');
      }
    });
  }

  async function renderRequests(view) {
    const { appointments } = await api('/appointments');
    view.innerHTML = html`<div class="page-head"><div><h2>📅 My appointments</h2><p class="muted">Track your pickup requests and approved collection times.</p></div></div><div id="list"></div>`;
    const list = view.querySelector('#list');
    if (!appointments.length) {
      list.innerHTML = '<div class="card empty-state"><div class="big">🗓️</div><h3>No appointments yet</h3><p class="muted" style="margin-top:6px">Search for your item and book a pickup when you find it.</p><a class="btn primary" href="#home" style="margin-top:16px">Start searching</a></div>';
      return;
    }
    appointments.forEach((a) => {
      const c = el(html`<div class="card req-card fade-in">
        <div class="pic">${raw(a.item_photo ? html`<img src="${a.item_photo}" alt="">` : '')}</div>
        <div><div class="row wrap" style="gap:8px"><b>${a.item_title}</b>${raw(statusChip(a.status))}</div>
          <div class="small" style="margin-top:4px">📅 <b>${fmtDateTime(a.scheduled_at)}</b></div>
          <div class="muted small">${stationIcon(a.station_type)} ${a.station_name} · ${a.station_address} · 📞 ${a.station_phone}</div>
          ${raw(a.status === 'approved' ? html`<div class="notice ok">✅ Approved${a.decided_by_name ? ` by ${a.decided_by_name}` : ''}. Please arrive on time with a photo ID.${a.police_note ? ` Note: ${a.police_note}` : ''}</div>` : '')}
          ${raw(a.status === 'rejected' ? html`<div class="notice bad">✕ Declined${a.police_note ? `: ${a.police_note}` : ''}</div>` : '')}
        </div>
        <div>${raw(['pending', 'approved'].includes(a.status) ? '<button class="btn bad sm" data-cancel>Cancel</button>' : '')}</div></div>`);
      const cb = c.querySelector('[data-cancel]');
      if (cb) cb.addEventListener('click', async () => {
        if (!(await confirmBox({ title: 'Cancel appointment', message: `Cancel your pickup for "${a.item_title}"?`, ok: 'Cancel appointment', danger: true }))) return;
        try { await api(`/appointments/${a.id}/cancel`, { method: 'POST' }); toast('Appointment cancelled', 'ok'); route(); } catch (err) { toast(err.message, 'bad'); }
      });
      list.appendChild(c);
    });
  }

  const NI = { match: '🎯', approved: '✅', rejected: '✕', completed: '🎉', no_show: '⏰', person_match: '🧑', reunion_approved: '🤝', reunion_rejected: '✕', reunited: '🫂' };

  async function renderAlerts(view) {
    const { notifications } = await api('/notifications');
    view.innerHTML = html`<div class="page-head"><div><h2>🔔 Notifications</h2><p class="muted">AI match alerts and appointment updates.</p></div></div><div class="card" id="list" style="padding:10px"></div>`;
    const list = view.querySelector('#list');
    if (!notifications.length) list.innerHTML = '<div class="empty-state"><div class="big">🔕</div><p class="muted">No notifications yet.</p></div>';
    notifications.forEach((n) => {
      const row = el(html`<div class="notif fade-in ${n.type} ${n.is_read ? '' : 'unread'}"><div class="ni">${NI[n.type] || '🔔'}</div>
        <div style="flex:1"><div class="row"><b>${n.title}</b><span class="spacer"></span><span class="muted tiny">${ago(n.created_at)}</span></div>
        <div class="small" style="margin-top:2px">${n.body}</div>
        ${raw(n.type === 'match' && n.item_id ? '<div class="small" style="margin-top:6px;font-weight:700;color:var(--accent)">View item &amp; book pickup →</div>' : '')}
        ${raw(n.type === 'person_match' ? '<div class="small" style="margin-top:6px;font-weight:700;color:var(--accent)">Review faces &amp; request reunion →</div>' : '')}</div></div>`);
      if (n.person_id) row.addEventListener('click', async () => {
        try {
          const { person } = await api(`/people/persons/${n.person_id}`);
          openPerson(person, person.report_id ? { report_id: person.report_id } : null);
        } catch (err) { toast(err.message, 'bad'); }
      });
      if (n.item_id) row.addEventListener('click', async () => {
        try {
          const { item } = await api(`/items/${n.item_id}`);
          openItem({ ...item, confidence: n.score || undefined }, n.report_id ? { report_id: n.report_id } : null);
        } catch (err) { toast(err.message, 'bad'); }
      });
      list.appendChild(row);
    });
    if (notifications.some((n) => !n.is_read)) { await api('/notifications/read-all', { method: 'POST' }); setUnread(0); }
  }

  async function renderReports(view) {
    const { reports } = await api('/reports');
    view.innerHTML = html`<div class="page-head"><div><h2>🔭 AI watchlist</h2><p class="muted">Searches that didn't find a match yet. The AI re-checks every newly logged item against them.</p></div></div><div class="grid auto" id="list"></div>`;
    const list = view.querySelector('#list');
    if (!reports.length) {
      list.innerHTML = '<div class="card empty-state" style="grid-column:1/-1"><div class="big">🔭</div><p class="muted">Nothing on your watchlist.</p></div>';
      return;
    }
    reports.forEach((r) => {
      const c = el(html`<div class="card fade-in stack">
        ${raw(r.photos.length ? html`<div class="row" style="gap:6px">${r.photos.slice(0, 5).map((p) => html`<img src="${p}" alt="" style="width:64px;height:64px;object-fit:cover;border-radius:12px">`)}</div>` : html`<div class="scan text" style="aspect-ratio:auto;padding:18px;font-size:1rem;border-radius:14px">“${r.description}”</div>`)}
        <div class="row wrap">${raw(statusChip(r.status))}<span class="chip">${r.mode === 'photo' ? '📸 Photo' : '💬 Description'}</span>${raw(r.category ? html`<span class="chip">${r.category.split('|')[0]}</span>` : '')}</div>
        <div class="muted small">Saved ${ago(r.created_at)}${r.matched_item_title ? '' : ''}</div>
        ${raw(r.matched_item_id ? html`<button class="btn primary sm" data-open>🎯 Matched: ${r.matched_item_title} — view</button>` : '')}
        ${raw(r.status === 'searching' ? '<button class="btn ghost sm" data-stop>Stop watching</button>' : '')}
      </div>`);
      const o = c.querySelector('[data-open]');
      if (o) o.addEventListener('click', async () => { const { item } = await api(`/items/${r.matched_item_id}`); openItem(item, { report_id: r.id }); });
      const s = c.querySelector('[data-stop]');
      if (s) s.addEventListener('click', async () => { await api(`/reports/${r.id}/cancel`, { method: 'POST' }); toast('Removed from watchlist', 'ok'); route(); });
      list.appendChild(c);
    });
  }

  const PERSON_SAMPLES = ['missing-boy-family.jpg', 'missing-man-family.jpg', 'missing-young-man-family.jpg', 'missing-woman-family.jpg', 'missing-riya.jpg'];
  const PERSON_EXAMPLES = [
    'Boy about 8 years old in a white shirt, lost at the airport',
    'My father, 40, short dark hair and a beard, dark jacket',
    'Young man, 23, tourist with a backpack and blue t-shirt',
    'Woman in her 40s with long dark wavy hair',
    'My grandfather, 78, grey hair and glasses',
  ];
  const RELATIONS = ['Parent', 'Child', 'Sibling', 'Spouse / partner', 'Grandparent', 'Grandchild', 'Other relative', 'Legal guardian', 'Friend / carer'];
  const REVIEW_NOTE = '<div class="review-note"><span>🛡️</span><div><b>AI suggests, officers confirm.</b> Face similarity is a lead, not proof of identity. Every reunion is verified in person by officers with photo ID and proof of relationship.</div></div>';

  function personFields(form) {
    return {
      name: form.pname.value.trim(),
      age: form.page.value,
      gender: form.pgender.value,
      last_seen_location: form.plocation.value.trim(),
      last_seen_at: form.pwhen.value,
      relation: form.prelation.value,
    };
  }

  function renderPeople(view) {
    view.innerHTML = html`<a class="back" href="#home">← Back to home</a>
      <div class="page-head"><div><h2>🧑 Find a missing person</h2><p class="muted">Upload a recent photo or describe the person. The face AI maps their facial features and compares them with people in care at police stations, airports, railway and security desks.</p></div><span class="spacer"></span><a class="btn ghost" href="#family">📂 My person reports &amp; reunions</a></div>
      <div class="search-layout">
        <form class="card fade-in stack" id="pf">
          <div class="seg"><button type="button" class="on" data-m="photo">📸 By photo</button><button type="button" data-m="text">💬 By description</button></div>
          <div data-pane="photo"><div id="dz"></div>
            <div class="muted tiny" style="margin-top:12px">Try a demo family photo (AI-generated faces of people who don't exist):</div>
            <div class="sample-strip">${PERSON_SAMPLES.map((s) => html`<button type="button" data-sample="${s}"><img src="/demo-photos/${s}" alt=""></button>`)}</div></div>
          <label class="field"><span id="descLabel">Distinguishing features (optional)</span><textarea class="input" name="pdesc" rows="3" maxlength="1000" placeholder="Hair, clothing, glasses, scars, language spoken, medical needs…"></textarea></label>
          <div class="examples hidden" data-pane="text">${PERSON_EXAMPLES.map((e) => html`<button type="button">${e}</button>`)}</div>
          <details><summary class="small" style="cursor:pointer;font-weight:700">➕ More details (name, age, last seen)</summary>
            <div class="grid cols-2" style="margin-top:12px">
              <label class="field"><span>Name</span><input class="input" name="pname" maxlength="80" placeholder="e.g. Riya Patel"></label>
              <label class="field"><span>Your relation</span><select class="input" name="prelation"><option value="">—</option>${RELATIONS.map((r) => html`<option>${r}</option>`)}</select></label>
              <label class="field"><span>Age</span><input class="input" name="page" type="number" min="1" max="109" placeholder="e.g. 22"></label>
              <label class="field"><span>Gender</span><select class="input" name="pgender"><option value="">Not specified</option><option value="female">Female</option><option value="male">Male</option></select></label>
              <label class="field"><span>Last seen at</span><input class="input" name="plocation" maxlength="200" placeholder="e.g. Westfield Mall food court"></label>
              <label class="field"><span>Last seen on</span><input class="input" name="pwhen" type="datetime-local" max="${localDateTime()}"></label>
            </div></details>
          ${raw(REVIEW_NOTE)}
          <button class="btn primary block lg" id="find" type="submit" disabled>🔍 Search for this person</button>
        </form>
        <div id="results">${raw(personIntro())}</div>
      </div>`;
    const form = view.querySelector('#pf');
    const btn = view.querySelector('#find');
    let mode = 'photo';
    let dz = null;
    const sync = () => { btn.disabled = mode === 'photo' ? !(dz && dz.files.length) : form.pdesc.value.trim().length < 3; };
    dz = dropzone(view.querySelector('#dz'), { hint: 'Drop recent photos of the person', onChange: sync });
    form.pdesc.addEventListener('input', sync);
    view.querySelectorAll('[data-sample]').forEach((b) => b.addEventListener('click', () => dz.addUrl(`/demo-photos/${b.dataset.sample}`)));
    view.querySelectorAll('.examples button').forEach((b) => b.addEventListener('click', () => { form.pdesc.value = b.textContent; sync(); }));
    view.querySelectorAll('.seg button').forEach((b) => b.addEventListener('click', () => {
      mode = b.dataset.m;
      view.querySelectorAll('.seg button').forEach((x) => x.classList.toggle('on', x === b));
      view.querySelector('[data-pane=photo]').classList.toggle('hidden', mode !== 'photo');
      view.querySelector('[data-pane=text]').classList.toggle('hidden', mode !== 'text');
      view.querySelector('#descLabel').textContent = mode === 'photo' ? 'Distinguishing features (optional)' : 'Describe the person';
      sync();
    }));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = personFields(form);
      const description = form.pdesc.value.trim();
      busy(btn, true, 'Face AI is searching…');
      if (mode === 'photo') {
        const fd = new FormData();
        dz.files.forEach((x) => fd.append('photos', x));
        Object.entries({ ...f, description }).forEach(([k, v]) => fd.append(k, v));
        await runPersonSearch(view.querySelector('#results'), () => api('/people/search/photo', { form: fd }), { kind: 'photo', previews: dz.files.map((x) => URL.createObjectURL(x)) });
      } else {
        await runPersonSearch(view.querySelector('#results'), () => api('/people/search/text', { body: { ...f, description } }), { kind: 'text', description });
      }
      busy(btn, false);
      sync();
    });
  }

  function personIntro() {
    const steps = [
      ['🧠', 'Detects every face', 'SSD-MobileNet face detector runs locally on the server — no photo leaves the platform'],
      ['📍', 'Maps 68 facial landmarks', 'Jawline, eyebrows, eyes, nose and mouth — drawn on your photo so you can see what the AI sees'],
      ['🧬', 'Builds a 128-d face signature', 'Robust to lighting, expression and camera; compared with everyone in care'],
      ['🤝', 'Officer-verified reunion', 'Possible matches are reviewed by officers before anyone is handed over'],
    ];
    return html`<div class="card fade-in"><h3>How the face AI searches</h3><ul class="trace" style="margin-top:10px">${steps.map(([i, t, d]) => html`<li class="show"><span class="ti">${i}</span><div><b>${t}</b><div class="muted small">${d}</div></div></li>`)}</ul></div>`;
  }

  async function runPersonSearch(box, call, ctx) {
    const visual = ctx.kind === 'photo'
      ? html`<div class="scan">${ctx.previews.map((p) => html`<img src="${p}" alt="">`)}<div class="grid-ov"></div></div>`
      : html`<div class="scan text"><div>“${ctx.description}”</div><div class="grid-ov"></div></div>`;
    const pending = ctx.kind === 'photo'
      ? ['Uploading photos securely', 'Detecting faces', 'Mapping 68 facial landmarks', 'Computing face signature & comparing with people in care']
      : ['Reading your description', 'Extracting age, gender and appearance', 'Imagining the person', 'Comparing with people in care'];
    box.innerHTML = html`<div class="card fade-in">${raw(visual)}<ul class="trace" id="tr" style="margin-top:14px">${pending.map((p) => html`<li><span class="ti"><span class="spin" style="border-color:rgba(109,76,255,.25);border-top-color:#6d4cff"></span></span><div><b>${p}</b></div></li>`)}</ul></div>`;
    const lis = [...box.querySelectorAll('#tr li')];
    let k = 0;
    const tick = setInterval(() => { if (k < lis.length) lis[k++].classList.add('show'); }, 380);
    let data;
    try {
      [data] = await Promise.all([call(), new Promise((r) => setTimeout(r, 1500))]);
    } catch (err) {
      clearInterval(tick);
      box.innerHTML = html`<div class="card empty-state"><div class="big">🙈</div><p>${err.message}</p></div>`;
      return;
    }
    clearInterval(tick);
    renderPersonResults(box, data, ctx);
  }

  function faceAnalysisCard(analyses) {
    return html`<div class="card fade-in" style="margin-bottom:18px"><div class="row wrap"><h3>🧠 What the face AI sees</h3><span class="spacer"></span>${raw(faceLegend())}</div>
      <div class="fa-grid" style="margin-top:14px">${analyses.map((a, i) => html`<div class="stack">${raw(faceSvg(a))}
        ${raw(a.faces.length ? faceFeatures(a.faces[0]) : `<div class="notice bad">No face detected in photo ${i + 1}</div>`)}</div>`)}</div></div>`;
  }

  function renderPersonResults(box, data, ctx) {
    const analysis = data.analyses ? faceAnalysisCard(data.analyses) : '';
    const attrs = data.attrs ? html`<div class="row wrap" style="gap:6px;justify-content:center"><span class="chip accent">⚧ ${data.attrs.gender || 'gender not stated'}</span><span class="chip accent">🎂 ${data.attrs.age ? `~${data.attrs.age} yrs` : 'age not stated'}</span></div>` : '';
    if (!data.found) {
      box.innerHTML = html`<div class="fade-in">${raw(analysis)}<div class="notfound">
          <div class="big">🕯️</div><h3>${data.message}</h3>
          <p class="muted" style="margin-top:10px">We've saved your ${ctx.kind === 'photo' ? 'photos and face signature' : 'description'} to your missing-person watchlist. Every person registered by officers from now on is automatically compared against it.</p>
          <div style="margin-top:14px">${raw(attrs)}</div>
          <div class="row" style="justify-content:center;margin-top:20px"><a class="btn ghost" href="#family">View my reports</a><a class="btn primary" href="#home">Back to home</a></div>
        </div>${raw(traceCard(data))}</div>`;
      return;
    }
    box.innerHTML = html`<div class="fade-in">${raw(analysis)}
      <div class="row wrap" style="margin-bottom:10px"><h3>${data.matches.length} possible match${data.matches.length > 1 ? 'es' : ''} in care</h3><span class="spacer"></span>${raw(attrs)}</div>
      ${raw(REVIEW_NOTE)}<div id="ml" style="margin-top:16px"></div>
      <div class="card flat" style="margin-top:18px;text-align:center"><b>Not the person you're looking for?</b><p class="muted small" style="margin-top:4px">Keep this search on the watchlist — we'll notify you if someone matching is registered later.</p><button class="btn ghost" id="watch" style="margin-top:12px">🔔 Keep watching for this person</button></div>
      ${raw(traceCard(data))}</div>`;
    const ml = box.querySelector('#ml');
    data.matches.forEach((m, idx) => ml.appendChild(personCard(m, idx, data)));
    box.querySelector('#watch').addEventListener('click', async (e) => {
      try {
        const r = await api(`/people/reports/${data.report_id}/activate`, { method: 'POST' });
        e.target.disabled = true;
        e.target.textContent = '✓ On your missing-person watchlist';
        toast(r.message, 'ok');
      } catch (err) { toast(err.message, 'bad'); }
    });
  }

  function personMeta(p) {
    const age = p.age ? `~${p.age} yrs${p.age_source === 'ai' ? ' (AI est.)' : ''}` : 'Age unknown';
    const g = p.gender ? `${p.gender}${p.gender_source === 'ai' ? ' (AI est.)' : ''}` : '';
    return [age, g].filter(Boolean).join(' · ');
  }

  function personCard(m, idx, data) {
    const target = m.photos[m.best_photo || 0] || m.photos[0];
    const query = data.analyses && data.analyses[m.query_photo];
    const faces = query
      ? html`<div class="face-pair"><div>${raw(faceSvg(query, { crop: true, face: m.query_face }))}<div class="cap">Your photo</div></div><div class="vs">VS</div><div>${raw(faceSvg(target, { crop: true, face: m.target_face }))}<div class="cap">In care</div></div></div>`
      : html`<div>${raw(faceSvg(target, { crop: true }))}<div class="cap" style="color:rgba(255,255,255,.7);text-align:center;margin-top:8px">In care</div></div>`;
    const card = el(html`<article class="pmatch fade-in ${idx === 0 ? 'best' : ''}" style="animation-delay:${idx * 80}ms">
      <div class="faces">${raw(faces)}${raw(m.distance != null ? html`<div class="dist">Face distance <b>${m.distance.toFixed(2)}</b> · ${m.strength === 'strong' ? 'strong similarity' : 'possible similarity'}</div>` : '')}</div>
      <div class="body">
        <div class="row" style="align-items:flex-start">
          <div style="flex:1"><div class="row wrap" style="gap:6px">${raw(statusChip(m.status))}<span class="chip">${personMeta(m)}</span></div>
            <h3 style="margin-top:8px;font-size:1.25rem">${m.display_name}</h3>
            <div class="muted small" style="margin-top:2px">Found ${fmtDateTime(m.found_at)}${m.found_location ? ` · ${m.found_location}` : ''}</div></div>
          <div style="text-align:center"><div class="conf" style="--p:${m.confidence};--c:${confColor(m.confidence)}"><span>${m.confidence}%</span></div><div class="muted tiny" style="margin-top:4px">Possible match</div></div>
        </div>
        ${raw(m.condition ? html`<div class="notice ok">🩺 ${m.condition}</div>` : '')}
        ${raw(m.description ? html`<p class="small">${m.description}</p>` : '')}
        <div class="reason">🤖 ${m.reason}</div>
        ${raw(m.geometry && m.geometry.length ? html`<details><summary class="small" style="cursor:pointer;font-weight:700">📐 Compare facial proportions</summary><div style="margin-top:8px">${raw(geometryTable(m.geometry, ['Your photo', 'In care']))}</div></details>` : '')}
        ${raw(stationBlock(m.station))}
        <div class="row wrap"><button class="btn ghost sm" data-view>View all photos</button><span class="spacer"></span><button class="btn primary" data-reunite>🤝 Request verified reunion</button></div>
      </div></article>`);
    card.querySelector('[data-view]').addEventListener('click', () => openPerson(m, data));
    card.querySelector('[data-reunite]').addEventListener('click', () => reunionFlow(m, data));
    return card;
  }

  function openPerson(p, data) {
    const photos = p.photos;
    const m = modal({
      title: html`🧑 ${p.display_name}`,
      wide: true,
      body: html`<div class="grid cols-2"><div class="stack"><div id="pmain">${raw(faceSvg(photos[0]))}</div>
          ${raw(photos.length > 1 ? html`<div class="row" style="gap:8px">${photos.map((ph, i) => html`<button type="button" class="thumb-face" data-i="${i}">${raw(faceSvg(ph, { crop: true }))}</button>`)}</div>` : '')}
          ${raw(faceLegend())}</div>
        <div class="stack">
          <div class="row wrap">${raw(statusChip(p.status))}${raw(p.confidence ? html`<span class="chip accent">🤖 ${p.confidence}% possible match</span>` : '')}</div>
          <dl class="kv"><dt>Age</dt><dd>${p.age ? `~${p.age}${p.age_source === 'ai' ? ' (AI estimate)' : ''}` : '—'}</dd><dt>Gender</dt><dd>${p.gender || '—'}${p.gender_source === 'ai' ? ' (AI estimate)' : ''}</dd>
            <dt>Found</dt><dd>${fmtDateTime(p.found_at)}</dd><dt>Where</dt><dd>${p.found_location || '—'}</dd><dt>Condition</dt><dd>${p.condition || '—'}</dd></dl>
          ${raw(p.description ? html`<p class="small">${p.description}</p>` : '')}
          ${raw(photos[0] && photos[0].faces[0] ? faceFeatures(photos[0].faces[0]) : '')}
          ${raw(stationBlock(p.station))}
          ${raw(REVIEW_NOTE)}
        </div></div>`,
      foot: p.status === 'in_care' ? html`<button class="btn ghost" data-close>Close</button><button class="btn primary" data-reunite>🤝 Request verified reunion</button>` : html`<button class="btn ghost" data-close>Close</button>`,
    });
    m.el.querySelectorAll('.thumb-face').forEach((b) => b.addEventListener('click', () => { m.$('#pmain').innerHTML = faceSvg(photos[Number(b.dataset.i)]); }));
    const b = m.$('[data-reunite]');
    if (b) b.addEventListener('click', () => { m.close(); reunionFlow(p, data); });
  }

  function reunionFlow(p, data) {
    const maxD = new Date();
    maxD.setDate(maxD.getDate() + 30);
    const photo = p.photos[p.best_photo || 0] || p.photos[0];
    const m = modal({
      title: '🤝 Request a verified reunion',
      body: html`<div class="row" style="gap:14px;align-items:flex-start">
          <div style="width:92px;flex:none">${raw(faceSvg(photo, { crop: true, cls: 'no-lm' }))}</div>
          <div><b>${p.display_name}</b><div class="muted small">${stationIcon(p.station.type)} ${p.station.name}</div><div class="muted tiny">🕘 ${p.station.hours} · 📞 ${p.station.phone}</div></div>
        </div>
        <form class="stack" style="margin-top:18px" id="rf">
          <label class="field"><span>Meeting date</span><input class="input" type="date" name="date" min="${localDate()}" max="${localDate(maxD)}" required></label>
          <div><div class="muted tiny" style="font-weight:600;text-transform:uppercase;letter-spacing:.04em">Meeting time</div><div class="slots" id="slots"></div></div>
          <label class="field"><span>Your relation to this person</span><select class="input" name="relation" required><option value="">Choose…</option>${RELATIONS.map((r) => html`<option>${r}</option>`)}</select></label>
          <label class="field"><span>Proof of identity &amp; relationship you'll bring</span><textarea class="input" name="proof" minlength="5" maxlength="1000" placeholder="e.g. Birth certificate, family photos, school ID, details only family would know"></textarea></label>
          <label class="field"><span>Contact phone</span><input class="input" name="phone" value="${state.user.phone || ''}"></label>
          ${raw(REVIEW_NOTE)}
        </form>`,
      foot: html`<button class="btn ghost" data-close>Cancel</button><button class="btn primary" data-submit>Send request</button>`,
    });
    const form = m.$('#rf');
    const slotsBox = m.$('#slots');
    let chosen = null;
    const loadSlots = async () => {
      chosen = null;
      if (!form.date.value) return;
      slotsBox.innerHTML = '<span class="muted small">Loading…</span>';
      const { slots } = await api(`/stations/${p.station.id}/slots?date=${form.date.value}`);
      const now = localDateTime();
      const usable = slots.map((s) => ({ ...s, past: `${form.date.value}T${s.time}` <= now }));
      if (!usable.some((s) => s.available && !s.past)) { slotsBox.innerHTML = '<span class="muted small">No free slots on this day — please pick another date.</span>'; return; }
      slotsBox.innerHTML = usable.map((s) => html`<button type="button" class="slot" data-t="${s.time}" ${raw(!s.available || s.past ? 'disabled' : '')}>${fmtTime(`${form.date.value}T${s.time}`)}</button>`).join('');
      slotsBox.querySelectorAll('.slot').forEach((b) => b.addEventListener('click', () => {
        chosen = b.dataset.t;
        slotsBox.querySelectorAll('.slot').forEach((x) => x.classList.toggle('on', x === b));
      }));
    };
    form.date.addEventListener('change', loadSlots);
    form.date.value = localDate();
    loadSlots();
    m.$('[data-submit]').addEventListener('click', async (e) => {
      if (!chosen) return toast('Please choose a meeting time', 'bad');
      if (!form.relation.value) return toast('Please tell the officers how you are related', 'bad');
      if (form.proof.value.trim().length < 5) return toast('Please describe the proof you will bring', 'bad');
      const btn = e.currentTarget;
      busy(btn, true, 'Sending…');
      try {
        await api('/people/reunions', {
          body: { person_id: p.id, scheduled_at: `${form.date.value}T${chosen}`, now: localDateTime(), relation: form.relation.value, proof: form.proof.value.trim(), contact_phone: form.phone.value.trim(), match_score: p.confidence, report_id: data && data.report_id },
        });
        m.close();
        const done = modal({
          title: 'Request sent',
          body: html`<div style="text-align:center"><div style="font-size:3rem">🤝</div><h3 style="margin-top:8px">Your reunion request is with ${p.station.name}</h3>
            <p class="muted" style="margin-top:8px">Requested for <b>${fmtDateTime(`${form.date.value}T${chosen}`)}</b>. Officers will review it and notify you. Please bring a photo ID and your proof of relationship.</p></div>`,
          foot: html`<button class="btn ghost" data-close>Close</button><a class="btn primary" href="#family">View my reunions</a>`,
        });
        done.$('a[href="#family"]').addEventListener('click', () => done.close());
      } catch (err) {
        busy(btn, false);
        toast(err.message, 'bad');
      }
    });
  }

  async function renderFamily(view) {
    const [{ reports }, { reunions }] = await Promise.all([api('/people/reports'), api('/people/reunions')]);
    view.innerHTML = html`<a class="back" href="#people">← Find a person</a>
      <div class="page-head"><div><h2>📂 My person reports &amp; reunions</h2><p class="muted">Your missing-person searches stay on the watchlist until you close them. The face AI re-checks every person officers register.</p></div></div>
      <h3 style="margin-bottom:12px">🤝 Reunion meetings</h3><div id="ru"></div>
      <h3 style="margin:26px 0 12px">🔭 Missing-person watchlist</h3><div class="grid auto" id="rp"></div>`;
    const ru = view.querySelector('#ru');
    if (!reunions.length) ru.innerHTML = '<div class="card empty-state"><p class="muted">No reunion requests yet.</p></div>';
    reunions.forEach((r) => {
      const c = el(html`<div class="card req-card fade-in">
        <div class="pic">${raw(r.person_photo ? html`<img src="${r.person_photo}" alt="">` : '')}</div>
        <div><div class="row wrap" style="gap:8px"><b>${r.person_display}</b>${raw(statusChip(r.status === 'completed' ? 'reunited' : r.status))}</div>
          <div class="small" style="margin-top:4px">📅 <b>${fmtDateTime(r.scheduled_at)}</b> · ${r.relation}</div>
          <div class="muted small">${stationIcon(r.station_type)} ${r.station_name} · ${r.station_address} · 📞 ${r.station_phone}</div>
          ${raw(r.status === 'approved' ? html`<div class="notice ok">✅ Approved${r.decided_by_name ? ` by ${r.decided_by_name}` : ''}. Bring photo ID and proof of relationship.${r.police_note ? ` Note: ${r.police_note}` : ''}</div>` : '')}
          ${raw(r.status === 'rejected' ? html`<div class="notice bad">✕ Declined${r.police_note ? `: ${r.police_note}` : ''}</div>` : '')}
          ${raw(r.status === 'completed' ? '<div class="notice ok">🎉 Reunited — identity verified by officers.</div>' : '')}
        </div>
        <div>${raw(['pending', 'approved'].includes(r.status) ? '<button class="btn bad sm" data-cancel>Cancel</button>' : '')}</div></div>`);
      const cb = c.querySelector('[data-cancel]');
      if (cb) cb.addEventListener('click', async () => {
        if (!(await confirmBox({ title: 'Cancel reunion request', message: `Cancel your meeting for ${r.person_display}?`, ok: 'Cancel request', danger: true }))) return;
        try { await api(`/people/reunions/${r.id}/cancel`, { method: 'POST' }); toast('Request cancelled', 'ok'); route(); } catch (err) { toast(err.message, 'bad'); }
      });
      ru.appendChild(c);
    });
    const rp = view.querySelector('#rp');
    if (!reports.length) rp.innerHTML = '<div class="card empty-state" style="grid-column:1/-1"><p class="muted">No missing-person reports.</p></div>';
    reports.forEach((r) => {
      const c = el(html`<div class="card fade-in stack">
        ${raw(r.photos.length ? html`<div class="rp-faces">${r.photos.slice(0, 3).map((p) => faceSvg(p, { crop: true }))}</div>` : html`<div class="scan text" style="aspect-ratio:auto;padding:18px;font-size:1rem;border-radius:14px">“${r.description}”</div>`)}
        <div class="row wrap">${raw(statusChip(r.status))}<span class="chip">${r.mode === 'photo' ? '📸 Face search' : '💬 Description'}</span></div>
        <div><b>${r.name || 'Unnamed report'}</b><div class="muted small">${[r.age ? `${r.age} yrs` : '', r.gender || '', r.last_seen_location ? `last seen ${r.last_seen_location}` : ''].filter(Boolean).join(' · ') || '—'}</div></div>
        <div class="muted tiny">Saved ${ago(r.created_at)}</div>
        ${raw(r.matched_person_id ? '<button class="btn primary sm" data-open>🎯 Review possible match</button>' : '')}
        ${raw(['searching', 'matched'].includes(r.status) ? '<button class="btn ghost sm" data-stop>Close report</button>' : '')}
      </div>`);
      const o = c.querySelector('[data-open]');
      if (o) o.addEventListener('click', async () => { try { const { person } = await api(`/people/persons/${r.matched_person_id}`); openPerson(person, { report_id: r.id }); } catch (err) { toast(err.message, 'bad'); } });
      const s = c.querySelector('[data-stop]');
      if (s) s.addEventListener('click', async () => { await api(`/people/reports/${r.id}/cancel`, { method: 'POST' }); toast('Report closed', 'ok'); route(); });
      rp.appendChild(c);
    });
  }

  api('/me', { allow401: true }).then(() => boot()).catch(() => showAuth());
})();
