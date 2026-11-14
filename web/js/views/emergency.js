import { api } from '../api.js';
import { esc, icon, chip, level, fmtTime, plain } from '../ui.js';
import { speechAvailable, listenOnce } from '../sensors.js';

const QUICK = [
  ['Not responding', 'unresponsive and not breathing normally', 'alert'],
  ['Chest pain', 'chest pain and pressure', 'heart'],
  ['Heart racing or uneven', 'heart racing, irregular rhythm, dizzy', 'heart'],
  ['Can\'t breathe well', 'short of breath, low oxygen', 'lungs'],
  ['Cut or burn', 'deep cut bleeding', 'shield'],
  ['After a spacewalk', 'after the spacewalk, joint pain and tingling fingers', 'sat'],
  ['Solar storm', 'solar storm alert', 'rad'],
  ['Very low or stressed', 'feeling very low, lonely and stressed', 'brain'],
];
const ACT = { onboard_now: 'Act onboard now', consult_live: 'Call the flight surgeon live', self_care_and_queue: 'Follow the advice · report queued for Earth' };

export async function render(el, { params, state, go }) {
  if (params[0]) return caseView(el, params[0], state, go);
  const m = state.mission;
  el.innerHTML = `
  <div class="banner red">${icon('alert', '#fff', 36)}<div style="flex:1"><div style="font-size:28px;font-weight:800">Emergency</div><div style="font-size:17px;opacity:.9">Tell TRIX who needs help and what is happening. The Emergency team answers in seconds, on board.</div></div></div>
  <div class="row">
    <div class="card grow"><h2>Who needs help?</h2>
      <div class="seg" role="group" aria-label="Patient">${Object.keys(m.crew).map((k) => `<button type="button" data-who="${k}" class="${k === (state.who === 'A' ? 'B' : 'A') ? 'on' : ''}">Astronaut ${k}</button>`).join('')}</div>
      <h2>What is happening?</h2>
      <div class="grid4">${QUICK.map(([t, s, ic]) => `<button class="btn ghost" style="min-height:84px;flex-direction:column;gap:6px" data-s="${esc(s)}">${icon(ic, 'var(--redt)', 26)}${esc(t)}</button>`).join('')}</div>
      <div class="field"><label for="txt">Or say / type it</label><div class="row" style="gap:10px"><input class="input" id="txt" style="flex:1;min-width:220px" placeholder="She feels dizzy and her heart is fluttering"><button class="btn ghost" id="mic">${icon('mic')}Speak</button></div></div>
      <div class="grid4"><div class="field"><label for="hr">Heart rate (if known)</label><input id="hr" inputmode="decimal"></div><div class="field"><label for="spo2">Oxygen %</label><input id="spo2" inputmode="decimal"></div></div>
      <button class="btn red big" id="send">${icon('send', '#fff', 24)}Get help now</button></div>
    <div class="card" style="width:360px;flex:none;max-width:100%"><h3>Earth link</h3><div class="kv"><span class="lbl">Location</span><span>${esc(m.link.label)}</span><span class="lbl">Reply time</span><span class="mono">${esc(m.link.round)}</span></div>
      <p class="muted small" style="margin:0">${m.link.live ? 'A flight surgeon can join live. TRIX guides the crew while they connect.' : 'Earth is too far for emergencies. TRIX and the crew act now; the report goes to Earth in the next link window.'}</p></div>
  </div>`;
  let patient = state.who === 'A' ? 'B' : 'A';
  el.querySelectorAll('[data-who]').forEach((b) => b.onclick = () => { patient = b.dataset.who; el.querySelectorAll('[data-who]').forEach((x) => x.classList.toggle('on', x === b)); });
  const txt = el.querySelector('#txt');
  el.querySelectorAll('[data-s]').forEach((b) => b.onclick = () => { txt.value = b.dataset.s; send(); });
  el.querySelector('#mic').onclick = () => { if (!speechAvailable()) return; listenOnce({ onText: (t) => { txt.value = t; } }); };
  el.querySelector('#send').onclick = send;
  async function send() {
    const btn = el.querySelector('#send');
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Emergency team working…';
    const vitals = {};
    const hr = el.querySelector('#hr').value, sp = el.querySelector('#spo2').value;
    if (hr) vitals.hr = +hr;
    if (sp) vitals.spo2 = +sp;
    const s = txt.value.toLowerCase();
    const flags = /irregular|uneven|flutter/.test(s) ? ['irregular_rhythm'] : /solar/.test(s) ? ['solar_event'] : [];
    const out = await api.post('/api/event', { event: 'alert', who: patient, vitals, flags, symptoms: txt.value, helper: state.who });
    go(`#/emergency/${out.case_id}`);
  }
}

