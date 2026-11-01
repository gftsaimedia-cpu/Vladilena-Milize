'use strict';
// "MỘT NGUỒN" cho lịch làm việc:
// lịch chỉ được hỏi qua src/engine/work-schedule.ts, nên test quét mã nguồn: ngoài danh sách cho phép (mỗi mục có lý do), không tệp sản phẩm nào đọc thứ trong tuần
// của lịch trực tiếp (`dows`, `type.<mã>.dows`, `T.dows`, `staff.sched`).
// Chia hai phần:
//   - máy chủ và mô-đun dùng chung (server.js, lib/, public/*.js);
//   - giao diện (src/engine/admin/, src/engine/nhan-vien/): đọc workSchedule và scheduledDates do máy chủ trả.
// Ngoại lệ có chủ ý: khối đóng băng legacy-payroll-block.js và đợt di chuyển một lần của src/domain/attendance/attendance-sessions.ts.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadPayroll } = require('../helpers/payroll-vm');

const ROOT = path.join(__dirname, '../..');
const EXPECTED = { tts: [1, 2, 3, 4, 5], ctv: [1, 2, 3, 4, 5, 6], nv: [1, 2, 3, 4, 5, 6] };

/* ---------- quét "một nguồn" ---------- */
// Mỗi mục: tệp (đường dẫn tương đối, dấu /) được phép đọc trực tiếp, và LÝ DO.
const ALLOWED = {
  'src/engine/work-schedule.ts': 'chính mô-đun: nguồn duy nhất',
  'src/engine/approval-view.ts':
    'create(params) dựng bảng SCHEDULE từ khoá type.<mã>.dows và FALLBACK: giữ xuất ra để tương thích (thiết kế mục 2 dòng 13), không còn là nguồn quyết định ngày lễ',
  'src/engine/payroll-params.ts':
    'DEFAULTS: nơi đặt giá trị tham số type.<mã>.dows (định nghĩa tham số; ngày công chuẩn theo lịch nay do work-schedule.js đếm, methodView đã bỏ 16/10/2026)',
  'src/params/save.ts':
    'kiểm chéo khoá khi Admin lưu tham số: lưu khoá lịch thì đồng bộ hàng duyệt (thiết kế 4.4); không hỏi ngày làm',
  'src/params/blocks.ts':
    'bảng khối phụ cấp: liệt kê đuôi khoá lịch của chức vụ là dữ liệu cấu hình, không hỏi ngày làm',
  'src/params/block-defs.ts': 'như blocks.js: định nghĩa khối',
  'src/params/positions.ts':
    'đọc và sao chép các khoá type.<mã>.* của một chức vụ (dữ liệu chức vụ, không hỏi ngày làm)',
  'src/domain/positions.ts': 'sao chép khoá chức vụ',
  'src/domain/position/position-catalog.ts':
    'danh mục chức vụ trong DB (28/10/2026): lưu thứ đi làm của từng phiên bản chức vụ và đưa ra đúng khoá type.<mã>.dows cho bộ tham số của tháng; không hỏi ngày làm',
  'src/domain/position/schema.js':
    'nạp danh mục chức vụ lần đầu từ DEFAULTS type.<mã>.dows (dữ liệu chức vụ, không hỏi ngày làm)',
  'src/domain/schedule.ts':
    'cầu nối của máy chủ: liệt kê khoá type.<mã>.dows của bộ tham số cho GET /api/team rồi giao việc giải lịch cho work-schedule.js',
  'src/engine/punch.ts':
    'quy tắc Check-in/out nhận staff.sched (tương thích) khi không có staff.isWorkDay: giữ nguyên theo thiết kế mục 2 dòng 19',
  'src/engine/admin/view-khung-luong.js': 'màn Cài đặt: nhãn và ô nhập của các khoá lịch chức vụ',
  'src/engine/admin/view-ho-so.js':
    'dòng Lịch làm việc của ngăn kéo hồ sơ in nhãn từ pattern.dows của GET /api/staff/:u/schedule (chỉ hiển thị, không tính ngày làm; ngày làm do máy chủ trả ở scheduledDates)',
  'src/engine/admin/cai-dat-so-do.js':
    'ngăn kéo ① của bảng quyền lợi sửa khoá type.<mã>.dows: tên khoá tham số là hợp đồng của PUT /api/settings/params (dữ liệu nhập, không tính ngày làm)'
};
const walk = (dir?, out: any[] = []) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file, out);
    else if (/\.(js|cjs)$/.test(entry.name)) out.push(file);
  }
  return out;
};
// bỏ chú thích khối và chú thích cuối dòng (đủ cho việc đếm; chuỗi chứa "//" như URL không có trong các mẫu cần tìm)
const stripComments = (text?) =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map(line => line.replace(/(^|[\s;,(])\/\/.*$/, '$1'))
    .join('\n');
// thứ trong tuần của lịch: dows (kể cả khoá type.<mã>.dows) và mảng thứ chép trong staff.sched
const READS = /\bdows\b|\.dows\b|\btype\.[^'"`\s]*dows|\bstaff\.sched\b|\.sched\b|\bsched:/;
function offenders(files?) {
  const out: any[] = [];
  for (const file of files) {
    const rel = path.relative(ROOT, file).split(path.sep).join('/');
    if (ALLOWED[rel]) continue;
    const lines = stripComments(fs.readFileSync(file, 'utf8')).split('\n');
    lines.forEach((line, i) => {
      if (READS.test(line)) out.push(`${rel}:${i + 1}: ${line.trim().slice(0, 100)}`);
    });
  }
  return out;
}
const productionFiles = () => [...walk(path.join(ROOT, 'src'))];
const uiFiles = () => [...walk(path.join(ROOT, 'src/engine/admin')), ...walk(path.join(ROOT, 'src/engine/nhan-vien'))];

test('S1: một nguồn (máy chủ và mô-đun dùng chung): ngoài danh sách cho phép, server.js, lib/ và public/*.js không đọc dows, type.<mã>.dows hay staff.sched trực tiếp', () => {
  assert.deepEqual(offenders(productionFiles()), []);
});

test('S1: một nguồn: không còn bản lịch chép tay dạng { tts: [...], ctv: [...], nv: [...] } trong mã sản phẩm ngoài approval-view.js (SCHEDULE giữ xuất ra để tương thích) và payroll-params.js', () => {
  const LITERAL = /\{\s*tts:\s*\[[\d,\s]+\],\s*ctv:\s*\[[\d,\s]+\],\s*nv:\s*\[[\d,\s]+\]\s*\}/;
  const keep = new Set<any>(['src/engine/approval-view.ts', 'src/engine/payroll-params.ts']);
  const hits = [...productionFiles()]
    .map(f => path.relative(ROOT, f).split(path.sep).join('/'))
    .filter(rel => !keep.has(rel) && LITERAL.test(stripComments(fs.readFileSync(path.join(ROOT, rel), 'utf8'))));
  assert.deepEqual(hits, []);
});

/* ---------- các ca khác ---------- */
test('S1: lịch mẫu của bài test đúng như luật: TTS Thứ 2–6, CTV và NV Thứ 2–7', () => {
  assert.deepEqual(EXPECTED.tts, [1, 2, 3, 4, 5]);
  assert.deepEqual(EXPECTED.ctv, EXPECTED.nv);
  assert.deepEqual(EXPECTED.nv, [1, 2, 3, 4, 5, 6]);
});
test('S1: PayrollParams.DEFAULTS giữ lịch mẫu của ba chức vụ (nguồn giá trị của mô-đun lịch)', () => {
  const { DEFAULTS } = require('../../src/engine/payroll-params');
  for (const type of Object.keys(EXPECTED))
    assert.deepEqual(DEFAULTS[`type.${type}.dows`], EXPECTED[type], `DEFAULTS type.${type}.dows`);
});
test('S1: khối công thức đóng băng (legacy-payroll-block.js): TYPES[*].dows khớp lịch mẫu', () => {
  const { api: dowsOf } = loadPayroll({
    append: 'this.dowsOf = Object.fromEntries(Object.entries(TYPES).map(([k, t]) => [k, t.dows]));',
    exportAs: 'dowsOf',
    timeout: 1000
  });
  assert.deepEqual(JSON.parse(JSON.stringify(dowsOf)), EXPECTED);
});
