// Mission replay: scrub the simulated mission and see when TRIX caught each problem, against fixed limits.
import { api } from '../api.js';
import { esc, icon, chip, hologram } from '../ui.js';

const ST = ['green', 'amber', 'red'];

export async function render(el, { state }) {
  const who = state.who;
  const r = await api.get(`/api/replay/${who}`);
  let day = 150, timer = null;
  const W = 900, L = 250, R = 14, rowH = 34;
  const X = (d) => L + d / (r.days - 1) * (W - L - R);
  const mapAt = (d) => Object.fromEntries(Object.entries(r.parts).map(([p, a]) => { let v = 0; for (let k = Math.max(0, d - 2); k <= d; k++) v = Math.max(v, a[k]); return [p, { status: ST[v] }]; }));
  const found = r.events.filter((e) => e.trix_day != null).length, fixed = r.events.filter((e) => e.fixed_day != null).length;
  const leads = r.events.filter((e) => e.lead > 0);

  const chart = () => `<svg viewBox="0 0 ${W} ${40 + r.events.length * rowH}" width="100%" role="img" aria-label="Timeline of planted problems and when each was first caught">
    ${[0, 60, 120, 180, 239].map((d) => `<line x1="${X(d)}" x2="${X(d)}" y1="18" y2="${30 + r.events.length * rowH}" stroke="#1C3263"/><text x="${X(d)}" y="12" text-anchor="${d > 200 ? 'end' : 'middle'}" font-size="11" fill="#8396BA" class="mono">day ${d}</text>`).join('')}
    ${r.events.map((e, i) => { const y = 30 + i * rowH;
      return `<text x="0" y="${y + 15}" font-size="13" fill="#F4F7FC">${esc(e.name.length > 34 ? `${e.name.slice(0, 33)}…` : e.name)}</text>
      <rect x="${X(e.start)}" y="${y + 4}" width="${Math.max(4, X(e.end) - X(e.start))}" height="14" fill="#2A4682"/>
      ${e.fixed_day != null ? `<path d="M${X(e.fixed_day)} ${y + 22} l-6 9 h12 z" fill="#FBBF24"><title>Fixed limits: day ${e.fixed_day}</title></path>` : ''}
      ${e.trix_day != null ? `<path d="M${X(e.trix_day)} ${y + 2} l-6 -9 h12 z" fill="#2DD4BF" transform="translate(0,9)"><title>TRIX: day ${e.trix_day}</title></path>` : ''}`; }).join('')}
    <line id="cursor" x1="${X(day)}" x2="${X(day)}" y1="16" y2="${34 + r.events.length * rowH}" stroke="#FC3D21" stroke-width="2"/></svg>`;

  function draw() {
    const active = r.events.filter((e) => day >= e.start && day <= e.end);
    el.querySelector('#holo').innerHTML = hologram(mapAt(day), {}, null);
    el.querySelector('#daylab').textContent = `Flight day ${day}`;
    el.querySelector('#cursor')?.setAttribute('x1', X(day)); el.querySelector('#cursor')?.setAttribute('x2', X(day));
    el.querySelector('#now').innerHTML = active.length ? active.map((e) => { const tx = e.trix_day != null && day >= e.trix_day, fx = e.fixed_day != null && day >= e.fixed_day;
      return `<div class="note" style="color:var(--t1)"><strong>${esc(e.name)}</strong><br><span class="small">${tx ? `<span style="color:var(--ok)">TRIX flagged it on day ${e.trix_day}</span>` : '<span class="muted">TRIX: not flagged yet</span>'} · ${fx ? `<span style="color:var(--watch)">fixed limits flagged it on day ${e.fixed_day}</span>` : `<span class="muted">fixed limits: ${e.fixed_day == null ? 'never flag it' : 'not yet'}</span>`}</span></div>`; }).join('') : '<span class="muted">No planted problem is active on this day.</span>';
  }

  el.innerHTML = `
  <div class="head"><div><div class="kicker">Simulated mission · Astronaut ${esc(who)} · ${r.days} days · ${r.events.length} planted problems</div><h1>Mission replay: when was each problem caught?</h1></div>
    <div class="row" style="gap:8px">${chip('green', `TRIX ${found}/${r.events.length}`)}${chip('amber', `FIXED LIMITS ${fixed}/${r.events.length}`)}<a class="btn ghost sm" href="#/sim">${icon('back')}Simulator</a></div></div>
  <div class="row">
    <div class="card" style="width:430px;flex:none;max-width:100%"><div class="head"><h2 id="daylab">Flight day ${day}</h2><button class="btn sm" id="play">${icon('play', '#fff', 16)}Play</button></div><div class="holo" id="holo"></div></div>
    <div class="col grow"><div class="card"><div class="head"><h2>Problems over the mission</h2><span class="row small muted" style="gap:14px"><span><span style="color:#2DD4BF">▼</span> TRIX first flag</span><span><span style="color:#FBBF24">▲</span> fixed limits first flag</span><span><span style="color:#FC3D21">|</span> today</span></span></div>
        ${chart()}<label class="sr" for="day">Flight day</label><input type="range" id="day" min="0" max="${r.days - 1}" value="${day}" style="width:100%"></div>
      <div class="card"><h2>On this day</h2><div id="now" class="col" style="gap:8px"></div></div>
      <div class="card"><h2>What this shows</h2><div style="font-size:18px;font-weight:700">${leads.length ? leads.map((e) => `${esc(e.name.split(' (')[0])}: ${e.lead} days earlier`).join(' · ') : 'TRIX and fixed limits flagged the acute problems on the same day.'}</div>
        <div class="muted" style="line-height:1.5">Sudden problems (fever, irregular heartbeat) are caught by both. Slow ones (bone loss, rising blood pressure, mood decline) are where comparing each astronaut with their own normal pays off. ${esc(r.note)}</div></div></div>
  </div>`;
  draw();
  el.querySelector('#day').oninput = (e) => { day = +e.target.value; draw(); };
  el.querySelector('#play').onclick = () => { clearInterval(timer); if (day >= r.days - 1) day = 0; timer = setInterval(() => { day += 2; if (day >= r.days - 1) { day = r.days - 1; clearInterval(timer); } el.querySelector('#day').value = day; draw(); }, 80); };
  return () => clearInterval(timer);
}
