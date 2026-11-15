// Mission deck: Sense -> Understand -> Act -> Report on one screen.
import { api } from '../api.js';
import { t as tr } from '../i18n.js';
import { esc, icon, chip, hologram, spark, plain, STATUS_WORD, fmtTime, toast } from '../ui.js';

const COL = { green: 'var(--ok)', amber: 'var(--watch)', red: 'var(--alert)', none: 'var(--none)' };
const PART_OF = { bp: 'heart', hr: 'heart', orthostatic: 'heart', hrv: 'brain', sleep: 'brain', mood: 'brain', fatigue: 'brain', reaction: 'brain',
  spo2: 'lungs', co2: 'lungs', temp: 'immune', skin: 'immune', glucose: 'gut', fluid: 'gut', mass: 'gut', vision: 'eyes', bone: 'bones',
  calcium: 'bones', exercise: 'bones', back_pain: 'bones', rad_daily: 'rad', rad_career: 'rad' };
const PART_GO = { brain: 'sleep', eyes: 'vision', rad: 'co2', lungs: 'spo2', heart: 'hr', gut: 'glucose', immune: 'temp', bones: 'bone' };
const TEAMC = { 'Daily care': '#2DD4BF', Emergency: '#FC3D21', Operations: '#7FB2FF' };

function timeline(rt) {
  const m = (t) => { const [h, mm] = t.split(':').map(Number); return h * 60 + mm; };
  const lo = m('06:00'), hi = m('22:00');
  const S = Object.fromEntries(rt.sessions.map((s) => [s.id, s]));
  const slot = S.morning.at, mDone = S.morning.done === S.morning.items.length, eDone = S.evening.done === S.evening.items.length;
  const end = (t, d) => { const x = m(t) + d; return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`; };
  const blocks = [['06:00', slot, 'Post-sleep', 'var(--bd2)'], [slot, end(slot, 25), `Morning check ${S.morning.done}/${S.morning.items.length}`, mDone ? '#0F766E' : 'var(--nred)', '#/checkin'],
    [end(slot, 25), '09:30', 'Exercise · resistance', 'var(--bd2)', '#/capture/exercise'], ['09:30', '12:30', 'Payload ops', 'var(--bd)'], ['12:30', '13:00', 'Lunch · scan pouch', 'var(--bd2)', '#/checkin/4'],
    ['13:00', '13:20', 'Vision', 'var(--blue)', '#/checkin/3'], ['13:20', '17:00', 'Maintenance', 'var(--bd)'], ['17:00', '18:00', 'Exercise · bike', 'var(--bd2)', '#/capture/exercise'],
    ['18:00', '21:00', 'Crew time · buddy check', 'var(--bd)', '#/crew'], ['21:00', '21:30', `Evening check ${S.evening.done}/${S.evening.items.length}`, eDone ? '#0F766E' : 'var(--nred)', '#/capture/mood'], ['21:30', '22:00', 'Pre-sleep', 'var(--bd2)']];
  const now = new Date(), nm = now.getUTCHours() * 60 + now.getUTCMinutes();
  const pct = (x) => (x - lo) / (hi - lo) * 100;
  return `<div class="tl">${blocks.filter(([a, b]) => m(b) > m(a)).map(([a, b, n, c, href]) => `<a class="blk" ${href ? `href="${href}"` : 'tabindex="-1"'} title="${a}–${b} ${esc(n)}" style="left:${pct(m(a))}%;width:${pct(m(b)) - pct(m(a))}%;background:${c}">${esc(n)}</a>`).join('')}
    ${[6, 8, 10, 12, 14, 16, 18, 20].map((h) => `<span class="tick" style="left:${pct(h * 60)}%">${String(h).padStart(2, '0')}:00</span>`).join('')}
    ${nm >= lo && nm <= hi ? `<div class="now" style="left:${pct(nm)}%"><span>NOW</span></div>` : ''}</div>`;
}

function miniTree(spans) {
  const teams = new Set(spans.map((s) => s.team));
  const box = (x, n) => { const on = teams.has(n), c = on ? TEAMC[n] : '#3A4B70';
    return `<rect x="${x}" y="70" width="92" height="26" fill="${on ? '#0E1F40' : '#0A1730'}" stroke="${c}" stroke-width="${on ? 2 : 1}"/><text x="${x + 46}" y="87" text-anchor="middle" font-size="11" font-weight="700" fill="${c}" font-family="'IBM Plex Sans Condensed',sans-serif" letter-spacing=".06em">${n.toUpperCase()}</text>
    <path id="mt${x}" d="M155 34 V52 H${x + 46} V70" fill="none" stroke="${c}" stroke-width="1.5" ${on ? '' : 'stroke-dasharray="3 4"'}/>${on ? `<circle r="3.5" fill="${c}"><animateMotion dur="1.8s" repeatCount="indefinite"><mpath href="#mt${x}"/></animateMotion></circle>` : ''}`; };
  return `<svg viewBox="0 0 310 104" width="100%" role="img" aria-label="Teams used by the latest case: ${[...teams].filter((t) => t !== 'Mission').join(', ') || 'none'}">
    ${box(8, 'Daily care')}${box(109, 'Emergency')}${box(210, 'Operations')}
    <rect x="100" y="8" width="110" height="26" fill="#0E1F40" stroke="#CFE0FF"/><text x="155" y="25" text-anchor="middle" font-size="11.5" font-weight="700" fill="#CFE0FF" font-family="'IBM Plex Sans Condensed',sans-serif" letter-spacing=".08em">MISSION</text></svg>`;
}

export async function render(el, { state }) {
  const who = state.who;
  const [t, off, rep, sc] = await Promise.all([api.get(`/api/today/${who}`), api.get('/api/office'), api.get('/api/reports'), api.get(`/api/scan/${who}`)]);
  const outline = sc.current ? sc.current.outline : null;
  const mine = off.cases.find((c) => c.who === who) || off.cases[0];
  const last = mine ? await api.get(`/api/office/${mine.case_id}`) : { spans: [] };
  const rt = t.routine, m = state.mission;
  const ass = Object.fromEntries((t.assessments || []).map((a) => [a.indicator, a]));
  const notes = {};
  Object.entries(PART_OF).forEach(([ind, part]) => { const a = ass[ind]; if (a && a.status !== 'green' && !notes[part]) notes[part] = (a.reasons?.[0] || '').slice(0, 30); });
  const measured = t.six.filter((s) => s.measured_today).length;
  const queued = rep.reports.filter((r) => r.status === 'queued').length;
  const agents = last.spans.filter((s) => !/orchestrator/.test(s.agent));
  const watch = (t.assessments || []).filter((a) => a.status !== 'green').length;
  const p = rt.prompt, ev = rt.events[0];
  const chev = '<svg width="30" height="40" viewBox="0 0 30 40" aria-hidden="true" style="flex:none"><path class="flow" d="M2 20 H26" stroke="#4C7DD9" stroke-width="2" fill="none"/><path d="M20 13 L27 20 L20 27" stroke="#4C7DD9" stroke-width="2" fill="none"/></svg>';
  const stage = (n, name, s, c, href, on) => `<a class="stage ${on ? 'on' : ''}" style="--c:${c}" href="${href}"><b>${n}</b><span><span class="n">${esc(tr(name))}</span><span class="s">${esc(s)}</span></span></a>`;
  const act = p ? { due: true, k: `${tr('Routine prompt')} · ${tr('due now')}`, t: `${tr(p.title.split(': ')[0])}: ${tr(p.item.label)}`, w: p.why, b: tr('Start'), go: p.item.go }
    : ev ? { due: false, k: 'Re-check', t: ev.label, w: ev.why, b: tr('Measure now'), go: ev.go }
    : watch ? { due: false, k: 'Your next best step', t: t.coach.messages?.[0] || 'Review your watch items', w: 'From the Coach agent, checked by Safety.', b: 'See trends', go: '#/body' }
    : { due: false, k: 'All clear', t: measured === 6 ? 'All 6 measured and GO. Nothing to do right now.' : 'Nothing due right now.', w: `Next: ${rt.sessions.find((s) => s.done < s.items.length)?.name || 'tomorrow morning'}.`, b: 'Open check-in', go: '#/checkin' };
  const alerts = t.alerts.map((a) => `<a class="banner red rise" href="#/emergency/${a.case_id}">${icon('alert', '#fff', 28)}<span style="flex:1"><strong class="cond" style="font-size:17px;letter-spacing:.06em;text-transform:uppercase">Crew alert · Astronaut ${esc(a.who)}</strong><br><span style="opacity:.92">${esc(a.summary)}</span></span><span class="cond" style="font-weight:700">OPEN →</span></a>`).join('');

  el.innerHTML = `${alerts}
  <div class="ribbon">${[stage(1, 'Sense', `${measured} of 6 measured${measured < 6 ? ` · ${6 - measured} due` : ''}`, 'var(--bluet)', '#/checkin', false),
    stage(2, 'Understand', agents.length ? `${agents.length} agents on your last check` : 'waiting for a reading', 'var(--ok)', '#/office', agents.length > 0 && mine && Date.now() / 1000 - mine.ts < 90),
    stage(3, 'Act', p ? '1 prompt due now' : watch ? `${watch} to watch` : 'nothing due', 'var(--watch)', act.go, !!p),
    stage(4, 'Report', m.link_cut ? `${queued} held · no contact` : `${queued} queued · delay ${m.link.delay}`, m.link_cut ? 'var(--redt)' : '#CFE0FF', '#/earth', false)].join(chev)}</div>
  <div class="deck">
    <div class="card" style="padding:0;gap:0"><div class="tile"><div class="ptitle"><span>1 · ${esc(tr('Sense'))}</span><span class="mono small dim">${measured}/6 today</span></div></div>
      ${t.six.map((s, i) => `<a class="srow rise" style="animation-delay:${i * 60}ms" href="#/capture/${s.id}" aria-label="${esc(s.name)}: ${STATUS_WORD[s.status]}${s.measured_today ? '' : ', not measured today'}">${icon(s.icon, COL[s.status], 18)}
        <span><span style="display:block;font-weight:600;font-size:14.5px">${esc(tr(s.name))}</span><span class="mono">${s.value == null ? '—' : esc(typeof s.value === 'number' ? +s.value.toFixed(1) : s.value)} <span class="small dim">${esc(s.unit)}</span></span></span>
        ${spark(s.spark, COL[s.status])}${s.measured_today ? chip(s.status, STATUS_WORD[s.status]) : chip('blue', 'DUE')}</a>`).join('')}
      <div style="padding:12px 14px;border-top:1px solid var(--bd)"><div class="kicker" style="font-size:12px;margin-bottom:8px">${esc(tr('Capture · any way you like'))}</div>
        <button class="btn sm" id="sync" style="width:100%;margin-bottom:8px">${icon('chip', '#fff', 18)}${esc(tr('Sync devices'))} <span style="opacity:.75;text-transform:none;letter-spacing:0">(simulated)</span></button>
        <div class="capgrid"><button class="btn ghost" data-talk>${icon('mic', 'var(--bluet)', 18)}${esc(tr('Speak'))}</button><a class="btn ghost" href="#/checkin/2">${icon('camera', 'var(--bluet)', 18)}${esc(tr('Face · voice'))}</a>
        <a class="btn ghost" href="#/checkin/4">${icon('drop', 'var(--bluet)', 18)}${esc(tr('Scan pouch'))}</a><a class="btn ghost" href="#/capture/reaction">${icon('clock', 'var(--bluet)', 18)}${esc(tr('Reaction'))}</a></div></div>
      <a href="#/crew" style="margin-top:auto;padding:12px 14px;border-top:1px solid var(--bd);display:flex;align-items:center;gap:12px;text-decoration:none;color:inherit"><span class="cond" style="font-weight:700;color:var(--watch)">LVL ${t.level.level}</span><span class="xp" style="flex:1" title="${t.level.xp} / ${t.level.next} XP"><i style="width:${Math.round(t.level.xp / t.level.next * 100)}%"></i></span><span class="mono small muted">${t.streak}-day streak</span></a>
    </div>
    <div class="col" style="gap:12px">
      <div class="holo"><div class="kicker" style="position:absolute;left:0;top:0;font-size:12.5px">Astronaut ${esc(who)} · flight day ${t.day} · day ring ${rt.ring.done} of ${rt.ring.of} · readiness ${rt.readiness}%</div>
        <div class="kicker" style="position:absolute;right:0;top:0;font-size:12.5px;color:${COL[t.strain.status]}">strain ${t.strain.strain == null ? '—' : Math.round(t.strain.strain)} · alertness ${t.strain.alertness == null ? '—' : Math.round(t.strain.alertness)}</div>
        ${hologram(t.body_map, notes, rt.ring, outline)}${outline ? '' : '<a class="small" href="#/mirror" style="position:absolute;left:0;bottom:0">Scan yourself to make this your own body →</a>'}</div>
      <div class="card act ${act.due ? 'due' : ''}"><div style="flex:1"><div class="kicker" style="color:${act.due ? 'var(--redt)' : 'var(--watch)'};font-weight:700">3 · ${esc(tr('Act'))} · ${esc(act.k)}</div><div style="font-size:21px;font-weight:700;margin-top:2px">${esc(act.t)}</div><div class="small muted" style="margin-top:2px">${esc(act.w)}</div></div>
        <a class="btn ${act.due ? 'due' : ''}" href="${act.go}">${esc(act.b)}</a></div>
    </div>
    <div class="col" style="gap:12px">
      <div class="card" style="padding:0;gap:0;flex:1"><div class="tile"><div class="ptitle"><span>2 · ${esc(tr('Understand'))}</span><span class="mono small" style="color:var(--ok)">${agents.length} agents</span></div></div>
        <div style="padding:10px 10px 0">${miniTree(last.spans)}</div>
        <div style="padding:8px 14px 12px;display:flex;flex-direction:column;gap:8px">${agents.slice(-4).map((s, i) => `<div class="rise small" style="animation-delay:${200 + i * 140}ms;line-height:1.35"><span class="mono dim" style="font-size:11.5px">${esc(s.started)}</span> <strong>${esc(s.agent)}</strong> <span class="muted">${esc(plain(s.result).slice(0, 70))}</span></div>`).join('') || '<span class="small muted">No decisions yet today. Take a reading and watch the agents work.</span>'}</div>
        <a class="cond small" style="margin:auto 14px 12px;color:var(--bluet)" href="${mine ? `#/office/${mine.case_id}` : '#/office'}">OPEN FULL AGENT TREE →</a></div>
      <a class="card" href="#/earth" style="padding:0;gap:0;text-decoration:none;color:inherit"><div class="tile"><div class="ptitle"><span>4 · ${esc(tr('Report'))} · ${esc(tr('Earth link'))}</span>${chip(m.space_weather.status, m.space_weather.status === 'green' ? 'SWX CALM' : m.space_weather.status === 'amber' ? 'SWX WATCH' : 'SWX STORM')}</div></div>
        <svg viewBox="0 0 310 64" width="100%" aria-hidden="true"><defs><radialGradient id="deg" cx=".35" cy=".35"><stop offset="0" stop-color="#93C5FD"/><stop offset="1" stop-color="#1D4ED8"/></radialGradient><radialGradient id="dmg" cx=".35" cy=".35"><stop offset="0" stop-color="#FCA5A5"/><stop offset="1" stop-color="#B91C1C"/></radialGradient></defs>
          <path id="dlk" d="M30 38 Q155 -6 280 38" fill="none" stroke="#2A4682" stroke-dasharray="2 6"/><circle cx="30" cy="38" r="13" fill="url(#dmg)"/><circle cx="280" cy="38" r="17" fill="url(#deg)"/>
          ${queued && !m.link_cut ? `<circle r="4.5" fill="#FBBF24"><animateMotion dur="${m.link.live ? 1.6 : 5}s" repeatCount="indefinite"><mpath href="#dlk"/></animateMotion></circle>` : ''}</svg>
        <div class="row mono small" style="justify-content:space-between;padding:2px 14px 12px"><span class="${m.link_cut ? '' : 'muted'}" style="${m.link_cut ? 'color:var(--redt)' : ''}">${m.link_cut ? 'NO CONTACT' : `delay ${esc(m.link.delay)}`}</span><span>${queued} queued</span><span class="muted">${esc(m.link.label)}</span></div></a>
    </div>
  </div>
  <div class="card" style="padding:0;gap:0"><div class="tile"><div class="ptitle"><span>${esc(tr('Today · your day is the menu'))}</span><span class="mono small dim">morning check ${esc(rt.sessions[0].at)} (learned) · evening check 21:00 · tap a block</span></div></div><div style="padding:6px 14px 4px">${timeline(rt)}</div></div>`;
  el.querySelectorAll('.mk').forEach((g) => { const go = () => { location.hash = `#/body/${PART_GO[g.dataset.part]}`; }; g.onclick = go; g.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') go(); }; });
  el.querySelector('#sync').onclick = async (e) => {
    e.currentTarget.disabled = true;
    const r = await api.post('/api/devices/sync', { who });
    toast(esc(r.message) + (r.case_id ? ` <a href="#/office/${r.case_id}">Agent tree</a>` : ''));
    if (r.handoff) location.hash = `#/emergency/${r.case_id}`; else render(el, { state });
  };
  el.querySelector('[data-talk]').onclick = () => document.getElementById('talkbtn')?.click();
}
