// Thin client for the onboard TRIX API.
async function call(method, url, body, isForm = false) {
  const opt = { method, headers: {} };
  if (body !== undefined) {
    if (isForm) opt.body = body;
    else { opt.body = JSON.stringify(body); opt.headers['Content-Type'] = 'application/json'; }
  }
  const r = await fetch(url, opt);
  const ct = r.headers.get('content-type') || '';
  const data = ct.includes('json') ? await r.json() : await r.text();
  if (!r.ok) throw new Error((data && data.detail) || `${r.status} ${r.statusText}`);
  return data;
}
export const api = {
  get: (u) => call('GET', u),
  post: (u, b) => call('POST', u, b ?? {}),
  form: (u, fd) => call('POST', u, fd, true),
};
