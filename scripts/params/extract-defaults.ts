'use strict';
// Sinh `src/engine/payroll-params.ts → DEFAULTS` từ MÃ ĐANG CHẠY.
// Đọc: public/{actual-hours,kpi-score,approval-view}.js (mặc định của mô-đun), src/engine/payroll-graph.ts, src/ai/thresholds.ts,
// src/platform/config.ts và một số hằng số có tên (regex). Mọi LÁ của các đối tượng nguồn phải khớp một mục của key-map.js, nếu không thì
// script DỪNG và báo đường dẫn (không bao giờ đoán). Số mà mã không giữ hằng số
// nằm ở hand-defaults.json, kèm lý do. KHÔNG đọc src/engine/index.html.
//
//   node scripts/params/extract-defaults.ts           ghi lại khối GENERATED trong src/engine/payroll-params.ts
//   node scripts/params/extract-defaults.ts --check   không ghi; thoát 1 nếu tệp không khớp mã hiện tại (dùng trong params:check)
const fs = require('node:fs');
const path = require('node:path');
const { RULES, REGEX_SOURCES, HAND_FILE } = require('./key-map');

const ROOT = path.join(__dirname, '..', '..');
const TARGET = 'src/engine/payroll-params.ts';
const BEGIN = '/* GENERATED:BEGIN (scripts/params/extract-defaults.ts) */';
const END = '/* GENERATED:END */';

const read = (rel?) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/* ---------- khớp đường dẫn ---------- */
function compile(pattern?) {
  return pattern.split('.').map(seg => {
    const m = /^<([a-zA-Z]+)(?::([^>]+))?>$/.exec(seg);
    return m ? { name: m[1], oneOf: m[2] ? m[2].split('|') : null } : { literal: seg };
  });
}
function match(compiled?, segments?) {
  if (compiled.length !== segments.length) return null;
  const vars: Record<string, any> = {};
  for (let i = 0; i < compiled.length; i++) {
    const c = compiled[i];
    if (c.literal !== undefined) {
      if (c.literal !== segments[i]) return null;
    } else {
      if (c.oneOf && !c.oneOf.includes(segments[i])) return null;
      vars[c.name] = segments[i];
    }
  }
  return vars;
}
const fill = (template?, vars?) => template.replace(/<([a-zA-Z]+)>/g, (_, name) => vars[name]);
const COMPILED = RULES.map(rule => ({ ...rule, compiled: compile(rule.path) }));

/* ---------- đối tượng nguồn ---------- */
function sources() {
  const out: Record<string, any> = {};
  const ActualHours = require(path.join(ROOT, 'src/engine/actual-hours'));
  const KpiScore = require(path.join(ROOT, 'src/engine/kpi-score'));
  const ApprovalView = require(path.join(ROOT, 'src/engine/approval-view'));
  const config = require(path.join(ROOT, 'src/platform/config.ts'));
  out.ActualHours = { RULE: { ...ActualHours.RULE }, POLICY: { ...ActualHours.POLICY } };
  out.KpiScore = {
    COMPONENTS: Object.fromEntries(KpiScore.COMPONENTS.map(c => [c.key, { weight: c.weight }])),
    WEWORK_MIN: KpiScore.WEWORK_MIN,
    POLICY: { ...KpiScore.POLICY }
  };
  out.ApprovalView = {
    POLICY: { pending: { ...ApprovalView.POLICY.pending }, rejected: { ...ApprovalView.POLICY.rejected } },
    COUNTS_ABSENT: { ...ApprovalView.COUNTS_ABSENT }
  };
  out.config = { ...config };
  return { out, ApprovalItems: [...ApprovalView.ITEMS], Punch: require(path.join(ROOT, 'src/engine/punch')) };
}
function* leaves(value?, prefix?) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [k, v] of Object.entries<any>(value)) yield* leaves(v, [...prefix, k]);
  } else yield [prefix, value];
}
const evalNumber = (text?) => {
  const cleaned = String(text).trim();
  if (!/^[\d\s*+/.e-]+$/.test(cleaned)) throw new Error(`Biểu thức số không an toàn: ${cleaned}`);
  const n = Function(`"use strict"; return (${cleaned});`)();
  if (!Number.isFinite(n)) throw new Error(`Biểu thức không ra số: ${cleaned}`);
  return n;
};
const TRANSFORM = {
  none: (v?) => v,
  minToHours: (v?) => v / 60,
  msToMin: (v?) => v / 60000
};

