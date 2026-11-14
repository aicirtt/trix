import { api } from '../api.js';
import { esc, icon, chip, figure, PARTS, level, STATUS_WORD } from '../ui.js';

const PART_OF = { bp: 'heart', hr: 'heart', orthostatic: 'heart', hrv: 'brain', sleep: 'brain', mood: 'brain', fatigue: 'brain',
  spo2: 'lungs', co2: 'lungs', temp: 'immune', skin: 'immune', glucose: 'gut', fluid: 'gut', vision: 'eyes', bone: 'bones',
  calcium: 'bones', rad_daily: 'rad', rad_career: 'rad' };
const COL = { green: 'var(--ok)', amber: 'var(--watch)', red: 'var(--alert)', none: 'var(--none)' };
const TASK_LINK = { checkin: '#/checkin', food: '#/checkin/4', vision: '#/checkin/3', buddy: '#/crew' };
const FIELD = { bp: 'sys', hr: 'hr', glucose: 'glucose', temp: 'temp', sleep: 'sleep', mood: 'mood' };

function spark(vals, color, w = 130, h = 34) {
  if (vals.length < 2) return '';
  const lo = Math.min(...vals), hi = Math.max(...vals), rng = hi - lo || 1;
  const pts = vals.map((v, i) => [i * w / (vals.length - 1), h - 4 - (v - lo) / rng * (h - 8)]);
  const [lx, ly] = pts[pts.length - 1];
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><polyline class="draw" points="${pts.map((p) => p.join(',')).join(' ')}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linejoin="round"/><circle cx="${lx}" cy="${ly}" r="3.5" fill="${color}"/></svg>`;
}

function timeline(tasks) {
  const m = (t) => { const [h, mm] = t.split(':').map(Number); return h * 60 + mm; };
  const lo = m('06:00'), hi = m('22:00');
  const slot = tasks[0]?.time || '07:40';
  const blocks = [['06:00', slot, 'Post-sleep', 'var(--bd2)'], [slot, '08:00', 'Health check-in', 'var(--nred)', '#/checkin'], ['08:00', '09:30', 'Exercise · ARED', 'var(--bd2)'],
    ['09:30', '12:30', 'Payload ops', 'var(--bd)'], ['12:30', '13:00', 'Lunch · log water', 'var(--bd2)', '#/checkin/4'], ['13:00', '13:15', 'Vision grid', 'var(--blue)', '#/checkin/3'],
    ['13:15', '17:00', 'Maintenance', 'var(--bd)'], ['17:00', '18:00', 'Exercise · CEVIS', 'var(--bd2)'], ['18:00', '21:00', 'Crew time · buddy check', 'var(--bd)', '#/crew'], ['21:00', '22:00', 'Pre-sleep', 'var(--bd2)']];
  const now = new Date(), nm = now.getUTCHours() * 60 + now.getUTCMinutes();
  const pct = (x) => (x - lo) / (hi - lo) * 100;
  return `<div class="tl">${blocks.filter(([a, b]) => m(b) > m(a)).map(([a, b, n, c, href]) => `<a class="blk" ${href ? `href="${href}"` : 'tabindex="-1"'} title="${a}–${b} ${esc(n)}" style="left:${pct(m(a))}%;width:${pct(m(b)) - pct(m(a))}%;background:${c}">${esc(n)}</a>`).join('')}
    ${[6, 8, 10, 12, 14, 16, 18, 20].map((h) => `<span class="tick" style="left:${pct(h * 60)}%">${String(h).padStart(2, '0')}:00</span>`).join('')}
    ${nm >= lo && nm <= hi ? `<div class="now" style="left:${pct(nm)}%"><span>NOW</span></div>` : ''}</div>`;
}

