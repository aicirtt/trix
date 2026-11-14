import { api } from '../api.js';
import { esc, icon, chip, figure, PARTS, level, levelStatus, STATUS_WORD } from '../ui.js';

const PART_OF = { bp: 'heart', hr: 'heart', orthostatic: 'heart', hrv: 'brain', sleep: 'brain', mood: 'brain', fatigue: 'brain',
  spo2: 'lungs', co2: 'lungs', temp: 'immune', skin: 'immune', glucose: 'gut', fluid: 'gut', vision: 'eyes', bone: 'bones',
  calcium: 'bones', rad_daily: 'rad', rad_career: 'rad' };
const TASK_LINK = { checkin: '#/checkin', food: '#/checkin/4', vision: '#/checkin/3', buddy: '#/crew' };

export async function render(el, { state }) {
  const [t, ind] = await Promise.all([api.get(`/api/today/${state.who}`), api.get('/api/indicators')]);
  const kb = Object.fromEntries(ind.indicators.map((i) => [i.id, i]));
  const worst = ['red', 'amber'].find((s) => Object.values(t.body_map).some((p) => p.status === s));
  let sel = worst ? PARTS.find((p) => (t.body_map[p.id] || {}).status === worst).id : 'heart';
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  function partPanel() {
    const p = PARTS.find((x) => x.id === sel);
    const st = (t.body_map[sel] || {}).status || 'none';
    const inds = Object.keys(PART_OF).filter((k) => PART_OF[k] === sel);
    const ass = Object.fromEntries((t.assessments || []).map((a) => [a.indicator, a]));
    const rows = inds.map((k) => {
      const i = kb[k]; if (!i) return '';
      const a = ass[k];
      const col = k === 'bp' ? 'sys' : k === 'mood' ? 'mood_raw' : k;
      const lv = t.latest[col];
      const val = k === 'bp' && t.latest.sys ? `${Math.round(t.latest.sys.value)}/${Math.round(t.latest.dia?.value ?? 0)}` :
        lv ? (typeof lv.value === 'number' ? +lv.value.toFixed(1) : esc(lv.value)) : '—';
      return `<a class="li" href="#/body/${k}" style="text-decoration:none;color:inherit">
        <span style="flex:1;min-width:0"><span style="display:block;font-weight:700">${esc(i.name)}</span>
        <span class="small muted">${a && a.reasons?.length ? esc(a.reasons[0]) : lv ? `Last: day ${lv.day} · ${esc(lv.source)}` : 'Not measured yet'}</span></span>
        <span class="mono" style="font-size:18px">${val} <span class="dim small">${esc(i.unit)}</span></span>${a ? chip(a.status) : chip('none', lv ? 'Not checked today' : 'No data')}</a>`;
    }).join('');
    const first = kb[inds[0]];
    return `<div class="card rise" style="border-color:${st === 'red' ? 'rgba(239,68,68,.6)' : st === 'amber' ? 'rgba(245,158,11,.5)' : 'var(--bd)'}">
      <div class="head"><div><h2>${esc(p.name)}</h2><div class="sub small">${t.body_map[sel] ? esc(level(t.body_map[sel].level)) : 'No reading yet'}</div></div>${chip(st)}</div>
      <div class="list">${rows}</div>
      ${first ? `<div class="note"><span class="lbl">In space</span><br>${esc(first.space_effect)}<br><span class="dim small">NASA: ${esc(first.hazard)} → ${esc(first.risk)}</span></div>` : ''}
    </div>`;
  }

  function draw() {
    const alerts = t.alerts.map((a) => `<a class="banner red rise" href="#/emergency/${a.case_id}">${icon('alert', '#fff', 30)}<span style="flex:1"><strong style="font-size:19px">Crew alert: Astronaut ${esc(a.who)}</strong><br><span style="opacity:.9">${esc(a.summary)}</span></span><span style="font-weight:800">Open →</span></a>`).join('');
    const tasks = t.tasks.map((k, i) => `<a class="li rise" style="animation-delay:${i * 70}ms;text-decoration:none;color:inherit" href="${TASK_LINK[k.kind] || `#/body/${k.kind}`}">
      <span class="mono dim" style="width:72px;flex:none">${esc(k.time)}</span>
      <span style="flex:1"><span style="display:block;font-weight:700;${k.done ? 'text-decoration:line-through;color:var(--t3)' : ''}">${esc(k.title)}</span><span class="small muted">${esc(k.why)}</span></span>
      ${k.done ? chip('green', 'Done') : icon('arrow', 'var(--t3)', 20)}</a>`).join('');
    el.innerHTML = `${alerts}
    <div class="head"><div><h1>${greet}, ${esc(t.crew.name)}</h1><div class="sub">Mission day ${t.day} · ${t.checked_in_today ? 'Checked in today' : 'Morning check-in not done yet'}</div></div>
      <div class="row" style="gap:10px;align-items:center"><span class="chip amber">${icon('flame', 'var(--ambt)', 16)}${t.streak}-day streak</span>
      <a class="btn" href="#/checkin">${icon('checkin', '#fff', 20)}${t.checked_in_today ? 'Check in again' : 'Start check-in'}</a></div></div>
    <div class="row">
      <div class="card bodycard" style="flex:none;width:340px;align-items:center">
        <div class="head" style="width:100%"><h2>Your body today</h2></div>
        ${figure(t.body_map, sel)}
        <div class="row small muted" style="gap:12px;justify-content:center">${['green', 'amber', 'red', 'none'].map((s) => `<span style="display:flex;gap:6px;align-items:center"><span class="tdot" style="background:${{ green: 'var(--teal)', amber: 'var(--amb)', red: 'var(--alert)', none: 'var(--none)' }[s]}"></span>${STATUS_WORD[s]}</span>`).join('')}</div>
      </div>
      <div class="col grow" id="part">${partPanel()}</div>
      <div class="col" style="width:380px;flex:none;max-width:100%">
        <div class="card"><div class="head"><h2>Today</h2><span class="small dim">Reminder ${esc(t.reminder.slot)} · learned</span></div><div class="list">${tasks}</div></div>
        <div class="card"><h3>TRIX says</h3>${(t.coach.messages || []).map((m) => `<div class="note" style="color:var(--t1)">${esc(m)}</div>`).join('')}
          <a class="small" href="#/crew">Buddy today: Astronaut ${esc(t.buddy)} →</a></div>
      </div>
    </div>`;
    el.querySelectorAll('[data-part]').forEach((b) => b.onclick = () => { sel = b.dataset.part; draw(); });
  }
  draw();
}
