// Coming home: landing-day readiness, risk areas on the body, stand test and recovery plan.
import { api } from '../api.js';
import { t } from '../i18n.js';
import { esc, icon, chip, ring, animateRings, hologram, toast } from '../ui.js';

const COL = { green: 'var(--ok)', amber: 'var(--watch)', red: 'var(--redt)', due: 'var(--bluet)' };
const ICON = { standing: 'heart', bones: 'bone', muscle: 'flame', balance: 'brain', eyes: 'eye', radiation: 'rad', spine: 'bone', sleep: 'brain' };
const RING = { green: '#2DD4BF', amber: '#FBBF24', red: '#FC3D21' };

export async function render(el, { state }) {
  const who = state.who;
  const draw = (r) => {
    const notes = {};
    for (const [part, p] of Object.entries(r.body_map)) notes[part] = p.areas.length > 1 ? `${p.areas.length} areas` : '';
    const counts = ['red', 'amber', 'due', 'green'].map((s) => [s, r.areas.filter((a) => a.status === s).length]).filter(([, n]) => n);
    el.innerHTML = `
    <div class="head"><div><div class="kicker">${esc(t('Coming home'))} · ${r.days_to_landing > 0 ? `landing in ${r.days_to_landing} days` : r.days_to_landing === 0 ? 'landing today' : 'landed'} · to ${esc(r.destination)}</div>
      <h1>Landing-day readiness</h1></div>
      <form id="land" class="row" style="gap:8px;align-items:center"><label class="small muted" for="indays">Days to landing</label>
        <input class="input" id="indays" type="number" min="0" max="400" value="${Math.max(0, r.days_to_landing)}" style="width:90px"><button class="btn ghost sm">Set</button></form></div>
    <div class="row" style="align-items:stretch">
      <div class="card" style="flex:1 1 420px;max-width:560px;align-items:center;position:relative">
        <div class="col" style="align-items:center;gap:6px;margin-bottom:-12px">
          ${ring(r.score / 100, RING[r.level], 140, 'Landing readiness')}
          <div class="cond" style="font-size:20px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${COL[r.level]}">${esc(r.verdict)}</div>
          <div class="small muted" style="text-align:center;max-width:420px">Your body adapted to ${esc(r.after)}. Landing day is when it shows. ${counts.map(([s, n]) => `${n} ${s === 'due' ? 'to measure' : s === 'green' ? 'GO' : s === 'amber' ? 'to watch' : 'NO-GO'}`).join(' · ')}.</div>
        </div>
        <div id="holo" style="width:100%;max-width:520px">${hologram(Object.fromEntries(['brain', 'eyes', 'rad', 'lungs', 'heart', 'gut', 'immune', 'bones'].map((k) => { const v = r.body_map[k]; return [k, !v ? { status: 'none', word: 'not a landing risk' } : v.status === 'none' ? { status: 'none', word: 'DUE' } : { status: v.status }]; })), notes, null)}</div>
      </div>
      <div class="col" style="flex:1 1 520px;gap:10px">
        ${r.areas.map((a, i) => `<details class="card rise landarea" style="animation-delay:${i * 50}ms;border-left:3px solid ${COL[a.status]};border-radius:0" ${a.status === 'red' || a.status === 'amber' ? 'open' : ''}>
          <summary style="display:flex;align-items:center;gap:12px;cursor:pointer;list-style:none">${icon(ICON[a.id] || 'heart', COL[a.status], 22)}
            <span style="flex:1"><strong>${esc(a.name)}</strong><br><span class="small mono muted">${esc(a.value)}</span></span>${chip(a.status === 'due' ? 'blue' : a.status, a.word)}</summary>
          <div style="line-height:1.55;margin-top:8px">${esc(a.why)}</div>
          <div style="line-height:1.55"><strong>Do now:</strong> ${esc(a.todo)}</div>
          <div class="row small" style="gap:14px">${a.procedure ? `<a href="#/procedure/${esc(a.procedure)}">Open the stand test procedure</a>` : ''}${a.source ? `<a href="${esc(a.source.url || '#')}" target="_blank" rel="noopener">${esc(a.source.title)}</a>` : ''}</div>
        </details>`).join('')}
      </div>
    </div>
    <div class="row" style="align-items:stretch">
      <div class="card" style="flex:1 1 360px;max-width:460px"><h2>Stand test rehearsal</h2>
        <div class="small muted" style="line-height:1.5">Lie still for 2 minutes and measure. Then stand (or pull upright in the foot loops) for 3 minutes and measure again. TRIX compares the two.</div>
        <form id="stand" class="grid2" style="gap:10px">
          <label class="small">Lying heart rate (bpm)<input class="input" name="lying_hr" type="number" inputmode="numeric"></label>
          <label class="small">Standing heart rate (bpm)<input class="input" name="standing_hr" type="number" inputmode="numeric"></label>
          <label class="small">Lying top pressure (mmHg)<input class="input" name="lying_sys" type="number" inputmode="numeric"></label>
          <label class="small">Standing top pressure (mmHg)<input class="input" name="standing_sys" type="number" inputmode="numeric"></label>
          <div class="row" style="gap:8px;grid-column:1/-1"><button class="btn">Save stand test</button><button type="button" class="btn ghost" id="demo">Fill a demo result</button></div>
          <div id="serr" class="small" style="color:var(--redt);grid-column:1/-1"></div>
        </form></div>
      <div class="card grow"><h2>Recovery plan</h2>
        <div class="plan">${r.plan.map((p, i) => `<div class="phase rise" style="animation-delay:${i * 80}ms"><div class="kicker">${esc(p.when)}</div><h3>${esc(p.phase)}</h3>
          <ul>${p.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ul></div>`).join('')}</div>
        <div class="small dim">${esc(r.note)}</div></div>
    </div>`;

    animateRings(el);
    el.querySelector('#land').onsubmit = async (e) => {
      e.preventDefault();
      try { await api.post('/api/homecoming/landing', { in_days: el.querySelector('#indays').value }); draw(await api.get(`/api/homecoming/${who}`)); }
      catch (err) { toast(esc(err.message)); }
    };
    const f = el.querySelector('#stand');
    el.querySelector('#demo').onclick = () => { f.lying_hr.value = 62; f.standing_hr.value = 96; f.lying_sys.value = 118; f.standing_sys.value = 104; };
    f.oninput = () => { el.querySelector('#serr').textContent = ''; };
    f.onsubmit = async (e) => {
      e.preventDefault();
      const body = Object.fromEntries(['lying_hr', 'standing_hr', 'lying_sys', 'standing_sys'].map((k) => [k, f[k].value]));
      if (Object.values(body).some((v) => v === '')) { el.querySelector('#serr').textContent = 'Enter all four numbers first.'; return; }
      try {
        const r2 = await api.post(`/api/homecoming/${who}/stand-test`, body);
        draw(r2);
        toast(`Stand test saved: heart rate +${r2.saved.hr_rise} bpm, top pressure -${r2.saved.sys_drop} mmHg`);
      } catch (err) { el.querySelector('#serr').textContent = err.message; }
    };
  };
  draw(await api.get(`/api/homecoming/${who}`));
}
