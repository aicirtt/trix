import { api } from '../api.js';
import { esc, icon, chip, toast, ring, animateRings, level, PARTS } from '../ui.js';
import { startCamera, stopCamera, frameJpeg, fileToDataUrl, mediapipe, LEFT_EYE, RIGHT_EYE, speechAvailable, listenOnce,
  recordAndTranscribe, bluetoothAvailable, connectHeartRate, rmssd } from '../sensors.js';

const STEPS = ['Vitals', 'Face check', 'Eyes & skin', 'Symptoms & food'];
const FIELDS = [
  ['hr', 'Heart rate', 'bpm', 'Holter / wrist'], ['sys', 'Blood pressure (top)', 'mmHg', 'BP cuff'], ['dia', 'Blood pressure (bottom)', 'mmHg', 'BP cuff'],
  ['spo2', 'Blood oxygen', '%', 'Pulse oximeter'], ['temp', 'Temperature', '°C', 'Thermometer'], ['glucose', 'Blood sugar', 'mg/dL', 'Glucose meter'],
  ['sleep', 'Sleep last night', 'hours', 'Actiwatch'], ['hrv', 'Heart-rate variability', 'ms', 'Holter (optional)'],
];

function load(who) { try { return JSON.parse(sessionStorage.getItem(`trix-draft-${who}`)) || { readings: {}, symptoms: '' }; } catch (e) { return { readings: {}, symptoms: '' }; } }
function save(who, d) { sessionStorage.setItem(`trix-draft-${who}`, JSON.stringify(d)); }