/* ---------- trích ---------- */
function extract() {
  const { out } = sources();
  const values: Record<string, any> = {},
    ignored: any[] = [],
    derived: Record<string, any> = {},
    origin: Record<string, any> = {};
  const unmapped: any[] = [];
  const put = (key?, value?, from?) => {
    if (Object.hasOwn(values, key) && JSON.stringify(values[key]) !== JSON.stringify(value))
      throw new Error(`Khoá ${key} có hai giá trị khác nhau trong mã: ${from} và ${origin[key]}`);
    values[key] = value;
    origin[key] = origin[key] || from;
  };
  for (const [name, root] of Object.entries<any>(out)) {
    for (const [segments, value] of leaves(root, [name])) {
      const hit = COMPILED.map(r => ({ r, vars: match(r.compiled, segments) })).find(x => x.vars);
      const where = segments.join('.');
      if (!hit) {
        unmapped.push(where);
        continue;
      }
      if (hit.r.ignore) ignored.push({ path: where, why: hit.r.ignore });
      else if (hit.r.derived) derived[where] = hit.r.derived;
      else for (const key of [].concat(hit.r.key)) put(fill(key, hit.vars), value, where);
    }
  }
  if (unmapped.length)
    throw new Error(
      `Đường dẫn mã chưa có trong scripts/params/key-map.ts (không đoán, thêm mục khớp hoặc ignore):\n  ${unmapped.join('\n  ')}`
    );
  // Hằng số có tên đọc bằng regex
  const firstOf: Record<string, any> = {};
  for (const src of REGEX_SOURCES) {
    const m = src.regex.exec(read(src.file));
    if (!m) throw new Error(`Regex không còn khớp trong ${src.file}: ${src.regex} (mã đã đổi, sửa key-map.js)`);
    const value = TRANSFORM[src.transform || 'none'](evalNumber(m[1]));
    if (src.mustEqualFirst) {
      const keep = Object.hasOwn(values, src.key) ? values[src.key] : firstOf[src.key];
      if (keep !== value) throw new Error(`${src.file} (${src.key}) = ${value} khác nguồn đầu tiên = ${keep}`);
    } else {
      put(src.key, value, `${src.file} ${src.regex}`);
      firstOf[src.key] = value;
    }
  }
  // Công thức tháng mặc định gõ bằng chữ (src/engine/payroll-graph.ts → DEFAULT_GRAPH): mặc định của khoá formula.<tên> là { text, tree } đã serialize.
  // Chưa nối vào bộ máy (wired:false) nên lưu giá trị này không đổi một đồng; nó cho màn Công thức biết công thức đang chạy bằng chữ gì.
  {
    const Formula = require(path.join(ROOT, 'src/engine/formula'));
    const { DEFAULT_GRAPH } = require(path.join(ROOT, 'src/engine/payroll-graph'));
    for (const [name, g] of Object.entries<any>(DEFAULT_GRAPH))
      put(
        `formula.${name}`,
        { text: g.text, tree: Formula.serialize(g.tree) },
        'src/engine/payroll-graph DEFAULT_GRAPH'
      );
  }
  const hand = JSON.parse(read(HAND_FILE));
  for (const [key, item] of Object.entries<any>(hand)) {
    if (Object.hasOwn(values, key))
      throw new Error(`Khoá viết tay ${key} đã có trong mã (${origin[key]}): bỏ khỏi hand-defaults.json`);
    if (!item.why) throw new Error(`Khoá viết tay ${key} thiếu lý do (why)`);
    values[key] = item.value;
    origin[key] = 'hand';
  }
  const sorted = Object.fromEntries(
    Object.keys(values)
      .sort()
      .map(k => [k, values[k]])
  );
  return {
    values: sorted,
    origin,
    ignored,
    derived,
    hand,
    codeKeys: Object.keys(values).filter(k => origin[k] !== 'hand')
  };
}

/* ---------- ghi tệp ---------- */
// Infinity (trần bậc thuế cuối) lưu là null; payroll-params.js đổi lại khi dựng lớp tham số
const literal = (values?) => JSON.stringify(values, (k, v) => (v === Infinity ? null : v), 2);
function render(values?) {
  return `${BEGIN}\n  const DEFAULTS = ${literal(values).replace(/\n/g, '\n  ')};\n  ${END}`;
}
function splice(file?, values?) {
  const begin = file.indexOf(BEGIN),
    end = file.indexOf(END);
  if (begin < 0 || end <= begin) throw new Error(`${TARGET} thiếu hai dấu GENERATED:BEGIN và GENERATED:END`);
  return file.slice(0, begin) + render(values) + file.slice(end + END.length);
}
// Định dạng bằng Prettier (devDependency) theo .prettierrc của dự án, để `npm run params:extract` không gây khác biệt định dạng.
// Không có Prettier (môi trường chỉ chạy, không cài devDependencies) thì giữ nguyên văn bản vừa sinh.
async function pretty(source?, file?) {
  let prettier;
  try {
    prettier = require('prettier');
  } catch {
    console.warn('Không có prettier: tệp được ghi chưa định dạng (chạy npm install rồi params:extract lại)');
    return source;
  }
  const config = (await prettier.resolveConfig(file)) || {};
  return prettier.format(source, { ...config, filepath: file });
}

async function main(argv?) {
  const { values } = extract();
  const file = path.join(ROOT, TARGET);
  const next = await pretty(splice(read(TARGET), values), file);
  if (argv.includes('--check')) {
    // Kiểm bằng GIÁ TRỊ (không so văn bản)
    const current = require(file).DEFAULTS;
    const text = (v?) =>
      JSON.stringify(
        Object.fromEntries(
          Object.keys(v)
            .sort()
            .map(k => [k, v[k]])
        ),
        (k, x) => (x === Infinity ? null : x)
      );
    if (text(current) !== text(values)) {
      console.error('src/engine/payroll-params.ts → DEFAULTS không khớp mã hiện tại: chạy `npm run params:extract`');
      process.exit(1);
    }
    console.log(`DEFAULTS khớp mã (${Object.keys(values).length} khoá)`);
    return;
  }
  fs.writeFileSync(file, next);
  console.log(`Đã ghi ${Object.keys(values).length} khoá vào ${TARGET} (đã định dạng bằng Prettier)`);
}

module.exports = { extract, sources, ROOT, TARGET, BEGIN, END };
if (require.main === module)
  main(process.argv.slice(2)).catch(error => {
    console.error(error.message);
    process.exit(1);
  });
