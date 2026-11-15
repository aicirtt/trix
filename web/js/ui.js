// Shared UI helpers: icons, chips, body figure, charts, toasts.
import { SPEECH, getLang } from './i18n.js';
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const P = {
  today: '<path d="M3 11 12 4l9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  checkin: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4h6v3H9z"/><path d="m9 14 2 2 4-4"/>',
  body: '<circle cx="12" cy="5" r="2.5"/><path d="M12 8v7"/><path d="M7 10h10"/><path d="m12 15-3 6"/><path d="m12 15 3 6"/>',
  care: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5h6v2"/><path d="M12 11v6"/><path d="M9 14h6"/>',
  crew: '<circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6"/><path d="M15 15c3 0 6 1.8 6 5"/>',
  earth: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.5 2.7 3.5 5.7 3.5 9s-1 6.3-3.5 9c-2.5-2.7-3.5-5.7-3.5-9S9.5 5.7 12 3z"/>',
  office: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9h3M7 13h6M7 17h4"/><circle cx="16.5" cy="9" r="1.5"/>',
  alert: '<path d="M12 3 2 20h20L12 3z"/><path d="M12 10v4"/><path d="M12 17h.01"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  heart: '<path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/>',
  brain: '<path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 3 3h1V4z"/><path d="M15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-3 3h-1V4z"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  lungs: '<path d="M12 4v8"/><path d="M12 10c-2-1-4 0-5 2l-2 6c-.5 2 1 3 3 2l4-2z"/><path d="M12 10c2-1 4 0 5 2l2 6c.5 2-1 3-3 2l-4-2z"/>',
  bone: '<path d="M7 4a2 2 0 0 0-2 3 2 2 0 0 0 0 3l9 9a2 2 0 0 0 3 0 2 2 0 0 0 3-2 2 2 0 0 0-3-3L8 5a2 2 0 0 0-1-1z"/>',
  shield: '<path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3z"/>',
  drop: '<path d="M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z"/>',
  rad: '<circle cx="12" cy="12" r="2"/><path d="M12 10V3a9 9 0 0 1 7.8 4.5L13.7 11"/><path d="M10.3 11 4.2 7.5A9 9 0 0 1 12 3"/><path d="M13 13.7l3.5 6.1a9 9 0 0 1-9 0l3.5-6.1"/>',
  pill: '<rect x="3" y="9" width="18" height="6" rx="3" transform="rotate(-45 12 12)"/><path d="m9 9 6 6"/>',
  camera: '<path d="M3 8h4l2-3h6l2 3h4v11H3z"/><circle cx="12" cy="13" r="3.5"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  send: '<path d="M4 12 20 4l-6 16-3-7z"/>',
  chip: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
  arrow: '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
  back: '<path d="M19 12H5"/><path d="m11 6-6 6 6 6"/>',
  flame: '<path d="M12 21c4 0 7-3 7-7 0-4-4-6-4-10-3 2-5 5-5 8-1-1-2-2-2-4-2 2-3 4-3 6 0 4 3 7 7 7z"/>',
  bt: '<path d="m7 7 10 10-5 5V2l5 5L7 17"/>',
  upload: '<path d="M12 16V4"/><path d="m6 10 6-6 6 6"/><path d="M4 20h16"/>',
  play: '<path d="M7 4v16l13-8z"/>',
  land: '<path d="M12 3a8 8 0 0 0-8 8h16a8 8 0 0 0-8-8z"/><path d="M4 11l6 7M20 11l-6 7M12 11v7"/><rect x="9.5" y="18" width="5" height="3.5" rx="1"/>',
  sat: '<path d="M13 7 9 3 5 7l4 4"/><path d="m17 11 4 4-4 4-4-4"/><path d="m8 12 4 4"/><path d="M16 8l-4 4"/><path d="M3 21c0-3 2-5 5-5"/>',
  star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  food: '<path d="M7 3v8a3 3 0 0 0 3 3v7"/><path d="M10 3v6"/><path d="M4 3v6a3 3 0 0 0 3 3"/><path d="M17 3c-2 0-3 3-3 6s1 4 3 4v8"/>',
};
export function icon(name, color = 'currentColor', size = 24, sw = 1.9) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="flex:none">${P[name] || ''}</svg>`;
}
export function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((el) => { el.outerHTML = icon(el.dataset.icon, el.dataset.color || 'currentColor', +(el.dataset.size || 24)); });
}

export const STATUS_WORD = { green: 'GO', amber: 'WATCH', red: 'NO-GO', none: 'NO DATA', due: 'DUE' };
export const chip = (status, text) => `<span class="chip ${esc(status)}">${esc(text ?? STATUS_WORD[status] ?? status)}</span>`;
export const level = (l) => ({ normal: 'Normal', self_care: 'Self-care', crew_medical_officer: 'Tell the crew medical officer',
  flight_surgeon: 'Flight surgeon', flight_surgeon_private: 'Flight surgeon (private)', emergency: 'Emergency' }[l] || l || '');
export const levelStatus = (l) => ({ normal: 'green', self_care: 'amber', crew_medical_officer: 'amber', flight_surgeon: 'red', flight_surgeon_private: 'amber', emergency: 'red' }[l] || 'none');

export function toast(msg, ms = 4200) {
  const t = document.getElementById('toast');
  const d = document.createElement('div');
  d.innerHTML = msg;
  t.appendChild(d);
  setTimeout(() => d.remove(), ms);
}

// Agent results in plain words: {"urgency":"emergency","route":"cardiac"} -> "urgency: emergency · route: cardiac"
export function plain(r) {
  if (r == null) return '';
  if (Array.isArray(r)) return r.map(plain).join(', ');
  if (typeof r !== 'object') return String(r);
  return Object.entries(r).filter(([, v]) => v !== null && v !== '' && !(Array.isArray(v) && !v.length))
    .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${Array.isArray(v) ? v.join(', ') : typeof v === 'object' ? JSON.stringify(v) : String(v).replace(/_/g, ' ')}`).join(' · ');
}

