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
  ['today', 'Today', 'today'], ['checkin', 'Check-in', 'checkin'], ['body', 'Body', 'body'], ['care', 'Care', 'care'],
  ['crew', 'Crew', 'crew'], ['earth', 'Earth link', 'earth'], ['office', 'Agent office', 'office'],
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

function renderTop() {
  const m = state.mission;
  if (!m) return;
  const link = m.link;
  const sw = m.space_weather;
  const swc = { green: 'var(--teal)', amber: 'var(--ambt)', red: 'var(--redt)' }[sw.status];
  document.getElementById('topbar').innerHTML = `
    <span style="font-weight:600">Day ${m.day} · ${esc(link.label === 'Mars' ? 'Mars transit' : link.label)}</span>
    <span class="it"><span class="${link.live ? '' : 'pulse-dot'}" style="width:9px;height:9px;border-radius:99px;background:${link.live ? 'var(--teal)' : 'var(--amb)'}"></span>Earth delay <strong class="mono">${esc(link.delay)}</strong></span>
    <span class="it">${icon('clock', 'var(--t2)', 18)}<strong class="mono" id="clock">--:--:--</strong> ship time</span>
    <span class="it">${icon('chip', 'var(--teal)', 18)}Onboard AI · works offline</span>
    <a class="it" href="#/earth" style="text-decoration:none">${icon('rad', swc, 18)}<span style="color:${swc}">${sw.status === 'green' ? 'Space weather calm' : sw.status === 'amber' ? 'Solar flare watch' : 'Solar storm'}</span></a>
    <span class="who"><span class="avatar">${esc(state.who)}</span>
      <label class="sr" for="whosel">I am</label>
      <select id="whosel">${Object.entries(m.crew).map(([k, c]) => `<option value="${k}" ${k === state.who ? 'selected' : ''}>${esc(c.name)} · ${esc(c.role.split(' · ')[0])}</option>`).join('')}</select></span>`;
  document.getElementById('whosel').onchange = (e) => state.setWho(e.target.value);
  clearInterval(clockTimer);
  const tick = () => { const el = document.getElementById('clock'); if (el) el.textContent = new Date().toUTCString().slice(17, 25); };
  tick();
  clockTimer = setInterval(tick, 1000);
}

function renderNav(active) {
  document.getElementById('nav').innerHTML = NAV.map(([k, label, ic]) =>
    `<a class="nav ${k === active ? 'on' : ''}" href="#/${k}" ${k === active ? 'aria-current="page"' : ''}>${icon(ic, 'currentColor', 26)}${label}</a>`).join('');
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

window.addEventListener('hashchange', route);
hydrateIcons(document);
refreshMission().then(route).catch((e) => {
  document.getElementById('view').innerHTML = `<div class="card"><h2>TRIX server not reachable</h2><p class="muted">Start it with <span class="mono">python app.py</span>. ${esc(e.message)}</p></div>`;
});
pollAlerts();
setInterval(pollAlerts, 5000);
