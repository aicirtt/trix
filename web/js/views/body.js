import { api } from '../api.js';
import { esc, icon, chip, lineChart, PARTS } from '../ui.js';

const ORDER = ['hr', 'bp', 'hrv', 'spo2', 'temp', 'glucose', 'sleep', 'mood', 'fatigue', 'reaction', 'exercise', 'mass', 'back_pain', 'fluid', 'calcium', 'bone', 'co2'];

export async function render(el, { params, state }) {
  const who = state.who;
  const ind = await api.get('/api/indicators');
  const kb = Object.fromEntries(ind.indicators.map((i) => [i.id, i]));
  if (!params[0] || params[0] === 'overview') return overview(el, who, kb);
  const sel = kb[params[0]] && ORDER.includes(params[0]) ? params[0] : (params[0] && kb[params[0]] ? params[0] : 'bone');
  const tr = ORDER.includes(sel) ? await api.get(`/api/trend/${who}/${sel}?days=${sel === 'bone' ? 240 : 90}`) : { points: [] };
  const i = kb[sel];
  const a = i.absolute || {};
  const limits = [];
  const add = (v, label, c) => { if (typeof v === 'number') limits.push({ v, label, c }); };
  if (sel === 'bp') { add(a.amber_high?.sys, 'Watch 140', '#F59E0B'); } else {
    add(a.red_high, 'Alert', '#F87171'); add(a.amber_high, 'Watch', '#FBBF24'); add(a.amber_low, 'Watch', '#FBBF24'); add(a.red_low, 'Alert', '#F87171');
    add(a.forecast_watch_level, 'Watch level', '#FBBF24'); add(a.red_1h_avg, '1-h limit', '#F87171');
  }
  const last = tr.points[tr.points.length - 1];
  const part = PARTS.find((p) => p.id === i.body_part);
  el.innerHTML = `
  <div class="head"><div><h1>${esc(i.name)}</h1><div class="sub">Astronaut ${esc(who)} · ${esc(part?.name || '')} · NASA hazard: ${esc(i.hazard)}</div></div>
    <div class="row" style="gap:8px">${last ? `<span class="chip blue mono">Last ${+last.value.toFixed(1)} ${esc(i.unit)} · day ${last.day}</span>` : ''}${sel === 'bone' && last ? (last.value <= a.forecast_watch_level ? chip('amber', 'Below the watch level') : tr.forecast_cross_day ? chip('amber', `Reaches watch level ~day ${tr.forecast_cross_day}`) : chip('green', 'Above the watch level')) : ''}</div></div>
  <div class="row">
    <nav class="card tight" style="width:240px;flex:none" aria-label="Indicators"><span class="lbl">Indicators</span>
      <a href="#/body/overview" class="caserow" style="text-decoration:none">30-day overview</a>
      ${ORDER.map((k) => `<a href="#/body/${k}" class="caserow ${k === sel ? 'on' : ''}" style="text-decoration:none">${esc(kb[k].name.split(' (')[0])}</a>`).join('')}</nav>
    <div class="col grow">
      <div class="card"><div class="head"><h2>Trend</h2><span class="small muted">Blue line: your readings · green band: your normal range (last 30 days) · yellow dots: logged in TRIX${sel === 'bone' ? ' · dashed: forecast' : ''}</span></div>
        ${lineChart({ points: tr.points, band: tr.band || [], limits, forecast: tr.forecast || [], unit: i.unit, height: 300, label: `${i.name} trend`, dia: sel === 'bp' })}</div>
      <div class="grid2">
        <div class="card"><h3>What happens in space</h3><p style="margin:0;line-height:1.55">${esc(i.space_effect)}</p><h3>Why we measure it</h3><p style="margin:0;line-height:1.55" class="muted">${esc(i.why_measure)}</p></div>
        <div class="card"><h3>What you can do</h3><ul style="margin:0;padding-left:20px;line-height:1.7">${i.actions.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
          <div class="small muted">Measured with: ${esc(i.devices.join(', '))} · ${esc(i.frequency)}</div>
          <div class="small">${(i.sources || []).map((s) => { const src = ind.sources[s]; return src ? `<a href="${esc(src.url)}" target="_blank" rel="noopener">${esc(src.title)}</a>` : esc(s); }).join(' · ')}</div></div>
      </div>
      ${sel === 'co2' ? '<div class="card" id="co2link"><span class="spinner"></span></div>' : ''}
      <div class="card"><h3>${icon('chip', 'var(--bluet)', 20)} Ask TRIX about this</h3><form id="ask" class="row" style="gap:10px"><label class="sr" for="q">Question</label><input class="input" id="q" style="flex:1;min-width:220px" value="Why does ${esc(i.name.split(' (')[0].toLowerCase())} change in space?"><button class="btn">Ask</button></form><div id="ans"></div></div>
    </div>
  </div>`;
  if (sel === 'co2') {
    const r = await api.get('/api/insights/co2-headache');
    const max = Math.max(0.05, ...r.bins.map((b) => Math.max(b.rate || 0, b.nasa_risk)));
    el.querySelector('#co2link').innerHTML = `<div class="head"><h2>Cabin air and headaches</h2>${chip(r.co2_7d_now >= 2.5 ? 'amber' : 'green', `7-day CO₂ ${r.co2_7d_now} mmHg`)}</div>
      <p style="margin:0;line-height:1.5">${esc(r.finding)}</p>
      <div class="row" style="gap:10px;align-items:flex-end;height:150px">${r.bins.map((b, i) => `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:6px">
        <div style="display:flex;gap:4px;align-items:flex-end;height:110px">
          <div class="rise" title="This crew: ${b.headache_days} of ${b.days} days" style="animation-delay:${i * 90}ms;width:22px;height:${Math.max(2, (b.rate || 0) / max * 110)}px;background:#FBBF24;border-radius:4px 4px 0 0"></div>
          <div class="rise" title="NASA model" style="animation-delay:${i * 90 + 40}ms;width:22px;height:${Math.max(2, b.nasa_risk / max * 110)}px;background:#60A5FA;border-radius:4px 4px 0 0"></div></div>
        <span class="mono small dim">${b.from}–${b.to}</span></div>`).join('')}</div>
      <div class="row small muted" style="gap:16px"><span><span class="tdot" style="background:#FBBF24"></span> This crew: share of days with a headache</span><span><span class="tdot" style="background:#60A5FA"></span> NASA: risk doubles per 1 mmHg</span><span class="dim">x: cabin CO₂ (mmHg)</span></div>
      <div class="note">${esc(r.advice)} Now: about ${(r.nasa_risk_now * 100).toFixed(1)}% headache risk on NASA's curve.${r.small_sample ? ' Few headaches logged so far, so treat the crew numbers as early.' : ''}</div>
      <div class="small"><a href="${esc(r.source.url)}" target="_blank" rel="noopener">${esc(r.source.title)}</a></div>`;
  }
  el.querySelector('#ask').onsubmit = async (e) => {
    e.preventDefault();
    const out = el.querySelector('#ans');
    out.innerHTML = '<span class="spinner"></span>';
    const r = await api.post('/api/ask', { question: el.querySelector('#q').value });
    out.innerHTML = answerHtml(r);
  };
}

