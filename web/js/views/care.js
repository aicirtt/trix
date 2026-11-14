import { api } from '../api.js';
import { esc, icon, chip } from '../ui.js';
import { answerHtml } from './body.js';

const ICON = { cardiac: 'heart', general: 'care', first_aid: 'shield', radiation: 'rad', mental: 'brain' };

export async function render(el, { state, go }) {
  const [pr, ph, land] = await Promise.all([api.get('/api/protocols'), api.get('/api/ops/pharmacy?who=' + state.who), api.get('/api/feeds/landing')]);
  const items = (ph.ops?.pharmacy || []);
  el.innerHTML = `
  <div class="head"><div><h1>Care</h1><div class="sub">Step-by-step procedures, practice, medicines and landing readiness</div></div>
    <a class="btn ghost" href="#/ultrasound">${icon('heart')}Ultrasound check</a></div>
  <div class="row">
    <div class="col grow">
      <div class="card"><h2>Procedures</h2><p class="muted small" style="margin:0">Steps come only from approved protocols. TRIX checks each step (camera or device) before moving on. Use Practice to train with a score.</p>
        <div class="list">${pr.protocols.map((p, i) => `<div class="li rise" style="animation-delay:${i * 60}ms">
          <span style="width:44px;height:44px;border-radius:12px;background:var(--p2);display:flex;align-items:center;justify-content:center">${icon(ICON[p.specialist] || 'care', 'var(--bluet)', 22)}</span>
          <span style="flex:1;min-width:0"><span style="display:block;font-weight:700">${esc(p.title)}</span><span class="small muted">${p.steps} steps · ${esc(p.equipment.join(', '))}</span></span>
          <button class="btn ghost sm" data-practice="${p.id}">Practice</button><button class="btn sm" data-start="${p.id}">Start</button></div>`).join('')}</div></div>
      <div class="card"><h2>${icon('chip', 'var(--bluet)', 22)} Ask TRIX</h2><p class="small muted" style="margin:0">Answers come only from NASA and onboard sources, with citations. No doses, no diagnoses.</p>
        <form id="ask" class="row" style="gap:10px"><label class="sr" for="q">Question</label><input class="input" id="q" style="flex:1;min-width:220px" placeholder="How much water should I drink per day?"><button class="btn">Ask</button></form>
        <div class="row" style="gap:8px">${['What should I check after a spacewalk?', 'Why do I keep getting headaches on the station?', 'How do I do CPR in weightlessness?', 'What medicines are onboard?'].map((q) => `<button class="btn ghost sm" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>
        <div id="ans" class="col"></div></div>
    </div>
    <div class="col" style="width:420px;flex:none;max-width:100%">
      <div class="card"><div class="head"><h2>Landing readiness</h2><span class="small dim">${esc(land.source)}</span></div>
        <div class="small muted">${esc(land.site)} · Meteomatics forecast</div>
        <div class="row" style="gap:6px">${land.windows.map((w) => `<div title="${esc(w.why.join(', ') || 'within limits')}" style="flex:1;min-width:0;text-align:center;padding:8px 0;border-radius:10px;background:${w.go ? 'rgba(45,212,191,.12)' : 'rgba(239,68,68,.14)'};border:1px solid ${w.go ? 'rgba(45,212,191,.4)' : 'rgba(239,68,68,.5)'}"><div class="mono small">${esc(w.time.slice(11, 13))}h</div><div style="font-weight:800;color:${w.go ? 'var(--teal)' : 'var(--redt)'}">${w.go ? 'GO' : 'NO'}</div><div class="dim" style="font-size:11px">${Math.round(w.wind_ms)} m/s</div></div>`).join('')}</div>
        <p style="margin:0">${esc(land.message)}</p><button class="btn ghost sm" data-start="LAND-01">Start landing-day stand test</button></div>
      <div class="card"><div class="head"><h2>Medicines</h2>${chip(ph.ops?.messages?.length ? 'amber' : 'green', `${ph.ops?.messages?.length || 0} to check`)}</div>
        <div class="list">${items.map((m) => `<div class="li"><span style="flex:1"><strong>${esc(m.name)}</strong><br><span class="small muted">${m.flags.length ? esc(m.flags.join(' · ')) : 'OK to end of mission'}</span></span><span class="mono small">${m.stock}</span></div>`).join('')}</div>
        <div class="small dim">Simulated stock. Doses only from the crew medical officer.</div></div>
    </div>
  </div>`;
  const start = async (pid, practice) => {
    const r = await api.post('/api/procedure/start', { protocol_id: pid, who: state.who, practice });
    go(`#/procedure/${r.sid}`);
  };
  el.querySelectorAll('[data-start]').forEach((b) => b.onclick = () => start(b.dataset.start, false));
  el.querySelectorAll('[data-practice]').forEach((b) => b.onclick = () => start(b.dataset.practice, true));
  const ask = async (q) => { const out = el.querySelector('#ans'); out.innerHTML = '<span class="spinner"></span>'; out.innerHTML = answerHtml(await api.post('/api/ask', { question: q })); };
  el.querySelector('#ask').onsubmit = (e) => { e.preventDefault(); const q = el.querySelector('#q').value.trim(); if (q) ask(q); };
  el.querySelectorAll('[data-q]').forEach((b) => b.onclick = () => { el.querySelector('#q').value = b.dataset.q; ask(b.dataset.q); });
}