async function caseView(el, cid, state, go) {
  const r = await api.get(`/api/office/${cid}`);
  const c = r.case?.result || {};
  const plan = c.specialist_plan || {};
  const dec = c.decision || {};
  const urgent = c.urgency === 'emergency';
  const team = r.spans.filter((s) => s.team === 'Emergency' && !/orchestrator/.test(s.agent));
  el.innerHTML = `
  <div class="banner ${urgent ? 'red' : 'warn'}">${icon('alert', urgent ? '#fff' : 'var(--ambt)', 36)}<div style="flex:1"><div style="font-size:26px;font-weight:800">Astronaut ${esc(c.who)} ${urgent ? 'needs help now' : 'needs attention'}</div>
    <div style="font-size:16px;opacity:.9">${esc(c.symptoms || (c.findings || []).join(', ') || '')} · case ${esc(cid)} · ${r.case ? fmtTime(r.case.ts) : ''}</div></div>${chip(urgent ? 'red' : 'amber', level(c.urgency))}</div>
  <div class="row">
    <div class="col" style="flex:1.3;min-width:320px">
      <h2>Do this now</h2>
      <div class="card calmstep" style="border:2px solid var(--blue)"><span class="lbl">${esc(ACT[dec.act] || 'Advice')}</span>
        ${c.procedure?.first_step ? `<div class="say">${esc(c.procedure.first_step)}</div><div style="line-height:1.5">${esc((plan.advice || '').replace(/First step \([^)]*\):.*$/, '').trim())}</div>` : `<div class="say" style="font-size:24px">${esc(plan.advice || '')}</div>`}
        <div class="muted small">${esc(dec.why || '')}</div>
        ${(plan.citations || []).length ? `<div class="small dim">${plan.citations.map((x, i) => `[${i + 1}] ${esc(x.title)}`).join(' · ')}</div>` : ''}</div>
      ${plan.protocol_id ? `<button class="btn big" id="startp">${icon('arrow', '#fff', 24)}Start guided procedure · ${esc(plan.protocol_id)}</button>` : ''}
      <a class="btn ghost" href="#/office/${esc(cid)}">${icon('office')}See every agent decision</a>
    </div>
    <div class="col" style="flex:1;min-width:300px">
      ${(c.findings || []).length ? `<div class="card"><h3>Why TRIX is worried</h3>${c.findings.map((f) => `<div class="note" style="color:var(--t1)">${esc(f)}</div>`).join('')}</div>` : ''}
      <div class="card"><div class="head"><h3>Virtual medical team</h3><span class="small dim">Logged for Earth</span></div>
        <div class="list">${team.map((s, i) => `<div class="li rowin" style="animation-delay:${i * 120}ms;align-items:flex-start"><span class="mono dim small" style="width:64px;flex:none">${esc(s.started)}</span><span style="flex:1"><strong>${esc(s.agent)}</strong><br><span class="small muted">${esc(plain(s.result))}</span></span>${chip(s.status === 'ok' ? 'green' : 'red', s.status === 'ok' ? 'Done' : s.status)}</div>`).join('')}</div></div>
    </div>
  </div>`;
  const sp = el.querySelector('#startp');
  if (sp) sp.onclick = async () => {
    const p = await api.post('/api/procedure/start', { protocol_id: plan.protocol_id, who: state.who, patient: c.who, case_id: cid, helper_skill: state.who === 'B' ? 'medical_officer' : 'crew' });
    go(`#/procedure/${p.sid}`);
  };
}
