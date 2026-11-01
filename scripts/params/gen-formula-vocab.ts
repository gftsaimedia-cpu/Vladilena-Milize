'use strict';
// Sinh khối GENERATED của `src/engine/formula-vocab.ts` (từ vựng của công thức gõ chữ) từ bộ máy tính lương và registry:
//   - biến, công thức có tên, hàm có sẵn: PayrollEngine.VARIABLES / FORMULAS / BUILTINS (khoá, nhãn, từ đồng nghĩa, đơn vị, miền, nguồn);
//   - tham số: danh sách chọn lọc dưới đây, đơn vị đối chiếu với src/params/registry.data.json (khoá `type.<type>.*` giữ nguyên dạng
//     registry; công thức giải <type> bằng ctx.scope.type khi tính);
//   - phần bộ máy chưa có (biến giờ OT..., cờ KPI, cờ loại, phép so sánh có tên): khai ở đây, đánh dấu `engineGap: true`.
//
//   node scripts/params/gen-formula-vocab.ts           ghi lại khối GENERATED trong src/engine/formula-vocab.ts
//   node scripts/params/gen-formula-vocab.ts --check   không ghi; thoát 1 nếu tệp lệch bộ máy hoặc registry (dùng trong params:check)
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const TARGET = path.join(ROOT, 'src/engine/formula-vocab.ts');
const BEGIN = '/* GENERATED:BEGIN (scripts/params/gen-formula-vocab.ts) */';
const END = '/* GENERATED:END */';

const Engine = require(path.join(ROOT, 'src/engine/payroll-engine'));
const Formula = require(path.join(ROOT, 'src/engine/formula'));
const registry = require(path.join(ROOT, 'src/params/registry.data.json'));

/* ---------- nhãn: chữ thường đầu câu (trừ từ viết tắt), chỉ chữ-số-dấu cách ---------- */
const WORDS = /[\p{L}\p{M}\p{N}_]+/gu;
const wordsOf = (text?) => text.match(WORDS) || [];
// mỗi từ phải bắt đầu bằng chữ cái (từ bắt đầu bằng chữ số được đọc là số, không khớp được nhãn)
const isValidPhrase = (text?) =>
  typeof text === 'string' &&
  wordsOf(text).join(' ') === text.trim().replace(/\s+/g, ' ') &&
  wordsOf(text).every(w => /^\p{L}/u.test(w));
const lowerFirst = (text?) => (/^\p{Lu}\p{Ll}/u.test(text) ? text[0].toLowerCase() + text.slice(1) : text);

// Nhãn ưu tiên khi nhãn của bộ máy dài hoặc không phải cách Admin vẫn gọi (nhãn của bộ máy thành từ đồng nghĩa)
const LABEL = {
  phuCapDiLai: 'đi lại',
  phuCapChuyenCan: 'chuyên cần',
  luongKpi: 'lương KPI',
  iDorm: 'ở iDorm',
  tienKpiCu: 'tiền KPI theo phần trăm',
  giuChuyenCan: 'giữ được chuyên cần',
  tinhGioVuotNguong: 'tính giờ vượt ngưỡng',
  tienKpi: 'tiền KPI theo điểm năm thành phần'
};
// Chữ Admin hay gõ và các nhãn cũ của từ vựng tạm: giữ làm từ đồng nghĩa để câu đã viết vẫn đọc được
const EXTRA_SYNONYMS = {
  phuCapDiLai: ['phụ cấp đi lại', 'tiền đi lại'],
  phuCapChuyenCan: ['phụ cấp chuyên cần', 'tiền chuyên cần'],
  heSoNgayKpi: ['hệ số ngày KPI'],
  tienNgayCong: ['tiền ngày công'],
  tongThanhPhanNgay: ['tổng sáu thành phần ngày'],
  luongCoBan: ['lương cơ bản của level', 'lương CB'],
  ngayDiLam: ['số ngày đi làm'],
  ngayCongChuan: ['số ngày công chuẩn'],
  gioVuotNguong: ['giờ vượt ngưỡng'],
  iDorm: ['iDorm'],
  giuChuyenCan: ['giữ chuyên cần', 'đủ điều kiện chuyên cần'],
  tongThuNhap: ['tổng thu nhập', 'thu nhập gộp']
};
const PRIORITY = { formula: 0, variable: 1, builtin: 2, parameter: 3 };

