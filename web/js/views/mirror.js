// Body mirror: scan yourself, see your own outline, compare with your first scan.
import { api } from '../api.js';
import { esc, icon, chip, toast } from '../ui.js';
import { startCamera, stopCamera, frameJpeg, fileToDataUrl, mediapipe } from '../sensors.js';
import * as homemsg from '../homemsg.js';

const NEED = [0, 11, 12, 23, 24, 25, 26, 27, 28], SEND = [0, 7, 8, 11, 12, 23, 24, 25, 26, 27, 28];

function maskPng(maskImg, w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); g.drawImage(maskImg, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h), px = d.data;
  let amin = 255, amax = 0;
  for (let i = 3; i < px.length; i += 64) { if (px[i] < amin) amin = px[i]; if (px[i] > amax) amax = px[i]; }
  const useAlpha = amax - amin > 40;                        // the mask is in the alpha channel on some builds, in red on others
  for (let i = 0; i < px.length; i += 4) { const v = (useAlpha ? px[i + 3] : px[i]) > 127 ? 255 : 0; px[i] = px[i + 1] = px[i + 2] = v; px[i + 3] = 255; }
  g.putImageData(d, 0, 0);
  return c.toDataURL('image/png');
}

function overlay(cmp, mix, localPhoto, who) {
  const cur = cmp.current, base = cmp.baseline, a = cur.anchor;
  const W = Math.round(1000 * a.aspect), H = 1000;
  const pts = (o) => o.map(([x, y]) => `${(a.hip[0] * W + x * a.height * H).toFixed(1)},${(a.hip[1] * H + y * a.height * H).toFixed(1)}`).join(' ');
  const photo = localPhoto || (cur.has_photo ? `/api/scan/${who}/photo/${cur.id}` : null);
  const two = cmp.scans.length > 1;
  return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;max-height:640px;display:block;background:#071126" role="img" aria-label="Your scan with ${two ? 'the first-scan outline in blue and today\'s outline in amber' : 'today\'s outline'}">
    ${photo ? `<image href="${photo}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="none" opacity=".85"/>` : `<text x="${W / 2}" y="40" text-anchor="middle" font-size="22" fill="#8396BA">outline only (photo not kept)</text>`}
    ${two ? `<polygon id="obase" points="${pts(base.outline)}" fill="none" stroke="#7FB2FF" stroke-width="5" stroke-dasharray="14 8" stroke-linejoin="round" opacity="${1 - mix * 0.85}"/>` : ''}
    <polygon id="ocur" points="${pts(cur.outline)}" fill="none" stroke="#FBBF24" stroke-width="5" stroke-linejoin="round" opacity="${two ? 0.15 + mix * 0.85 : 1}"/></svg>`;
}

export async function render(el, { state }) {
  const who = state.who;
  let cmp = await api.get(`/api/scan/${who}`);
  let stream = null, stopped = false, localPhoto = null, mix = 0.6, lastGood = null;
  const cleanup = () => { stopped = true; stopCamera(stream); };

  function draw() {
    const has = cmp.scans.length > 0;
    el.innerHTML = `
    <div class="head"><div><div class="kicker">Weekly routine · body mirror · ${cmp.scans.length} scan${cmp.scans.length === 1 ? '' : 's'}</div><h1>${has && cmp.scans.length > 1 ? `How your body has changed since day ${cmp.baseline.day}` : 'Scan yourself so TRIX can show your body'}</h1></div>
      ${has && cmp.scans.length > 1 ? `<span class="row small" style="gap:14px"><span class="row" style="gap:6px;align-items:center"><span style="width:18px;height:3px;background:#7FB2FF"></span>Day ${cmp.baseline.day}${cmp.baseline.simulated ? ' (simulated)' : ''}</span><span class="row" style="gap:6px;align-items:center"><span style="width:18px;height:3px;background:#FBBF24"></span>Today · day ${cmp.current.day}</span></span>` : ''}</div>
    <div class="row">
      <div class="card" style="flex:1.1;min-width:320px;padding:0;gap:0"><div class="tile"><div class="ptitle"><span>${has ? 'Your scan with outlines' : 'Camera'}</span><span class="mono small dim">same pose · same distance</span></div></div>
        <div style="padding:10px" id="stage">${has ? overlay(cmp, mix, localPhoto, who) : ''}<div class="cam" id="cam" ${has ? 'hidden' : ''} style="aspect-ratio:3/4;max-height:640px;margin:0 auto"><video id="vid" playsinline></video><canvas class="overlay" id="ov"></canvas>
          <div class="idle" id="idle">${icon('body', 'var(--t2)', 44)}<span>Hook your feet in the loops, face the tablet and stand so your head and feet are both in view. Arms slightly out.</span></div><div class="msg" id="msg" hidden></div></div></div>
        ${has && cmp.scans.length > 1 ? `<div style="padding:12px 16px;border-top:1px solid var(--bd)"><div class="row" style="align-items:center;gap:12px"><span class="mono small" style="color:#7FB2FF">DAY ${cmp.baseline.day}</span><label class="sr" for="mix">Fade between scans</label><input type="range" id="mix" min="0" max="100" value="${mix * 100}" style="flex:1"><span class="mono small" style="color:#FBBF24">TODAY</span></div></div>` : ''}
        <div class="row" style="padding:12px 16px;border-top:1px solid var(--bd);gap:10px;align-items:center"><button class="btn" id="camon">${icon('camera', '#fff', 18)}${has ? 'Scan again' : 'Start camera'}</button><button class="btn due" id="shot" disabled>Capture</button>
          <label class="btn ghost" for="up" style="cursor:pointer">${icon('upload')}Use a photo</label><input type="file" id="up" accept="image/*" class="sr"><span id="stat" class="mono small muted"></span></div></div>
      <div class="col" style="flex:1;min-width:300px">
        <div class="card"><h2>What changed</h2>${cmp.changes.length ? `<div class="list">${cmp.changes.map((c, i) => `<div class="li rise" style="animation-delay:${i * 90}ms"><span style="flex:1"><strong>${esc(c.label)}</strong><br><span class="small muted">${esc(c.note)}</span></span><span class="mono" style="font-size:20px">${c.pct > 0 ? '+' : ''}${c.pct}%</span>${chip(c.status, c.status === 'green' ? 'GO' : 'WATCH')}</div>`).join('')}</div>` : `<p class="muted" style="margin:0">${has ? 'One scan so far. A second scan shows what changed.' : 'Nothing to compare yet.'}</p>`}</div>
        <div class="card"><h2>What to do</h2><div style="font-size:18px;font-weight:700">${esc(cmp.message)}</div>${cmp.note ? `<div class="small muted" style="line-height:1.5">${esc(cmp.note)}</div>` : ''}
          <div class="row" style="gap:10px">${cmp.changes.some((c) => c.status === 'amber') ? '<a class="btn" href="#/capture/exercise">Log today\'s exercise</a>' : ''}<a class="btn ghost" href="#/today">Back to my deck</a></div></div>
        <div class="card" style="flex:1"><h2>Why scan?</h2><div style="line-height:1.5">In weightlessness, fluid moves toward the head and leg muscles shrink. Astronauts call it “puffy face, bird legs”. Your scan becomes the body on your mission deck, and a weekly re-scan shows how you are changing.</div>
          <div class="small muted">Scans: ${cmp.scans.map((s) => `day ${s.day}${s.simulated ? ' (simulated)' : ''}`).join(' · ') || 'none yet'}</div>
          ${has && !cmp.scans.some((s) => s.simulated) ? `<button class="btn ghost sm" id="sim">Add a simulated day-1 scan (demo)</button><span class="small dim">For the demo only: builds a “day 1” from today's scan by undoing the typical spaceflight changes.</span>` : ''}</div>
      </div>
    </div>
    <div id="homemsgs"></div>`;
    homemsg.mount(el.querySelector('#homemsgs'), who, { manage: true });
    const m = el.querySelector('#mix');
    if (m) m.oninput = () => { mix = m.value / 100; const b = el.querySelector('#obase'), c = el.querySelector('#ocur'); if (b) b.style.opacity = 1 - mix * 0.85; if (c) c.style.opacity = 0.15 + mix * 0.85; };
    el.querySelector('#sim')?.addEventListener('click', async () => { cmp = await api.post('/api/scan/simulate-day1', { who }); draw(); });
    el.querySelector('#camon').onclick = live;
    el.querySelector('#shot').onclick = capture;
    el.querySelector('#up').onchange = async (e) => { if (e.target.files[0]) fromPhoto(await fileToDataUrl(e.target.files[0])); };
  }

  const ready = (lm) => lm && NEED.every((i) => lm[i] && (lm[i].visibility ?? 1) > 0.5 && lm[i].y > 0 && lm[i].y < 1);
  async function model() { const stat = el.querySelector('#stat'); stat.textContent = 'Loading the body model (on the tablet)…'; const p = await mediapipe('pose_seg'); stat.textContent = ''; return p; }

  async function live() {
    const cam = el.querySelector('#cam'), vid = el.querySelector('#vid'), msg = el.querySelector('#msg'), ov = el.querySelector('#ov');
    el.querySelector('#stage svg')?.remove(); cam.hidden = false; msg.hidden = false; msg.textContent = 'Starting camera…';
    try { stream = await startCamera(vid, 'user'); } catch (e) { msg.textContent = e.message; return; }
    el.querySelector('#idle').hidden = true;
    let pose;
    try { pose = await model(); } catch (e) { msg.textContent = `Body model could not load: ${e.message}`; return; }
    const ctx = ov.getContext('2d');
    while (!stopped && stream && vid.isConnected) {
      const r = await pose.run(vid);
      ov.width = vid.videoWidth; ov.height = vid.videoHeight; ctx.clearRect(0, 0, ov.width, ov.height);
      const ok = ready(r?.poseLandmarks);
      ctx.strokeStyle = ok ? '#2DD4BF' : '#FBBF24'; ctx.lineWidth = 4; ctx.setLineDash([12, 10]);
      ctx.strokeRect(ov.width * 0.2, ov.height * 0.04, ov.width * 0.6, ov.height * 0.92);
      lastGood = ok ? { r, w: vid.videoWidth, h: vid.videoHeight } : null;
      const shot = el.querySelector('#shot'); if (shot) shot.disabled = !ok;
      msg.textContent = ok ? 'Pose matched. Hold still and press Capture.' : "I can't see your whole body yet. Step back until your head and feet are inside the frame.";
      await new Promise((res) => setTimeout(res, 150));          // let the page breathe between frames
    }
  }

  async function send(r, w, h, photo) {
    const landmarks = Object.fromEntries(SEND.filter((i) => r.poseLandmarks[i]).map((i) => [i, [r.poseLandmarks[i].x, r.poseLandmarks[i].y]]));
    if (!r.segmentationMask) throw new Error('The body model did not return an outline. Try again with more light.');
    cmp = await api.post('/api/scan', { who, mask: maskPng(r.segmentationMask, Math.min(w, 720), Math.round(Math.min(w, 720) * h / w)), landmarks, photo });
    localPhoto = photo; cleanup(); stopped = false; stream = null;
    toast('Scan saved. It is now the body on your mission deck.');
    draw();
  }

  async function capture() {
    if (!lastGood) return;
    const vid = el.querySelector('#vid');
    try { await send(lastGood.r, lastGood.w, lastGood.h, frameJpeg(vid, 720, 0.82)); } catch (e) { el.querySelector('#msg').textContent = e.message; }
  }

  async function fromPhoto(dataUrl) {
    const stat = el.querySelector('#stat');
    try {
      const img = new Image(); img.src = dataUrl; await img.decode();
      const pose = await model();
      const r = await pose.run(img);
      if (!ready(r?.poseLandmarks)) { stat.textContent = "I can't see a whole body in that photo (head to feet, facing the camera)."; return; }
      const c = document.createElement('canvas'); const s = Math.min(1, 720 / img.naturalWidth); c.width = img.naturalWidth * s; c.height = img.naturalHeight * s; c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      await send(r, img.naturalWidth, img.naturalHeight, c.toDataURL('image/jpeg', 0.82));
    } catch (e) { stat.textContent = e.message; }
  }

  draw();
  return cleanup;
}
