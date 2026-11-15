// Messages from home: player, unlock pop-up and the panel used on the Body mirror and Crew screens.
import { api } from './api.js';
import { esc, icon, toast, speak } from './ui.js';

const RULE_HELP = 'Rewards follow effort (check-ins), never good numbers. A hard day or "I need a message from home" unlocks one straight away.';

export function play(who, m) {
  document.getElementById('homeplayer')?.remove();
  const d = document.createElement('div');
  d.id = 'homeplayer'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-label', `Message from ${m.sender}`);
  const src = `/api/messages/${who}/${m.id}/media`;
  const media = m.kind === 'video' ? `<video src="${src}" controls autoplay playsinline style="width:100%;max-height:60vh;background:#000"></video>`
    : m.kind === 'audio' ? `<audio src="${src}" controls autoplay style="width:100%"></audio>`
    : `<div class="hmtext">${esc(m.text || '')}</div>`;
  d.innerHTML = `<div class="hmbox"><div class="kicker">${m.from_earth ? 'New from Earth' : 'Message from home'}${m.demo ? ' · demo' : ''}</div>
    <h2 style="margin:4px 0 2px">${icon('heart', 'var(--redt)', 24)} ${esc(m.sender)}</h2><div class="small muted">${esc(m.relation || '')}${m.reason ? ` · unlocked by ${esc(m.reason)}` : ''}</div>
    ${media}<div class="row" style="justify-content:flex-end"><button class="btn ghost" id="hmclose">Close</button></div></div>`;
  document.body.appendChild(d);
  if (m.kind === 'demo') speak(m.text || '');
  const close = () => { try { speechSynthesis.cancel(); } catch (e) { /* no speech */ } d.remove(); };
  d.querySelector('#hmclose').onclick = close;
  d.onclick = (e) => { if (e.target === d) close(); };
  d.querySelector('#hmclose').focus();
  api.post(`/api/messages/${who}/${m.id}/played`).catch(() => {});
}

// Pop-up after a check that unlocked something.
export function announce(who, list) {
  if (!list || !list.length) return;
  const m = list[0];
  document.getElementById('hmnew')?.remove();
  const d = document.createElement('div');
  d.id = 'hmnew'; d.className = 'hmnew rise'; d.setAttribute('role', 'status');
  d.innerHTML = `${icon('heart', 'var(--redt)', 26)}<span style="flex:1"><strong>New message from ${esc(m.sender)}</strong><br><span class="small muted">Unlocked by ${esc(m.reason || 'your check-in')}${list.length > 1 ? ` · +${list.length - 1} more` : ''}</span></span>
    <button class="btn sm" id="hmplay">Play</button><button class="btn ghost sm" id="hmlater" aria-label="Later">Later</button>`;
  document.body.appendChild(d);
  d.querySelector('#hmplay').onclick = () => { d.remove(); play(who, m); };
  d.querySelector('#hmlater').onclick = () => d.remove();
  setTimeout(() => d.remove(), 20000);
}