export function fmtTime(ts) {
  const d = new Date(ts * 1000);
  return d.toTimeString().slice(0, 8);
}

// ---------- body figure ----------
export const PARTS = [
  { id: 'brain', name: 'Brain, sleep & mood', icon: 'brain', x: 150, y: 30 },
  { id: 'eyes', name: 'Eyes', icon: 'eye', x: 150, y: 78 },
  { id: 'rad', name: 'Radiation dose', icon: 'rad', x: 252, y: 92 },
  { id: 'lungs', name: 'Lungs & cabin air', icon: 'lungs', x: 122, y: 170 },
  { id: 'heart', name: 'Heart & blood vessels', icon: 'heart', x: 170, y: 178 },
  { id: 'gut', name: 'Nutrition, water & blood sugar', icon: 'drop', x: 150, y: 262 },
  { id: 'immune', name: 'Immune system & skin', icon: 'shield', x: 56, y: 270 },
  { id: 'bones', name: 'Bones & muscles', icon: 'bone', x: 120, y: 446 },
];

export function figure(bodyMap, selected) {
  const svg = `<svg width="300" height="560" viewBox="0 0 300 560" role="img" aria-label="Body map coloured by health status">
<defs><linearGradient id="scang" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#60A5FA" stop-opacity="0"/><stop offset=".85" stop-color="#60A5FA" stop-opacity=".2"/><stop offset="1" stop-color="#93C5FD" stop-opacity=".85"/></linearGradient></defs>
<g stroke="#2A4682" stroke-width="34" stroke-linecap="round" fill="none"><path d="M92 132 Q66 150 62 212 L56 330"/><path d="M208 132 Q234 150 238 212 L244 330"/><path d="M126 336 L120 450 L116 536"/><path d="M174 336 L180 450 L184 536"/></g>
<g stroke="#0E1F40" stroke-width="30" stroke-linecap="round" fill="none"><path d="M92 132 Q66 150 62 212 L56 330"/><path d="M208 132 Q234 150 238 212 L244 330"/><path d="M126 336 L120 450 L116 536"/><path d="M174 336 L180 450 L184 536"/></g>
<path d="M96 118 Q150 102 204 118 Q224 126 226 160 L218 300 Q214 334 194 344 L106 344 Q86 334 82 300 L74 160 Q76 126 96 118 Z" fill="#0E1F40" stroke="#2A4682" stroke-width="2"/>
<rect x="136" y="88" width="28" height="26" fill="#0E1F40"/><ellipse cx="150" cy="54" rx="34" ry="40" fill="#0E1F40" stroke="#2A4682" stroke-width="2"/>
<g stroke="#24407A" stroke-width="2" fill="none"><path d="M150 140 V300"/><path d="M112 200 Q150 214 188 200"/><path d="M114 226 Q150 240 186 226"/><path d="M120 420 L118 470 M180 420 L182 470"/></g>
<rect class="scanline" x="20" y="0" width="260" height="60" fill="url(#scang)"/></svg>`;
  const hs = PARTS.map((p) => {
    const st = (bodyMap[p.id] || {}).status || 'none';
    const on = p.id === selected;
    return `<button type="button" class="hot ${st} ${on ? 'on' : ''}" style="left:${p.x}px;top:${p.y}px" data-part="${p.id}" aria-pressed="${on}" aria-label="${esc(p.name)}: ${STATUS_WORD[st]}">${icon(p.icon, on ? '#04070E' : `var(--c)`, 21, 2.1)}</button>`;
  }).join('');
  return `<div class="bodywrap">${svg}${hs}</div>`;
}