export async function render(el, { state, go }) {
  const [t, ind] = await Promise.all([api.get(`/api/today/${state.who}`), api.get('/api/indicators')]);
  const kb = Object.fromEntries(ind.indicators.map((i) => [i.id, i]));
  const worst = ['red', 'amber'].find((s) => Object.values(t.body_map).some((p) => p.status === s));
  let sel = worst ? PARTS.find((p) => (t.body_map[p.id] || {}).status === worst)?.id : null;
  const due = t.six.filter((s) => !s.measured_today);
  const roles = { A: 'FE', B: 'CDR', C: 'PLT' };

  function partPanel() {
    if (!sel) return '';
    const p = PARTS.find((x) => x.id === sel);
    const st = (t.body_map[sel] || {}).status || 'none';
    const ass = Object.fromEntries((t.assessments || []).map((a) => [a.indicator, a]));
    const inds = Object.keys(PART_OF).filter((k) => PART_OF[k] === sel && kb[k]);
    return `<div class="card rise"><div class="head"><h2>${icon(p.icon, COL[st], 18)} ${esc(p.name)}</h2><span class="row" style="gap:8px">${chip(st, STATUS_WORD[st])}<button class="btn ghost sm" id="closepart" aria-label="Close">Close</button></span></div>
      <div class="list">${inds.map((k) => { const a = ass[k]; const col = k === 'bp' ? 'sys' : k === 'mood' ? 'mood_raw' : k; const lv = t.latest[col];
        return `<a class="li" href="#/body/${k}" style="text-decoration:none;color:inherit"><span style="flex:1"><strong>${esc(kb[k].name)}</strong><br><span class="small muted">${a && a.reasons?.length ? esc(a.reasons[0]) : lv ? `Last: day ${lv.day}` : 'Not measured yet'}</span></span><span class="mono">${lv ? (typeof lv.value === 'number' ? +lv.value.toFixed(1) : esc(lv.value)) : '—'} <span class="dim small">${esc(kb[k].unit)}</span></span>${a ? chip(a.status, STATUS_WORD[a.status]) : chip('none', lv ? 'NOT TODAY' : 'NO DATA')}</a>`; }).join('')}</div>
      <div class="note small">${esc(kb[inds[0]]?.space_effect || '')}</div></div>`;
  }

  function draw() {
    const alerts = t.alerts.map((a) => `<a class="banner red rise" href="#/emergency/${a.case_id}">${icon('alert', '#fff', 28)}<span style="flex:1"><strong class="cond" style="font-size:17px;letter-spacing:.06em;text-transform:uppercase">Crew alert · Astronaut ${esc(a.who)}</strong><br><span style="opacity:.92">${esc(a.summary)}</span></span><span class="cond" style="font-weight:700">OPEN →</span></a>`).join('');
    const tiles = t.six.map((s, i) => {
      const c = COL[s.status];
      return `<div class="card tile rise" style="animation-delay:${i * 80}ms">
        <div class="ptitle"><span>${icon(s.icon, c, 16)}${esc(s.name)}</span>${chip(s.status, STATUS_WORD[s.status])}</div>
        <div class="pbody"><div class="row" style="justify-content:space-between;align-items:flex-end;gap:8px"><span><span class="val">${s.value == null ? '—' : esc(typeof s.value === 'number' ? +s.value.toFixed(1) : s.value)}</span> <span class="mono small dim">${esc(s.unit)}</span></span>${spark(s.spark, c)}</div>
          <div class="small muted" style="line-height:1.45;min-height:38px">${esc(s.why)}</div>
          <div class="row small dim" style="justify-content:space-between">${s.measured_today ? `<span style="color:var(--ok)">${icon('check', 'var(--ok)', 14, 3)} Measured today</span>` : '<span>Not measured today</span>'}<span>${s.last_day != null ? `day ${s.last_day}` : ''}</span></div>
          <a class="btn ${s.measured_today ? 'ghost' : 'due'} sm" style="margin-top:auto" href="${s.measured_today ? `#/body/${s.id}` : `#/checkin/1/${FIELD[s.id]}`}">${s.measured_today ? 'Trend' : 'Measure now'}</a></div></div>`;
    }).join('');
    const lvl = t.level;
    el.innerHTML = `${alerts}
    <div class="ctop">
      <div style="flex:1;min-width:260px"><div class="kicker">Self-assessment · flight day ${t.day} · ${roles[t.who] || ''}</div><h1>How are you today, ${esc(t.crew.name)}?</h1></div>
      <a class="card" href="${due.length ? `#/checkin/1/${FIELD[due[0].id]}` : '#/checkin'}" style="text-decoration:none;color:inherit">${due.length ? `<span class="blink" style="width:10px;height:10px;background:var(--nred)"></span><span class="cond" style="font-weight:700;letter-spacing:.07em;text-transform:uppercase">Measurement due</span><span class="mono muted">${esc(due.map((d) => d.name).slice(0, 2).join(' · '))}${due.length > 2 ? ` +${due.length - 2}` : ''}</span>` : `${icon('check', 'var(--ok)', 18, 3)}<span class="cond" style="font-weight:700;letter-spacing:.07em;text-transform:uppercase">All 6 measured today</span>`}</a>
      <a class="card" href="#/crew" style="text-decoration:none;color:inherit"><span class="cond" style="font-weight:700;color:var(--watch);letter-spacing:.07em">LVL ${lvl.level}</span><span class="xp" title="${lvl.xp} / ${lvl.next} XP"><i style="width:${Math.round(lvl.xp / lvl.next * 100)}%"></i></span><span class="mono small muted">${t.streak}-day streak</span></a>
    </div>
    <div class="row">
      <div class="card bodycard" style="flex:none;width:330px;padding:0;gap:0">
        <div class="tile"><div class="ptitle"><span>Body map · tap to inspect</span>${chip(worst || 'green', STATUS_WORD[worst || 'green'])}</div></div>
        <div style="padding:10px 0 4px;display:flex;justify-content:center"><div style="transform:scale(.88);transform-origin:top center;height:500px">${figure(t.body_map, sel)}</div></div>
        <div class="row small muted" style="gap:12px;justify-content:center;padding-bottom:12px">${['green', 'amber', 'red', 'none'].map((s) => `<span class="row" style="gap:6px;align-items:center"><span class="tdot" style="background:${COL[s]}"></span>${STATUS_WORD[s]}</span>`).join('')}</div>
      </div>
      <div class="col grow">
        <div id="part">${partPanel()}</div>
        <div class="cgrid">${tiles}</div>
      </div>
    </div>
    <div class="row">
      <div class="card grow" style="padding:0;gap:0"><div class="tile"><div class="ptitle"><span>Crew timeline · flight day ${t.day}</span><span class="mono small dim">Reminder ${esc(t.reminder.slot)} · learned (${Math.round((t.reminder.p_respond || 0) * 100)}% response)</span></div></div><div style="padding:6px 14px 4px">${timeline(t.tasks)}</div></div>
      <div class="card" style="width:380px;flex:none;max-width:100%"><h2>TRIX advisory</h2>${(t.coach.messages || []).map((m) => `<div class="note" style="color:var(--t1)">${esc(m)}</div>`).join('')}
        <div class="list">${t.tasks.filter((k) => !k.done).slice(0, 3).map((k) => `<a class="li" href="${TASK_LINK[k.kind] || `#/body/${k.kind}`}" style="text-decoration:none;color:inherit"><span class="mono dim small" style="width:62px">${esc(k.time)}</span><span style="flex:1">${esc(k.title)}</span>${icon('arrow', 'var(--t3)', 18)}</a>`).join('')}</div></div>
    </div>`;
    el.querySelectorAll('[data-part]').forEach((b) => b.onclick = () => { sel = sel === b.dataset.part ? null : b.dataset.part; draw(); });
    el.querySelector('#closepart')?.addEventListener('click', () => { sel = null; draw(); });
  }
  draw();
}
