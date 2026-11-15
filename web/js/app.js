// TRIX web app: router, top bar and shared state.
import { api } from './api.js';
import { esc, icon, hydrateIcons, toast } from './ui.js';
import * as today from './views/today.js';
import * as checkin from './views/checkin.js';
import * as body from './views/body.js';
import * as care from './views/care.js';
import * as procedure from './views/procedure.js';
import * as ultrasound from './views/ultrasound.js';
import * as emergency from './views/emergency.js';
import * as crew from './views/crew.js';
import * as earth from './views/earth.js';
import * as office from './views/office.js';
import * as capture from './views/capture.js';
import * as mirror from './views/mirror.js';
import * as sim from './views/sim.js';
import * as replay from './views/replay.js';
import * as ground from './views/ground.js';
import * as sources from './views/sources.js';
import { t, setLang, LANGS, SPEECH } from './i18n.js';
import { speak } from './ui.js';
import { speechAvailable, listenOnce } from './sensors.js';

const NAV = [
  ['today', 'Mission deck', 'today'], ['checkin', 'Check-in', 'checkin'], ['body', 'Trends', 'body'], ['care', 'Procedures', 'care'],
  ['mirror', 'Body mirror', 'body'], ['crew', 'Crew', 'crew'], ['earth', 'Earth link', 'earth'], ['office', 'Agent tree', 'office'], ['sim', 'Simulator', 'play'],
];
const ROUTES = { today, checkin, body, care, procedure, ultrasound, emergency, crew, earth, office, capture, mirror, sim, replay, ground, sources };
const CALM = new Set(['emergency', 'procedure']);

export const state = {
  who: localStorage.getItem('trix-who') || 'C',
  mission: null,
  setWho(w) { this.who = w; localStorage.setItem('trix-who', w); refreshMission().then(route); },
};

let cleanup = null;
let clockTimer = null;

export async function refreshMission() {
  state.mission = await api.get('/api/state');
  state.lang = state.mission.langs[state.who] || 'en';
  setLang(state.lang); window.__trixSpeech = SPEECH[state.lang];
  renderTop();
  const tb = document.getElementById('talkbtn'); if (tb) tb.querySelector('span').textContent = t('Talk to TRIX');
}

function met() {
  // mission elapsed time: mission day + ship clock (UTC)
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const doy = Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(d.getUTCFullYear(), 0, 0)) / 864e5);
  return { met: `${state.mission.day}:${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`, gmt: `${doy}/${p(d.getUTCHours())}:${p(d.getUTCMinutes())}` };
}

function renderTop() {
  const m = state.mission;
  if (!m) return;
  const link = m.link;
  const sw = m.space_weather;
  const swc = { green: 'var(--ok)', amber: 'var(--watch)', red: 'var(--redt)' }[sw.status];
  const roles = { A: 'FE', B: 'CDR', C: 'PLT' };
  document.getElementById('topbar').innerHTML = `
    <span class="brand">TRI<span>X</span></span><span class="sub">${esc(link.label === 'Mars' ? 'Mars transit' : link.label)} · offline</span>
    <span class="tm push"><b>MET</b><span id="met">--</span></span>
    <span class="tm"><b>GMT</b><span id="gmt">--</span></span>
    <span class="tm" ${link.cut ? 'style="color:var(--redt);font-weight:600"' : ''}><span class="${link.live ? '' : 'blink'}" style="width:9px;height:9px;border-radius:99px;background:${link.cut ? 'var(--nred)' : link.live ? 'var(--ok)' : 'var(--watch)'}"></span>${link.cut ? 'NO LINK · no contact with Earth' : `${link.live ? 'AOS' : 'LOS'} · Earth delay ${esc(link.delay)}`}</span>
    <a class="tm" href="#/earth" style="text-decoration:none;color:${swc}">${icon('rad', swc, 16)}${sw.status === 'green' ? 'SWX calm' : sw.status === 'amber' ? 'SWX watch' : 'SWX storm'}</a>
    <span class="who"><label class="sr" for="whosel">I am</label>
      <select id="whosel">${Object.entries(m.crew).map(([k, c]) => `<option value="${k}" ${k === state.who ? 'selected' : ''}>${roles[k] || ''} · Astronaut ${k}</option>`).join('')}</select>
      <label class="sr" for="langsel">Language</label><select id="langsel" title="My language">${Object.entries(LANGS).map(([k, n]) => `<option value="${k}" ${k === state.lang ? 'selected' : ''}>${n}</option>`).join('')}</select></span>`;
  document.getElementById('whosel').onchange = (e) => state.setWho(e.target.value);
  document.getElementById('langsel').onchange = async (e) => { await api.post('/api/lang', { who: state.who, lang: e.target.value }); await refreshMission(); route(); };
  clearInterval(clockTimer);
  const tick = () => { const t = met(); const a = document.getElementById('met'), b = document.getElementById('gmt'); if (a) a.textContent = t.met; if (b) b.textContent = t.gmt; };
  tick();
  clockTimer = setInterval(tick, 1000);
}

