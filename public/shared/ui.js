(function () {
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function html(strings, ...vals) {
    return strings.reduce((out, s, i) => {
      let v = i < vals.length ? vals[i] : '';
      if (Array.isArray(v)) v = v.join('');
      else if (v && typeof v === 'object' && '__raw' in v) v = v.__raw;
      else v = esc(v);
      return out + s + v;
    }, '');
  }
  const raw = (s) => ({ __raw: String(s) });

  function el(markup) {
    const t = document.createElement('template');
    t.innerHTML = markup.trim();
    return t.content.firstElementChild;
  }

  function makeApi(base, onUnauthorized) {
    return async function api(path, opts = {}) {
      const init = { method: opts.method || 'GET', credentials: 'same-origin', headers: {} };
      if (opts.form) init.body = opts.form;
      else if (opts.body !== undefined) {
        init.headers['content-type'] = 'application/json';
        init.body = JSON.stringify(opts.body);
      }
      if (init.body && !opts.method) init.method = 'POST';
      const res = await fetch(base + path, init);
      let data = {};
      try { data = await res.json(); } catch (e) { data = {}; }
      if (res.status === 401 && !opts.allow401 && onUnauthorized) onUnauthorized();
      if (!res.ok) {
        const err = new Error(data.error || `Request failed (${res.status})`);
        err.status = res.status;
        throw err;
      }
      return data;
    };
  }

  function toast(msg, kind = '') {
    let box = document.querySelector('.toasts');
    if (!box) { box = el('<div class="toasts"></div>'); document.body.appendChild(box); }
    const t = el(html`<div class="toast ${kind}">${msg}</div>`);
    box.appendChild(t);
    setTimeout(() => { t.style.transition = 'opacity .3s, transform .3s'; t.style.opacity = '0'; t.style.transform = 'translateX(30px)'; }, 3800);
    setTimeout(() => t.remove(), 4200);
  }

  function modal({ title, body, foot = '', wide = false, onClose }) {
    const m = el(html`<div class="modal-back"><div class="modal ${wide ? 'wide' : ''}">
      <div class="modal-head"><h3 style="flex:1">${raw(title)}</h3><button class="x" data-close aria-label="Close">×</button></div>
      <div class="modal-body">${raw(body)}</div>${raw(foot ? `<div class="modal-foot">${foot}</div>` : '')}</div></div>`);
    const close = () => { m.remove(); document.removeEventListener('keydown', onKey); if (onClose) onClose(); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    m.addEventListener('click', (e) => { if (e.target === m || e.target.closest('[data-close]')) close(); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(m);
    return { el: m, close, $: (s) => m.querySelector(s) };
  }

  function confirmBox({ title, message, ok = 'Confirm', danger = false, input = null }) {
    return new Promise((resolve) => {
      let done = false;
      const m = modal({
        title,
        body: html`<p class="muted">${message}</p>${raw(input ? html`<label class="field" style="margin-top:14px"><span>${input.label}</span><textarea class="input" data-in placeholder="${input.placeholder || ''}"></textarea></label>` : '')}`,
        foot: html`<button class="btn ghost" data-close>Cancel</button><button class="btn ${danger ? 'bad' : 'primary'}" data-ok>${ok}</button>`,
        onClose: () => { if (!done) resolve(null); },
      });
      m.$('[data-ok]').addEventListener('click', () => {
        done = true;
        const v = input ? m.$('[data-in]').value.trim() : true;
        m.close();
        resolve(input ? { value: v } : v);
      });
      const i = m.$('[data-in]');
      if (i) i.focus();
    });
  }

  function dropzone(container, { max = 5, hint = 'Drag & drop or click to choose', onChange } = {}) {
    let files = [];
    container.innerHTML = html`<div class="dropzone" tabindex="0">
        <div class="dz-icon">📷</div>
        <div style="font-weight:600;margin-top:6px">${hint}</div>
        <div class="muted small">JPG, PNG or WEBP · up to ${max} photos · 10 MB each</div>
        <input type="file" accept="image/*" multiple hidden>
      </div><div class="thumbs"></div>`;
    const dz = container.querySelector('.dropzone');
    const input = container.querySelector('input');
    const thumbs = container.querySelector('.thumbs');
    const render = () => {
      thumbs.innerHTML = '';
      files.forEach((f, i) => {
        const url = URL.createObjectURL(f);
        const t = el(html`<div class="thumb"><img src="${url}" alt="photo ${i + 1}"><button type="button" title="Remove">×</button></div>`);
        t.querySelector('button').addEventListener('click', (e) => { e.stopPropagation(); files.splice(i, 1); render(); });
        thumbs.appendChild(t);
      });
      for (let i = files.length; i < max; i++) thumbs.appendChild(el(`<div class="thumb empty">${i + 1}</div>`));
      if (onChange) onChange(files);
    };
    const add = (list) => {
      const imgs = [...list].filter((f) => f.type.startsWith('image/'));
      const room = max - files.length;
      if (imgs.length > room) toast(`You can upload a maximum of ${max} photos`, 'bad');
      files = files.concat(imgs.slice(0, Math.max(room, 0)));
      render();
    };
    dz.addEventListener('click', () => input.click());
    dz.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') input.click(); });
    input.addEventListener('change', () => { add(input.files); input.value = ''; });
    ['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('drag'); }));
    ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('drag'); }));
    dz.addEventListener('drop', (e) => add(e.dataTransfer.files));
    render();
    return {
      get files() { return files; },
      add,
      clear() { files = []; render(); },
      async addUrl(url) {
        const res = await fetch(url);
        const blob = await res.blob();
        add([new File([blob], url.split('/').pop(), { type: blob.type || 'image/jpeg' })]);
      },
    };
  }

  function gallery(photos) {
    if (!photos || !photos.length) return '<div class="gallery"><div class="main"></div></div>';
    return html`<div class="gallery"><div class="main"><img src="${photos[0]}" alt="item photo"></div>
      ${raw(photos.length > 1 ? `<div class="strip">${photos.map((p, i) => html`<img src="${p}" class="${i === 0 ? 'on' : ''}" alt="">`).join('')}</div>` : '')}</div>`;
  }
  function wireGallery(root) {
    root.querySelectorAll('.gallery').forEach((g) => {
      const main = g.querySelector('.main img');
      g.querySelectorAll('.strip img').forEach((im) => im.addEventListener('click', () => {
        main.src = im.src;
        g.querySelectorAll('.strip img').forEach((x) => x.classList.toggle('on', x === im));
      }));
    });
  }

  const pad = (n) => String(n).padStart(2, '0');
  const localDate = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const localDateTime = (d = new Date()) => `${localDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const parseLocal = (s) => {
    const [d, t = '00:00'] = String(s).replace(' ', 'T').split('T');
    const [y, m, dd] = d.split('-').map(Number);
    const [hh, mm] = t.split(':').map(Number);
    return new Date(y, m - 1, dd, hh || 0, mm || 0);
  };
  const fmtDate = (s) => parseLocal(s).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const fmtTime = (s) => parseLocal(s).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const fmtDateTime = (s) => `${fmtDate(s)} · ${fmtTime(s)}`;
  function ago(s) {
    const d = new Date(String(s).includes('T') ? s : `${String(s).replace(' ', 'T')}Z`);
    const sec = Math.max(1, Math.round((Date.now() - d.getTime()) / 1000));
    if (sec < 60) return 'just now';
    if (sec < 3600) return `${Math.round(sec / 60)} min ago`;
    if (sec < 86400) return `${Math.round(sec / 3600)} h ago`;
    return `${Math.round(sec / 86400)} d ago`;
  }
  const initials = (name) => String(name || '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  const stationIcon = (type) => ({ police: '🚓', airport: '✈️', corporate: '🏢', transit: '🚆' }[type] || '📍');
  const STATUS = {
    pending: ['warn', 'Pending review'], approved: ['ok', 'Approved'], rejected: ['bad', 'Rejected'], cancelled: ['', 'Cancelled'],
    completed: ['info', 'Collected'], no_show: ['bad', 'No-show'], available: ['ok', 'Available'], reserved: ['warn', 'Reserved'], returned: ['info', 'Returned'],
    searching: ['accent', 'AI watching'], matched: ['ok', 'Match found'], closed: ['', 'Closed'],
    in_care: ['warn', 'In care'], reunited: ['info', 'Reunited'], draft: ['', 'Draft'],
  };
  const statusChip = (s) => { const [k, label] = STATUS[s] || ['', s]; return html`<span class="chip ${k}"><span class="dot"></span>${label}</span>`; };
  const mapLink = (st) => (st && st.lat != null ? `https://www.google.com/maps/search/?api=1&query=${st.lat},${st.lng}` : '#');
  const busy = (btn, on, label) => {
    if (on) { btn.dataset.label = btn.innerHTML; btn.disabled = true; btn.innerHTML = `<span class="spin"></span>${esc(label || 'Working…')}`; }
    else { btn.disabled = false; if (btn.dataset.label) btn.innerHTML = btn.dataset.label; }
  };
  const orbs = () => { document.body.insertAdjacentHTML('afterbegin', '<div class="bg-orbs"><span></span><span></span><span></span></div>'); };

  const FACE_PARTS = [
    ['jaw', '#22d3ee', 0, 16, false], ['brows', '#fbbf24', 17, 21, false], ['brows', '#fbbf24', 22, 26, false],
    ['nose', '#a78bfa', 27, 30, false], ['nose', '#a78bfa', 31, 35, false], ['eyes', '#34d399', 36, 41, true], ['eyes', '#34d399', 42, 47, true],
    ['mouth', '#f472b6', 48, 59, true], ['mouth', '#f472b6', 60, 67, true],
  ];
  const FACE_LEGEND = [['Jawline', '#22d3ee'], ['Eyebrows', '#fbbf24'], ['Eyes', '#34d399'], ['Nose', '#a78bfa'], ['Mouth', '#f472b6']];
  const n1 = (v) => Math.round(v * 10) / 10;

  function faceMarks(f, primary) {
    const b = f.box;
    const r = n1(Math.max(1, b.w / 90));
    const parts = (f.landmarks || []).length === 68
      ? FACE_PARTS.map(([, c, a, z, closed]) => {
        const pts = f.landmarks.slice(a, z + 1).map((p) => p.join(',')).join(' ');
        return `<${closed ? 'polygon' : 'polyline'} class="lm-line" points="${pts}" stroke="${c}"/>`;
      }).join('') + f.landmarks.map((p, i) => `<circle class="lm-pt" cx="${p[0]}" cy="${p[1]}" r="${r}" style="animation-delay:${i * 12}ms"/>`).join('')
      : '';
    const c = n1(b.w * 0.18);
    const corners = [[b.x, b.y, 1, 1], [b.x + b.w, b.y, -1, 1], [b.x, b.y + b.h, 1, -1], [b.x + b.w, b.y + b.h, -1, -1]]
      .map(([x, y, dx, dy]) => `<path class="fbox" d="M${n1(x)} ${n1(y + dy * c)}V${n1(y)}H${n1(x + dx * c)}"/>`).join('');
    return `<g class="face-g ${primary ? 'primary' : 'other'}"><rect class="fbox-bg" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="${n1(b.w * 0.04)}"/>${corners}${primary ? parts : ''}</g>`;
  }

  // Renders a photo with its detected face box and 68 landmarks as an SVG; `crop` zooms into the primary face.
  function faceSvg(photo, { face, crop = false, all = true, cls = '' } = {}) {
    if (!photo) return '';
    const url = typeof photo === 'string' ? photo : photo.url;
    const W = photo.width;
    const H = photo.height;
    const faces = (photo.faces || []);
    const f = face || faces[0];
    if (!W || !H) return html`<div class="face-viz ${cls}"><img src="${url}" alt=""></div>`;
    let vb = `0 0 ${W} ${H}`;
    if (crop && f) {
      const size = Math.min(Math.max(f.box.w, f.box.h) * 1.75, W, H);
      const cx = f.box.x + f.box.w / 2;
      const cy = f.box.y + f.box.h / 2 - f.box.h * 0.04;
      const x = Math.min(Math.max(0, cx - size / 2), W - size);
      const y = Math.min(Math.max(0, cy - size / 2), H - size);
      vb = `${n1(x)} ${n1(y)} ${n1(size)} ${n1(size)}`;
    }
    const same = (a, b) => a && b && a.box.x === b.box.x && a.box.y === b.box.y;
    const drawn = all ? faces.slice() : f ? [f] : [];
    if (f && !drawn.some((x) => same(x, f))) drawn.push(f);
    return `<div class="face-viz ${esc(cls)} ${crop ? 'crop' : ''}"><svg viewBox="${vb}" preserveAspectRatio="xMidYMid ${crop ? 'slice' : 'meet'}" role="img" aria-label="Photo with facial landmarks">
      <image href="${esc(url)}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="none"/>
      ${drawn.map((x) => faceMarks(x, same(x, f))).join('')}</svg>${faces.length > 1 && !crop ? `<span class="face-count">${faces.length} faces</span>` : ''}</div>`;
  }

  const faceLegend = () => `<div class="face-legend">${FACE_LEGEND.map(([l, c]) => `<span><i style="background:${c}"></i>${l}</span>`).join('')}</div>`;

  function faceFeatures(f) {
    if (!f) return '';
    const g = f.geometry || {};
    const chips = [
      `🎯 Face detected ${Math.round(f.score * 100)}%`,
      `🎂 Age ~${f.age} (AI estimate)`,
      `⚧ ${f.gender} (${Math.round(f.gender_p * 100)}%, AI estimate)`,
      `🙂 ${f.expression}`,
      g.face_shape && `🔷 ${g.face_shape} face`,
      g.pose && `🧭 ${g.pose}${g.roll ? `, tilt ${g.roll}°` : ''}`,
      g.symmetry != null && `⚖️ Symmetry ${g.symmetry}%`,
      g.eye_spacing != null && `👁️ Eye spacing ${g.eye_spacing}% of face width`,
    ].filter(Boolean);
    return html`<div class="face-feats">${chips.map((c) => html`<span class="chip">${c}</span>`)}</div>`;
  }

  const GEO_LABELS = {
    eye_spacing: ['Eye spacing', '% of face width', 12], nose_length: ['Nose length', '% of face height', 10], nose_width: ['Nose width', '% of eye distance', 14],
    mouth_width: ['Mouth width', '% of eye distance', 20], jaw_taper: ['Jaw taper', '% of face width', 10], face_ratio: ['Face height ÷ width', '', 0.2],
  };
  function geometryTable(rows, [la, lb] = ['Photo', 'Record']) {
    if (!rows || !rows.length) return '';
    return html`<table class="geo"><thead><tr><th>Facial proportion</th><th>${la}</th><th>${lb}</th><th>Agreement</th></tr></thead><tbody>${rows.map((r) => {
      const [label, unit, tol] = GEO_LABELS[r.key] || [r.key, '', 1];
      const agree = Math.max(0, Math.round((1 - r.diff / tol) * 100));
      return html`<tr><td>${label}<div class="muted tiny">${unit}</div></td><td>${r.a}</td><td>${r.b}</td><td><div class="ai-bar"><i style="width:${agree}%"></i></div></td></tr>`;
    })}</tbody></table>`;
  }

  window.UI = { esc, html, raw, el, makeApi, toast, modal, confirmBox, dropzone, gallery, wireGallery, localDate, localDateTime, parseLocal, fmtDate, fmtTime, fmtDateTime, ago, initials, stationIcon, statusChip, mapLink, busy, orbs, faceSvg, faceLegend, faceFeatures, geometryTable };
})();
