// Sources and data: everything TRIX relies on, and what is simulated.
import { api } from '../api.js';
import { esc, icon } from '../ui.js';

export async function render(el) {
  const s = await api.get('/api/sources');
  const row = (x) => `<div class="li" style="align-items:flex-start"><span style="flex:1">${x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.title)}</a>` : `<strong>${esc(x.title)}</strong>`}${x.used_by?.length ? `<br><span class="small muted">Used by: ${esc(x.used_by.join(', '))}</span>` : ''}</span></div>`;
  el.innerHTML = `
  <div class="head"><div><div class="kicker">For judges and the project page</div><h1>Sources and data</h1></div><a class="btn ghost sm" href="#/earth">${icon('back')}Earth link</a></div>
  <div class="row">
    <div class="card grow"><h2>NASA and research references (${s.references.length})</h2><div class="list">${s.references.map(row).join('')}</div></div>
    <div class="col grow"><div class="card"><h2>Live data</h2><div class="list">${s.live_data.map(row).join('')}</div></div>
      <div class="card"><h2>Onboard knowledge notes (${s.knowledge_notes.length})</h2><div class="list">${s.knowledge_notes.map(row).join('')}</div><div class="small dim">Short notes written by the team from the linked NASA pages; answers cite them.</div></div>
      <div class="card"><h2>Models and tools</h2><div class="list">${s.models_and_tools.map(row).join('')}</div></div>
      <div class="card" style="border-color:var(--watch)"><h2>What is simulated</h2><ul style="margin:0;padding-left:20px;line-height:1.7">${s.simulated.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div></div>
  </div>`;
}
