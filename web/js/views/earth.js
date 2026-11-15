import { api } from '../api.js';
import { esc, icon, chip, toast, fmtTime } from '../ui.js';
import { bluetoothAvailable, connectHeartRate } from '../sensors.js';

const LINK_SVG = (live) => `<svg viewBox="0 0 760 110" width="100%" role="img" aria-label="Reports travel from the ship to Earth">
<defs><radialGradient id="eg" cx=".35" cy=".35"><stop offset="0" stop-color="#93C5FD"/><stop offset="1" stop-color="#1D4ED8"/></radialGradient><radialGradient id="mg" cx=".35" cy=".35"><stop offset="0" stop-color="#FCA5A5"/><stop offset="1" stop-color="#B91C1C"/></radialGradient></defs>
<path id="lnk" d="M70 55 Q380 -5 690 55" fill="none" stroke="#2B3954" stroke-width="2" stroke-dasharray="2 7"/>
<circle cx="70" cy="55" r="26" fill="url(#mg)"/><text x="70" y="102" text-anchor="middle" font-size="12" fill="#AAB6C8">Ship</text>
<circle cx="690" cy="55" r="30" fill="url(#eg)"/><text x="690" y="104" text-anchor="middle" font-size="12" fill="#AAB6C8">Earth · flight surgeons</text>
<g><circle r="6" fill="#FBBF24"/><circle r="12" fill="#FBBF24" fill-opacity=".25"/><animateMotion dur="${live ? 1.6 : 6}s" repeatCount="indefinite"><mpath href="#lnk"/></animateMotion></g>
<g visibility="hidden"><set attributeName="visibility" to="visible" begin="${live ? 0.8 : 3}s"/><circle r="4" fill="#60A5FA"/><animateMotion dur="${live ? 1.6 : 6}s" begin="${live ? 0.8 : 3}s" repeatCount="indefinite" keyPoints="1;0" keyTimes="0;1" calcMode="linear"><mpath href="#lnk"/></animateMotion></g>
<g id="burst"></g></svg>`;

