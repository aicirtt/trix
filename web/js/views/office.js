// Agent office as a tree: the event, the mission orchestrator, the team orchestrators and the agents they gave work to.
import { api } from '../api.js';
import { esc, icon, chip, fmtTime, plain } from '../ui.js';

const TEAMS = [['Daily care', '#2DD4BF', ['Check-in', 'Detection', 'Coach', 'Reminder', 'Safety', 'Report']], ['Emergency', '#FC3D21', ['Triage', 'Specialist', 'Flight Surgeon', 'Procedure', 'Safety', 'Report']], ['Operations', '#7FB2FF', ['Pharmacy', 'Devices', 'Privacy', 'Safety', 'Report']]];
const W = 250, CH = 50, GAP = 60, X0 = [30, 345, 660];
const T = (x, y, s, size, fill, weight = 400, anchor = 'start', fam = "'IBM Plex Sans',sans-serif", ls = 0) => `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}" font-family="${fam}" letter-spacing="${ls}">${esc(s)}</text>`;
const MONO = "'IBM Plex Mono',monospace", COND = "'IBM Plex Sans Condensed',sans-serif";
const cut = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export async function render(el, { params }) {
  const { cases } = await api.get('/api/office');
  const cid = params[0] || cases[0]?.case_id;
  if (!cid) {
    el.innerHTML = '<div class="head"><div><div class="kicker">Agent office</div><h1>Who gave what work to whom</h1></div></div><div class="card empty">No cases yet. Take a reading or raise an alert, then come back.</div>';
    return undefined;
  }
  const r = await api.get(`/api/office/${cid}`);
  const spans = r.spans, c = r.case;
  const byId = Object.fromEntries(spans.map((s, i) => [s.span_id, i]));
  const root = spans.findIndex((s) => s.team === 'Mission');
  const order = spans.map((_, i) => i);                      // spans arrive in tree order = execution order
  const step = Object.fromEntries(order.map((i, n) => [i, n + 1]));
  let sel = spans.findIndex((s) => s.team === 'Emergency' && !/orchestrator/.test(s.agent) && /Cardiac|General|First|Mental|Radiation/.test(s.agent));
  if (sel < 0) sel = Math.max(0, spans.findIndex((s) => s.agent === 'Detection'));
  let timer = null;

  const node = (i, x, y, w, h, title, sub, color, opt = {}) => {
    const s = spans[i];
    const dim = opt.dim, on = i === sel && !dim;
    return `<g class="${dim ? '' : 'nd'} rise" ${dim ? 'opacity=".38"' : `data-i="${i}" tabindex="0" role="button" aria-label="Step ${step[i]}: ${esc(title)}. ${esc(sub)}"`} style="animation-delay:${opt.delay || 0}ms">
      ${on ? `<rect x="${x - 5}" y="${y - 5}" width="${w + 10}" height="${h + 10}" fill="none" stroke="${color}" stroke-width="2"><animate attributeName="opacity" values=".7;.1;.7" dur="2s" repeatCount="indefinite"/></rect>` : ''}
      <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${on ? '#0E1F40' : '#0A1730'}" stroke="${color}" stroke-width="${on ? 2 : 1}"/><rect x="${x}" y="${y}" width="4" height="${h}" fill="${color}"/>
      ${dim ? '' : `<circle cx="${x}" cy="${y}" r="11" fill="#050B18" stroke="${color}" stroke-width="1.5"/>${T(x, y + 4, step[i], 11, color, 600, 'middle', MONO)}`}
      ${T(x + 14, y + 21, title, 14, '#F4F7FC', 700, 'start', COND, '.05em')}${T(x + 14, y + 39, cut(sub, Math.floor(w / 6.6)), 12, '#A9B8D6')}
      ${s && s.ms != null && !dim ? T(x + w - 8, y + 20, `${s.ms} ms`, 10.5, '#8396BA', 500, 'end', MONO) : ''}</g>`;
  };

  function tree() {
    let svg = '', maxRows = 3, delay = 300;
    const mission = spans[root];
    const pos = {};
    TEAMS.forEach(([team, color, idle], k) => {
      const x = X0[k], mid = x + (W + 30) / 2;
      const orch = spans.findIndex((s) => s.team === team && /orchestrator/.test(s.agent));
      const agents = spans.map((s, i) => [s, i]).filter(([s]) => s.team === team && !/orchestrator/.test(s.agent) && s.depth >= 2);
      const used = orch >= 0;
      svg += `<path id="e${k}" d="M485 162 V192 H${mid} V222" fill="none" stroke="${color}" stroke-width="${used ? 2 : 1}" stroke-opacity="${used ? 0.9 : 0.3}" ${used ? '' : 'stroke-dasharray="3 5"'}/>`;
      const rows = used ? agents.length : idle.length;
      maxRows = Math.max(maxRows, rows);
      svg += `<path id="s${k}" d="M${x + 14} 280 V${322 + (rows - 1) * GAP + CH / 2}" fill="none" stroke="${color}" stroke-width="1.5" stroke-opacity="${used ? 0.8 : 0.25}"/>`;
      if (used) {
        pos[orch] = [x, 251];
        svg += node(orch, x, 222, W + 30, 58, `${team} orchestrator`.toUpperCase(), `gave work to ${agents.length} agent${agents.length === 1 ? '' : 's'}`, color, { delay });
        agents.forEach(([s, i], n) => { const y = 322 + n * GAP; delay += 110; pos[i] = [x + 36 + W - 6, y + CH / 2];
          svg += `<path d="M${x + 14} ${y + CH / 2} H${x + 36}" fill="none" stroke="${color}" stroke-width="1.5" stroke-opacity=".8"/>` + node(i, x + 36, y, W - 6, CH, s.agent, plain(s.result), color, { delay }); });
        svg += `<circle r="4" fill="${color}"><animateMotion dur="1.8s" repeatCount="indefinite"><mpath href="#e${k}"/></animateMotion></circle><circle r="3.5" fill="${color}"><animateMotion dur="2.4s" repeatCount="indefinite"><mpath href="#s${k}"/></animateMotion></circle>`;
      } else {
        svg += node(-1, x, 222, W + 30, 58, `${team} orchestrator`.toUpperCase(), 'idle · not needed for this case', color, { dim: true });
        idle.forEach((a, n) => { const y = 322 + n * GAP; svg += `<path d="M${x + 14} ${y + CH / 2} H${x + 36}" fill="none" stroke="${color}" stroke-opacity=".25"/>` + node(-1, x + 36, y, W - 6, CH, a, 'idle', color, { dim: true }); });
      }
    });
    // hand-off from Daily care to Emergency
    const em = spans.findIndex((s) => s.team === 'Emergency' && /orchestrator/.test(s.agent));
    const det = spans.findIndex((s) => s.team === 'Daily care' && s.agent === 'Detection');
    if (em >= 0 && det >= 0 && /hand-off/i.test(spans[em].trigger || '')) {
      const [dx, dy] = pos[det];
      svg += `<path id="ho" class="flow" d="M${dx} ${dy} C ${dx + 26} ${dy}, 318 251, 345 251" fill="none" stroke="#FC3D21" stroke-width="2"/><path d="M337 245 L345 251 L337 257" fill="none" stroke="#FC3D21" stroke-width="2"/>
        <circle r="4.5" fill="#FC3D21"><animateMotion dur="1.6s" repeatCount="indefinite"><mpath href="#ho"/></animateMotion></circle>${T(322, 210, 'HAND-OFF', 11.5, '#FF7A63', 700, 'end', COND, '.08em')}`;
    }
    if (root >= 0) svg += node(root, 350, 104, 270, 58, 'MISSION ORCHESTRATOR', `routed to ${plain(mission.result).replace('team: ', '') || 'a team'}`, '#CFE0FF', { delay: 150 });
    const evt = c ? `${c.event} · Astronaut ${c.who || '—'}` : 'event';
    svg += `<path id="e0" d="M485 70 V104" fill="none" stroke="#FBBF24" stroke-width="1.5"/><circle r="4" fill="#FBBF24"><animateMotion dur="1.2s" repeatCount="indefinite"><mpath href="#e0"/></animateMotion></circle>
      <rect x="310" y="26" width="350" height="44" fill="#071126" stroke="#FBBF24" stroke-dasharray="4 4"/>${T(485, 44, `EVENT · ${evt}`.toUpperCase(), 12.5, '#FBBF24', 700, 'middle', COND, '.06em')}${T(485, 61, cut(c?.summary || '', 46), 12, '#F4F7FC', 500, 'middle', MONO)}`;
    const H = 322 + maxRows * GAP + 10;
    return `<svg viewBox="0 0 960 ${H}" role="group" aria-label="Agent tree for case ${esc(cid)}">${svg}</svg>`;
  }

  function detail() {
    const s = spans[sel] || {};
    const parent = s.parent_id ? spans[byId[s.parent_id]] : null;
    const prev = sel > 0 ? spans[sel - 1] : null, next = spans[sel + 1];
    return `<div class="tile"><div class="ptitle"><span>Selected · step ${step[sel]} of ${spans.length}</span>${chip(s.status === 'ok' ? 'green' : 'red', s.status === 'ok' ? 'DONE' : String(s.status).toUpperCase())}</div></div>
      <div style="padding:14px;display:flex;flex-direction:column;gap:12px"><div style="font-size:24px;font-weight:700">${esc(s.agent)}</div>
      <div class="kv" style="grid-template-columns:86px 1fr"><span class="lbl">Team</span><span>${esc(s.team)}</span><span class="lbl">Given by</span><span>${esc(parent ? parent.agent : 'the event')}${s.trigger ? ` <span class="muted small">(after ${esc(s.trigger)})</span>` : ''}</span>
        <span class="lbl">Given</span><span class="mono small muted" style="word-break:break-word">${esc(plain(s.inputs))}</span><span class="lbl">Returned</span><strong style="word-break:break-word">${esc(plain(s.result))}</strong>
        <span class="lbl">Passed to</span><span>${next && next.depth >= s.depth ? esc(next.agent) : s.agent === 'Report' ? 'Earth report queue' : esc(next ? next.agent : 'done')}</span><span class="lbl">Took</span><span class="mono">${s.ms} ms</span></div>
      <div class="lbl">Tools it used</div>${(s.tools || []).map((t) => `<div class="note small" style="color:var(--t1)">${icon('chip', 'var(--bluet)', 15)} <strong class="mono">${esc(t.tool)}</strong><br><span class="muted">${esc(plain(t.result))}</span></div>`).join('') || '<span class="small dim">No tools: it only routes work.</span>'}</div>`;
  }

  function draw() {
    el.querySelector('#tree').innerHTML = tree();
    el.querySelector('#detail').innerHTML = detail();
    el.querySelectorAll('.nd').forEach((g) => { const pick = () => { clearInterval(timer); sel = +g.dataset.i; draw(); }; g.onclick = pick; g.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } }; });
    el.querySelectorAll('.nd.rise, g.rise').forEach((g) => { if (drawn) { g.classList.remove('rise'); } });
    drawn = true;
    const bar = el.querySelector('#rbar'); if (bar) bar.style.width = `${Math.round(step[sel] / spans.length * 100)}%`;
    const lab = el.querySelector('#rlab'); if (lab) lab.textContent = `step ${step[sel]} of ${spans.length} · ${spans[sel].agent}`;
  }
  let drawn = false;
  const total = spans.filter((s) => s.depth === 1).reduce((a, s) => a + (s.ms || 0), 0);
  const live = c && Date.now() / 1000 - c.ts < 120;
  el.innerHTML = `
  <div class="head"><div><div class="kicker">Agent office · case ${esc(cid)} · Astronaut ${esc(c?.who || '—')} · ${c ? fmtTime(c.ts) : ''}</div><h1>Who gave what work to whom</h1></div>
    <div class="row" style="gap:12px;align-items:center"><label class="sr" for="casesel">Case</label><select class="input" id="casesel" style="min-height:44px;font-size:14px;width:auto">${cases.slice(0, 40).map((x) => `<option value="${x.case_id}" ${x.case_id === cid ? 'selected' : ''}>${fmtTime(x.ts)} · ${esc(x.event)} · ${esc(x.who || 'crew')} · ${esc(x.summary.slice(0, 40))}</option>`).join('')}</select>
      <span class="chip ${c?.urgency === 'emergency' ? 'red' : 'green'}">${live ? '<span class="blink">●</span> LIVE · ' : ''}${spans.length} steps · ${(total / 1000).toFixed(2)} s</span></div></div>
  <div class="row">
    <div class="card grow tree" style="padding:6px 10px;flex:2.6;min-width:320px;overflow-x:auto" id="tree"></div>
    <div class="col" style="flex:1;min-width:300px"><div class="card" style="padding:0;gap:0;flex:1" id="detail"></div>
      <div class="card" style="padding:0;gap:0"><div class="tile"><div class="ptitle"><span>Replay this case</span></div></div><div class="row" style="padding:12px 14px;align-items:center;gap:12px"><button class="btn" id="replay" aria-label="Replay" style="min-width:48px;padding:0">${icon('play', '#fff', 20)}</button>
        <div style="flex:1"><div style="height:6px;background:var(--bd)"><div id="rbar" style="height:100%;width:0;background:var(--nred);transition:width .3s"></div></div><div class="mono small dim" id="rlab" style="margin-top:5px"></div></div></div>
        <div class="small dim" style="padding:0 14px 12px">Logged to logs/agent_office.jsonl and included in the Earth report.</div></div></div>
  </div>`;
  draw();
  el.querySelector('#casesel').onchange = (e) => { location.hash = `#/office/${e.target.value}`; };
  el.querySelector('#replay').onclick = () => { clearInterval(timer); let n = 0; sel = order[0]; draw(); timer = setInterval(() => { n++; if (n >= order.length) { clearInterval(timer); return; } sel = order[n]; draw(); }, 650); };
  return () => clearInterval(timer);
}
