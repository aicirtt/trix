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

const NAV = [
  ['today', 'Health', 'today'], ['checkin', 'Check-in', 'checkin'], ['body', 'Trends', 'body'], ['care', 'Procedures', 'care'],
  ['crew', 'Crew', 'crew'], ['earth', 'Earth link', 'earth'], ['office', 'Agent log', 'office'],
];
const ROUTES = { today, checkin, body, care, procedure, ultrasound, emergency, crew, earth, office };
const CALM = new Set(['emergency', 'procedure']);

export const state = {
  who: localStorage.getItem('trix-who') || 'C',
  mission: null,
  setWho(w) { this.who = w; localStorage.setItem('trix-who', w); renderTop(); route(); },
};

let cleanup = null;
let clockTimer = null;

export async function refreshMission() {
  state.mission = await api.get('/api/state');
  renderTop();
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
    <span class="brand">TRI<span>X</span></span><span class="sub">Crew health system · ${esc(link.label === 'Mars' ? 'Mars transit' : link.label)} · offline</span>
    <span class="tm push"><b>MET</b><span id="met">--</span></span>
    <span class="tm"><b>GMT</b><span id="gmt">--</span></span>
    <span class="tm"><span class="${link.live ? '' : 'blink'}" style="width:9px;height:9px;border-radius:99px;background:${link.live ? 'var(--ok)' : 'var(--watch)'}"></span>${link.live ? 'AOS' : 'LOS'} · Earth delay ${esc(link.delay)}</span>
    <a class="tm" href="#/earth" style="text-decoration:none;color:${swc}">${icon('rad', swc, 16)}${sw.status === 'green' ? 'SWX calm' : sw.status === 'amber' ? 'SWX watch' : 'SWX storm'}</a>
    <span class="who"><label class="sr" for="whosel">I am</label>
      <select id="whosel">${Object.entries(m.crew).map(([k, c]) => `<option value="${k}" ${k === state.who ? 'selected' : ''}>${roles[k] || ''} · Astronaut ${k}</option>`).join('')}</select></span>`;
  document.getElementById('whosel').onchange = (e) => state.setWho(e.target.value);
  clearInterval(clockTimer);
  const tick = () => { const t = met(); const a = document.getElementById('met'), b = document.getElementById('gmt'); if (a) a.textContent = t.met; if (b) b.textContent = t.gmt; };
  tick();
  clockTimer = setInterval(tick, 1000);
}

function renderNav(active) {
  document.getElementById('nav').innerHTML = NAV.map(([k, label, ic]) =>
    `<a class="${k === active ? 'on' : ''}" href="#/${k}" ${k === active ? 'aria-current="page"' : ''}>${icon(ic, 'currentColor', 18)}${label}</a>`).join('') +
    `<a class="sos" href="#/emergency">${icon('alert', '#fff', 18, 2.2)}Medical emergency</a>`;
}

export function go(hash) { location.hash = hash; }

async function route() {
  const parts = (location.hash.replace(/^#\/?/, '') || 'today').split('/');
  const name = ROUTES[parts[0]] ? parts[0] : 'today';
  renderNav(name === 'procedure' || name === 'ultrasound' ? 'care' : name === 'emergency' ? '' : name);
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

// Watch for crew emergencies raised on another tablet.
let seen = new Set();
async function pollAlerts() {
  try {
    const { cases } = await api.get('/api/office');
    for (const c of cases.slice(0, 10)) {
      if (c.urgency === 'emergency' && !seen.has(c.case_id) && Date.now() / 1000 - c.ts < 120) {
        if (seen.size) toast(`<strong style="color:var(--redt)">Crew alert:</strong> Astronaut ${esc(c.who)} · ${esc(c.summary)} · <a href="#/emergency/${c.case_id}">Open</a>`, 9000);
      }
      seen.add(c.case_id);
    }
  } catch (e) { /* server restarting */ }
}

// ---------------- check-in reminder at the time the Reminder agent learned ----------------
let notified = '';
async function checkReminder() {
  try {
    const t = await api.get(`/api/today/${state.who}`);
    const box = document.getElementById('reminder');
    const [h, m] = t.reminder.slot.split(':').map(Number);
    const now = new Date(), nowMin = now.getUTCHours() * 60 + now.getUTCMinutes();
    const key = `${state.who}-${t.day}`;
    const snoozed = +(sessionStorage.getItem(`trix-snooze-${key}`) || 0) > Date.now();
    const show = !t.checked_in_today && nowMin >= h * 60 + m && !snoozed && !location.hash.startsWith('#/checkin');
    box.hidden = !show;
    if (!show) return;
    box.innerHTML = `${icon('clock', 'var(--nred)', 22)}<span><strong class="cond" style="letter-spacing:.07em;text-transform:uppercase">Check-in due</strong><br><span class="small muted">Reminder ${esc(t.reminder.slot)} · the time you answer most often</span></span>
      <button class="btn sm due" id="remgo">Start check-in</button><button class="btn sm ghost" id="remsnooze">Snooze 15 min</button>`;
    document.getElementById('remgo').onclick = () => { box.hidden = true; go('#/checkin'); };  // the check-in itself teaches the Reminder agent
    document.getElementById('remsnooze').onclick = () => { sessionStorage.setItem(`trix-snooze-${key}`, Date.now() + 15 * 60e3); box.hidden = true; };
    if (notified !== key && 'Notification' in window) {
      notified = key;
      if (Notification.permission === 'default') await Notification.requestPermission();
      if (Notification.permission === 'granted') new Notification('TRIX · check-in due', { body: `Astronaut ${state.who}: your morning check-in is due (${t.reminder.slot}).` });
    }
  } catch (e) { /* server restarting */ }
}
setInterval(checkReminder, 60000);
window.addEventListener('hashchange', () => setTimeout(checkReminder, 300));

window.addEventListener('hashchange', route);
hydrateIcons(document);
refreshMission().then(() => { route(); checkReminder(); }).catch((e) => {
  document.getElementById('view').innerHTML = `<div class="card"><h2>TRIX server not reachable</h2><p class="muted">Start it with <span class="mono">python app.py</span>. ${esc(e.message)}</p></div>`;
});
pollAlerts();
setInterval(pollAlerts, 5000);
