// Flight surgeon view: what Earth receives, after the signal delay, with the crew's privacy choices applied.
import { api } from '../api.js';
import { esc, icon, chip, fmtTime, plain, level } from '../ui.js';

export async function render(el) {
  let timer = null, open = null;
  async function draw() {
    const g = await api.get('/api/ground');
    const cut = g.link.cut;
    const typing = document.activeElement?.id === 'gmsg' ? document.activeElement.value : null;
    el.innerHTML = `
    <div class="banner info" style="border-color:#CFE0FF"><span data-icon="earth" data-size="30"></span><div style="flex:1"><div class="cond" style="font-size:20px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">Earth · flight surgeon console</div>
      <div class="small muted">This is the other end of the link. Reports appear only after the signal delay${g.warp > 1 ? ` (demo clock: 1 minute of delay passes in 1 second, so ${g.link.delay} takes about ${Math.round(g.delay_s)} s)` : ''}.</div></div>
      ${chip(cut ? 'red' : 'green', cut ? 'NO CONTACT WITH THE SHIP' : `LINK UP · ${esc(g.link.label)} · ${esc(g.link.delay)}`)}</div>
    <div class="row">
      <div class="card grow" style="flex:1.6"><div class="head"><h2>Reports from the ship</h2><span class="small muted">${g.held_on_ship} still held on board${cut ? ' (link down)' : ''}</span></div>
        ${g.reports.length ? g.reports.map((r) => `<div class="card tight" style="border-color:${r.priority === 'urgent' && r.arrived ? 'var(--nred)' : 'var(--bd)'}">
          <button class="caserow" data-open="${r.id}" ${r.arrived ? '' : 'disabled'} style="padding:0"><span class="row" style="gap:10px;align-items:center;width:100%"><strong>${esc(r.case_id)}</strong><span class="muted small">Astronaut ${esc(r.who || 'crew')} · sent ${fmtTime(r.sent_at)}</span>
            <span style="margin-left:auto" class="row">${chip(r.priority === 'urgent' ? 'red' : 'none', r.priority.toUpperCase())}${r.arrived ? chip('green', 'RECEIVED') : chip('amber', `IN TRANSIT · ${Math.ceil(r.arrives_in)} s`)}</span></span></button>
          ${r.arrived && open === r.id ? body(r.body) : ''}</div>`).join('') : '<div class="empty">Nothing received yet. On the ship, open Earth link and send the queued reports.</div>'}</div>
      <div class="col" style="flex:1;min-width:300px"><div class="card"><h2>Message the crew</h2><p class="small muted" style="margin:0">Arrives on the ship after the same delay.</p>
        <form id="gform" class="col" style="gap:10px"><label class="sr" for="gto">To</label><select class="input" id="gto" style="font-size:15px"><option value="crew">Whole crew</option><option value="A">Astronaut A</option><option value="B">Astronaut B</option><option value="C">Astronaut C</option></select>
          <label class="sr" for="gmsg">Message</label><textarea class="input" id="gmsg" rows="3" placeholder="Good work on the ECG. Repeat it in 2 hours and send the trace.">${esc(typing || '')}</textarea><button class="btn" ${cut ? 'disabled' : ''}>Send to the ship</button></form>
        <div id="gerr" class="small" style="color:var(--redt)"></div></div>
        <div class="card" style="flex:1"><h2>Sent messages</h2>${g.messages.slice().reverse().slice(0, 6).map((m) => `<div class="note small"><strong>To ${m.to === 'crew' ? 'the crew' : `Astronaut ${esc(m.to)}`}</strong> · ${m.deliver <= Date.now() / 1000 ? '<span style="color:var(--ok)">delivered</span>' : '<span style="color:var(--watch)">in transit</span>'}<br>${esc(m.text)}</div>`).join('') || '<span class="small muted">None yet.</span>'}</div></div>
    </div>`;
    el.querySelectorAll('[data-icon]').forEach((e) => { e.outerHTML = icon(e.dataset.icon, '#CFE0FF', +e.dataset.size); });
    el.querySelectorAll('[data-open]').forEach((b) => b.onclick = () => { open = open === +b.dataset.open ? null : +b.dataset.open; draw(); });
    el.querySelector('#gform').onsubmit = async (e) => { e.preventDefault(); try { await api.post('/api/ground/message', { to: el.querySelector('#gto').value, text: el.querySelector('#gmsg').value }); el.querySelector('#gmsg').value = ''; draw(); } catch (er) { el.querySelector('#gerr').textContent = er.message; } };
    if (typing !== null) { const t = el.querySelector('#gmsg'); t.focus(); t.setSelectionRange(t.value.length, t.value.length); }
  }
  const body = (b) => `<div class="kv" style="margin-top:10px;grid-template-columns:110px 1fr"><span class="lbl">Event</span><span>${esc(b.event)} · ${esc(b.team)}</span>
    ${b.urgency ? `<span class="lbl">Urgency</span><span>${esc(level(b.urgency))}</span><span class="lbl">Decision</span><span>${esc(String(b.decision || '').replace(/_/g, ' '))}</span><span class="lbl">Procedure</span><span>${esc(b.protocol || 'none')}</span>` : ''}
    ${b.body_map ? `<span class="lbl">Body map</span><span>${esc(plain(b.body_map))}</span>` : ''}${b.vitals ? `<span class="lbl">Readings</span><span class="mono small">${esc(plain(b.vitals))}</span>` : '<span class="lbl">Readings</span><span class="muted">withheld by the astronaut\'s privacy setting</span>'}
    ${b.symptoms ? `<span class="lbl">Symptoms</span><span>${esc(b.symptoms)}</span>` : ''}<span class="lbl">Agent log</span><span class="small">${(b.agent_log || []).map((a) => `<strong>${esc(a.agent)}</strong> ${esc(plain(a.result).slice(0, 80))}`).join('<br>')}</span></div>`;
  await draw();
  timer = setInterval(() => { if (document.activeElement?.id !== 'gmsg' || !document.activeElement.value) draw(); }, 2000);
  return () => clearInterval(timer);
}
