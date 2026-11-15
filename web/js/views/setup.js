// First-run setup: everything an astronaut sets once, in one guided flow, before the mission routine starts.
import { api } from '../api.js';
import { esc, icon, toast } from '../ui.js';
import { LANGS } from '../i18n.js';
import * as homemsg from '../homemsg.js';

const PRIV = [
  ['vitals_summary', 'Share my daily vitals summary with Earth', 'Heart rate, blood pressure, sleep totals'],
  ['mood_details', 'Share mood details', 'Off: Earth gets a weekly score only'],
  ['crew_can_see_status', 'Crew can see my status colours', 'Used for buddy checks'],
  ['scan_photos', 'Keep my body-scan photos', 'On board only, never sent to Earth. Off: outline only'],
];
const STEPS = ['Who you are', 'Language', 'Mission', 'Routine', 'Body scan', 'Messages from home', 'Privacy', 'Ready'];

export async function render(el, { params, state, go, refreshMission }) {
  let step = Math.max(0, Math.min(STEPS.length - 1, +(params[0] || sessionStorage.getItem('trix-setup-step') || 0)));
  let s = await api.get(`/api/setup/${state.who}`);
  const save = async (body) => { s = await api.post(`/api/setup/${state.who}`, body); return s; };
  const lang = () => { try { return localStorage.getItem(`trix-lang-${state.who}`) || 'en'; } catch (e) { return 'en'; } };

  function body() {
    const who = state.who;
    switch (step) {
      case 0: return `<h2>Welcome to TRIX</h2>
        <p class="lead">TRIX helps you check your own health in space: a few minutes a day, clear colours, and help when something is wrong. Setup takes about 3 minutes and you can change everything later.</p>
        <div class="field"><span class="lbl">This tablet is for</span><div class="seg" role="group" aria-label="Astronaut">${['A', 'B', 'C'].map((k) => `<button type="button" data-who="${k}" class="${k === who ? 'on' : ''}">Astronaut ${k}</button>`).join('')}</div>
          <span class="small muted">${esc(s.crew.role)}</span></div>
        <div class="field"><label for="nm">What should TRIX call you?</label><input class="input" id="nm" maxlength="30" placeholder="Sam" value="${esc(s.name)}" style="max-width:320px"></div>`;
      case 1: return `<h2>Your language</h2><p class="lead">Screens, steps and the voice of TRIX follow your language. Each astronaut can choose their own.</p>
        <div class="setgrid">${Object.entries(LANGS).map(([k, n]) => `<button type="button" class="setpick ${k === lang() ? 'on' : ''}" data-lang="${k}">${esc(n)}</button>`).join('')}</div>`;
      case 2: return `<h2>Your mission</h2><p class="lead">Where you are changes how you measure (no normal scale when weightless), what to watch, and who can help.</p>
        <div class="setgrid wide">${Object.entries(s.locations).map(([k, l]) => `<button type="button" class="setpick ${k === s.location ? 'on' : ''}" data-loc="${k}"><strong>${esc(l.label)}</strong><span class="small muted">${esc(l.place)} · ${esc(l.gravity)}</span></button>`).join('')}</div>
        <div class="field"><label for="days">Days until landing</label><input class="input" id="days" type="number" min="0" max="400" value="${Math.max(0, s.days_to_landing)}" style="max-width:160px">
          <span class="small muted">TRIX starts your landing-day preparation in the last two weeks.</span></div>`;
      case 3: return `<h2>Your routine</h2><p class="lead">TRIX reminds you at the right moments, and learns when you actually respond.</p>
        <div class="rtline"><div><span class="kicker">Every morning</span><strong>Morning check · about 5 min</strong><span class="small muted">Sleep, heart rate, blood pressure, temperature, blood sugar, oxygen, face and voice check, reaction test</span>
          <div class="seg" role="group" aria-label="Morning check time" style="margin-top:8px">${s.slots.map((t) => `<button type="button" data-slot="${t}" class="${t === s.morning ? 'on' : ''}">${t}</button>`).join('')}</div></div>
          <div><span class="kicker">Every evening · ${esc(s.evening)}</span><strong>Evening check · about 2 min</strong><span class="small muted">Mood, exercise, food and water, a buddy check on a crewmate</span></div>
          <div><span class="kicker">Every week</span><strong>Weekly checks</strong><span class="small muted">Vision grid, body mass, back pain and a body scan</span></div>
          <div><span class="kicker">Last two weeks</span><strong>Coming home</strong><span class="small muted">Landing-day readiness, stand test rehearsal and a recovery plan</span></div></div>
        <p class="small muted">Streaks, badges and a crew goal reward doing the checks, never good numbers. For the first two weeks TRIX learns your personal normal.</p>`;
      case 4: return `<h2>Day-1 body scan</h2><p class="lead">Stand in front of the tablet once now. Your outline becomes the body on your Mission deck, and each weekly scan is compared with today ("puffy face, bird legs").</p>
        <div class="setstatus ${s.scans ? 'ok' : ''}">${s.scans ? `${icon('check', 'var(--ok)', 22)} Scan saved (${s.scans})` : `${icon('body', 'var(--t2)', 22)} No scan yet`}</div>
        <div class="row" style="gap:10px"><a class="btn" href="#/mirror" id="toscan">${icon('camera', '#fff', 18)}${s.scans ? 'Scan again' : 'Scan me now'}</a></div>
        <p class="small muted">The photo stays on the onboard computer and is never sent to Earth. You can skip this and do it later on Body mirror.</p>`;
      case 5: return `<h2>Messages from home</h2><p class="lead">Before launch, family and friends record short messages. TRIX unlocks them as you keep up your checks, and straight away on a hard day.</p><div id="hm"></div>`;
      case 6: return `<h2>Your privacy</h2><p class="lead">You decide what leaves the spacecraft. Emergencies are always shared with the crew medical officer and the flight surgeon.</p>
        ${PRIV.map(([k, t, d]) => `<div class="toggle"><span><strong>${t}</strong><br><span class="small muted">${d}</span></span><span class="switch"><input type="checkbox" data-p="${k}" ${s.privacy[k] ? 'checked' : ''} aria-label="${esc(t)}"><span></span></span></div>`).join('')}`;
      default: return `<h2>You're ready${s.name ? `, ${esc(s.name)}` : ''}</h2><p class="lead">Here's what you set:</p>
        <div class="kv" style="grid-template-columns:180px 1fr"><span class="lbl">Astronaut</span><span>${esc(s.crew.name)} · ${esc(s.crew.role)}</span>
          <span class="lbl">Language</span><span>${esc(LANGS[lang()] || 'English')}</span>
          <span class="lbl">Mission</span><span>${esc(s.locations[s.location].label)} · landing in ${Math.max(0, s.days_to_landing)} days</span>
          <span class="lbl">Morning check</span><span class="mono">${esc(s.morning)}</span><span class="lbl">Evening check</span><span class="mono">${esc(s.evening)}</span>
          <span class="lbl">Body scan</span><span>${s.scans ? 'Saved' : 'Later, on Body mirror'}</span><span class="lbl">Messages from home</span><span>${s.messages || 'None yet'}</span></div>
        <div class="row" style="gap:10px;margin-top:6px"><button class="btn big" id="first">${icon('check', '#fff', 22)}Start my first check</button><button class="btn ghost big" id="deck">Go to my Mission deck</button></div>`;
    }
  }

  function draw() {
    sessionStorage.setItem('trix-setup-step', step);
    el.innerHTML = `<div class="head"><div><div class="kicker">Setup · step ${step + 1} of ${STEPS.length} · ${esc(STEPS[step])}</div><h1>Set up TRIX</h1></div>
      <a class="btn ghost sm" href="#/today" id="later">Finish later</a></div>
      <div class="setdots" role="list">${STEPS.map((n, i) => `<button type="button" role="listitem" data-step="${i}" class="${i < step ? 'done' : i === step ? 'now' : ''}" aria-label="Step ${i + 1}: ${esc(n)}" title="${esc(n)}"><span>${i + 1}</span>${esc(n)}</button>`).join('')}</div>
      <div class="card setcard">${body()}
        ${step < STEPS.length - 1 ? `<div class="row" style="justify-content:space-between;margin-top:8px"><button class="btn ghost" id="back" ${step === 0 ? 'disabled' : ''}>Back</button>
          <span class="row" style="gap:8px">${[4, 5].includes(step) ? '<button class="btn ghost" id="skip">Skip for now</button>' : ''}<button class="btn" id="next">Next</button></span></div>` : ''}
        <div id="serr" class="small" style="color:var(--redt)"></div></div>`;
    const err = (m) => { el.querySelector('#serr').textContent = m; };
    el.querySelector('#later').onclick = () => sessionStorage.setItem('trix-setup-later', '1');
    el.querySelectorAll('[data-step]').forEach((b) => b.onclick = () => { step = +b.dataset.step; draw(); });
    el.querySelectorAll('[data-who]').forEach((b) => b.onclick = async () => { state.setWho(b.dataset.who); });
    el.querySelectorAll('[data-lang]').forEach((b) => b.onclick = () => { state.setLang(b.dataset.lang); });
    el.querySelectorAll('[data-loc]').forEach((b) => b.onclick = () => { s.location = b.dataset.loc; el.querySelectorAll('[data-loc]').forEach((x) => x.classList.toggle('on', x === b)); });
    el.querySelectorAll('[data-slot]').forEach((b) => b.onclick = () => { s.morning = b.dataset.slot; el.querySelectorAll('[data-slot]').forEach((x) => x.classList.toggle('on', x === b)); });
    el.querySelectorAll('[data-p]').forEach((i) => i.onchange = async () => { await api.post(`/api/privacy/${state.who}`, { [i.dataset.p]: i.checked }); s.privacy[i.dataset.p] = i.checked; });
    el.querySelector('#toscan')?.addEventListener('click', () => sessionStorage.setItem('trix-setup-return', step));
    if (step === 5) homemsg.mount(el.querySelector('#hm'), state.who, { manage: true }).then(() => api.get(`/api/setup/${state.who}`).then((x) => { s = x; }));
    el.querySelector('#back')?.addEventListener('click', () => { step -= 1; draw(); });
    el.querySelector('#skip')?.addEventListener('click', () => { step += 1; draw(); });
    el.querySelector('#next')?.addEventListener('click', async () => {
      try {
        if (step === 0) await save({ name: el.querySelector('#nm').value });
        if (step === 2) {
          const d = el.querySelector('#days').value;
          if (d === '' || +d < 0 || +d > 400) { err('Enter the days until landing (0 to 400).'); return; }
          await save({ location: s.location, in_days: +d });
          await refreshMission?.();
        }
        if (step === 3) await save({ morning: s.morning });
        if (step === 5) s = await api.get(`/api/setup/${state.who}`);
        step += 1; draw();
      } catch (e) { err(e.message); }
    });
    const finish = async (to) => { await save({ done: true }); sessionStorage.removeItem('trix-setup-step'); sessionStorage.removeItem('trix-setup-return'); toast('Setup saved. You can change it any time from the Crew screen.'); go(to); };
    el.querySelector('#first')?.addEventListener('click', () => finish('#/capture/sleep'));
    el.querySelector('#deck')?.addEventListener('click', () => finish('#/today'));
  }
  draw();
}
