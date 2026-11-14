// Guided capture of one measurement: how to measure, what it means, why it matters. Then: what you get back.
import { api } from '../api.js';
import { t } from '../i18n.js';
import { esc, icon, chip, ring, animateRings, limitBar, lineChart, toast, speak } from '../ui.js';

const WORD_ST = { GO: 'green', WATCH: 'amber', 'NO-GO': 'red' };

export async function render(el, { params, state, go }) {
  const who = state.who, ind = params[0] || 'hr';
  let info;
  try { info = await api.get(`/api/capture/${who}/${ind}`); } catch (e) { go('#/checkin'); return undefined; }
  let timers = [], stopped = false;
  const cleanup = () => { stopped = true; timers.forEach(clearTimeout); speechSynthesis?.cancel?.(); };
  const lastTxt = info.last ? `Last: ${typeof info.last.value === 'number' ? +info.last.value.toFixed(1) : info.last.value} ${info.unit} · day ${info.last.day}` : 'No earlier reading';

  const input = ind === 'bp'
    ? `<div class="row" style="gap:10px;align-items:center;justify-content:center"><label class="sr" for="v-sys">Top number</label><input class="input bigin" id="v-sys" inputmode="decimal" placeholder="120" style="max-width:190px"><span class="mono" style="font-size:44px">/</span><label class="sr" for="v-dia">Bottom number</label><input class="input bigin" id="v-dia" inputmode="decimal" placeholder="80" style="max-width:190px"></div>`
    : ind === 'mood' ? `<div class="seg" role="group" aria-label="Mood 1 to 5" style="display:flex">${[1, 2, 3, 4, 5].map((m) => `<button type="button" data-pick="${m}" style="flex:1;min-height:70px;font-size:16px">${m}<br>${['', 'Very low', 'Low', 'OK', 'Good', 'Great'][m]}</button>`).join('')}</div>`
    : ind === 'back_pain' ? `<div class="seg" role="group" aria-label="Pain 0 to 10" style="display:flex;flex-wrap:wrap">${Array.from({ length: 11 }, (_, m) => `<button type="button" data-pick="${m}" style="flex:1;min-width:44px;min-height:60px;font-size:18px">${m}</button>`).join('')}</div>`
    : ind === 'reaction' ? `<button type="button" class="rxpad" id="rx">Tap here to start<br><span class="small muted" style="font-weight:400">8 rounds · about 40 seconds</span></button><div id="rxlog" class="mono small muted" style="min-height:20px"></div>`
    : `<label class="sr" for="v">${esc(info.name)}</label><input class="input bigin" id="v" inputmode="decimal" placeholder="—" autocomplete="off">`;

  el.innerHTML = `
  <div class="head"><div><div class="kicker">Guided measurement · about ${info.minutes < 1 ? 'half a' : info.minutes} minute${info.minutes > 1 ? 's' : ''} · ${esc(info.devices[0])}</div><h1>${esc(t(info.label))}</h1></div>
    <a class="btn ghost sm" href="#/today">${icon('back')}Deck</a></div>
  <div class="row">
    <div class="col" style="flex:1.15;min-width:320px">
      <div class="card" style="flex:1"><div class="head"><h2>${esc(t('1 · How to measure'))}</h2><button class="btn ghost sm" id="read">${icon('mic')}${esc(t('Read it to me'))}</button></div>
        ${info.howto.map((s, i) => `<div class="hstep ${i === 1 ? 'now' : i === 0 ? 'done' : ''}"><b>${i + 1}</b><span>${esc(t(s))}</span></div>`).join('')}</div>
      <div class="card"><div class="head"><h2>${esc(t('Reading'))}</h2><span class="mono small dim">${esc(lastTxt)}</span></div>${input}
        ${ind === 'reaction' ? '' : `<div class="row" style="justify-content:space-between;align-items:center"><span class="col" style="gap:6px"><span class="mono muted">${esc(info.unit)}</span>${info.sim_device ? `<button class="btn ghost sm" id="dev">${icon('chip')}Read from ${esc(info.sim_device)}</button><span class="small dim">Simulated device for the demo</span>` : ''}</span><button class="btn big" id="save">${icon('check', '#fff', 22)}${esc(t('Done · save'))}</button></div>`}<div id="err" class="small" style="color:var(--redt)" role="alert"></div></div>
    </div>
    <div class="col" style="flex:1;min-width:300px">
      <div class="card"><h2>${esc(t('2 · What the number means'))}</h2><div id="mean" class="muted" style="line-height:1.5">Green is GO, amber is WATCH, red is NO-GO. TRIX also compares the reading with your own usual range.</div>${limitBar(info.limits, null)}</div>
      <div class="card" style="flex:1"><h2>${esc(t('3 · Why it matters in space'))}</h2><div style="line-height:1.55">${esc(info.why)}</div>${info.source ? `<div class="small"><a href="${esc(info.source.url)}" target="_blank" rel="noopener">${esc(info.source.title)}</a></div>` : ''}</div>
      <div class="card" style="flex-direction:row;align-items:center;gap:16px">${ring(info.ring.done / info.ring.of, '#2DD4BF', 96, 'Day ring')}<div><div class="cond" style="font-weight:700;letter-spacing:.07em;text-transform:uppercase">Day ring ${info.ring.done} of ${info.ring.of}</div><div class="small muted">${info.in_six ? 'This one fills the ring.' : 'Extra check: counts toward your routine.'} +20 XP</div></div></div>
    </div>
  </div>`;
  animateRings(el);
  el.querySelector('#read').onclick = () => speak(info.howto.map(t).join(' '));
  let picked = null, source = 'tablet';
  el.querySelectorAll('[data-pick]').forEach((b) => b.onclick = () => { picked = +b.dataset.pick; el.querySelectorAll('[data-pick]').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); }); });
  const save = async (value) => {
    const body = { who, indicator: ind, source };
    if (ind === 'bp') { body.sys = el.querySelector('#v-sys').value; body.dia = el.querySelector('#v-dia').value; } else body.value = value ?? (picked ?? el.querySelector('#v')?.value);
    try { result(await api.post('/api/capture', body)); } catch (e) { el.querySelector('#err').textContent = e.message; }
  };
  el.querySelector('#dev')?.addEventListener('click', async () => {
    const r = await api.post('/api/devices/read', { who, indicator: ind });
    if (ind === 'bp') { el.querySelector('#v-sys').value = r.values.sys; el.querySelector('#v-dia').value = r.values.dia; } else el.querySelector('#v').value = r.values[ind];
    el.querySelectorAll('.bigin').forEach((i) => i.classList.add('pop'));
    el.querySelector('#err').innerHTML = `<span style="color:var(--ok)">● received from ${esc(r.device)} (simulated)</span>`;
    source = 'simulated device';
  });
  el.querySelector('#save')?.addEventListener('click', () => save());
  el.querySelectorAll('.bigin').forEach((i) => i.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); }));
  (el.querySelector('#v') || el.querySelector('#v-sys'))?.focus();

  // ---------------- reaction test ----------------
  const rx = el.querySelector('#rx');
  if (rx) {
    const N = 8; let times = [], early = 0, t0 = 0, phase = 'idle';
    const log = el.querySelector('#rxlog');
    const arm = () => { phase = 'wait'; rx.className = 'rxpad'; rx.innerHTML = `Wait for the flash…<br><span class="small muted" style="font-weight:400">round ${times.length + 1} of ${N}</span>`;
      timers.push(setTimeout(() => { if (stopped) return; phase = 'go'; t0 = performance.now(); rx.className = 'rxpad go'; rx.textContent = 'TAP!'; }, 1500 + Math.random() * 2500)); };
    const finish = () => { phase = 'done'; const s = [...times].sort((a, b) => a - b); const med = Math.round((s[3] + s[4]) / 2); const lapses = times.filter((x) => x > 500).length;
      rx.className = 'rxpad'; rx.innerHTML = `${med} ms<br><span class="small muted" style="font-weight:400">median of ${N} · ${lapses} slow · ${early} false start${early === 1 ? '' : 's'}</span>`; rx.disabled = true; save(med); };
    rx.onpointerdown = (e) => { e.preventDefault();
      if (phase === 'idle') return arm();
      if (phase === 'wait') { early++; timers.forEach(clearTimeout); timers = []; rx.className = 'rxpad early'; rx.textContent = 'Too early. Wait for the flash.'; phase = 'pause'; timers.push(setTimeout(arm, 900)); return undefined; }
      if (phase === 'go') { times.push(Math.round(performance.now() - t0)); log.textContent = times.map((x) => `${x} ms`).join(' · '); if (times.length >= N) finish(); else arm(); }
      return undefined; };
    rx.onkeydown = (e) => { if (e.key === ' ' || e.key === 'Enter') rx.onpointerdown(e); };
  }

  // ---------------- what you get back ----------------
  function result(r) {
    cleanup();
    const st = WORD_ST[r.meaning.word];
    const shown = typeof r.value === 'object' ? `${Math.round(r.value.sys)}${r.value.dia != null ? `/${Math.round(r.value.dia)}` : ''}` : r.value;
    const stat = (a, b, c, col = 'var(--t1)') => `<div class="card tight rise"><span class="lbl">${a}</span><div class="mono" style="font-size:28px;color:${col}">${b}</div><div class="small muted">${c}</div></div>`;
    const pts = r.insight.series.map((v, i) => ({ day: i + 1, value: v, source: 'history' }));
    el.innerHTML = `
    ${r.handoff ? `<a class="banner red rise" href="#/emergency/${r.case_id}">${icon('alert', '#fff', 28)}<span style="flex:1"><strong>TRIX passed this to the Emergency team.</strong> Open it now.</span><span class="cond" style="font-weight:700">OPEN →</span></a>` : ''}
    <div class="head"><div><div class="kicker">Saved · checked by ${r.agents.length} agents including Safety · <a href="#/office/${r.case_id}">see the agent tree</a></div><h1>${esc(r.insight.name)} ${esc(shown)} ${esc(r.insight.unit)}</h1></div>${chip(st, r.meaning.word)}</div>
    <div class="statrow">${stat(t('Day ring'), `${r.ring.done} / ${r.ring.of}`, r.ring.done > r.ring_before.done ? 'ring filled by this reading' : 'the 6 daily measurements', 'var(--ok)')}
      ${stat(t('Readiness'), r.readiness === r.readiness_before ? `${r.readiness}%` : `${r.readiness_before} → ${r.readiness}%`, 'for your next critical task')}
      ${stat(t('Streak'), `${r.streak} days`, `+${r.xp} XP · level ${r.level.level}`, 'var(--watch)')}${stat(t('Crew goal'), `${r.team_goal.done} / ${r.team_goal.total}`, 'everyone checks in this week')}</div>
    <div class="row">
      <div class="card grow" style="flex:1.4"><h2>${esc(t('What TRIX noticed · just for you'))}</h2><div style="font-size:23px;font-weight:700;line-height:1.3">${esc(r.insight.line)}</div>
        <div style="line-height:1.5">${esc(r.meaning.text)}</div>${r.insight.focus ? `<div class="note" style="color:var(--t1)">${esc(r.insight.focus)}</div>` : ''}
        ${limitBar(info.limits, typeof r.value === 'object' ? r.value.sys : r.value)}
        ${pts.length > 2 ? lineChart({ points: pts, height: 170, label: `${r.insight.name}, last ${pts.length} readings` }) : ''}</div>
      <div class="col" style="flex:1;min-width:280px"><div class="card"><h2>${esc(t('Who checked it'))}</h2><div class="row" style="gap:6px">${r.agents.map((a, i) => `<span class="tag rise" style="animation-delay:${i * 120}ms">${esc(a)}</span>`).join('<span class="dim">→</span>')}</div></div>
        <div class="card" style="flex:1"><h2>${esc(t('Next'))}</h2>${r.next ? `<div style="font-size:19px;font-weight:700">${esc(t(r.next.label))}</div><div class="small muted">about ${r.next.minutes < 1 ? 'half a minute' : `${r.next.minutes} min`}</div><a class="btn big due" id="next" href="${r.next.go}">${icon('arrow', '#fff', 22)}${esc(t('Next'))}: ${esc(t(r.next.label))}</a>` : '<div style="font-size:19px;font-weight:700">This session is complete.</div>'}
          <a class="btn ghost" href="#/today">${esc(t('Back to my deck'))}</a></div></div>
    </div>`;
    if (r.ring.done > r.ring_before.done) toast(`Day ring ${r.ring.done} of ${r.ring.of} · +${r.xp} XP`);
  }
  return cleanup;
}