function renderNav(active) {
  document.getElementById('nav').innerHTML = NAV.map(([k, label, ic]) =>
    `<a class="${k === active ? 'on' : ''}" href="#/${k}" ${k === active ? 'aria-current="page"' : ''}>${icon(ic, 'currentColor', 18)}${esc(t(label))}</a>`).join('') +
    `<a class="sos" href="#/emergency">${icon('alert', '#fff', 18, 2.2)}${esc(t('Medical emergency'))}</a>`;
}

export function go(hash) { location.hash = hash; }

async function route() {
  const parts = (location.hash.replace(/^#\/?/, '') || 'today').split('/');
  const name = ROUTES[parts[0]] ? parts[0] : 'today';
  renderNav(name === 'procedure' || name === 'ultrasound' ? 'care' : name === 'emergency' ? '' : name === 'capture' ? 'checkin' : name === 'replay' || name === 'ground' ? 'sim' : name === 'sources' ? 'earth' : name);
  document.getElementById('app').classList.toggle('calm', CALM.has(name));
  if (cleanup) { try { cleanup(); } catch (e) { console.warn(e); } cleanup = null; }
  const view = document.getElementById('view');
  view.innerHTML = '<div class="empty"><span class="spinner"></span></div>';
  try {
    cleanup = await ROUTES[name].render(view, { params: parts.slice(1), state, go, refreshMission }) || null;
    hydrateIcons(view);
  } catch (e) {
    console.error(e);
    view.innerHTML = `<div class="card"><h2>Something went wrong</h2><p class="muted">${esc(e.message)}</p><a class="btn ghost" href="#/today">Back to Today</a></div>`;
  }
  document.getElementById('main').scrollTop = 0;
}

// Watch for crew emergencies raised on another tablet, and for messages from Earth.
let seen = new Set(), firstPoll = true;
function alarm() {
  try { const a = new (window.AudioContext || window.webkitAudioContext)(); [0, 0.35, 0.7].forEach((d) => { const o = a.createOscillator(), g = a.createGain(); o.frequency.value = 880; g.gain.value = 0.15; o.connect(g); g.connect(a.destination); o.start(a.currentTime + d); o.stop(a.currentTime + d + 0.2); }); } catch (e) { /* no audio */ }
}
function takeover(c) {
  document.getElementById('takeover')?.remove();
  const d = document.createElement('div');
  d.id = 'takeover'; d.setAttribute('role', 'alertdialog'); d.setAttribute('aria-label', `Astronaut ${c.who} needs help`);
  d.style.cssText = 'position:fixed;inset:0;z-index:80;background:rgba(120,14,0,.94);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;padding:24px;text-align:center';
  d.innerHTML = `${icon('alert', '#fff', 84, 2)}<div class="cond" style="font-size:20px;letter-spacing:.12em;text-transform:uppercase;color:#FFD9D2">Crew alert · you are needed</div>
    <div style="font-size:46px;font-weight:700;line-height:1.1">Astronaut ${esc(c.who)} needs help now</div><div style="font-size:20px;color:#FFD9D2">${esc(c.summary)}</div>
    <div class="row" style="gap:14px;justify-content:center"><a class="btn big" id="tkgo" href="#/emergency/${c.case_id}" style="background:#fff;color:#7A1206">Open the guided response</a><button class="btn big ghost" id="tkno" style="border-color:#fff">Someone else is responding</button></div>`;
  document.body.appendChild(d);
  d.querySelector('#tkgo').onclick = () => d.remove();
  d.querySelector('#tkno').onclick = () => d.remove();
  d.querySelector('#tkgo').focus();
  alarm();
}
async function pollAlerts() {
  try {
    const { cases } = await api.get('/api/office');
    for (const c of cases.slice(0, 10)) {
      const fresh = c.urgency === 'emergency' && !seen.has(c.case_id) && Date.now() / 1000 - c.ts < 90;
      if (fresh && !firstPoll && c.who !== state.who && !location.hash.includes(c.case_id) && !/^#\/(sim|ground|replay)/.test(location.hash)) takeover(c);
      else if (fresh && !firstPoll && c.who === state.who && !location.hash.includes(c.case_id)) toast(`<strong style="color:var(--redt)">Emergency team started for you.</strong> <a href="#/emergency/${c.case_id}">Open</a>`, 9000);
      seen.add(c.case_id);
    }
    firstPoll = false;
    const box = await api.get(`/api/inbox/${state.who}`);
    const got = new Set(JSON.parse(sessionStorage.getItem('trix-inbox') || '[]'));
    box.messages.forEach((m) => { if (!got.has(m.id)) { got.add(m.id); toast(`<strong style="color:#CFE0FF">Message from Earth · flight surgeon</strong><br>${esc(m.text)}`, 15000); } });
    sessionStorage.setItem('trix-inbox', JSON.stringify([...got]));
  } catch (e) { /* server restarting */ }
}

// ---------------- routine prompts: TRIX asks at the right time ----------------
let notified = '';
async function checkReminder() {
  try {
    const t = await api.get(`/api/today/${state.who}`);
    const box = document.getElementById('reminder');
    const p = t.routine.prompt;
    const key = p ? `${state.who}-${t.day}-${p.session}` : '';
    const snoozed = +(sessionStorage.getItem(`trix-snooze-${key}`) || 0) > Date.now();
    const busy = !/^#\/(body|care|crew|earth|office|ultrasound)/.test(location.hash);   // the deck and capture screens show the prompt themselves
    const show = !!p && !snoozed && !busy;
    box.hidden = !show;
    if (p && notified !== key && !snoozed && 'Notification' in window && Notification.permission === 'granted') {
      notified = key;
      new Notification('TRIX · routine prompt', { body: `Astronaut ${state.who}: ${p.title} (${p.minutes} min).` });
    }
    if (!show) return;
    box.innerHTML = `${icon('clock', 'var(--nred)', 22)}<span><strong class="cond" style="letter-spacing:.07em;text-transform:uppercase">${esc(t('Routine prompt'))} · ${esc(t(p.title.split(': ')[0]))}: ${esc(t(p.item.label))}</strong><br><span class="small muted">${esc(p.why)}</span></span>
      <a class="btn sm due" href="${p.item.go}">${esc(t('Start'))}</a><button class="btn sm ghost" id="remsnooze">${esc(t('Snooze 15 min'))}</button>`;
    document.getElementById('remsnooze').onclick = () => { sessionStorage.setItem(`trix-snooze-${key}`, Date.now() + 15 * 60e3); box.hidden = true; };
  } catch (e) { /* server restarting */ }
}
setInterval(checkReminder, 60000);
window.addEventListener('hashchange', () => setTimeout(checkReminder, 300));

// ---------------- talk to TRIX: a voice front door to the agents ----------------
function setupTalk() {
  const btn = document.createElement('button');
  btn.id = 'talkbtn'; btn.className = 'talkbtn'; btn.type = 'button'; btn.setAttribute('aria-expanded', 'false');
  btn.innerHTML = `${icon('mic', '#fff', 20)}<span>Talk to TRIX</span>`;
  const panel = document.createElement('div');
  panel.className = 'talk'; panel.hidden = true; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Talk to TRIX');
  panel.innerHTML = `<div class="row" style="justify-content:space-between;align-items:center"><strong class="cond" style="letter-spacing:.08em;text-transform:uppercase;color:#CFE0FF">Talk to TRIX</strong><button class="btn ghost sm" id="talkclose" aria-label="Close">Close</button></div>
    <div id="talklog" class="col" style="gap:8px"><div class="trix small">Say or type anything: <em>“heart rate 68 and oxygen 98”</em>, <em>“I drank 500 mL of water”</em>, <em>“why is my sleep amber?”</em>, <em>“start my check-in”</em>, or <em>“my chest feels tight”</em>.</div></div>
    <form id="talkform" class="row" style="gap:8px"><label class="sr" for="talkin">Message</label><input class="input" id="talkin" style="flex:1;min-width:0;font-size:16px" placeholder="Type or press the mic" autocomplete="off">
      <button type="button" class="btn ghost" id="talkmic" aria-label="Speak" style="padding:0 14px">${icon('mic')}</button><button class="btn" style="padding:0 16px">Send</button></form>`;
  document.body.append(btn, panel);
  const log = panel.querySelector('#talklog'), input = panel.querySelector('#talkin');
  const open = (o) => { panel.hidden = !o; btn.setAttribute('aria-expanded', o); if (o) input.focus(); };
  btn.onclick = () => open(panel.hidden);
  panel.querySelector('#talkclose').onclick = () => open(false);
  const send = async (text) => {
    if (!text.trim()) return;
    log.insertAdjacentHTML('beforeend', `<div class="me">${esc(text)}</div>`);
    input.value = '';
    try {
      const r = await api.post('/api/assistant', { who: state.who, text });
      log.insertAdjacentHTML('beforeend', `<div class="trix">${r.route ? `<div class="mono small dim" style="margin-bottom:4px">${r.route.filter(Boolean).map(esc).join(' → ')}</div>` : ''}${esc(r.say)}
        ${(r.sources || []).map((s) => `<div class="small"><a href="${esc(s.url)}" target="_blank" rel="noopener">[${s.n}] ${esc(s.title)}</a></div>`).join('')}
        ${r.case_id ? `<div class="small"><a href="#/office/${r.case_id}">See what the agents did</a></div>` : ''}</div>`);
      speak(r.say);
      if (r.go) { if (r.kind === 'emergency' || r.kind === 'navigate') open(false); location.hash = r.go; } else if (r.kind === 'log' && (location.hash === '' || location.hash.startsWith('#/today'))) route();
    } catch (e) { log.insertAdjacentHTML('beforeend', `<div class="trix">Could not reach TRIX: ${esc(e.message)}</div>`); }
    panel.scrollTop = panel.scrollHeight;
  };
  panel.querySelector('#talkform').onsubmit = (e) => { e.preventDefault(); send(input.value); };
  panel.querySelector('#talkmic').onclick = () => {
    if (!speechAvailable()) { input.placeholder = 'Speech needs Chrome or Edge. Type instead.'; return; }
    input.placeholder = 'Listening…';
    listenOnce({ onText: (t, fin) => { input.value = t; if (fin && t) send(t); }, onError: () => { input.placeholder = 'Could not hear you. Type instead.'; } });
  };
}
setupTalk();

window.addEventListener('hashchange', route);
hydrateIcons(document);
refreshMission().then(() => { route(); checkReminder(); }).catch((e) => {
  document.getElementById('view').innerHTML = `<div class="card"><h2>TRIX server not reachable</h2><p class="muted">Start it with <span class="mono">python app.py</span>. ${esc(e.message)}</p></div>`;
});
pollAlerts();
setInterval(pollAlerts, 3000);
