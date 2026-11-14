import { api } from '../api.js';
import { esc, icon, chip, fmtTime, plain } from '../ui.js';

const TEAMC = { Mission: '#AAB6C8', 'Daily care': '#2DD4BF', Emergency: '#F87171', Operations: '#60A5FA' };

const CONSTELLATION = (active) => `<svg viewBox="0 0 360 170" width="100%" style="max-width:420px;display:block;margin:0 auto" role="img" aria-label="Agent constellation: the mission orchestrator in the centre with the Daily care, Emergency and Operations teams">
<ellipse cx="180" cy="85" rx="150" ry="62" fill="none" stroke="#1F2A40" stroke-dasharray="3 5"/><ellipse cx="180" cy="85" rx="92" ry="38" fill="none" stroke="#1F2A40" stroke-dasharray="3 5"/>
<path id="lnDC" d="M180 85 L58 50" stroke="#2DD4BF" stroke-opacity=".35" stroke-width="1.5"/><path id="lnEM" d="M180 85 L312 62" stroke="#F87171" stroke-opacity=".35" stroke-width="1.5"/><path id="lnOP" d="M180 85 L196 146" stroke="#60A5FA" stroke-opacity=".35" stroke-width="1.5"/>
<path id="lnHO" d="M58 50 Q180 -6 312 62" fill="none" stroke="#F87171" stroke-opacity="${active.has('handoff') ? .7 : .2}" stroke-width="1.5" stroke-dasharray="4 4"/>
${active.has('Daily care') ? '<circle r="3.5" fill="#2DD4BF"><animateMotion dur="2.4s" repeatCount="indefinite"><mpath href="#lnDC"/></animateMotion></circle>' : ''}
${active.has('handoff') ? '<circle r="3.5" fill="#F87171" visibility="hidden"><set attributeName="visibility" to="visible" begin=".6s"/><animateMotion dur="3s" begin=".6s" repeatCount="indefinite"><mpath href="#lnHO"/></animateMotion></circle>' : ''}
${active.has('Emergency') ? '<circle r="3.5" fill="#F87171" visibility="hidden"><set attributeName="visibility" to="visible" begin="1s"/><animateMotion dur="2s" begin="1s" repeatCount="indefinite" keyPoints="1;0" keyTimes="0;1" calcMode="linear"><mpath href="#lnEM"/></animateMotion></circle>' : ''}
${active.has('Operations') ? '<circle r="3" fill="#60A5FA" visibility="hidden"><set attributeName="visibility" to="visible" begin=".3s"/><animateMotion dur="2.6s" begin=".3s" repeatCount="indefinite"><mpath href="#lnOP"/></animateMotion></circle>' : ''}
<circle cx="180" cy="85" r="22" fill="#141D31" stroke="#AAB6C8" stroke-width="2"/><circle cx="180" cy="85" r="22" fill="none" stroke="#AAB6C8"><animate attributeName="r" values="22;34" dur="2.4s" repeatCount="indefinite"/><animate attributeName="stroke-opacity" values=".45;0" dur="2.4s" repeatCount="indefinite"/></circle>
<text x="180" y="89" text-anchor="middle" font-size="11" font-weight="700" fill="#E6EBF2">Mission</text>
${[['Daily care', 58, 50, 15, 78], ['Emergency', 312, 62, 15, 90], ['Operations', 196, 146, 13, 150]].map(([n, x, y, r, ty]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#0F1626" stroke="${TEAMC[n]}" stroke-width="${active.has(n) ? 3 : 1.5}" stroke-opacity="${active.has(n) ? 1 : .45}"/><text x="${n === 'Operations' ? 240 : x}" y="${ty}" text-anchor="middle" font-size="11" fill="${TEAMC[n]}" fill-opacity="${active.has(n) ? 1 : .55}">${n}</text>`).join('')}
</svg>`;

export async function render(el, { params, go }) {
  const { cases } = await api.get('/api/office');
  const cid = params[0] || cases[0]?.case_id;
  if (!cid) {
    el.innerHTML = '<div class="head"><div><h1>Agent office</h1><div class="sub">Every decision TRIX makes appears here</div></div></div><div class="card empty">No cases yet. Do a check-in or raise an alert.</div>';
    return;
  }
  const r = await api.get(`/api/office/${cid}`);
  const spans = r.spans;
  let sel = Math.max(0, spans.findIndex((s) => !/orchestrator/.test(s.agent) && s.team === 'Emergency'));
  if (sel < 0) sel = 0;
  const teams = new Set(spans.map((s) => s.team));
  if (spans.some((s) => /hand-off/.test(s.trigger))) teams.add('handoff');
  const total = spans.filter((s) => s.depth === 0).reduce((a, s) => a + (s.ms || 0), 0);
  const c = r.case;

  function detail() {
    const s = spans[sel] || {};
    const res = plain(s.result);
    return `<div class="head"><h2>${esc(s.agent)}</h2><span class="small" style="color:${TEAMC[s.team]}">${esc(s.team)}</span></div>
      <div class="kv"><span class="lbl">Triggered by</span><span>${esc(s.trigger)}</span><span class="lbl">Input</span><span class="mono small muted" style="word-break:break-word">${esc(JSON.stringify(s.inputs))}</span>
      <span class="lbl">Returned</span><strong style="word-break:break-word">${esc(res)}</strong><span class="lbl">Took</span><span class="mono">${s.ms} ms</span><span class="lbl">Status</span>${chip(s.status === 'ok' ? 'green' : 'red', s.status)}</div>
      <div><div class="lbl" style="margin-bottom:8px">Tools used</div>${(s.tools || []).map((t) => `<div class="note small" style="margin-bottom:6px;color:var(--t1)">${icon('chip', 'var(--bluet)', 15)} <strong>${esc(t.tool)}</strong> → ${esc(typeof t.result === 'string' ? t.result : JSON.stringify(t.result))}</div>`).join('') || '<span class="small dim">No tools: routing only.</span>'}</div>`;
  }

  el.innerHTML = `
  <div class="head"><div><h1>Agent office</h1><div class="sub">Every decision TRIX made: who triggered it, which tools it used, what it returned</div></div>
    <span class="row" style="gap:8px;align-items:center;padding:8px 14px;border-radius:12px;background:var(--p1);border:1px solid var(--bd);font-weight:600"><span class="tdot ${c && Date.now() / 1000 - c.ts < 120 ? 'live-dot' : ''}" style="background:${c?.urgency === 'emergency' ? '#EF4444' : '#2DD4BF'};width:9px;height:9px"></span>Case ${esc(cid)} · Astronaut ${esc(c?.who || '—')}</span></div>
  <div class="grid4">${[['Steps', spans.length], ['Teams', [...teams].filter((t) => t !== 'Mission' && t !== 'handoff').join(' → ') || '—'], ['Hand-offs', teams.has('handoff') ? 1 : 0], ['Safety', spans.filter((s) => s.agent === 'Safety').every((s) => (s.result || {}).allowed !== false) ? 'All clear' : 'Blocked'], ['Total time', `${(total / 1000).toFixed(2)} s`]].slice(0, 4).map(([a, b]) => `<div class="card tight"><span class="lbl">${a}</span><div style="font-size:20px;font-weight:800">${esc(b)}</div></div>`).join('')}</div>
  <div class="row">
    <nav class="card tight" style="width:250px;flex:none;max-height:640px;overflow:auto" aria-label="Cases"><span class="lbl">Recent cases</span>
      ${cases.slice(0, 40).map((x) => `<a class="caserow ${x.case_id === cid ? 'on' : ''}" href="#/office/${x.case_id}" style="text-decoration:none"><span class="row" style="gap:8px;align-items:center"><span class="tdot" style="background:${x.urgency === 'emergency' ? '#EF4444' : TEAMC[{ daily: 'Daily care', emergency: 'Emergency', ops: 'Operations' }[x.team]] || '#AAB6C8'}"></span><strong>${esc(x.event)}</strong><span class="small dim">${esc(x.who || '')} · ${fmtTime(x.ts)}</span></span><span class="small muted">${esc(x.summary)}</span></a>`).join('')}</nav>
    <section class="card grow" style="padding:0;overflow:hidden"><div class="orow" style="cursor:default;border-top:0"><span class="lbl">Time</span><span class="lbl">Team</span><span class="lbl">Agent · returned</span><span class="lbl" style="text-align:right">Took</span></div>
      ${spans.map((s, i) => `<button type="button" class="orow rowin ${i === sel ? 'on' : ''}" data-i="${i}" style="animation-delay:${100 + i * 90}ms;padding-left:${14 + s.depth * 18}px" aria-pressed="${i === sel}">
        <span class="mono small dim">${esc(s.started)}</span><span class="row small" style="gap:6px;align-items:center;color:var(--t2)"><span class="tdot" style="background:${TEAMC[s.team]}"></span>${esc(s.team)}</span>
        <span style="min-width:0"><span style="display:block;font-weight:700">${esc(s.agent)}</span><span class="small muted" style="display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(plain(s.result))}</span></span>
        <span class="mono small dim" style="text-align:right">${s.ms} ms</span></button>`).join('')}</section>
    <div class="col" style="width:400px;flex:none;max-width:100%"><div class="card" id="detail">${detail()}</div>
      <div class="card"><h3>Who called whom</h3>${CONSTELLATION(teams)}<div class="small dim">Logged to logs/agent_office.jsonl · included in the Earth report</div></div></div>
  </div>`;
  el.querySelectorAll('[data-i]').forEach((b) => b.onclick = () => {
    sel = +b.dataset.i;
    el.querySelectorAll('[data-i]').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); x.style.opacity = 1; x.classList.remove('rowin'); });
    el.querySelector('#detail').innerHTML = detail();
  });
}