export function answerHtml(r) {
  return `<div class="note rise" style="color:var(--t1);font-size:16px">${esc(r.answer)}</div>
    <div class="small muted">${r.sources.filter((s) => s.cited).map((s) => `[${s.n}] <a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a>`).join('<br>') || 'No source cited.'}</div>
    <div class="small dim">Answered on board (${r.safety.allowed ? 'checked by the Safety agent' : 'blocked by the Safety agent'}).</div>`;
}

async function overview(el, who, kb) {
  const o = await api.get(`/api/overview/${who}`);
  const W = 900, H = 110, L = 46, R = 12;
  const X = (i) => L + i / (o.days.length - 1) * (W - L - R);
  const lane = (title, vals, color, lo, hi, unit, fill) => {
    const ok = vals.map((v, i) => [i, v]).filter(([, v]) => v != null);
    const Y = (v) => 14 + (hi - v) / (hi - lo) * (H - 30);
    const pts = ok.map(([i, v]) => `${X(i)},${Y(Math.max(lo, Math.min(hi, v)))}`).join(' ');
    const lastv = ok.length ? ok[ok.length - 1][1] : null;
    return `<div class="row" style="align-items:center;gap:12px"><div style="width:150px;flex:none"><div class="cond" style="font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#CFE0FF">${title}</div><div class="mono" style="font-size:24px;color:${color}">${lastv ?? '—'} <span class="small dim">${unit}</span></div></div>
      <svg viewBox="0 0 ${W} ${H}" style="flex:1;min-width:0" role="img" aria-label="${title} over the last ${o.days.length} days"><line x1="${L}" x2="${W - R}" y1="${Y(lo)}" y2="${Y(lo)}" stroke="#1C3263"/><line x1="${L}" x2="${W - R}" y1="${Y(hi)}" y2="${Y(hi)}" stroke="#1C3263"/>
        <text x="${L - 6}" y="${Y(hi) + 4}" text-anchor="end" font-size="11" fill="#8396BA" class="mono">${hi}</text><text x="${L - 6}" y="${Y(lo) + 4}" text-anchor="end" font-size="11" fill="#8396BA" class="mono">${lo}</text>
        ${fill && ok.length > 1 ? `<polygon points="${X(ok[0][0])},${Y(lo)} ${pts} ${X(ok[ok.length - 1][0])},${Y(lo)}" fill="${color}" fill-opacity=".12"/>` : ''}
        <polyline class="draw" points="${pts}" fill="none" stroke="${color}" stroke-width="2.4" stroke-linejoin="round"/></svg></div>`;
  };
  const sc = { green: 'var(--ok)', amber: 'var(--watch)', red: 'var(--alert)' }[o.now.status];
  el.innerHTML = `
  <div class="head"><div><div class="kicker">Astronaut ${esc(who)} · last ${o.days.length} days · day ${o.days[0]} to ${o.days[o.days.length - 1]}</div><h1>Sleep, mood, alertness and strain</h1></div>${chip(o.now.status, o.now.status === 'green' ? 'GO' : o.now.status === 'amber' ? 'WATCH' : 'NO-GO')}</div>
  <div class="row">
    <nav class="card tight" style="width:240px;flex:none" aria-label="Indicators"><span class="lbl">Trends</span><a href="#/body/overview" class="caserow on" style="text-decoration:none">30-day overview</a>
      ${ORDER.map((k) => `<a href="#/body/${k}" class="caserow" style="text-decoration:none">${esc(kb[k].name.split(' (')[0])}</a>`).join('')}</nav>
    <div class="col grow"><div class="card">${lane('Sleep', o.sleep, '#7FB2FF', 3, 9, 'h')}${lane('Mood', o.mood, '#2DD4BF', 1, 5, '/ 5')}${lane('Alertness', o.alertness, '#CFE0FF', 0, 100, '/ 100', true)}${lane('Strain', o.strain, sc === 'var(--ok)' ? '#FBBF24' : '#FC3D21', 0, 100, '/ 100', true)}</div>
      <div class="card"><h2>What it means</h2><div style="font-size:19px;font-weight:700">${esc(o.now.message)}</div><div class="muted" style="line-height:1.5">Alertness near 80 and strain near 25 are your own normal. ${esc(o.note)}</div>
        <div class="row" style="gap:10px"><a class="btn" href="#/capture/reaction">Do the reaction test</a><a class="btn ghost" href="#/checkin/2">Face and voice check</a></div></div></div>
  </div>`;
}