/* ---------- registry: đơn vị của khoá (đối chiếu) ---------- */
const REG_UNIT = { vnd: 'VND', ratio: 'ratio', hour: 'hour', day: 'day', minute: 'minute' };
const regById = new Map<any, any>();
for (const e of registry.entries) regById.set(e.id, e);
const regUnit = (key?) => {
  const e = regById.get(key);
  return e && REG_UNIT[e.unit] ? { unit: REG_UNIT[e.unit], editableBy: e.editableBy, id: e.id } : null;
};

/* ---------- đơn vị của bộ máy → đơn vị của từ vựng ---------- */
const FLAG_BUILTINS = new Set<any>(['giuChuyenCan', 'so']);
const FLAG_VARIABLES = new Set<any>(['iDorm']);
function unitOf(entry?) {
  if (entry.kind === 'builtin' && FLAG_BUILTINS.has(entry.key)) return 'flag';
  if (entry.kind === 'variable' && FLAG_VARIABLES.has(entry.key)) return 'flag';
  return entry.unit;
}

function phrasesFor(key?, engineLabel?, engineSynonyms?, problems?) {
  const label = LABEL[key] || lowerFirst(engineLabel);
  const candidates = [engineLabel, ...(engineSynonyms || []), ...(EXTRA_SYNONYMS[key] || [])].map(lowerFirst);
  const out: any[] = [];
  for (const c of candidates) {
    if (!isValidPhrase(c)) {
      problems.push(`${key}: bỏ từ đồng nghĩa không đọc lại được "${c}"`);
      continue;
    }
    const t = c.trim().replace(/\s+/g, ' ');
    if (t !== label && !out.includes(t)) out.push(t);
  }
  if (!isValidPhrase(label)) throw new Error(`${key}: nhãn "${label}" không hợp lệ; đặt LABEL.${key}`);
  return { label, synonyms: out };
}

