// Sources and data: everything TRIX relies on, and what is simulated.
import { api } from '../api.js';
import { esc, icon } from '../ui.js';

export async function render(el, { params } = {}) {
  const s = await api.get('/api/sources');
  const row = (x) => `<div class="li" style="align-items:flex-start"><span style="flex:1">${x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.title)}</a>` : `<strong>${esc(x.title)}</strong>`}${x.used_by?.length ? `<br><span class="small muted">Used by: ${esc(x.used_by.join(', '))}</span>` : ''}</span></div>`;
  el.innerHTML = `
  <div class="head"><div><div class="kicker">For judges and the project page</div><h1>Sources and data</h1></div><a class="btn ghost sm" href="#/earth">${icon('back')}Earth link</a></div>
  <div class="card" id="sci"><div class="head"><div><h2>Real spaceflight biology data · NASA Open Science Data Repository</h2><div class="small muted">${esc(s.open_science.about)}</div></div>
      <a class="btn ghost sm" href="${esc(s.open_science.home)}" target="_blank" rel="noopener">Open the repository</a></div>
    <form id="sf" class="row" style="gap:8px;align-items:center"><label class="sr" for="sq">Search NASA studies</label><input class="input" id="sq" placeholder="Search NASA studies: bone loss, radiation, immune…" style="flex:1;min-width:220px"><button class="btn sm">Search</button><span id="ssrc" class="small dim mono"></span></form>
    <div class="list" id="sres"></div>
    <div class="small"><a href="${esc(s.open_science.paper.url)}" target="_blank" rel="noopener">${esc(s.open_science.paper.title)}</a></div></div>
  <div class="row">
    <div class="card grow"><h2>NASA and research references (${s.references.length})</h2><div class="list">${s.references.map(row).join('')}</div></div>
    <div class="col grow"><div class="card"><h2>Live data</h2><div class="list">${s.live_data.map(row).join('')}</div></div>
      <div class="card"><h2>Onboard knowledge notes (${s.knowledge_notes.length})</h2><div class="list">${s.knowledge_notes.map(row).join('')}</div><div class="small dim">Short notes written by the team from the linked NASA pages; answers cite them.</div></div>
      <div class="card"><h2>Models and tools</h2><div class="list">${s.models_and_tools.map(row).join('')}</div></div>
      <div class="card" style="border-color:var(--watch)"><h2>What is simulated</h2><ul style="margin:0;padding-left:20px;line-height:1.7">${s.simulated.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div></div>
  </div>`;
  const study = (x) => `<div class="li" style="align-items:flex-start"><span class="mono" style="min-width:74px"><a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.id)}</a></span><span style="flex:1"><strong>${esc(x.title)}</strong>${x.organism ? ` <span class="small dim">${esc(x.organism)}</span>` : ''}<br><span class="small muted">${esc(x.what || '')}${x.indicators ? ` Linked to: ${esc(x.indicators.join(', '))}.` : ''}</span></span></div>`;
  const show = (rows, src) => { el.querySelector('#sres').innerHTML = rows.map(study).join('') || '<div class="small muted">No studies found.</div>'; el.querySelector('#ssrc').textContent = src; };
  show(s.open_science.studies, 'bundled · works offline');
  const search = async (q) => { el.querySelector('#ssrc').textContent = 'searching…'; const r = await api.get(`/api/science/search?q=${encodeURIComponent(q)}`); show(r.studies, `${r.source} · “${r.term}”`); };
  el.querySelector('#sf').onsubmit = (e) => { e.preventDefault(); const q = el.querySelector('#sq').value.trim(); if (q) search(q); };
  if (params?.[0]) { const q = decodeURIComponent(params[0]); el.querySelector('#sq').value = q; search(q); }
}
