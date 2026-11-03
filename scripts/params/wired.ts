'use strict';
// Cờ `wired` của registry: một khoá chỉ `wired: true` khi (1) bộ máy src/engine/payroll-engine.ts hoặc src/ai/*
// ĐỌC nó từ bộ tham số và (2) không còn bản sao hằng số của giá trị đó ở chỗ khác mà chạy thật (hằng số trong server.js, các mô-đun dùng chung
// punch, actual-hours, kpi-score, approval-view). Khoá chưa nối mà vẫn cho Lưu thì Lưu "không có tác dụng" hoặc, tệ hơn, bộ máy tính một
// số còn nơi kiểm đầu vào dùng số cũ. PUT /api/settings/params từ chối khoá `wired: false` bằng 400 PARAM_NOT_WIRED.
//
// Kiểm tĩnh, không chạy mã: đọc văn bản nguồn. params:check so cờ trong registry với kết quả ở đây, nên khi một mô-đun chuyển sang đọc params
// (hết bản sao) hoặc khi có bản sao mới, params:check báo lỗi cho tới khi chạy lại `node scripts/params/wired.ts --write`.
//   node scripts/params/wired.ts            in bảng và số lượng
//   node scripts/params/wired.ts --write    ghi cờ vào src/params/registry.data.json (chỉ đổi trường wired)
const fs = require('node:fs');
const path = require('node:path');
const { extract, ROOT } = require('./extract-defaults');
const { isKeyWired } = require('../../src/params/wired-flag');
const registry = require(path.join(ROOT, 'src/params/registry.ts'));

