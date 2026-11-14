// Tablet sensors: camera, MediaPipe (on-device), speech, Bluetooth heart-rate straps.
import { api } from './api.js';

// ---------------- camera ----------------
export async function startCamera(video, facing = 'user') {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser has no camera access. Use Chrome or Edge on localhost.');
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 960 }, height: { ideal: 720 } }, audio: false });
  video.srcObject = stream;
  video.muted = true;
  video.playsInline = true;
  await video.play();
  return stream;
}
export function stopCamera(stream) { stream?.getTracks().forEach((t) => t.stop()); }

export function frameJpeg(src, maxW = 960, q = 0.85) {
  const w = src.videoWidth || src.naturalWidth || src.width, h = src.videoHeight || src.naturalHeight || src.height;
  const s = Math.min(1, maxW / w);
  const c = document.createElement('canvas');
  c.width = Math.round(w * s); c.height = Math.round(h * s);
  c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', q);
}

export function fileToDataUrl(file) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
}

// ---------------- MediaPipe (runs in the browser, offline when vendored) ----------------
const MP = {
  face_mesh: { local: '/vendor/mediapipe/face_mesh', cdn: 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@0.4.1633559619', js: 'face_mesh.js', cls: 'FaceMesh' },
  pose: { local: '/vendor/mediapipe/pose', cdn: 'https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404', js: 'pose.js', cls: 'Pose' },
};
const loaded = {};
async function base(kind) {
  const m = MP[kind];
  try { const r = await fetch(`${m.local}/${m.js}`, { method: 'HEAD' }); if (r.ok) return { url: m.local, offline: true }; } catch (e) { /* fall through */ }
  return { url: m.cdn, offline: false };
}
function loadScript(src) {
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.crossOrigin = 'anonymous'; s.onload = res; s.onerror = () => rej(new Error(`Could not load ${src}`)); document.head.appendChild(s); });
}
export async function mediapipe(kind) {
  if (loaded[kind]) return loaded[kind];
  const b = await base(kind);
  await loadScript(`${b.url}/${MP[kind].js}`);
  const Cls = window[MP[kind].cls];
  const model = new Cls({ locateFile: (f) => `${b.url}/${f}` });
  if (kind === 'face_mesh') model.setOptions({ maxNumFaces: 1, refineLandmarks: false, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
  else model.setOptions({ modelComplexity: 0, smoothLandmarks: true, enableSegmentation: false, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
  let last = null;
  model.onResults((r) => { last = r; });
  await model.initialize();
  loaded[kind] = {
    offline: b.offline,
    async run(image) { last = null; await model.send({ image }); return last; },
  };
  return loaded[kind];
}

export const LEFT_EYE = [33, 160, 158, 133, 153, 144];
export const RIGHT_EYE = [362, 385, 387, 263, 373, 380];

// ---------------- speech ----------------
export function speechAvailable() { return !!(window.SpeechRecognition || window.webkitSpeechRecognition); }
export function listenOnce({ onText, onEnd, onError, continuous = false }) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { onError?.(new Error('no speech recognition')); return null; }
  const rec = new SR();
  rec.lang = 'en-US';
  rec.interimResults = true;
  rec.continuous = continuous;
  let final = '';
  rec.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) final += e.results[i][0].transcript + ' ';
      else interim += e.results[i][0].transcript;
    }
    onText?.((final + interim).trim(), false);
  };
  rec.onerror = (e) => onError?.(e);
  rec.onend = () => { onText?.(final.trim(), true); onEnd?.(final.trim()); };
  rec.start();
  return rec;
}

// Offline fallback: record audio and let the onboard computer transcribe it (faster-whisper).
export async function recordAndTranscribe(seconds = 8) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const rec = new MediaRecorder(stream);
  const chunks = [];
  rec.ondataavailable = (e) => chunks.push(e.data);
  const done = new Promise((r) => { rec.onstop = r; });
  rec.start();
  await new Promise((r) => setTimeout(r, seconds * 1000));
  rec.stop();
  await done;
  stream.getTracks().forEach((t) => t.stop());
  const fd = new FormData();
  fd.append('audio', new Blob(chunks, { type: 'audio/webm' }), 'voice.webm');
  return api.form('/api/voice/transcribe', fd);
}

// ---------------- Bluetooth heart rate (standard GATT Heart Rate service) ----------------
export function bluetoothAvailable() { return !!navigator.bluetooth; }
export async function connectHeartRate(onBpm) {
  const dev = await navigator.bluetooth.requestDevice({ filters: [{ services: ['heart_rate'] }] });
  const server = await dev.gatt.connect();
  const svc = await server.getPrimaryService('heart_rate');
  const ch = await svc.getCharacteristic('heart_rate_measurement');
  ch.addEventListener('characteristicvaluechanged', (e) => {
    const v = e.target.value;
    const flags = v.getUint8(0);
    const bpm = flags & 1 ? v.getUint16(1, true) : v.getUint8(1);
    let rr = [];
    if (flags & 0x10) {           // RR intervals present -> heart-rate variability
      let i = 1 + (flags & 1 ? 2 : 1) + (flags & 0x08 ? 2 : 0);
      for (; i + 1 < v.byteLength; i += 2) rr.push(v.getUint16(i, true) / 1024 * 1000);
    }
    onBpm(bpm, rr);
  });
  await ch.startNotifications();
  await api.post('/api/devices/pair', { id: `ble-${dev.id}`, name: dev.name || 'Bluetooth heart-rate strap', feeds: ['hr', 'hrv'], status: 'live' });
  return dev;
}
export function rmssd(rr) {
  if (rr.length < 3) return null;
  let s = 0;
  for (let i = 1; i < rr.length; i++) s += (rr[i] - rr[i - 1]) ** 2;
  return Math.sqrt(s / (rr.length - 1));
}
