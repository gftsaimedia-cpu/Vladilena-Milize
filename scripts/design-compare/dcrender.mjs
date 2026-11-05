import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const D = fileURLToPath(new URL('../../design/', import.meta.url));
const get = (o, p) => p.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);
function parseAttrs(s) { const o = {}; for (const m of s.matchAll(/([a-zA-Z-]+)="([^"]*)"/g)) o[m[1]] = m[2]; return o; }
export function renderComponent(name, inherited = {}, attrs = {}) {
  const src = fs.readFileSync(D + name + '.dc.html', 'utf8');
  const sm = src.match(/<script type="text\/x-dc"([^>]*)>([\s\S]*?)<\/script>/);
  const dp = sm ? (/data-props='([^']*)'/.exec(sm[1]) || [])[1] : null;
  const defaults = {};
  if (dp) for (const [k, v] of Object.entries(JSON.parse(dp))) if (k[0] !== '$' && v && 'default' in v) defaults[k] = v.default;
  const props = { ...defaults, ...inherited, ...attrs };
  let vals = {};
  if (sm) {
    class DCLogic { constructor(p) { this.props = p; this.state = null; } setState() {} }
    const C = new Function('DCLogic', sm[2] + '\n;return Component;')(DCLogic);
    const inst = new C(props); vals = inst.renderVals ? inst.renderVals() : {};
  }
  let t = src.replace(/<script[\s\S]*?<\/script>/g, '');
  const helmet = (t.match(/<helmet>([\s\S]*?)<\/helmet>/) || [])[1] || '';
  t = t.replace(/<helmet>[\s\S]*?<\/helmet>/, '').replace(/<\/?x-dc>/g, '').replace(/<!doctype[^>]*>|<\/?(html|head|body)[^>]*>|<meta[^>]*>|<title>[\s\S]*?<\/title>/gi, '');
  const sub = (p) => { const v = get(vals, p.trim()); if (v === undefined) { const pv = props[p.trim()]; return pv === undefined ? '' : String(pv); } return typeof v === 'function' ? '' : String(v); };
  t = t.replace(/\shidden="\{\{([^}]+)\}\}"/g, (m, p) => { const v = get(vals, p.trim()); return v === true || v === 'true' ? ' hidden' : ''; });
  // dc-import: dựng lồng nhau, props của wrapper được kế thừa
  t = t.replace(/<dc-import\s+([^>]*)>(<\/dc-import>)?/g, (m, a) => {
    const at = parseAttrs(a); const nm = at.name; delete at.name; delete at['hint-size'];
    for (const k of Object.keys(at)) at[k] = at[k].replace(/\{\{([^}]+)\}\}/g, (mm, p) => sub(p));
    return renderComponent(nm, props, at);
  });
  t = t.replace(/\{\{([^}]+)\}\}/g, (m, p) => sub(p));
  return `<style>${helmet.replace(/<\/?style>/g, '')}</style>` + t;
}
export function page(name, props = {}) {
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><style>body{margin:0}</style></head><body>${renderComponent(name, {}, props)}</body></html>`;
}