// ---------- charts ----------
export function lineChart({ points, band = [], limits = [], forecast = [], unit = '', height = 280, label = 'Trend', dia = false }) {
  if (!points.length) return '<div class="empty">No data yet.</div>';
  const W = 760, H = height, L = 52, R = 18, T = 16, B = 34;
  const all = points.flatMap((p) => [p.value, dia && p.dia != null ? p.dia : p.value]).concat(band.flatMap((b) => [b.lo, b.hi]), forecast.map((f) => f.value), limits.map((l) => l.v));
  let lo = Math.min(...all), hi = Math.max(...all);
  const pad = (hi - lo) * 0.12 || 1; lo -= pad; hi += pad;
  const d0 = Math.min(...points.map((p) => p.day)), d1 = Math.max(...points.map((p) => p.day), ...forecast.map((f) => f.day));
  const X = (d) => L + (d - d0) / Math.max(1, d1 - d0) * (W - L - R);
  const Y = (v) => T + (hi - v) / (hi - lo) * (H - T - B);
  const ticks = [lo + pad, (lo + hi) / 2, hi - pad];
  let g = ticks.map((v) => `<line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" stroke="#1F2A40"/><text x="${L - 8}" y="${Y(v) + 4}" text-anchor="end" font-size="12" fill="#7D8BA3" class="mono">${(+v.toFixed(1))}</text>`).join('');
  const xs = [d0, Math.round((d0 + d1) / 2), d1];
  g += xs.map((d, k) => `<text x="${X(d)}" y="${H - 10}" text-anchor="${['start', 'middle', 'end'][k]}" font-size="12" fill="#7D8BA3" class="mono">day ${d}</text>`).join('');
  let bandSvg = '';
  if (band.length > 1) {
    const top = band.map((b) => `${X(b.day)},${Y(b.hi)}`).join(' ');
    const bot = band.slice().reverse().map((b) => `${X(b.day)},${Y(b.lo)}`).join(' ');
    bandSvg = `<polygon points="${top} ${bot}" fill="rgba(45,212,191,.10)" stroke="none"/><polyline points="${band.map((b) => `${X(b.day)},${Y(b.median)}`).join(' ')}" fill="none" stroke="rgba(45,212,191,.45)" stroke-dasharray="3 4"/>`;
  }
  const lim = limits.map((l) => `<line x1="${L}" x2="${W - R}" y1="${Y(l.v)}" y2="${Y(l.v)}" stroke="${l.c}" stroke-dasharray="6 5"/><text x="${W - R}" y="${Y(l.v) - 5}" text-anchor="end" font-size="12" fill="${l.c}">${esc(l.label)}</text>`).join('');
  const line = points.map((p) => `${X(p.day)},${Y(p.value)}`).join(' ');
  const diaLine = dia ? `<polyline class="draw" points="${points.filter((p) => p.dia != null).map((p) => `${X(p.day)},${Y(p.dia)}`).join(' ')}" fill="none" stroke="#93C5FD" stroke-width="2" stroke-opacity=".7"/>` : '';
  const logged = points.filter((p) => p.source !== 'history').map((p) => `<circle cx="${X(p.day)}" cy="${Y(p.value)}" r="5" fill="#FBBF24" stroke="#0A0F1A" stroke-width="2"><title>Logged in TRIX: ${p.value}</title></circle>`).join('');
  const fc = forecast.length ? `<polyline class="fadein" points="${forecast.map((f) => `${X(f.day)},${Y(f.value)}`).join(' ')}" fill="none" stroke="#60A5FA" stroke-width="3" stroke-dasharray="7 6"/>` : '';
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(label)}">${g}${bandSvg}${lim}<polyline class="draw" points="${line}" fill="none" stroke="#60A5FA" stroke-width="2.6" stroke-linejoin="round"/>${diaLine}${fc}${logged}</svg>`;
}