export async function render(el, { params, state, go }) {
  const who = state.who;
  const step = Math.min(4, Math.max(1, +(params[0] || 1)));
  const d = load(who);
  let stream = null, timer = null, rec = null, stopped = false;
  const cleanup = () => { stopped = true; stopCamera(stream); clearInterval(timer); rec?.stop?.(); };

  const stepper = `<div class="stepper" role="list">${STEPS.map((s, i) => `<a role="listitem" class="step ${i + 1 === step ? 'on' : ''} ${i + 1 < step ? 'done' : ''}" href="#/checkin/${i + 1}" style="text-decoration:none"><b>${i + 1 < step ? icon('check', '#04070E', 16, 3) : i + 1}</b>${s}</a>`).join('')}</div>`;
  const head = (title, sub) => `<div class="head"><div><h1>${title}</h1><div class="sub">${sub}</div></div>${stepper}</div>`;
  const nav = (back, next, label = 'Next') => `<div class="row" style="justify-content:space-between">${back ? `<a class="btn ghost" href="#/checkin/${back}">${icon('back')}Back</a>` : '<span></span>'}${next ? `<a class="btn" href="#/checkin/${next}">${label}${icon('arrow', '#fff')}</a>` : ''}</div>`;

  // ------------------------------------------------ step 1: vitals
  if (step === 1) {
    el.innerHTML = head('Morning check-in', `Astronaut ${esc(who)} · type, speak, or connect a device`) + `
    <div class="row">
      <div class="card grow">
        <div class="grid4">${FIELDS.map(([k, n, u, dev]) => `<div class="field"><label for="f-${k}">${n}</label><input id="f-${k}" inputmode="decimal" data-k="${k}" value="${d.readings[k] ?? ''}" autocomplete="off"><span class="unit">${u} · ${dev}</span></div>`).join('')}</div>
        <div class="field"><label>How is your mood?</label><div class="seg" role="group" aria-label="Mood 1 to 5">${[1, 2, 3, 4, 5].map((m) => `<button type="button" data-mood="${m}" class="${+d.readings.mood === m ? 'on' : ''}" aria-pressed="${+d.readings.mood === m}">${m} ${['', 'Very low', 'Low', 'OK', 'Good', 'Great'][m]}</button>`).join('')}</div></div>
      </div>
      <div class="col" style="width:360px;flex:none;max-width:100%">
        <div class="card"><h3>${icon('mic', 'var(--bluet)', 20)} Say your readings</h3>
          <p class="small muted" style="margin:0">“Heart rate 68, blood pressure 118 over 76, oxygen 98, slept six and a half hours.”</p>
          <button class="btn" id="speak">${icon('mic', '#fff', 20)}Start speaking</button>
          <div id="heard" class="note" style="min-height:48px">${d.transcript ? esc(d.transcript) : 'Nothing heard yet.'}</div></div>
        <div class="card"><h3>${icon('bt', 'var(--bluet)', 20)} Devices</h3>
          <button class="btn ghost" id="ble">${icon('bt')}Connect Bluetooth heart-rate strap</button>
          <div id="blestat" class="small muted">${bluetoothAvailable() ? 'Works with any standard Bluetooth heart-rate strap or watch.' : 'Bluetooth needs Chrome or Edge.'}</div>
          <label class="btn ghost" for="csv" style="cursor:pointer">${icon('upload')}Import device file (CSV)</label><input type="file" id="csv" accept=".csv" class="sr">
        </div>
      </div>
    </div>${nav(null, 2)}`;
    const upd = () => { el.querySelectorAll('[data-k]').forEach((i) => { d.readings[i.dataset.k] = i.value === '' ? undefined : +i.value; }); save(who, d); };
    el.querySelectorAll('[data-k]').forEach((i) => i.oninput = upd);
    el.querySelectorAll('[data-mood]').forEach((b) => b.onclick = () => { d.readings.mood = +b.dataset.mood; save(who, d); el.querySelectorAll('[data-mood]').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); }); });
    const fill = (r) => { Object.entries(r).forEach(([k, v]) => { d.readings[k] = v; const i = el.querySelector(`[data-k="${k}"]`); if (i) { i.value = v; i.classList.add('pop'); } if (k === 'mood') el.querySelector(`[data-mood="${Math.round(v)}"]`)?.click(); }); save(who, d); };
    el.querySelector('#speak').onclick = async () => {
      const heard = el.querySelector('#heard');
      const apply = async (text) => { const p = await api.post('/api/voice/parse', { text }); d.transcript = text; if (p.symptoms) d.symptoms = [d.symptoms, p.symptoms].filter(Boolean).join('; '); fill(p.readings); heard.innerHTML = `${esc(text)}<br><span class="small" style="color:var(--teal)">Filled: ${Object.keys(p.readings).join(', ') || 'nothing recognised'}</span>`; };
      if (speechAvailable()) {
        heard.textContent = 'Listening…';
        rec = listenOnce({ onText: (t, fin) => { heard.textContent = t || 'Listening…'; if (fin && t) apply(t); }, onError: (e) => { heard.textContent = `Speech not available (${e.error || e.message}). Trying the onboard speech model…`; } });
      } else {
        heard.textContent = 'Recording 8 seconds for the onboard speech model…';
        try { const r = await recordAndTranscribe(8); if (r.ok) apply(r.text); else heard.textContent = r.error; } catch (e) { heard.textContent = e.message; }
      }
    };
    el.querySelector('#ble').onclick = async () => {
      const st = el.querySelector('#blestat');
      try {
        let rrs = [];
        const dev = await connectHeartRate((bpm, rr) => { rrs = rrs.concat(rr).slice(-60); const h = rmssd(rrs); fill(h ? { hr: bpm, hrv: Math.round(h) } : { hr: bpm }); st.innerHTML = `<span style="color:var(--teal)">Live from ${esc(dev?.name || 'strap')}: ${bpm} bpm${h ? ` · HRV ${Math.round(h)} ms` : ''}</span>`; });
        st.textContent = `Connected to ${dev.name || 'heart-rate strap'}. Waiting for data…`;
      } catch (e) { st.textContent = `Not connected: ${e.message}`; }
    };
    el.querySelector('#csv').onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      const fd = new FormData(); fd.append('who', who); fd.append('file', f);
      try { const r = await api.form('/api/import', fd); toast(`Imported ${r.imported} readings from ${esc(f.name)}.`); } catch (er) { toast(`Import failed: ${esc(er.message)}`); }
    };
    return cleanup;
  }

  // ------------------------------------------------ step 2: face fatigue
  if (step === 2) {
    el.innerHTML = head('Face check', '20 seconds · measures how open your eyes are (PERCLOS) · video never leaves the tablet') + `
    <div class="row"><div class="card grow" style="max-width:720px"><div class="cam" id="cam"><video id="v" playsinline></video><canvas class="overlay" id="ov"></canvas>
      <div class="idle" id="idle">${icon('camera', 'var(--t2)', 40)}<span>Hold the tablet at arm's length, look at the screen and relax.</span><button class="btn" id="go">${icon('play', '#fff', 18)}Start face check</button></div>
      <div class="msg" id="msg" hidden></div></div></div>
      <div class="col" style="width:360px;flex:none;max-width:100%"><div class="card" id="res"><h3>Result</h3><p class="muted small" style="margin:0">${d.readings.fatigue != null ? `Last result: eyes closed ${d.readings.fatigue}% of the time.` : 'Not done yet.'}</p></div>
      <div class="note">Uses MediaPipe Face Mesh on the tablet. Only eye measurements (numbers) are sent to TRIX.</div></div></div>
    ${nav(1, 3)}`;
    el.querySelector('#go').onclick = async () => {
      const v = el.querySelector('#v'), ov = el.querySelector('#ov'), msg = el.querySelector('#msg');
      msg.hidden = false; msg.textContent = 'Starting camera…';
      try { stream = await startCamera(v, 'user'); } catch (e) { msg.textContent = e.message; return; }
      el.querySelector('#idle').hidden = true;
      msg.textContent = 'Loading the face model (on the tablet)…';
      let fm;
      try { fm = await mediapipe('face_mesh'); } catch (e) { msg.textContent = `Face model could not load: ${e.message}`; return; }
      const frames = [], t0 = performance.now();
      const ctx = ov.getContext('2d');
      while (!stopped && performance.now() - t0 < 20000) {
        const r = await fm.run(v);
        ov.width = v.videoWidth; ov.height = v.videoHeight; ctx.clearRect(0, 0, ov.width, ov.height);
        const lm = r?.multiFaceLandmarks?.[0];
        const left = Math.ceil(20 - (performance.now() - t0) / 1000);
        if (lm) {
          const P = (i) => [lm[i].x * ov.width, lm[i].y * ov.height];
          frames.push({ t: (performance.now() - t0) / 1000, left: LEFT_EYE.map(P), right: RIGHT_EYE.map(P) });
          ctx.strokeStyle = '#2DD4BF'; ctx.lineWidth = 2;
          [LEFT_EYE, RIGHT_EYE].forEach((eye) => { ctx.beginPath(); eye.forEach((i, k) => { const [x, y] = P(i); k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }); ctx.closePath(); ctx.stroke(); });
          msg.textContent = `Keep looking at the screen… ${left} s`;
        } else msg.textContent = `I can't see your face. Move into view… ${left} s`;
      }
      stopCamera(stream);
      if (stopped) return;
      const r = await api.post('/api/vision/fatigue', { who, frames });
      if (r.ok) { d.readings.fatigue = r.perclos; save(who, d); }
      msg.textContent = r.message;
      el.querySelector('#res').innerHTML = `<h3>Result</h3>${r.ok ? `${chip(r.status, r.status === 'green' ? 'Alert' : r.status === 'amber' ? 'Tired' : 'Very tired')}<div class="kv"><span class="lbl">Eyes closed</span><span class="mono">${r.perclos}% of the time</span><span class="lbl">Blinks</span><span class="mono">${r.blinks_per_min}/min</span><span class="lbl">Long blinks</span><span class="mono">${r.long_blinks}</span></div>` : ''}<p style="margin:0">${esc(r.message)}</p>`;
    };
    return cleanup;
  }

  // ------------------------------------------------ step 3: eyes and skin
  if (step === 3) {
    const grid = Array.from({ length: 21 }, (_, i) => `<line x1="${i * 10}" y1="0" x2="${i * 10}" y2="200" stroke="#111" stroke-width=".8"/><line x1="0" y1="${i * 10}" x2="200" y2="${i * 10}" stroke="#111" stroke-width=".8"/>`).join('');
    el.innerHTML = head('Eyes & skin', 'Weekly vision grid (for eye changes in space) and a skin photo if anything looks new') + `
    <div class="row">
      <div class="card grow"><h2>Vision grid</h2><p class="muted" style="margin:0">Hold the tablet at reading distance. Cover one eye and look at the centre dot. Do all the lines look straight and complete?</p>
        <div class="row" style="align-items:center"><svg class="amsler" viewBox="0 0 200 200" role="img" aria-label="Amsler grid with a centre dot">${grid}<circle cx="100" cy="100" r="3.5" fill="#000"/></svg>
        <div class="col" style="flex:1;min-width:220px">${['Left eye', 'Right eye'].map((e, i) => `<div class="field"><label>${e}</label><div class="seg" role="group" aria-label="${e}"><button type="button" data-eye="${i}" data-v="ok" class="${d.eyes?.[i] === 'ok' ? 'on' : ''}">Straight</button><button type="button" data-eye="${i}" data-v="bad" class="${d.eyes?.[i] === 'bad' ? 'on' : ''}">Wavy, blurry or missing</button></div></div>`).join('')}
        <div id="eyeres" class="note">${d.readings.vision ? `Recorded: ${esc(d.readings.vision)}` : 'Answer for each eye.'}</div></div></div></div>
      <div class="card" style="width:420px;flex:none;max-width:100%"><h2>Skin photo</h2>
        <div class="cam" id="cam"><video id="v" playsinline></video><img id="shot" alt="" hidden><div class="idle" id="idle">${icon('camera', 'var(--t2)', 36)}<span>Rash, cold sore or a cut? Photograph it with the flash on.</span></div></div>
        <div class="row" style="gap:10px"><button class="btn ghost sm" id="camon">${icon('camera')}Camera</button><button class="btn sm" id="snap" disabled>Take photo</button><label class="btn ghost sm" for="up" style="cursor:pointer">${icon('upload')}Upload</label><input type="file" id="up" accept="image/*" class="sr"></div>
        <div id="skinres" class="note">Photos stay onboard and are shared only with the crew medical officer.</div></div>
    </div>${nav(2, 4)}`;
    d.eyes = d.eyes || [null, null];
    el.querySelectorAll('[data-eye]').forEach((b) => b.onclick = () => {
      d.eyes[+b.dataset.eye] = b.dataset.v;
      el.querySelectorAll(`[data-eye="${b.dataset.eye}"]`).forEach((x) => x.classList.toggle('on', x === b));
      if (d.eyes.every(Boolean)) {
        const bad = d.eyes.map((v, i) => v === 'bad' ? ['left', 'right'][i] : null).filter(Boolean);
        d.readings.vision = bad.length ? `distortion in ${bad.join(' and ')} eye` : 'none';
        el.querySelector('#eyeres').innerHTML = bad.length ? `<span style="color:var(--ambt)">Distortion noted in the ${bad.join(' and ')} eye. TRIX will tell the crew medical officer.</span>` : '<span style="color:var(--teal)">Both eyes normal.</span>';
      }
      save(who, d);
    });
    const v = el.querySelector('#v'), shot = el.querySelector('#shot');
    const analyse = async (img) => {
      shot.src = img; shot.hidden = false; el.querySelector('#idle').hidden = true;
      el.querySelector('#skinres').innerHTML = '<span class="spinner"></span> Checking…';
      const r = await api.post('/api/vision/skin', { who, image: img });
      if (r.ok) d.readings.skin = r.reading.skin;
      save(who, d);
      el.querySelector('#skinres').innerHTML = r.ok ? `${chip(r.status, r.status === 'green' ? 'No red area' : 'Red area')} <span class="mono small">${r.red_pct}% of skin · ${r.spots} spots</span><p style="margin:6px 0 0">${esc(r.message)}</p><span class="small dim">${esc(r.note)}</span>` : esc(r.message);
    };
    el.querySelector('#camon').onclick = async () => { try { stream = await startCamera(v, 'environment'); shot.hidden = true; el.querySelector('#idle').hidden = true; el.querySelector('#snap').disabled = false; } catch (e) { toast(esc(e.message)); } };
    el.querySelector('#snap').onclick = () => { const img = frameJpeg(v); stopCamera(stream); analyse(img); };
    el.querySelector('#up').onchange = async (e) => { if (e.target.files[0]) analyse(await fileToDataUrl(e.target.files[0])); };
    return cleanup;
  }

  // ------------------------------------------------ step 4: symptoms and food
  const [menu, food] = await Promise.all([api.get('/api/menu'), api.get(`/api/food/today/${who}`)]);
  el.innerHTML = head('Symptoms & food', 'Anything that feels wrong, and what you ate and drank today') + `
  <div class="row">
    <div class="col grow">
      <div class="card"><h2>How do you feel?</h2>
        <textarea class="input" id="sym" rows="3" placeholder="For example: mild headache since waking up">${esc(d.symptoms || '')}</textarea>
        <div class="row" style="gap:8px">${['Headache', 'Dizzy', 'Nausea', 'Back pain', 'Blurry vision', 'Congested', 'Lonely or stressed', 'Short of breath', 'Chest pain'].map((s) => `<button class="btn ghost sm" data-sym="${s}">${s}</button>`).join('')}<button class="btn ghost sm" id="symvoice">${icon('mic')}Say it</button></div></div>
      <div class="card"><div class="head"><h2>Food & water</h2><a class="small" href="/api/food/labels" target="_blank" rel="noopener">Print pouch labels</a></div>
        <div class="row"><div class="cam" style="max-width:320px"><video id="v" playsinline></video><div class="idle" id="idle">${icon('food', 'var(--t2)', 36)}<span>Show the pouch's QR label to the camera</span></div><div class="msg" id="fmsg" hidden></div></div>
        <div class="col" style="flex:1;min-width:240px"><button class="btn" id="scan">${icon('camera', '#fff', 20)}Scan a pouch</button><label class="btn ghost" for="fup" style="cursor:pointer">${icon('upload')}Photo of a pouch</label><input type="file" id="fup" accept="image/*" class="sr">
          <div class="row" style="gap:8px"><button class="btn ghost sm" data-add="TRIX-F12">+ 500 mL water</button><button class="btn ghost sm" data-add="TRIX-F09">+ Fortified milk</button><button class="btn ghost sm" data-add="TRIX-F16">+ Vitamin D3</button></div>
          <label class="field"><span class="small muted">Or pick from the menu</span><select class="input" id="pick"><option value="">Choose food…</option>${menu.items.map((m) => `<option value="${m.id}">${esc(m.name)} · ${m.kcal} kcal</option>`).join('')}</select></label></div></div>
        <div id="eaten" class="small muted"></div></div>
    </div>
    <div class="col" style="width:360px;flex:none;max-width:100%"><div class="card" id="totals"></div>
      <div class="card"><h3>Ready?</h3><p class="small muted" style="margin:0">${Object.keys(d.readings).filter((k) => d.readings[k] != null).length} readings in this check-in.</p><button class="btn big" id="submit">${icon('send', '#fff', 22)}Send check-in</button></div></div>
  </div>${nav(3, null)}`;
  let fd = food;
  const drawTotals = () => {
    const t = fd.totals, g = fd.targets;
    el.querySelector('#totals').innerHTML = `<h3>Today so far</h3><div class="row" style="justify-content:space-around">
      <div style="text-align:center">${ring(t.fluid_ml / g.fluid_ml, '#60A5FA', 110, 'Water')}<div class="small">Water ${Math.round(t.fluid_ml)} / ${g.fluid_ml} mL</div></div>
      <div style="text-align:center">${ring(t.calcium_mg / g.calcium_mg, '#2DD4BF', 110, 'Calcium')}<div class="small">Calcium ${Math.round(t.calcium_mg)} / ${g.calcium_mg} mg</div></div></div>
      <div class="small muted">Vitamin D ${Math.round(t.vitamin_d_iu)} / ${g.vitamin_d_iu} IU · ${Math.round(t.kcal)} kcal</div>`;
    el.querySelector('#eaten').textContent = fd.items.length ? `Logged today: ${fd.items.map((i) => i.name).join(', ')}` : 'Nothing logged yet today.';
    animateRings(el);
  };
  drawTotals();
  const log = async (ids) => { fd = await api.post('/api/food/log', { who, ids }); drawTotals(); toast(`Logged ${esc(ids.map((i) => menu.items.find((m) => m.id === i)?.name).join(', '))}`); };
  el.querySelectorAll('[data-add]').forEach((b) => b.onclick = () => log([b.dataset.add]));
  el.querySelector('#pick').onchange = (e) => { if (e.target.value) { log([e.target.value]); e.target.value = ''; } };
  const sym = el.querySelector('#sym');
  sym.oninput = () => { d.symptoms = sym.value; save(who, d); };
  el.querySelectorAll('[data-sym]').forEach((b) => b.onclick = () => { sym.value = [sym.value, b.dataset.sym.toLowerCase()].filter(Boolean).join(', '); sym.oninput(); });
  el.querySelector('#symvoice').onclick = () => { rec = listenOnce({ onText: (t) => { if (t) { sym.value = t; sym.oninput(); } }, onError: () => toast('Speech recognition is not available in this browser.') }); };
  const v = el.querySelector('#v'), fmsg = el.querySelector('#fmsg');
  el.querySelector('#scan').onclick = async () => {
    try { stream = await startCamera(v, 'environment'); } catch (e) { toast(esc(e.message)); return; }
    el.querySelector('#idle').hidden = true; fmsg.hidden = false; fmsg.textContent = 'Looking for a pouch label…';
    clearInterval(timer);
    timer = setInterval(async () => {
      const r = await api.post('/api/vision/food', { who, image: frameJpeg(v, 800), log: false });
      if (r.ok) { clearInterval(timer); stopCamera(stream); fmsg.textContent = r.message; log(r.items.map((i) => i.id)); }
    }, 900);
  };
  el.querySelector('#fup').onchange = async (e) => {
    if (!e.target.files[0]) return;
    const r = await api.post('/api/vision/food', { who, image: await fileToDataUrl(e.target.files[0]), log: false });
    if (r.ok) log(r.items.map((i) => i.id)); else toast(esc(r.message));
  };
  el.querySelector('#submit').onclick = async (e) => {
    e.target.disabled = true; e.target.innerHTML = '<span class="spinner"></span> Agents checking…';
    const readings = Object.fromEntries(Object.entries(d.readings).filter(([, v]) => v !== undefined && v !== null && v !== ''));
    const out = await api.post('/api/checkin', { who, readings, symptoms: d.symptoms || '', source: 'tablet', reminder_slot: null });
    sessionStorage.removeItem(`trix-draft-${who}`);
    cleanup();
    showResult(el, out, who);
  };
  return cleanup;
}

