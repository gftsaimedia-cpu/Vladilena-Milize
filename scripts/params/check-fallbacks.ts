'use strict';
// Kiểm bản chép chuyển tiếp: mỗi mô-đun luật dùng chung (public/{actual-hours,approval-view,kpi-score,punch,leave,payroll-calendar}.js)
// giữ một FALLBACK (khoá registry → giá trị) cho trang chưa nạp payroll-params.js. FALLBACK phải bằng PayrollParams.DEFAULTS từng khoá,
// và bản mô-đun dựng từ FALLBACK phải cho ra đúng bản dựng từ DEFAULTS.
//   node scripts/params/check-fallbacks.ts        thoát 1 nếu có lệch
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { isDeepStrictEqual } = require('node:util');
const ROOT = path.join(__dirname, '..', '..');
const { DEFAULTS } = require(path.join(ROOT, 'src/engine/payroll-params'));
const MODULES = ['actual-hours', 'approval-view', 'kpi-score', 'punch', 'leave', 'payroll-calendar', 'work-schedule'];

function problems() {
  const out: any[] = [];
  for (const name of MODULES) {
    const mod = require(path.join(ROOT, 'src/engine', name + '.ts'));
    if (!mod.FALLBACK || typeof mod.create !== 'function') {
      out.push(`${name}.js: thiếu FALLBACK hoặc create(params)`);
      continue;
    }
    for (const [key, value] of Object.entries<any>(mod.FALLBACK))
      if (JSON.stringify(DEFAULTS[key]) !== JSON.stringify(value))
        out.push(
          `${name}.js: FALLBACK["${key}"] = ${JSON.stringify(value)} khác DEFAULTS (${JSON.stringify(DEFAULTS[key])})`
        );
    // Bản dựng từ FALLBACK (khoá vắng ném PARAM_MISSING: FALLBACK đủ khoá) bằng bản dựng từ DEFAULTS
    try {
      const strip = (built?) =>
        Object.fromEntries(Object.entries<any>(built).filter(([, v]: any) => typeof v !== 'function'));
      const a = strip(mod.create(mod.FALLBACK)),
        b = strip(mod.create(DEFAULTS));
      if (!isDeepStrictEqual(a, b)) out.push(`${name}.js: bản dựng từ FALLBACK khác bản dựng từ DEFAULTS`);
    } catch (error) {
      out.push(`${name}.js: create(FALLBACK) lỗi: ${error.message}`);
    }
  }
  return out;
}

// Bảng chép chuyển tiếp của mã máy chủ (lib/*.js): khoá đã có trong DEFAULTS phải bằng nhau; khoá chưa có (registry chưa thêm) chỉ được liệt kê
const LIB_MODULES = ['auth'];
function libProblems() {
  const out: any[] = [],
    pending: any[] = [];
  for (const name of LIB_MODULES) {
    // Đọc bảng từ văn bản nguồn: KHÔNG require lib/*.js vì chúng mở cơ sở dữ liệu lúc nạp
    const source = fs.readFileSync(path.join(ROOT, 'src/platform', name + '.ts'), 'utf8');
    const m = new RegExp('const FALLBACK = Object\\.freeze\\((\\{[\\s\\S]*?\\n\\})\\);').exec(source);
    if (!m) {
      out.push(`src/platform/${name}.ts: không tìm thấy const FALLBACK = Object.freeze({...})`);
      continue;
    }
    const table = vm.runInNewContext(`(${m[1]})`);
    for (const [key, value] of Object.entries<any>(table)) {
      if (!Object.hasOwn(DEFAULTS, key)) pending.push(key);
      else if (!isDeepStrictEqual(DEFAULTS[key], value))
        out.push(
          `src/platform/${name}.ts: FALLBACK["${key}"] = ${JSON.stringify(value)} khác DEFAULTS (${JSON.stringify(DEFAULTS[key])})`
        );
    }
  }
  return { problems: out, pending };
}

module.exports = { problems, libProblems };
if (require.main === module) {
  const lib = libProblems();
  const found = [...problems(), ...lib.problems];
  for (const line of found) console.error(line);
  if (found.length) process.exit(1);
  console.log(`check-fallbacks đạt: ${MODULES.length} mô-đun, ${LIB_MODULES.length} mã máy chủ`);
  if (lib.pending.length) console.log(`khoá chờ registry (chưa có trong DEFAULTS): ${lib.pending.join(', ')}`);
}