const read = (file?) => fs.readFileSync(path.join(ROOT, file), 'utf8');
// Nơi đọc bộ tham số đã giải: bộ máy, lớp dẫn xuất của payroll-params.js (không tính khối DEFAULTS được sinh), AI, và hai mô-đun máy chủ
// nhận params từ paramsStore.resolve (kỳ lương, ước tính của nhân sự)
const ENGINE_FILES = [
  'src/engine/payroll-engine.ts',
  'src/engine/payroll-params.ts',
  'src/engine/pay-tail-calc.ts', // phép chọn của bảo hiểm và thuế do Kế toán cấu hình
  'src/domain/period/periods.ts',
  'src/domain/payroll/payroll-service.ts',
  'src/engine/pay-options-calc.ts', // phương án cách tính: pay.method, attendance.lossMode, shortHoursRounding, advance.basis
  'src/engine/work-schedule.ts', // lịch làm việc: type.<mã>.workdaysMode, dows, workdays
  'src/domain/limits.ts', // giới hạn khai: isat.monthlyLimit, tham số nghỉ giữa ca của trần giờ ngày
  // Sáu mô-đun luật dùng chung nhận params qua create(params). Bảng FALLBACK của chúng là bản chép chuyển tiếp bằng DEFAULTS
  // (scripts/params/check-fallbacks.ts kiểm): không tính là nơi đọc và không tính là bản sao chạy thật
  ...['actual-hours', 'approval-view', 'kpi-score', 'punch', 'leave', 'payroll-calendar'].map(m => `src/engine/${m}.ts`)
].filter(f => f.endsWith('.ts'));
// Khoá dựng bằng chuỗi nhiều dòng hoặc nối chuỗi mà biểu thức chính quy bên dưới không bắt: ghi nơi dựng và bằng chứng nó còn đó
const EXTRA_READS = [
  { pattern: 'law.regionMinWage.*', file: 'src/engine/payroll-params.ts', re: /'law\.regionMinWage\.' \+/ }
];
// Khoá dựng động type.<mã>.<đuôi> (mẫu 'type.*.*' ở trên) khớp MỌI đuôi, kể cả đuôi mà bộ máy không đọc theo tên: ở đây khai các đuôi đó để cờ không nói dối.
// `named` là bằng chứng: chỉ khi KHÔNG tệp nào của ENGINE_FILES (ngoài bảng GENERATED và FALLBACK) nhắc tên đuôi thì khoá mới bị coi là chưa đọc;
// khi bộ máy bắt đầu đọc theo tên, dòng này tự hết hiệu lực và `node scripts/params/wired.ts --write` trả cờ về true.
const NOT_READ_DYNAMIC = [
  {
    pattern: 'type.*.probationPayPct',
    named: /probationPayPct/,
    why: 'không có thử việc (chủ quyết định 16/10/2026): bộ máy không đọc type.<mã>.probationPayPct, khoá chỉ nằm trong bảng loại do khuôn type.<mã>.<đuôi> dựng'
  }
];
// Bỏ bảng FALLBACK (const FALLBACK = Object.freeze({ … })) khỏi văn bản: các khoá trong đó chỉ là bản chép, không phải nơi đọc
const withoutFallback = (text?) => {
  const at = text.search(/const FALLBACK = Object\.freeze\(\{/);
  if (at < 0) return text;
  let depth = 0;
  for (let i = text.indexOf('{', at); i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}' && --depth === 0) return text.slice(0, at) + text.slice(i + 1);
  }
  return text;
};
const withoutGenerated = (text?) => {
  const begin = text.indexOf('GENERATED:BEGIN'),
    end = text.indexOf('GENERATED:END');
  return begin >= 0 && end > begin ? text.slice(0, begin) + text.slice(end) : text;
};

/* ---------- (1) khoá nào bộ máy hoặc AI đọc: chuỗi và biểu thức chính quy trong nguồn, ${…} và <…> thành đoạn bất kỳ ---------- */
// Chuỗi kết thúc bằng dấu chấm (tiền tố) KHÔNG tính là đọc: danh sách tiền tố chỉ để mô tả. Khoá dựng bằng nối chuỗi khai ở EXTRA_READS.
const norm = (text?) => text.replace(/\$\{[^}]*\}/g, '*').replace(/<[a-zA-Z]+>/g, '*');
// Các dòng NOT_READ_DYNAMIC còn hiệu lực: không tệp nào của bộ máy nhắc tên đuôi
function notReadPatterns() {
  const texts = ENGINE_FILES.map(file => withoutFallback(withoutGenerated(read(file))));
  return NOT_READ_DYNAMIC.filter(n => !texts.some(text => n.named.test(text)));
}
function readPatterns() {
  const patterns = new Set<any>();
  for (const file of ENGINE_FILES) {
    const text = withoutFallback(withoutGenerated(read(file)));
    for (const m of text.matchAll(/(['"`])([A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z0-9_<>${}]*)+)\1/g))
      if (!m[2].endsWith('.')) patterns.add(norm(m[2]));
    for (const m of text.matchAll(/\/\^((?:[^/\n\\]|\\.)+)\//g)) {
      if (!/\\\./.test(m[1])) continue; // chỉ biểu thức có dấu chấm thoát (khuôn khoá)
      const converted = m[1]
        .replace(/\(\?<[a-zA-Z]+>[^)]*\)/g, '*')
        .replace(/\\\./g, '.')
        .replace(/\$$/, '');
      patterns.add(converted);
    }
  }
  for (const extra of EXTRA_READS) if (extra.re.test(read(extra.file))) patterns.add(extra.pattern);
  return [...patterns];
}
const toRegex = (pattern?) =>
  new RegExp(
    '^' +
      pattern
        .split('.')
        .map(seg => (seg === '*' ? '[^.]+' : seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
        .join('\\.') +
      '$'
  );

/* ---------- (2) bản sao hằng số còn chạy thật ngoài bộ máy ---------- */
// Khoá có giá trị nằm trong mô-đun dùng chung (nguồn của DEFAULTS là chính mô-đun đó) hoặc trong server.js / punch.js: mô-đun chưa nhận
// params nên đổi tham số không đổi nó.
// Mô-đun luật dùng chung (ActualHours, KpiScore, ApprovalView, punch) KHÔNG tính: chúng đọc params qua create(), hằng số trong đó chỉ là mặc định.
const COPY_ORIGIN = [/^server/];
// Bản sao không nằm trong nguồn của DEFAULTS: mỗi dòng ghi nơi chép và biểu thức chính quy chứng minh nó còn đó
const SERVER_COPIES = [
  {
    pattern: 'level.*.*.kpi',
    file: 'src/server.ts',
    re: /const KPI_MAX = /,
    why: 'server.js → KPI_MAX (kiểm lương KPI tối đa khi nhập)'
  },
  {
    pattern: 'type.*.kpiPass',
    file: 'src/server.ts',
    re: /const KPI_PASS = /,
    why: 'server.js → KPI_PASS (mốc KPI đạt)'
  },
  {
    pattern: 'type.*.dows',
    file: 'src/server.ts',
    re: /const SCHED_OF = /,
    why: 'server.js → SCHED_OF (thứ trong lịch làm việc)'
  },
  {
    pattern: 'type.*.nightOptions',
    file: 'src/server.ts',
    re: /Number\(b\.nightPct\) === \d+/,
    why: 'server.js → PUT /api/staff (nightPct 40 hoặc 60)'
  },
  // Nơi ngoài bộ máy còn gọi mô-đun luật dùng chung BẢN MẶC ĐỊNH (không create(params) theo tháng): các khoá nó đọc vẫn là bản sao chạy thật.
  // `unless` chứng minh nơi đó đã chuyển sang create(params): khớp thì không còn là bản sao.
  {
    pattern: 'attendance.openSessionMaxHours',
    file: 'src/domain/attendance/attendance-sessions.ts',
    re: /require\('\.\.\/public\/punch'\)/,
    unless: /\.create\(/,
    why: 'src/domain/attendance/attendance-sessions.ts dùng punch mặc định (buildDay, forgotDay)'
  },
  {
    pattern: 'attendance.earlyCheckinMaxHours',
    file: 'src/domain/attendance/attendance-sessions.ts',
    re: /require\('\.\.\/public\/punch'\)/,
    unless: /\.create\(/,
    why: 'src/domain/attendance/attendance-sessions.ts dùng punch mặc định (buildDay, forgotDay)'
  },
  // shift.preset.*.*: không còn bản sao chạy thật. src/domain/attendance/attendance-sessions.ts dùng punch mặc định chỉ trong đợt di chuyển
  // MỘT LẦN lúc nạp src/platform/db cho dấu Check-in cũ chưa có phiên (trước khi có tham số theo tháng); src/ai/review.ts chỉ hỏi mã ca có trong bảng
  // (ActualHours.SHIFT_TIMES có mặt), mã ca không đổi khi sửa giờ.
  {
    pattern: 'type.*.dows',
    file: 'src/domain/approvals/approvals.ts',
    re: /require\('\.\.\/public\/approval-view/,
    unless: /\.create\(/,
    why: 'src/domain/approvals/approvals.ts dùng approval-view mặc định (dayCtx, itemOf: lịch làm việc)'
  }
];

function derive() {
  const { origin } = extract();
  const reads = readPatterns().map(toRegex);
  const notRead = notReadPatterns().map(n => ({ ...n, regex: toRegex(n.pattern) }));
  const copies = SERVER_COPIES.filter(c => c.re.test(read(c.file)) && !(c.unless && c.unless.test(read(c.file)))).map(
    c => ({ ...c, regex: toRegex(c.pattern) })
  );
  const result = new Map<any, any>();
  for (const entry of registry.entries) {
    const editable =
      entry.valueBearing &&
      !entry.backing &&
      !['fixed', 'removed'].includes(entry.class) &&
      !!registry.WRITE_CAP[entry.editableBy];
    if (!editable) {
      result.set(entry.id, { wired: null, reason: 'không sửa được trên màn' });
      continue;
    }
    const keys = registry.keysOf(entry);
    if (!keys.length) {
      // mục không có khoá trong DEFAULTS (ví dụ họ khoá chưa có hàng): coi như chưa nối
      result.set(entry.id, { wired: false, reason: 'chưa có khoá trong DEFAULTS' });
      continue;
    }
    const unread = keys.filter(k => !reads.some(r => r.test(k)) || notRead.some(n => n.regex.test(k)));
    const copied = keys.map(k => {
      const byOrigin = COPY_ORIGIN.find(re => re.test(String(origin[k] || '')));
      if (byOrigin) return { key: k, why: `giá trị còn nằm trong ${origin[k]}` };
      const byList = copies.find(c => c.regex.test(k));
      return byList ? { key: k, why: byList.why } : null;
    });
    // từng khoá: chưa đọc, hoặc còn bản sao → chưa nối
    const bad = new Map<any, any>();
    for (const k of unread) bad.set(k, notRead.find(n => n.regex.test(k))?.why ?? `bộ máy và AI chưa đọc ${k}`);
    for (const c of copied) if (c && !bad.has(c.key)) bad.set(c.key, `${c.key}: ${c.why}`);
    if (!bad.size) result.set(entry.id, { wired: true, reason: 'bộ máy đọc, không còn bản sao' });
    else {
      // bảng hỗn hợp (ví dụ bậc lương: lương cơ bản đã nối, lương KPI tối đa còn bản sao ở server.js): chỉ khoá liệt kê mới bị chặn
      const mixed = bad.size < keys.length;
      result.set(entry.id, {
        wired: false,
        reason: [...bad.values()][0],
        ...(mixed ? { unwiredKeys: [...bad.keys()].sort() } : {})
      });
    }
  }
  return result;
}

module.exports = { derive, readPatterns, SERVER_COPIES, isKeyWired };

if (require.main === module) {
  const derived = derive();
  if (process.argv.includes('--write')) {
    const file = path.join(ROOT, 'src/params/registry.data.json');
    const data = JSON.parse(fs.readFileSync(file, 'utf8')); // đọc ngay trước khi ghi: không mang bản cũ
    for (const entry of data.entries) {
      const got = derived.get(entry.id);
      if (!got) continue;
      delete entry.unwiredKeys;
      if (got.wired === null) delete entry.wired;
      else entry.wired = got.wired;
      if (got.unwiredKeys) entry.unwiredKeys = got.unwiredKeys;
    }
    fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
    console.log('Đã ghi cờ wired vào src/params/registry.data.json (chạy prettier --write lên tệp này)');
  }
  const rows = [...derived.entries()].filter(([, v]: any) => v.wired !== null);
  console.log(
    `wired: ${rows.filter(([, v]: any) => v.wired).length} true, ${rows.filter(([, v]: any) => !v.wired).length} false`
  );
  for (const [id, v] of rows) console.log(`${v.wired ? 'TRUE ' : 'false'} ${id.padEnd(40)} ${v.reason}`);
}