async function showResult(el, out, who) {
  const ind = await api.get('/api/indicators');
  const NAME = Object.fromEntries(ind.indicators.map((i) => [i.id, i.name.split(' (')[0]]));
  const bm = out.body_map || {};
  const flagged = (out.assessments || []).filter((a) => a.status !== 'green');
  el.innerHTML = `
  ${out.handoff ? `<a class="banner red rise" href="#/emergency/${out.case_id}">${icon('alert', '#fff', 30)}<span style="flex:1"><strong style="font-size:20px">TRIX passed this to the Emergency team</strong><br>${esc((out.specialist_plan || {}).advice || '')}</span><span style="font-weight:800">Open →</span></a>` : ''}
  <div class="card" style="align-items:center;text-align:center;padding:32px">
    <svg width="120" height="120" viewBox="0 0 120 120" class="pop" aria-hidden="true"><circle cx="60" cy="60" r="52" fill="none" stroke="#1F2A40" stroke-width="8"/><circle cx="60" cy="60" r="52" fill="none" stroke="#2DD4BF" stroke-width="8" stroke-linecap="round" class="draw" style="stroke-dasharray:330;stroke-dashoffset:330;animation-duration:1.2s"/><path d="m40 62 14 14 28-30" fill="none" stroke="#2DD4BF" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" class="draw" style="stroke-dasharray:80;stroke-dashoffset:80;animation-delay:.9s;animation-duration:.6s"/></svg>
    <h1>Mission logged</h1><p class="muted" style="margin:0">Case ${esc(out.case_id)} · checked by ${out.assessments?.length || 0} health checks and the Safety agent · <a href="#/office/${out.case_id}">see what the agents did</a></p>
  </div>
  <div class="row">
    <div class="card grow"><h2>What TRIX found</h2><div class="grid4">${PARTS.filter((p) => bm[p.id]).map((p, i) => `<div class="note rise" style="animation-delay:${i * 80}ms;display:flex;flex-direction:column;gap:6px"><strong style="color:var(--t1)">${esc(p.name)}</strong>${chip(bm[p.id].status)}<span class="small">${esc(level(bm[p.id].level))}</span></div>`).join('')}</div>
      ${flagged.length ? `<div class="list">${flagged.map((a) => `<div class="li"><span style="flex:1"><strong>${esc(NAME[a.indicator] || a.indicator)}</strong> <span class="muted">${esc(a.reasons.join(' · '))}</span></span>${chip(a.status)}</div>`).join('')}</div>` : ''}</div>
    <div class="col" style="width:400px;flex:none;max-width:100%"><div class="card"><h2>What to do</h2>${(out.coach?.messages || []).map((m) => `<div class="note" style="color:var(--t1)">${esc(m)}</div>`).join('')}
      ${(out.coach?.learn || []).length ? `<div class="small muted">Learn more: ${out.coach.learn.slice(0, 3).map((l) => `<a href="#/body/${esc(l.indicator)}">${esc(NAME[l.indicator] || l.indicator)}</a>`).join(' · ')}</div>` : ''}
      <div class="small dim">Next check-in reminder: ${esc(out.reminder?.next_checkin || '')}</div></div>
      <a class="btn ghost" href="#/today">${icon('today')}Back to Today</a></div>
  </div>`;
}