export function ring(pct, color = '#2DD4BF', size = 120, label = '') {
  const r = size / 2 - 10, c = 2 * Math.PI * r, off = c * (1 - Math.max(0, Math.min(1, pct)));
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${esc(label)} ${Math.round(pct * 100)}%"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="#1F2A40" stroke-width="10"/><circle class="ringfill" data-off="${off}" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="10" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c}" transform="rotate(-90 ${size / 2} ${size / 2})"/><text x="50%" y="52%" text-anchor="middle" dominant-baseline="middle" font-size="${size / 5}" font-weight="800" fill="#E6EBF2">${Math.round(pct * 100)}%</text></svg>`;
}
export function animateRings(root = document) {
  requestAnimationFrame(() => setTimeout(() => root.querySelectorAll('.ringfill').forEach((c) => { c.style.strokeDashoffset = c.dataset.off; }), 60));
}

export function speak(text) {
  try {
    if (!('speechSynthesis' in window)) return;
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.95;
    u.lang = getLang() !== 'en' && /[^ -]/.test(text) ? SPEECH[getLang()] : 'en-US';   // untranslated text stays an English voice
    speechSynthesis.speak(u);
  } catch (e) { /* no speech on this device */ }
}

// ---------- hologram body for the mission deck ----------
const HOLO = { brain: [320, 75, 'R', 66, 'BRAIN · SLEEP · MOOD'], eyes: [320, 118, 'L', 112, 'VISION'], rad: [412, 131, 'R', 140, 'RADIATION'],
  lungs: [295, 201, 'L', 196, 'LUNGS · CABIN AIR'], heart: [338, 208, 'R', 214, 'HEART'], gut: [320, 284, 'R', 292, 'FOOD · WATER · SUGAR'],
  immune: [235, 291, 'L', 286, 'IMMUNE · SKIN'], bones: [293, 449, 'L', 444, 'BONES · MUSCLE'] };
