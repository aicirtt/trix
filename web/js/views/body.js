import { api } from '../api.js';
import { esc, icon, chip, lineChart, PARTS } from '../ui.js';

const ORDER = ['hr', 'bp', 'hrv', 'spo2', 'temp', 'glucose', 'sleep', 'mood', 'fatigue', 'fluid', 'calcium', 'bone', 'co2'];

export async function render(el, { params, state }) {
  const who = state.who;
  const ind = await api.get('/api/indicators');
  const kb = Object.fromEntries(ind.indicators.map((i) => [i.id, i]));
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
      <div class="card"><h3>${icon('chip', 'var(--bluet)', 20)} Ask TRIX about this</h3><form id="ask" class="row" style="gap:10px"><label class="sr" for="q">Question</label><input class="input" id="q" style="flex:1;min-width:220px" value="Why does ${esc(i.name.split(' (')[0].toLowerCase())} change in space?"><button class="btn">Ask</button></form><div id="ans"></div></div>
    </div>
  </div>`;
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