// extraVariables: thêm biến vào từ vựng (ví dụ thuộc tính của bậc lương `level.attr.<mã>` nhãn "<nhãn> của level"):
// [{ key, label, synonyms?, unit, domain?, source? }]
function build(options: any = {}) {
  const problems: any[] = [];
  const entries: any[] = [];
  const covers = Engine.FORMULAS.tongThuNhap.requiredDayParts;

  // biến của bộ máy
  for (const e of Object.values<any>(Engine.VARIABLES)) {
    const { label, synonyms } = phrasesFor(e.key, e.label, e.synonyms, problems);
    const out: Record<string, any> = {
      key: e.key,
      label,
      synonyms,
      kind: 'variable',
      unit: unitOf(e),
      domain: e.domain,
      source: e.from
    };
    if (e.nonZero) out.nonZero = true;
    if (e.key === 'tongThanhPhanNgay') out.covers = [...covers];
    entries.push(out);
  }
  for (const e of options.extraVariables || []) {
    const { label, synonyms } = phrasesFor(e.key, e.label, e.synonyms || [], problems);
    entries.push({
      key: e.key,
      label,
      synonyms,
      kind: 'variable',
      unit: e.unit,
      domain: e.domain || 'person',
      source: e.source || e.key,
      extra: true
    });
  }
  // biến THEO NGÀY của bộ máy (miền day): chỉ dùng trong "tổng theo ngày (…)"
  for (const e of Object.values<any>(Engine.DAY_VARIABLES)) {
    const { label, synonyms } = phrasesFor(e.key, e.label, e.synonyms, problems);
    entries.push({ key: e.key, label, synonyms, kind: 'variable', unit: e.unit, domain: 'day', source: e.from });
  }
  // biến mà bộ máy chưa công bố nhưng có trong kết quả tháng hoặc trong hồ sơ
  const gap = (key?, label?, unit?, source?, synonyms: any[] = []) => {
    const p = phrasesFor(key, label, synonyms, problems);
    entries.push({
      key,
      label: p.label,
      synonyms: p.synonyms,
      kind: 'variable',
      unit,
      domain: 'month',
      source,
      engineGap: true
    });
  };
  gap('gioOt', 'giờ OT', 'hour', 'm.otHours', ['giờ làm thêm OT']);
  gap('gioLamBu', 'giờ làm bù', 'hour', 'm.makeupHours');
  gap('gioLamLe', 'giờ làm ngày lễ', 'hour', 'm.holWorkHours');
  gap('gioDem', 'giờ làm đêm', 'hour', 'm.nightHours');
  gap('loaiCoPhuCap', 'loại có phụ cấp', 'flag', '!!(type.travel || type.attendance)');
  gap('coKpi', 'loại có KPI', 'flag', '!!type.kpi');
  gap('kpiDat', 'KPI đạt', 'flag', 'KPI đạt mốc (m.kpiPass; năm thành phần: KpiScore.evaluate(m.kpiParts).pass)');
  gap('kpiNamThanhPhan', 'KPI năm thành phần', 'flag', "m.kpiMethod === 'five'");
  gap('batTamUng', 'bật tạm ứng', 'flag', 'staff.advanceOn !== false');

  // công thức có tên
  for (const e of Object.values<any>(Engine.FORMULAS)) {
    const { label, synonyms } = phrasesFor(e.key, e.label, e.synonyms, problems);
    const out: Record<string, any> = {
      key: e.key,
      label,
      synonyms,
      kind: 'formula',
      unit: e.unit,
      domain: 'month',
      source: e.from
    };
    if (e.locked) out.locked = true;
    if (e.requiredDayParts) out.required = [...e.requiredDayParts];
    entries.push(out);
  }

  // hàm có sẵn bị khoá: chỉ những hàm gọi được bằng chữ (mọi đối số là số; hàm nhận cả hồ sơ người như baoHiem thì không)
  for (const e of Object.values<any>(Engine.BUILTINS)) {
    if (e.args.some(a => a.unit === 'text')) continue;
    const { label, synonyms } = phrasesFor(e.key, e.label, e.synonyms, problems);
    entries.push({
      key: e.key,
      label,
      synonyms,
      kind: 'builtin',
      unit: unitOf(e),
      domain: e.domain === 'day' ? 'day' : 'month',
      locked: true,
      args: e.args.map(a => ({ name: a.name, unit: a.unit === 'count' ? 'flag' : a.unit })),
      source: `PayrollEngine.BUILTINS.${e.key}`
    });
  }
  // phép so sánh có tên: phép (gt, gte…) là tham số của registry, không phải dấu viết sẵn trong công thức
  entries.push({
    key: 'vuotNguongKpi',
    label: 'vượt ngưỡng giờ KPI',
    synonyms: [],
    kind: 'builtin',
    unit: 'flag',
    domain: 'month',
    locked: true,
    args: [
      { name: 'gioVuotNguong', unit: 'hour' },
      { name: 'nguongGio', unit: 'hour' }
    ],
    source: 'so(kpi.overLimitCompare, a, b)',
    engineGap: true
  });

  // tham số (khoá registry)
  // regKey: khoá registry dùng để đối chiếu đơn vị khi registry chưa có dạng `type.<type>.*` (chỉ có type.nv.*)
  const param = (key?, label?, synonyms?, expectUnit?, regKey?) => {
    const reg = regUnit(regKey || key);
    if (!reg) throw new Error(`registry không có khoá ${regKey || key}`);
    if (reg.unit !== expectUnit) throw new Error(`${key}: registry ghi đơn vị ${reg.unit}, từ vựng ghi ${expectUnit}`);
    const p = phrasesFor(key, label, synonyms, problems);
    entries.push({
      key,
      label: p.label,
      synonyms: p.synonyms,
      kind: 'parameter',
      unit: reg.unit,
      domain: 'month',
      registryId: regKey ? key : reg.id,
      editableBy: reg.editableBy
    });
  };
  param('advance.rate', 'tỷ lệ tạm ứng', [], 'ratio');
  param('kpi.overLimitHours', 'ngưỡng giờ vượt KPI', ['ngưỡng giờ KPI'], 'hour');
  param('attendance.overLimitHours', 'ngưỡng giờ vượt chuyên cần', [], 'hour');
  param('ot.rate', 'hệ số OT', [], 'ratio');
  param('ot.holidayRate', 'hệ số làm lễ', [], 'ratio');
  param('type.<type>.travel', 'tỷ lệ phụ cấp đi lại theo loại', ['tỷ lệ đi lại', 'tỷ lệ đi lại NV'], 'ratio');
  param(
    'type.<type>.attendance',
    'tỷ lệ chuyên cần theo loại',
    ['tỷ lệ phụ cấp chuyên cần', 'tỷ lệ chuyên cần', 'tỷ lệ chuyên cần NV'],
    'ratio'
  );
  param(
    'type.<type>.maxAbsent',
    'ngưỡng ngày nghỉ chuyên cần theo loại',
    ['ngưỡng ngày nghỉ chuyên cần'],
    'day',
    'type.nv.maxAbsent'
  );

  // chữ dùng chung của nhiều mục: nhãn của một mục luôn thắng; còn lại theo thứ tự công thức > biến > hàm > tham số
  const labels = new Map<any, any>();
  for (const e of entries) {
    const f = wordsOf(e.label)
      .map(w => Formula.fold(w))
      .join(' ');
    if (labels.has(f)) throw new Error(`nhãn "${e.label}" của ${e.key} trùng nhãn của ${labels.get(f)}`);
    labels.set(f, e.key);
  }
  const owner = new Map<any, any>();
  const ranked = [...entries].sort((a: any, b: any) => PRIORITY[a.kind] - PRIORITY[b.kind]);
  for (const e of ranked) {
    e.synonyms = e.synonyms.filter(s => {
      const f = wordsOf(s)
        .map(w => Formula.fold(w))
        .join(' ');
      if (labels.has(f) && labels.get(f) !== e.key) {
        problems.push(`${e.key}: bỏ "${s}" (là nhãn của ${labels.get(f)})`);
        return false;
      }
      if (owner.has(f) && owner.get(f) !== e.key) {
        problems.push(`${e.key}: bỏ "${s}" (đã thuộc ${owner.get(f)})`);
        return false;
      }
      owner.set(f, e.key);
      return true;
    });
  }
  const check = Formula.checkVocabulary(entries);
  if (!check.ok) throw new Error('từ vựng sinh ra không hợp lệ: ' + JSON.stringify(check.errors));
  return { entries, problems };
}