const HC = { green: '#2DD4BF', amber: '#FBBF24', red: '#FC3D21', none: '#5B6F96' };
export function hologram(bodyMap, notes = {}, ring = null, outline = null) {
  const limb = '<path d="M92 132 Q66 150 62 212 L56 330"/><path d="M208 132 Q234 150 238 212 L244 330"/><path d="M126 336 L120 450 L116 536"/><path d="M174 336 L180 450 L184 536"/>';
  const calls = Object.entries(HOLO).map(([id, [x, y, side, ly, title]]) => {
    const st = (bodyMap[id] || {}).status || 'none', c = HC[st];
    const line = side === 'R' ? `M${x} ${y} L452 ${ly} L468 ${ly}` : `M${x} ${y} L188 ${ly} L172 ${ly}`;
    const tx = side === 'R' ? 474 : 166, an = side === 'R' ? 'start' : 'end';
    const pulse = st === 'amber' || st === 'red' ? `<circle cx="${x}" cy="${y}" r="9" fill="none" stroke="${c}"><animate attributeName="r" values="9;20" dur="2.2s" repeatCount="indefinite"/><animate attributeName="stroke-opacity" values=".8;0" dur="2.2s" repeatCount="indefinite"/></circle>` : '';
    return `<g class="mk" data-part="${id}" tabindex="0" role="button" aria-label="${esc(title)}: ${STATUS_WORD[st]}"><path d="${line}" fill="none" stroke="${c}" stroke-width="1.2" stroke-opacity=".8"/>
      <circle cx="${x}" cy="${y}" r="14" fill="transparent"/><circle cx="${x}" cy="${y}" r="7" fill="#050B18" stroke="${c}" stroke-width="2.5"/><circle cx="${x}" cy="${y}" r="2.5" fill="${c}"/>${pulse}
      <text x="${tx}" y="${ly - 3}" font-size="12.5" font-weight="700" fill="#CFE0FF" text-anchor="${an}" font-family="'IBM Plex Sans Condensed',sans-serif" letter-spacing=".08em">${esc(title)}</text>
      <text x="${tx}" y="${ly + 14}" font-size="12" fill="${c}" text-anchor="${an}" font-family="'IBM Plex Mono',monospace">${esc((bodyMap[id] || {}).word || STATUS_WORD[st])}${notes[id] ? ' · ' + esc(notes[id]) : ''}</text></g>`;
  }).join('');
  let arc = '';
  if (ring && ring.of) {
    const f = Math.min(0.9999, ring.done / ring.of), a = f * 2 * Math.PI - Math.PI / 2;
    arc = ring.done ? `<path d="M320 14 A286 286 0 ${f > 0.5 ? 1 : 0} 1 ${320 + 286 * Math.cos(a)} ${300 + 286 * Math.sin(a)}" fill="none" stroke="#2DD4BF" stroke-width="5" stroke-linecap="round"><title>Day ring ${ring.done} of ${ring.of}</title></path>` : '';
  }
  return `<svg viewBox="0 0 640 600" role="group" aria-label="Your body status. Day ring ${ring ? ring.done : 0} of ${ring ? ring.of : 6}">
  <defs><linearGradient id="bodyg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1F5BD6" stop-opacity=".55"/><stop offset="1" stop-color="#0B3D91" stop-opacity=".25"/></linearGradient>
  <linearGradient id="hscan" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7FB2FF" stop-opacity="0"/><stop offset="1" stop-color="#CFE0FF" stop-opacity=".75"/></linearGradient>
  <radialGradient id="hbase" cx=".5" cy=".5"><stop offset="0" stop-color="#4C7DD9" stop-opacity=".5"/><stop offset="1" stop-color="#4C7DD9" stop-opacity="0"/></radialGradient><filter id="hblur"><feGaussianBlur stdDeviation="9"/></filter></defs>
  <circle cx="320" cy="300" r="286" fill="none" stroke="#1C3263" stroke-width="5"/>${arc}
  <g class="spin"><circle cx="320" cy="300" r="266" fill="none" stroke="#2A4682" stroke-width="2" stroke-dasharray="2 14"/><path d="M320 34 A266 266 0 0 1 586 300" fill="none" stroke="#4C7DD9" stroke-width="2.5"/></g>
  <g class="spin2"><circle cx="320" cy="300" r="228" fill="none" stroke="#1C3263" stroke-dasharray="40 10"/><circle cx="320" cy="72" r="4" fill="#FC3D21"/></g>
  <ellipse cx="320" cy="552" rx="150" ry="26" fill="url(#hbase)"/><ellipse cx="320" cy="552" rx="120" ry="18" fill="none" stroke="#4C7DD9" stroke-opacity=".7"/><ellipse cx="320" cy="552" rx="80" ry="11" fill="none" stroke="#7FB2FF" stroke-opacity=".6"/>
  ${outline ? `<g class="holofig"><polygon points="${outline.map(([x, y]) => `${(320 + x * 433).toFixed(1)},${(354 + y * 433).toFixed(1)}`).join(' ')}" fill="#4C7DD9" opacity=".3" filter="url(#hblur)"/><polygon points="${outline.map(([x, y]) => `${(320 + x * 433).toFixed(1)},${(354 + y * 433).toFixed(1)}`).join(' ')}" fill="url(#bodyg)" stroke="#7FB2FF" stroke-width="2" stroke-linejoin="round"/>
  <rect x="200" y="60" width="240" height="46" fill="url(#hscan)"><animate attributeName="y" values="40;520;40" dur="7s" repeatCount="indefinite"/></rect></g>` : ''}
  <g transform="translate(185,48) scale(0.9)" class="holofig" ${outline ? 'display="none"' : ''}><g stroke="#4C7DD9" stroke-width="36" stroke-linecap="round" fill="none" opacity=".35" filter="url(#hblur)">${limb}</g>
  <g stroke="#7FB2FF" stroke-width="32" stroke-linecap="round" fill="none">${limb}</g><g stroke="#0B1C3E" stroke-width="28" stroke-linecap="round" fill="none">${limb}</g>
  <path d="M96 118 Q150 102 204 118 Q224 126 226 160 L218 300 Q214 334 194 344 L106 344 Q86 334 82 300 L74 160 Q76 126 96 118 Z" fill="url(#bodyg)" stroke="#7FB2FF" stroke-width="2"/>
  <rect x="136" y="88" width="28" height="26" fill="#0B1C3E"/><ellipse cx="150" cy="54" rx="34" ry="40" fill="url(#bodyg)" stroke="#7FB2FF" stroke-width="2"/>
  <g stroke="#4C7DD9" stroke-width="1.5" fill="none" opacity=".8"><path d="M150 140 V300"/><path d="M112 200 Q150 214 188 200"/><path d="M114 226 Q150 240 186 226"/><path d="M100 170 Q150 150 200 170"/><path d="M108 270 Q150 284 192 270"/></g>
  <rect x="30" y="0" width="240" height="46" fill="url(#hscan)"><animate attributeName="y" values="-40;540;-40" dur="7s" repeatCount="indefinite"/></rect></g>${calls}</svg>`;
}