export async function render(el, { state, refreshMission }) {
  const [rep, dev, sw] = await Promise.all([api.get('/api/reports'), api.get('/api/ops/devices'), api.get('/api/feeds/space-weather')]);
  const m = state.mission;
  const loc = m.location;
  const queued = rep.reports.filter((r) => r.status === 'queued');
  const swc = { green: 'green', amber: 'amber', red: 'red' }[sw.status];
  el.innerHTML = `
  <div class="head"><div><h1>Earth link</h1><div class="sub">What reaches Earth, when, and what runs on board without it</div></div>
    <div class="seg" role="group" aria-label="Mission location">${Object.entries(m.locations).map(([k, l]) => `<button type="button" data-loc="${k}" class="${k === loc ? 'on' : ''}" aria-pressed="${k === loc}">${esc(l.label)}</button>`).join('')}</div></div>
  <div class="row">
    <div class="col grow">
      <div class="card" style="padding-bottom:8px;${m.link_cut ? 'opacity:.35' : ''}">${LINK_SVG(m.link.live)}</div>
      <div class="card"><div class="row" style="gap:28px;align-items:center"><div><span class="lbl">One-way delay</span><div class="mono" style="font-size:36px;font-weight:600">${esc(m.link.delay)}</div></div>
        <div><span class="lbl">Ask and get an answer</span><div class="mono" style="font-size:36px;font-weight:600;color:var(--ambt)">${esc(m.link.round)}</div></div>
        <div style="flex:1;min-width:220px;color:var(--t2);line-height:1.5">${m.link_cut ? '<strong style="color:var(--redt)">No contact with Earth.</strong> TRIX and the crew decide on board. Reports are held until the link returns.' : m.link.live ? 'Flight surgeons can join live. TRIX still logs and summarises everything.' : 'Too slow for emergencies. TRIX acts on board and sends reports in the next link window.'}</div>
        <div class="col" style="gap:8px"><button class="btn ${m.link_cut ? '' : 'red'} sm" id="cut">${m.link_cut ? 'Restore the link' : 'Cut the link'}</button><a class="btn ghost sm" href="#/ground" target="_blank" rel="noopener">Flight surgeon view</a></div></div></div>
      <div class="card"><div class="head"><h2>Report queue</h2><span class="small muted">${rep.window_open ? 'Link window open' : `Next link window ${esc(rep.next_window)}`}</span></div>
        <table><thead><tr><th class="lbl">Report</th><th class="lbl">Who</th><th class="lbl" style="text-align:right">Size</th><th class="lbl" style="text-align:right">Priority</th><th class="lbl" style="text-align:right">Status</th></tr></thead>
        <tbody>${rep.reports.slice(0, 12).map((r) => `<tr><td><a href="#/office/${esc(r.case_id)}">${esc(r.case_id)}</a> <span class="small dim">${fmtTime(r.ts)}</span></td><td>${esc(r.who || 'crew')}</td><td class="mono" style="text-align:right">${(r.bytes / 1024).toFixed(1)} KB</td><td style="text-align:right">${chip(r.priority === 'urgent' ? 'red' : 'none', r.priority)}</td><td style="text-align:right">${chip(r.status === 'sent' ? 'green' : 'amber', r.status)}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">Nothing queued.</td></tr>'}</tbody></table>
        <div class="row" style="justify-content:space-between;align-items:center"><span class="small dim">Summaries only. Your privacy choices apply (Crew → My privacy).</span><button class="btn" id="send" ${queued.length && !m.link_cut ? '' : 'disabled'}>${icon('send', '#fff', 20)}Send ${queued.length} now</button></div></div>
    </div>
    <div class="col" style="width:400px;flex:none;max-width:100%">
      <div class="card"><div class="head"><h2>Space weather</h2>${chip(swc, sw.status === 'green' ? 'Calm' : sw.status === 'amber' ? 'Watch' : 'Storm')}</div>
        <p style="margin:0">${esc(sw.message)}</p>
        <div class="list">${sw.flares.slice(0, 4).map((f) => `<div class="li small"><span class="mono" style="width:56px">${esc(f.class)}</span><span style="flex:1" class="muted">${esc((f.peak || '').replace('T', ' ').replace('Z', ''))} UTC · region ${esc(f.region ?? '—')}</span></div>`).join('') || '<div class="small muted">No flares in the last 7 days.</div>'}</div>
        <div class="small dim">NASA DONKI · ${esc(sw.source)}${sw.error ? ' · no network, using the last saved data' : ''}</div>
        ${sw.status !== 'green' ? '<button class="btn ghost" id="applysw">Alert the crew</button>' : ''}</div>
      <div class="card"><h2>Medical devices</h2>${dev.ops.devices.map((d) => `<div class="li"><span style="flex:1">${esc(d.name)}</span>${chip(['offline'].includes(d.status) ? 'red' : 'green', d.status)}</div>`).join('')}
        <button class="btn ghost sm" id="ble">${icon('bt')}Pair a Bluetooth heart-rate device</button><span class="small dim">${bluetoothAvailable() ? '' : 'Bluetooth needs Chrome or Edge.'}</span></div>
      <div class="card"><div class="head"><h2>On-board AI</h2>${chip('green', 'No internet needed')}</div>${Object.entries(m.ai).map(([k, v]) => `<div class="li small"><span style="flex:1;text-transform:capitalize">${esc(k.replace('_', ' '))}</span><span class="muted">${esc(String(v))}</span></div>`).join('')}</div>
    </div>
  </div>`;
  el.querySelectorAll('[data-loc]').forEach((b) => b.onclick = async () => { await api.post('/api/mission', { location: b.dataset.loc }); await refreshMission(); render(el, { state, refreshMission }); });
  const send = el.querySelector('#send');
  send.onclick = async () => {
    send.disabled = true;
    const g = el.querySelector('#burst');
    g.innerHTML = queued.slice(0, 8).map((_, i) => `<circle r="5" fill="#FBBF24" visibility="hidden"><set attributeName="visibility" to="visible" begin="${i * 0.18}s"/><animateMotion dur="${m.link.live ? 1.2 : 2.4}s" begin="${i * 0.18}s" fill="freeze"><mpath href="#lnk"/></animateMotion></circle>`).join('');
    const r = await api.post('/api/reports/send');
    setTimeout(() => { toast(`${r.sent} reports sent. ${m.link.live ? 'Earth has them now.' : `They reach Earth in ${esc(m.link.delay)}.`}`); render(el, { state, refreshMission }); }, 2600);
  };
  el.querySelector('#cut').onclick = async () => { await api.post('/api/mission', { link_cut: !m.link_cut }); await refreshMission(); render(el, { state, refreshMission }); };
  const ap = el.querySelector('#applysw');
  if (ap) ap.onclick = async () => { const r = await api.post('/api/feeds/space-weather/apply'); toast(`${esc(r.message)} Sent to ${r.cases?.length || 0} crew.`); };
  el.querySelector('#ble').onclick = async () => { try { await connectHeartRate(() => {}); toast('Device paired.'); render(el, { state, refreshMission }); } catch (e) { toast(`Not paired: ${esc(e.message)}`); } };
}
