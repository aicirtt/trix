import { api } from '../api.js';
import { esc, icon, chip, ring, animateRings, toast } from '../ui.js';
import * as homemsg from '../homemsg.js';

const PRIV = [
  ['vitals_summary', 'Share daily vitals summary with Earth', 'Heart rate, blood pressure, sleep totals'],
  ['mood_details', 'Share mood details', 'Off: Earth gets a weekly score only'],
  ['voice_recordings', 'Keep voice recordings', 'Off: only the words TRIX understood are kept'],
  ['face_video', 'Keep face-check video', 'Off: only eye measurements are kept'],
  ['crew_can_see_status', 'Crew can see my status colours', 'Used for buddy checks'],
  ['scan_photos', 'Keep my body-scan photos', 'On board only, never sent to Earth. Off: outline only'],
];

export async function render(el, { state }) {
  const who = state.who;
  const [c, pv] = await Promise.all([api.get('/api/crew'), api.get(`/api/privacy/${who}`)]);
  const mine = c.buddy.find((b) => b.who === who);
  const g = c.team_goal;
  el.innerHTML = `
  <div class="head"><div><h1>Crew</h1><div class="sub">Streaks, team goal, buddy check and your privacy</div></div><a class="btn ghost sm" href="#/setup/0">Run setup again</a></div>
  <div class="grid3">${c.board.map((p, i) => `<div class="card rise" style="animation-delay:${i * 90}ms;${p.who === who ? 'border-color:var(--bluet)' : ''}">
    <div class="row" style="align-items:center;gap:12px"><span class="avatar" style="width:48px;height:48px;font-size:20px">${p.who}</span><div style="flex:1"><h3>${esc(p.name)}</h3><span class="small muted">${esc(p.role)}</span></div></div>
    <div class="row" style="gap:10px"><span class="chip amber">${icon('flame', 'var(--ambt)', 16)}${p.streak} days</span><span class="chip blue">${icon('star', 'var(--bluet)', 16)}${p.points} pts</span></div>
    <div class="row" style="gap:6px">${p.badges.map((b) => `<span class="tag" title="${esc(b.how)}" style="${b.got ? 'color:var(--ambt);border-color:rgba(245,158,11,.5)' : 'opacity:.55'}">${b.got ? '★ ' : ''}${esc(b.name)}</span>`).join('')}</div></div>`).join('')}</div>
  <div class="row">
    <div class="card" style="flex:none;width:320px;align-items:center;text-align:center"><h2>Team goal</h2>${ring(g.pct / 100, '#60A5FA', 150, 'Team goal')}<div class="muted">${esc(g.name)}</div><div class="mono">${g.done} / ${g.total} check-ins</div></div>
    <div class="card" style="flex:none;width:300px"><div class="head"><h2>Crew cohesion</h2>${chip(c.cohesion.status, c.cohesion.status === 'green' ? 'Steady' : 'Watch')}</div>
      <div class="mono" style="font-size:40px;font-weight:700">${c.cohesion.score}<span class="small dim">/100</span></div>
      <div class="kv small"><span class="lbl">Crew mood</span><span class="mono">${c.cohesion.mood_now ?? '—'} / 5</span><span class="lbl">vs last week</span><span class="mono">${c.cohesion.trend == null ? '—' : (c.cohesion.trend > 0 ? '+' : '') + c.cohesion.trend}</span><span class="lbl">Buddy concerns</span><span class="mono">${c.cohesion.buddy_concerns}</span></div>
      <p class="small muted" style="margin:0">${esc(c.cohesion.message)} Crew-level only: nobody's details are shown.</p></div>
    <div class="card grow"><h2>Buddy check</h2>
      ${mine ? `<p style="margin:0;font-size:18px">Today you check on <strong>Astronaut ${esc(mine.buddy)}</strong>. Ask how they slept and how they feel.</p>
      ${mine.done ? chip('green', `Done · ${mine.status === 'ok' ? 'they are OK' : 'concern raised'}`) : `<div class="field"><label for="note">Note (optional)</label><input class="input" id="note" placeholder="Slept badly, a bit quiet today"></div>
      <div class="row" style="gap:10px"><button class="btn" data-b="ok">${icon('check', '#fff')}They're OK</button><button class="btn ghost" data-b="concern">${icon('alert')}I'm worried about them</button></div>`}` : ''}
      <div class="list">${c.buddy.map((b) => `<div class="li"><span style="flex:1">Astronaut ${esc(b.who)} → Astronaut ${esc(b.buddy)}</span>${b.done ? chip(b.status === 'ok' ? 'green' : 'amber', b.status === 'ok' ? 'OK' : 'Concern') : chip('none', 'Not yet')}</div>`).join('')}</div>
      <div class="small dim">Pairs rotate every day. “I'm worried” sends a private note to the crew medical officer.</div></div>
  </div>
  <div id="homemsgs"></div>
  <div class="card"><div class="head"><h2>${icon('lock', 'var(--bluet)', 22)} My privacy · Astronaut ${esc(who)}</h2><span class="small dim">${esc(pv.rules.join(' '))}</span></div>
    ${PRIV.map(([k, t, s]) => `<div class="toggle"><span><strong>${t}</strong><br><span class="small muted">${s}</span></span><span class="switch"><input type="checkbox" data-p="${k}" ${pv.settings[k] ? 'checked' : ''} aria-label="${esc(t)}"><span></span></span></div>`).join('')}</div>`;
  animateRings(el);
  homemsg.mount(el.querySelector('#homemsgs'), who);
  el.querySelectorAll('[data-b]').forEach((b) => b.onclick = async () => {
    await api.post('/api/buddy', { who, buddy: mine.buddy, status: b.dataset.b, note: el.querySelector('#note')?.value || '' });
    toast(b.dataset.b === 'ok' ? 'Buddy check logged.' : 'Concern sent privately to the crew medical officer.');
    render(el, { state });
  });
  el.querySelectorAll('[data-p]').forEach((i) => i.onchange = async () => {
    await api.post(`/api/privacy/${who}`, { [i.dataset.p]: i.checked });
    toast('Privacy setting saved. It applies to every report sent to Earth.');
  });
}