export function spark(vals, color, w = 70, h = 26) {
  vals = (vals || []).filter((v) => v != null);
  if (vals.length < 2) return `<svg width="${w}" height="${h}" aria-hidden="true"></svg>`;
  const lo = Math.min(...vals), hi = Math.max(...vals), rng = hi - lo || 1;
  const pts = vals.map((v, i) => [i * w / (vals.length - 1), h - 4 - (v - lo) / rng * (h - 8)]);
  const [lx, ly] = pts[pts.length - 1];
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><polyline class="draw" points="${pts.map((p) => p.join(',')).join(' ')}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round"/><circle cx="${lx}" cy="${ly}" r="3" fill="${color}"/></svg>`;
}

// colour bar for a measurement's limits, with the reading marked
export function limitBar(limits, value) {
  const n = (x) => (typeof x === 'number' ? x : (x && typeof x.sys === 'number' ? x.sys : null));
  const L = { rl: n(limits.red_low), al: n(limits.amber_low), ah: n(limits.amber_high), rh: n(limits.red_high) };
  const th = Object.values(L).filter((x) => x != null);
  if (!th.length) return '';
  const v = typeof value === 'number' ? value : null;
  let lo = Math.min(...th, v ?? Infinity), hi = Math.max(...th, v ?? -Infinity);
  const pad = (hi - lo) * 0.35 || Math.abs(hi) * 0.2 || 1; lo -= pad; hi += pad;
  const C = { r: 'var(--alert)', a: 'var(--watch)', g: 'var(--ok)' };
  const cuts = [[L.rl, L.al != null ? 'a' : 'g'], [L.al, 'g'], [L.ah, 'a'], [L.rh, 'r']].filter(([x]) => x != null).sort((p, q) => p[0] - q[0]);
  let cur = L.rl != null ? 'r' : L.al != null ? 'a' : 'g', at = lo;
  const segs = [];
  cuts.forEach(([x, next]) => { segs.push([x - at, cur]); cur = next; at = x; });
  segs.push([hi - at, cur]);
  const labels = cuts.map(([x]) => `<span style="position:absolute;left:${(x - lo) / (hi - lo) * 100}%;transform:translateX(-50%)">${x}</span>`).join('');
  return `<div class="lbarwrap">${v != null ? `<div class="lmark" style="left:${(v - lo) / (hi - lo) * 100}%">${v}<i></i></div>` : ''}<div class="lbar">${segs.map(([w, c]) => `<span style="flex:${Math.max(w, 0.0001)};background:${C[c]}"></span>`).join('')}</div>
    <div class="mono small dim" style="position:relative;height:18px;margin-top:4px">${labels}</div></div>`;
}
