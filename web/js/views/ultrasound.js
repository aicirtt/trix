import { api } from '../api.js';
import { esc, icon, chip, ring, animateRings } from '../ui.js';
import { startCamera, stopCamera, frameJpeg, fileToDataUrl } from '../sensors.js';

function syntheticFrame(good = true) {
  // A drawn practice image (clearly labelled): a fan-shaped scan with four dark chambers.
  const c = document.createElement('canvas'); c.width = 640; c.height = 480;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 640, 480);
  g.save(); g.beginPath(); g.moveTo(320, 20); g.arc(320, 20, 430, Math.PI * 0.31, Math.PI * 0.69); g.closePath(); g.clip();
  const n = document.createElement('canvas'); n.width = 640; n.height = 480;
  const nc = n.getContext('2d'), img = nc.createImageData(640, 480);
  for (let i = 0; i < img.data.length; i += 4) { const v = 120 + Math.random() * 90; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
  nc.putImageData(img, 0, 0);
  g.drawImage(n, 0, 0);   // drawImage respects the fan-shaped clip; putImageData would not
  g.restore();
  g.save(); g.beginPath(); g.moveTo(320, 20); g.arc(320, 20, 430, Math.PI * 0.31, Math.PI * 0.69); g.closePath(); g.clip();
  g.fillStyle = '#080808';
  const ch = good ? [[275, 210], [370, 205], [270, 330], [372, 330]] : [[300, 230], [365, 300]];
  ch.forEach(([x, y]) => { g.beginPath(); g.ellipse(x, y, 40, 52, 0, 0, 7); g.fill(); });
  g.restore();
  g.fillStyle = '#FBBF24'; g.font = 'bold 18px sans-serif'; g.fillText('PRACTICE IMAGE (drawn, not a real scan)', 14, 462);
  return c.toDataURL('image/jpeg', 0.9);
}

export async function render(el) {
  let stream = null;
  el.innerHTML = `
  <div class="head"><div><h1>Ultrasound heart check</h1><div class="sub">Apical 4-chamber view · TRIX checks the picture and tells you how to move the probe</div></div><a class="btn ghost" href="#/care">${icon('back')}Care</a></div>
  <div class="row">
    <div class="col" style="flex:1.4;min-width:320px"><div class="cam" style="aspect-ratio:4/3"><video id="vid" playsinline></video><canvas class="overlay" id="ov"></canvas><img id="img" alt="Ultrasound frame being checked" hidden>
      <div class="idle" id="idle">${icon('heart', 'var(--t2)', 40)}<span>Point the tablet camera at the ultrasound screen, or upload a frame.</span></div></div>
      <div class="row" style="gap:10px"><button class="btn ghost" id="camon">${icon('camera')}Use camera</button><button class="btn" id="snap" disabled>Check this frame</button>
        <label class="btn ghost" for="up" style="cursor:pointer">${icon('upload')}Upload frame</label><input id="up" type="file" accept="image/*" class="sr">
        <button class="btn ghost sm" id="good">Practice image</button><button class="btn ghost sm" id="bad">Practice image (poor)</button></div></div>
    <div class="col" style="flex:1;min-width:300px"><div class="card" id="res"><h2>View quality</h2><p class="muted" style="margin:0">No frame checked yet.</p></div>
      <div class="note">Checks: picture coverage, brightness (gain), sharpness and the four heart chambers. Pumping strength (ejection fraction) needs the EchoNet-Dynamic model, which is not installed on this computer.</div></div>
  </div>`;
  const vid = el.querySelector('#vid'), img = el.querySelector('#img'), ov = el.querySelector('#ov');
  const check = async (dataUrl) => {
    img.src = dataUrl; img.hidden = false; el.querySelector('#idle').hidden = true;
    el.querySelector('#res').innerHTML = '<span class="spinner"></span>';
    const r = await api.post('/api/vision/ultrasound', { image: dataUrl });
    await new Promise((res) => { if (img.complete) res(); else img.onload = res; });
    ov.width = r.size?.[0] || 640; ov.height = r.size?.[1] || 480;
    const ctx = ov.getContext('2d'); ctx.clearRect(0, 0, ov.width, ov.height);
    ctx.strokeStyle = '#2DD4BF'; ctx.lineWidth = 3;
    (r.chamber_boxes || []).forEach(([x, y, w, h], i) => { ctx.strokeRect(x, y, w, h); ctx.fillStyle = '#2DD4BF'; ctx.font = 'bold 16px Inter'; ctx.fillText(String(i + 1), x + 6, y + 20); });
    const st = r.quality === 'good' ? 'green' : r.quality === 'fair' ? 'amber' : 'red';
    el.querySelector('#res').innerHTML = `<div class="head"><h2>View quality</h2>${chip(st, r.quality ? r.quality[0].toUpperCase() + r.quality.slice(1) : 'No image')}</div>
      ${r.ok ? `<div class="row" style="align-items:center">${ring(r.score / 100, st === 'green' ? '#2DD4BF' : st === 'amber' ? '#FBBF24' : '#F87171', 120, 'Quality')}<div class="kv" style="flex:1"><span class="lbl">Chambers</span><span class="mono">${r.chambers} of 4</span><span class="lbl">Brightness</span><span class="mono">${r.brightness}</span><span class="lbl">Sharpness</span><span class="mono">${r.sharpness}</span><span class="lbl">Coverage</span><span class="mono">${Math.round(r.coverage * 100)}%</span></div></div>` : ''}
      <div class="say" style="font-size:22px">${esc(r.message)}</div>${(r.tips || []).slice(1).map((t) => `<div class="note">${esc(t)}</div>`).join('')}<div class="small dim">${esc(r.note || '')}</div>`;
    animateRings(el);
  };
  el.querySelector('#camon').onclick = async () => { try { stream = await startCamera(vid, 'environment'); img.hidden = true; el.querySelector('#idle').hidden = true; el.querySelector('#snap').disabled = false; } catch (e) { el.querySelector('#res').innerHTML = esc(e.message); } };
  el.querySelector('#snap').onclick = () => check(frameJpeg(vid));
  el.querySelector('#up').onchange = async (e) => { if (e.target.files[0]) check(await fileToDataUrl(e.target.files[0])); };
  el.querySelector('#good').onclick = () => check(syntheticFrame(true));
  el.querySelector('#bad').onclick = () => check(syntheticFrame(false));
  return () => stopCamera(stream);
}