function readBlock(text?) {
  const i = text.indexOf(BEGIN),
    j = text.indexOf(END);
  if (i < 0 || j < i) throw new Error(`${TARGET}: thiếu cặp dấu ${BEGIN} ... ${END}`);
  return { i, j };
}

async function main() {
  const { entries, problems } = build();
  const check = process.argv.includes('--check');
  const text = fs.readFileSync(TARGET, 'utf8');
  const { i, j } = readBlock(text);
  if (check) {
    const current = require(TARGET).generated || [];
    if (JSON.stringify(current) !== JSON.stringify(entries)) {
      console.error(
        'src/engine/formula-vocab.ts lệch bộ máy hoặc registry. Chạy: node scripts/params/gen-formula-vocab.ts'
      );
      process.exit(1);
    }
    console.log(`formula-vocab: khớp bộ máy và registry (${entries.length} mục).`);
    return;
  }
  const body = `${BEGIN}\n  const GENERATED = ${JSON.stringify(entries, null, 2)};\n  ${END}`;
  const next = text.slice(0, i) + body + text.slice(j + END.length);
  const prettier = require('prettier');
  const formatted = await prettier.format(next, { ...(await prettier.resolveConfig(TARGET)), filepath: TARGET });
  fs.writeFileSync(TARGET, formatted);
  for (const p of problems) console.log('  lưu ý:', p);
  console.log(`formula-vocab: đã ghi ${entries.length} mục.`);
}

if (require.main === module) {
  main().catch(e => {
    console.error(e.message);
    process.exit(1);
  });
}
module.exports = { build, buildVocabulary: build };
