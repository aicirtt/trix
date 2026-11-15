// Interface language per astronaut. English strings are the keys; each other language is one module in web/js/lang/,
// loaded only when chosen. Static labels on every screen are translated in place after each render (translateDom);
// long NASA explanations, agent advice and anything the onboard record generates stay in English.
// Translations were written by the team, not yet checked by native speakers.
export const LANGS = { en: 'English', ru: 'Русский', ja: '日本語', zh: '中文', fr: 'Français', de: 'Deutsch', es: 'Español', it: 'Italiano', hi: 'हिन्दी', ko: '한국어' };
export const SPEECH = { en: 'en-US', ru: 'ru-RU', ja: 'ja-JP', zh: 'zh-CN', fr: 'fr-FR', de: 'de-DE', es: 'es-ES', it: 'it-IT', hi: 'hi-IN', ko: 'ko-KR' };
let lang = 'en';
const MAPS = {};
export async function setLang(l) {
  lang = LANGS[l] ? l : 'en';
  if (lang !== 'en' && !MAPS[lang]) {
    try { MAPS[lang] = (await import(`./lang/${lang}.js`)).default; } catch (e) { console.warn('language file missing:', lang, e.message); lang = 'en'; }
  }
  document.documentElement.lang = lang;
}
export const getLang = () => lang;
const pick = (en) => (lang === 'en' ? en : MAPS[lang]?.[en]);
export function t(s) { return (lang !== 'en' && MAPS[lang]?.[s]) || s; }

// Translate the static text already in the page: every text node and placeholder / aria-label / title that matches a key.
// Each node remembers its English, so switching language again (or back to English) re-translates persistent elements.
const ATTRS = ['placeholder', 'aria-label', 'title'];
const EN = new WeakMap();
export function translateDom(root) {
  if (!root || root.nodeType !== 1) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (/^(SCRIPT|STYLE|TEXTAREA)$/.test(n.parentNode.nodeName) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
  const nodes = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n);
  for (const n of nodes) {
    const cur = n.nodeValue.trim(), en = EN.get(n) ?? cur;
    if (!en || (!EN.has(n) && lang === 'en')) continue;
    const tr = pick(en);
    if (!tr || tr === cur) continue;
    EN.set(n, en);
    n.nodeValue = n.nodeValue.replace(cur, tr);
  }
  for (const el of [root, ...root.querySelectorAll('[placeholder],[aria-label],[title]')]) {
    for (const a of ATTRS) {
      const cur = el.getAttribute?.(a);
      if (!cur) continue;
      const mem = EN.get(el) || {}, en = mem[a] ?? cur.trim();
      if (!(a in mem) && lang === 'en') continue;
      const tr = pick(en);
      if (!tr || tr === cur) continue;
      EN.set(el, { ...mem, [a]: en });
      el.setAttribute(a, tr);
    }
  }
}
