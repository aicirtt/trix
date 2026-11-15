import { api } from '../api.js';
import { esc, icon, chip, toast, speak } from '../ui.js';
import { startCamera, stopCamera, frameJpeg, fileToDataUrl, mediapipe, speechAvailable, listenOnce } from '../sensors.js';
import * as av from '../avatar3d.js';

const DEVICE_INPUT = {
  spo2_recheck: [['spo2', 'Oxygen on the other finger', '%']],
  reading_received: [['glucose', 'Blood sugar reading', 'mg/dL']],
  vitals_baseline: [['hr', 'Heart rate lying down', 'bpm'], ['sys', 'Top BP lying down', 'mmHg']],
  vitals_standing: [['hr', 'Heart rate standing', 'bpm'], ['sys', 'Top BP standing', 'mmHg']],
};

export async function render(el, { params, state, go }) {
  const sid = params[0];
  let v = await api.get(`/api/procedure/${sid}`);
  let stream = null, timer = null, stopped = false, rec = null, voiceOn = false, talk = true;
  const placed = {};
  const values = {};
  // "Show me how": one 3D stage kept alive across steps and moved into each newly drawn step
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pid = v.protocol.id;
  let showAv = av.HAS(pid) && av.webglOk() && (() => { try { return localStorage.getItem('trix-avatar') !== 'off'; } catch (e) { return true; } })();
  const avBox = document.createElement('div');
  avBox.className = 'avbox';
  avBox.innerHTML = '<div class="avmsg">Loading the 3D guide…</div>';
  let stage = null, stageFailed = false;
  const weightless = ['iss', 'mars'].includes(state.mission?.location || 'iss');
  async function ensureStage() {
    if (stage || stageFailed || !showAv) return stage;
    try { stage = await av.createStage(avBox, { weightless, still: reduce }); avBox.querySelector('.avmsg')?.remove(); }
    catch (e) { stageFailed = true; avBox.innerHTML = `<div class="avmsg">The 3D guide could not load here (${esc(e.message)}). Follow the written steps.</div>`; }
    return stage;
  }
  const cleanup = () => { stopped = true; clearInterval(timer); stopCamera(stream); rec?.stop?.(); speechSynthesis?.cancel?.(); stage?.dispose(); stage = null; };

  async function submit(passed, detail = '') {
    clearInterval(timer);
    v = await api.post(`/api/procedure/${sid}/submit`, { passed, detail });
    if (v.feedback && !passed) toast(esc(v.feedback));
    draw();
  }

  function draw() {
    const p = v.protocol, cur = v.current;
    const dots = p.steps.map((s, i) => `<span class="${i < (cur ? cur.n - 1 : p.steps.length) ? 'done' : i === (cur?.n ?? 0) - 1 ? 'now' : ''}"></span>`).join('');
    if (v.done) {
      stopCamera(stream); stage?.dispose(); stage = null;
      const sc = v.score;
      el.innerHTML = `<div class="card" style="align-items:center;text-align:center;padding:36px">
        <svg width="110" height="110" viewBox="0 0 120 120" class="pop" aria-hidden="true"><circle cx="60" cy="60" r="52" fill="none" stroke="#2DD4BF" stroke-width="8"/><path d="m40 62 14 14 28-30" fill="none" stroke="#2DD4BF" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <h1>${esc(p.title)} complete</h1>
        ${v.practice && sc ? `<div class="row" style="justify-content:center;gap:12px"><span class="chip blue" style="font-size:18px">Score ${sc.score}/100</span>${chip('none', `${sc.retries} retries`)}${chip('none', `${sc.seconds} s`)}</div>` : '<p class="muted">Every step was checked. The record is in the Earth report and the Agent office.</p>'}
        <div class="row" style="justify-content:center"><a class="btn ghost" href="#/care">Back to Care</a><a class="btn" href="#/today">Health</a></div></div>`;
      return;
    }
    const chk = cur.check;
    const isEcg = chk.type === 'camera' && /^E\d$/.test(chk.target || '');
    const isCam = chk.type === 'camera';
    el.innerHTML = `
    <div class="head"><div><h1>${esc(p.title)}</h1><div class="sub">${v.practice ? 'Practice mode · scored' : 'Live procedure'} · ${esc(p.id)} · ${esc(p.note || '')}</div></div>
      <div class="row" style="gap:12px;align-items:center"><strong class="muted">Step ${cur.n} of ${cur.of}</strong><div class="dots">${dots}</div></div></div>
    <div class="row">
      <div class="col" style="flex:1.3;min-width:320px">
        ${av.HAS(pid) ? `<div class="card" style="padding:0;gap:0"><div class="tile"><div class="ptitle"><span>Show me how · step ${cur.n} of ${cur.of}</span><button class="btn ghost sm" id="avtoggle">${showAv ? 'Hide 3D guide' : 'Show 3D guide'}</button></div></div>${showAv ? '<div id="avslot"></div><div class="avcap"><span id="avlabel"></span><span class="dim">Drag to turn · 3D guide is a demonstration; follow the written step</span></div>' : ''}</div>` : ''}
        ${isCam ? `<div class="cam" id="cam"><video id="vid" playsinline></video><canvas class="overlay" id="ov"></canvas>
          <div class="idle" id="idle">${icon('camera', 'var(--t2)', 40)}<span>${isEcg ? 'Mount the tablet facing the patient\'s chest so the shoulders and hips are in view.' : 'Point the camera at the patient.'}</span><button class="btn" id="camon">${icon('camera', '#fff', 18)}Turn on camera</button></div>
          <div class="msg" id="msg" hidden></div></div>` : ''}
        ${chk.type === 'device' && chk.target === 'view_quality' ? `<div class="card"><h3>Ultrasound picture</h3><p class="small muted" style="margin:0">Capture the ultrasound screen or upload a frame. TRIX checks the view.</p><div class="row" style="gap:8px"><label class="btn ghost sm" for="usup" style="cursor:pointer">${icon('upload')}Upload frame</label><input id="usup" type="file" accept="image/*" class="sr"><a class="btn ghost sm" href="#/ultrasound">Open full ultrasound check</a></div><div id="usres"></div></div>` : ''}
        ${!isCam && chk.type !== 'device' ? `<div class="card" style="min-height:200px;justify-content:center;align-items:center;text-align:center">${icon('check', 'var(--teal)', 48, 2.4)}<p class="muted">Do the step, then confirm.</p></div>` : ''}
        ${chk.type === 'device' && chk.target !== 'view_quality' ? `<div class="card"><h3>Device check</h3>${(DEVICE_INPUT[chk.target] || []).map(([k, n, u]) => `<div class="field"><label for="d-${k}">${n}</label><input id="d-${k}" data-dk="${k}" inputmode="decimal" value="${values[chk.target + k] ?? ''}"><span class="unit">${u}</span></div>`).join('') || `<p class="muted" style="margin:0">Waiting for <strong>${esc(chk.target.replace(/_/g, ' '))}</strong>. Confirm when the device shows it.</p>`}</div>` : ''}
      </div>
      <div class="col" style="flex:1;min-width:300px">
        <div class="card calmstep" style="border:2px solid var(--blue)"><div class="row" style="gap:10px;align-items:center;color:var(--bluet);font-weight:700">${icon('mic', 'var(--bluet)', 20)}TRIX is saying</div>
          <div class="say" id="say">${esc(cur.say)}</div><div id="fb" class="muted"></div></div>
        <div class="note">Hook your feet in the foot loops so your hands stay steady.</div>
        <div class="grid2"><button class="btn ghost big" id="repeat">Repeat</button><button class="btn ghost big" id="help">I need help</button></div>
        <button class="btn big" id="next">${icon('check', '#fff', 22)}${isEcg ? 'Next step (camera confirms)' : chk.type === 'device' ? 'Device shows it · next' : 'Done · next step'}</button>
        <div class="row small" style="justify-content:space-between"><label class="row" style="gap:8px;align-items:center"><span class="switch"><input type="checkbox" id="talk" ${talk ? 'checked' : ''}><span></span></span>Read steps aloud</label>
          ${speechAvailable() ? `<label class="row" style="gap:8px;align-items:center"><span class="switch"><input type="checkbox" id="voice" ${voiceOn ? 'checked' : ''}><span></span></span>Voice: “next”, “repeat”, “help”</label>` : ''}</div>
      </div>
    </div>`;
    const slot = el.querySelector('#avslot');
    if (slot) {
      slot.appendChild(avBox);
      ensureStage().then((st) => { if (st && !stopped) { const lab = st.setStep(pid, cur.n - 1); const l = el.querySelector('#avlabel'); if (l && lab) l.textContent = reduce ? `${lab} · still` : lab; } });
    }
    el.querySelector('#avtoggle')?.addEventListener('click', () => {
      showAv = !showAv; try { localStorage.setItem('trix-avatar', showAv ? 'on' : 'off'); } catch (e) { /* storage off */ }
      if (!showAv) { stage?.dispose(); stage = null; avBox.innerHTML = '<div class="avmsg">Loading the 3D guide…</div>'; }
      draw();
    });
    if (talk) speak(cur.say);
    el.querySelector('#talk').onchange = (e) => { talk = e.target.checked; if (!talk) speechSynthesis?.cancel?.(); };
    el.querySelector('#repeat').onclick = () => speak(cur.say);
    el.querySelector('#help').onclick = () => { api.post('/api/event', { event: 'alert', who: state.who, symptoms: `Help requested during ${p.title}, step ${cur.n}` }); toast('Crew alerted. The crew medical officer has been notified.'); };
    const voice = el.querySelector('#voice');
    if (voice) voice.onchange = (e) => { voiceOn = e.target.checked; if (voiceOn) listen(); else rec?.stop?.(); };
    el.querySelector('#next').onclick = async () => {
      if (isEcg) { await ecgCheck(true); return; }
      if (chk.type === 'device' && DEVICE_INPUT[chk.target]) {
        const ins = [...el.querySelectorAll('[data-dk]')];
        if (ins.some((i) => i.value === '')) { toast('Enter the reading first.'); return; }
        const r = Object.fromEntries(ins.map((i) => [i.dataset.dk, +i.value]));
        ins.forEach((i) => { values[chk.target + i.dataset.dk] = i.value; });
        await api.post('/api/event', { event: 'reading', who: state.who, readings: r, source: p.id });
        return submit(true, `reading ${JSON.stringify(r)}`);
      }
      submit(true, chk.type);
    };
    const up = el.querySelector('#usup');
    if (up) up.onchange = async (e) => {
      const r = await api.post('/api/vision/ultrasound', { image: await fileToDataUrl(e.target.files[0]) });
      el.querySelector('#usres').innerHTML = `${chip(r.quality === 'good' ? 'green' : r.quality === 'fair' ? 'amber' : 'red', `View ${r.quality}`)} <p>${esc(r.message)}</p>`;
      if (r.quality === 'good') submit(true, `view ${r.score}`);
    };
    const camon = el.querySelector('#camon');
    if (camon) camon.onclick = () => camera(chk);
  }

  function listen() {
    if (stopped || !voiceOn) return;
    rec = listenOnce({ onEnd: (t) => {
      const s = (t || '').toLowerCase();
      if (/\b(next|done)\b/.test(s)) el.querySelector('#next')?.click();
      else if (/repeat/.test(s)) el.querySelector('#repeat')?.click();
      else if (/help/.test(s)) el.querySelector('#help')?.click();
      setTimeout(listen, 300);
    }, onError: () => setTimeout(listen, 1500) });
  }

  // ---------------- camera checks ----------------
  async function camera(chk) {
    const vid = el.querySelector('#vid'), msg = el.querySelector('#msg');
    msg.hidden = false; msg.textContent = 'Starting camera…';
    try { stream = await startCamera(vid, 'environment'); } catch (e) { msg.textContent = e.message; return; }
    el.querySelector('#idle').hidden = true;
    msg.textContent = 'Loading the body-tracking model (on the tablet)…';
    let pose;
    try { pose = await mediapipe('pose'); } catch (e) { msg.textContent = `Body model could not load: ${e.message}. Confirm the step by eye.`; return; }
    msg.textContent = 'Looking…';
    if (/^E\d$/.test(chk.target)) loopEcg(pose);
    else if (chk.target === 'compression_rate') loopCpr(pose);
    else if (chk.target === 'sway') loopSway(pose);
    else loopShow(pose);
  }

  let lastPose = null;
  async function poseFrame(pose) {
    const vid = el.querySelector('#vid'), ov = el.querySelector('#ov');
    if (!vid || !ov) return null;
    const r = await pose.run(vid);
    ov.width = vid.videoWidth; ov.height = vid.videoHeight;
    const ctx = ov.getContext('2d'); ctx.clearRect(0, 0, ov.width, ov.height);
    const lm = r?.poseLandmarks;
    if (lm) {
      ctx.strokeStyle = 'rgba(96,165,250,.7)'; ctx.lineWidth = 3;
      [[11, 12], [12, 24], [24, 23], [23, 11], [11, 13], [13, 15], [12, 14], [14, 16]].forEach(([a, b]) => { ctx.beginPath(); ctx.moveTo(lm[a].x * ov.width, lm[a].y * ov.height); ctx.lineTo(lm[b].x * ov.width, lm[b].y * ov.height); ctx.stroke(); });
    }
    lastPose = lm;
    return { lm, ov, ctx, vid };
  }

  function loopEcg(pose) {
    const step = async () => {
      while (!stopped && v.current && /^E\d$/.test(v.current.check.target)) {
        await ecgCheck(false, pose);
        await new Promise((r) => setTimeout(r, 700));
      }
    };
    step();
  }

  async function ecgCheck(manual, pose) {
    const target = v.current.check.target;
    const msg = el.querySelector('#msg'), fb = el.querySelector('#fb');
    if (!stream) {
      if (manual) { placed[target] = null; return submit(true, 'confirmed by operator (no camera)'); }
      return;
    }
    let f = pose ? await poseFrame(pose) : { lm: lastPose, vid: el.querySelector('#vid'), ov: el.querySelector('#ov'), ctx: el.querySelector('#ov').getContext('2d') };
    if (!f?.lm) { if (msg) msg.textContent = "I can't see her shoulders and hips yet. Move the tablet back."; return; }
    const landmarks = Object.fromEntries([11, 12, 23, 24].map((i) => [i, [f.lm[i].x, f.lm[i].y]]));
    const r = await api.post('/api/vision/ecg', { image: frameJpeg(f.vid, 960, 0.8), landmarks, target, placed });
    const { ov, ctx } = f;
    if (r.targets_norm) {
      Object.entries(r.targets_norm).forEach(([k, [x, y]]) => {
        const cx = x * ov.width, cy = y * ov.height, now = k === target;
        ctx.beginPath(); ctx.arc(cx, cy, now ? 18 : 10, 0, 7); ctx.lineWidth = now ? 4 : 2;
        ctx.strokeStyle = placed[k] ? '#2DD4BF' : now ? '#FBBF24' : 'rgba(170,182,200,.6)'; ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.font = 'bold 14px Inter, sans-serif'; ctx.fillText(k.slice(1), cx - 4, cy - 22);
      });
    }
    if (r.found_norm && r.targets_norm) {
      const [fx, fy] = [r.found_norm[0] * ov.width, r.found_norm[1] * ov.height];
      const [tx, ty] = [r.targets_norm[target][0] * ov.width, r.targets_norm[target][1] * ov.height];
      ctx.strokeStyle = r.passed ? '#2DD4BF' : '#F87171'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(tx, ty); ctx.stroke();
      ctx.beginPath(); ctx.arc(fx, fy, 8, 0, 7); ctx.fillStyle = ctx.strokeStyle; ctx.fill();
    }
    if (msg) msg.textContent = r.message;
    if (fb) fb.textContent = r.status === 'move' ? r.message : '';
    if (r.passed) { placed[target] = r.found; speak(r.message); await submit(true, `camera: ${r.off_cm} cm from target`); }
    else if (manual) toast(esc(r.message));
  }

  function loopCpr(pose) {
    const ys = [];
    (async () => {
      while (!stopped && v.current?.check.target === 'compression_rate') {
        const f = await poseFrame(pose);
        const msg = el.querySelector('#msg');
        if (f?.lm) {
          const y = (f.lm[15].y + f.lm[16].y) / 2;
          ys.push([performance.now() / 1000, y]);
          while (ys.length && ys[ys.length - 1][0] - ys[0][0] > 8) ys.shift();
          if (ys.length > 20 && ys[ys.length - 1][0] - ys[0][0] > 5) {
            const mean = ys.reduce((s, p) => s + p[1], 0) / ys.length;
            let cross = 0;
            for (let i = 1; i < ys.length; i++) if (ys[i - 1][1] < mean && ys[i][1] >= mean) cross++;
            const rate = Math.round(cross / (ys[ys.length - 1][0] - ys[0][0]) * 60);
            msg.textContent = `Compressions: ${rate} per minute. ${rate < 100 ? 'Push faster.' : rate > 120 ? 'Slow down a little.' : 'Good rate. Keep going.'}`;
            if (rate >= 100 && rate <= 120) { speak('Good rate. Keep going.'); await submit(true, `rate ${rate}/min`); return; }
          } else msg.textContent = 'Start compressions. Measuring the rate…';
        } else if (msg) msg.textContent = "I can't see the helper's arms.";
      }
    })();
  }

  function loopSway(pose) {
    const xs = [];
    (async () => {
      const t0 = performance.now();
      while (!stopped && v.current?.check.target === 'sway') {
        const f = await poseFrame(pose);
        const msg = el.querySelector('#msg');
        if (f?.lm) {
          const sw = Math.hypot(f.lm[11].x - f.lm[12].x, f.lm[11].y - f.lm[12].y);
          xs.push(((f.lm[11].x + f.lm[12].x) / 2) / sw);
          const left = Math.ceil(15 - (performance.now() - t0) / 1000);
          msg.textContent = `Stand still with your eyes open… ${Math.max(0, left)} s`;
          if (left <= 0 && xs.length > 10) {
            const m = xs.reduce((a, b) => a + b, 0) / xs.length;
            const sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length) * 100;
            const ok = sd < 6;
            msg.textContent = `Sway ${sd.toFixed(1)}% of shoulder width: ${ok ? 'steady' : 'unsteady, hold the rail and tell the crew medical officer'}.`;
            await submit(true, `sway ${sd.toFixed(1)}%${ok ? '' : ' (unsteady)'}`);
            return;
          }
        }
      }
    })();
  }

  function loopShow(pose) {
    (async () => { while (!stopped && v.current?.check.type === 'camera') { await poseFrame(pose); const m = el.querySelector('#msg'); if (m) m.textContent = 'Check it on screen, then press Done.'; } })();
  }

  draw();
  return cleanup;
}
