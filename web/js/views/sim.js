// What-if simulator: inject a scenario and watch the agents react. Also: cut the link, reset the demo.
import { api } from '../api.js';
import { esc, icon, chip, level, levelStatus, toast } from '../ui.js';

const ICON = { irregular: 'heart', unresponsive: 'alert', low_oxygen: 'lungs', fever: 'shield', bad_sleep: 'brain', co2: 'lungs', solar_storm: 'rad' };
const ACT = { onboard_now: 'Act on board now', consult_live: 'Call the flight surgeon live', self_care_and_queue: 'Follow advice · report queued' };

export async function render(el, { state, refreshMission }) {
  const s = await api.get('/api/sim');
  let patient = state.who === 'A' ? 'B' : 'A';
  const m = state.mission;
  el.innerHTML = `
  <div class="head"><div><div class="kicker">Demo tools · everything here uses simulated events</div><h1>What if…?</h1></div>
    <div class="row" style="gap:10px"><a class="btn ghost" href="#/replay">${icon('play')}Mission replay</a><a class="btn ghost" href="#/ground" target="_blank" rel="noopener">${icon('earth')}Flight surgeon view</a></div></div>
  <div class="row">
    <div class="card grow"><h2>1 · Who does it happen to?</h2>
      <div class="seg" role="group" aria-label="Astronaut">${Object.keys(m.crew).map((k) => `<button type="button" data-who="${k}" class="${k === patient ? 'on' : ''}">Astronaut ${k}</button>`).join('')}</div>
      <h2>2 · Pick a scenario</h2>
      <div class="grid4">${s.scenarios.map((x) => `<button class="btn ghost" data-sc="${x.id}" style="min-height:92px;flex-direction:column;gap:6px;text-transform:none;letter-spacing:0;font-size:15px">${icon(ICON[x.id] || 'alert', 'var(--redt)', 26)}${esc(x.name)}<span class="small dim">${x.scope === 'all' ? 'whole crew' : 'one astronaut'}</span></button>`).join('')}</div>
      <div id="out" class="col"><p class="muted" style="margin:0">Pick a scenario. TRIX treats it exactly like a real reading: the same agents, the same safety checks, the same reports.</p></div></div>
    <div class="col" style="width:380px;flex:none;max-width:100%">
      <div class="card" style="border-color:${m.link_cut ? 'var(--nred)' : 'var(--bd)'}"><div class="head"><h2>Earth link</h2>${chip(m.link_cut ? 'red' : 'green', m.link_cut ? 'NO CONTACT' : 'CONNECTED')}</div>
        <p class="muted" style="margin:0;line-height:1.5">Cut the link, then run an emergency: TRIX and the crew handle it alone and the report waits on board.</p>
        <button class="btn ${m.link_cut ? '' : 'red'} big" id="cut">${m.link_cut ? 'Restore the link' : 'Cut the link to Earth'}</button></div>
      <div class="card"><h2>Start the demo again</h2><p class="muted small" style="margin:0">Clears everything logged in the app. The simulated 240-day mission history stays.</p><button class="btn ghost" id="reset">Reset demo data</button></div>
    </div>
  </div>`;
  el.querySelectorAll('[data-who]').forEach((b) => b.onclick = () => { patient = b.dataset.who; el.querySelectorAll('[data-who]').forEach((x) => x.classList.toggle('on', x === b)); });
  el.querySelectorAll('[data-sc]').forEach((b) => b.onclick = async () => {
    const out = el.querySelector('#out');
    out.innerHTML = '<span class="spinner"></span>';
    const r = await api.post('/api/sim', { scenario: b.dataset.sc, who: patient });
    out.innerHTML = `<h2>3 · What TRIX did · ${esc(r.scenario)}</h2>` + r.results.map((x, i) => `<div class="card tight rise" style="animation-delay:${i * 120}ms;border-color:${x.urgency === 'emergency' ? 'var(--nred)' : 'var(--bd)'}">
      <div class="head"><strong>Astronaut ${esc(x.who)}</strong><span class="row" style="gap:8px">${x.urgency ? chip(levelStatus(x.urgency), level(x.urgency).toUpperCase()) : chip('amber', `WATCH · ${esc(x.flagged.join(', '))}`)}${x.handoff ? chip('red', 'HAND-OFF TO EMERGENCY') : ''}</span></div>
      ${x.decision ? `<div class="small" style="color:var(--watch)">${esc(ACT[x.decision] || x.decision)} · ${esc(x.why || '')}</div>` : ''}<div style="line-height:1.45">${esc(x.advice || '')}</div>
      <div class="row" style="gap:10px">${x.urgency ? `<a class="btn sm due" href="#/emergency/${x.case_id}">Open the response</a>` : ''}<a class="btn sm ghost" href="#/office/${x.case_id}">Agent tree</a></div></div>`).join('');
  });
  el.querySelector('#cut').onclick = async () => { await api.post('/api/mission', { link_cut: !m.link_cut }); await refreshMission(); render(el, { state, refreshMission }); };
  el.querySelector('#reset').onclick = async () => { await api.post('/api/sim/reset'); await refreshMission(); toast('Demo data cleared.'); render(el, { state, refreshMission }); };
}