// Panel: manage=true on the Body mirror (add and delete), false on the Crew screen (play, next, comfort).
export async function mount(box, who, { manage = false } = {}) {
  const r = await api.get(`/api/messages/${who}`);
  const row = (m) => `<div class="li"><span>${icon(m.unlocked ? 'heart' : 'lock', m.unlocked ? 'var(--redt)' : 'var(--t2)', 20)}</span>
    <span style="flex:1"><strong>${esc(m.sender)}</strong>${m.relation ? ` <span class="small muted">· ${esc(m.relation)}</span>` : ''}${m.demo ? ' <span class="tag">demo</span>' : ''}${m.from_earth ? ' <span class="tag">from Earth</span>' : ''}<br>
    <span class="small muted">${!m.arrived ? `On its way from Earth · ${m.arrives_in} s` : m.unlocked ? `Unlocked${m.reason ? ` by ${esc(m.reason)}` : ''}${m.played ? ' · played' : ''}` : `Locked · unlocks after ${esc(m.rule_label)}`}</span></span>
    ${m.unlocked ? `<button class="btn sm" data-play="${m.id}">${icon('play', '#fff', 16)}Play</button>` : ''}${manage ? `<button class="btn ghost sm" data-del="${m.id}" aria-label="Delete message from ${esc(m.sender)}">Delete</button>` : ''}</div>`;
  box.innerHTML = `<div class="card"><div class="head"><h2>${icon('heart', 'var(--redt)', 22)} Messages from home</h2><span class="mono small dim">${r.unlocked} of ${r.total} unlocked</span></div>
    ${r.next ? `<div class="hmnext">${esc(r.next.say)}</div>` : r.total ? '' : `<div class="muted">${manage ? 'Before launch, family and friends record short messages. Add them here and TRIX unlocks them as you keep up your health checks.' : 'No messages yet. Add them on the Body mirror screen.'}</div>`}
    ${r.total ? `<div class="list">${r.messages.map(row).join('')}</div>` : ''}
    ${manage ? `<form id="hmadd" class="grid2" style="gap:10px">
      <label class="small">From<input class="input" name="sender" placeholder="Mum" maxlength="40"></label>
      <label class="small">Relationship<input class="input" name="relation" placeholder="Mother" maxlength="40"></label>
      <label class="small">Unlocks after<select class="input" name="rule">${r.rules.map((x) => `<option value="${x.id}">${esc(x.label)}</option>`).join('')}</select></label>
      <label class="small">Recording (audio or video)<input class="input" name="file" type="file" accept="audio/*,video/*"></label>
      <div class="row" style="gap:8px;grid-column:1/-1"><button class="btn">Add message</button><button type="button" class="btn ghost" id="hmdemo">Add a demo message</button></div>
      <div id="hmerr" class="small" style="color:var(--redt);grid-column:1/-1"></div></form>`
    : `<div class="row" style="gap:8px"><button class="btn ghost" id="hmcomfort">${icon('heart', 'var(--redt)', 18)}I need a message from home</button></div>`}
    <div class="small dim">${esc(RULE_HELP)} Recordings stay on board and are never sent to Earth.</div></div>`;
  const byId = Object.fromEntries(r.messages.map((m) => [String(m.id), m]));
  box.querySelectorAll('[data-play]').forEach((b) => b.onclick = () => { play(who, byId[b.dataset.play]); });
  box.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => { await api.del(`/api/messages/${who}/${b.dataset.del}`); toast('Message deleted.'); mount(box, who, { manage }); });
  box.querySelector('#hmcomfort')?.addEventListener('click', async () => {
    try { const m = await api.post(`/api/messages/${who}/comfort`); play(who, m); mount(box, who, { manage }); }
    catch (e) { toast(esc(e.message)); }
  });
  box.querySelector('#hmdemo')?.addEventListener('click', async () => { await api.post(`/api/messages/${who}/demo`); toast('Demo message added. It unlocks after your next check-in.'); mount(box, who, { manage }); });
  const f = box.querySelector('#hmadd');
  if (f) {
    f.oninput = () => { box.querySelector('#hmerr').textContent = ''; };
    f.onsubmit = async (e) => {
      e.preventDefault();
      const err = box.querySelector('#hmerr');
      if (!f.sender.value.trim()) { err.textContent = 'Enter who the message is from.'; return; }
      if (!f.file.files[0]) { err.textContent = 'Choose an audio or video recording.'; return; }
      const fd = new FormData(); ['sender', 'relation', 'rule'].forEach((k) => fd.append(k, f[k].value)); fd.append('file', f.file.files[0]);
      try { await api.form(`/api/messages/${who}`, fd); toast(`Message from ${esc(f.sender.value)} added.`); mount(box, who, { manage }); }
      catch (e2) { err.textContent = e2.message; }
    };
  }
}
