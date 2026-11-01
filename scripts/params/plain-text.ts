'use strict';
// Chữ hiển thị cho Admin của từng mục registry, viết bằng lời cho chuyên viên C&B (không tên tệp, tên hàm, tên tài liệu, mã câu hỏi, tên giai đoạn).
// Nguồn: scripts/params/plain-text.json: id → { help, basis, legalBasis?, lockReason? }.
//   help          một câu: mục này đổi gì
//   basis         ai chốt và đang ở trạng thái nào; luật chỉ ghi tên luật và điều
//   legalBasis    (mục có sàn, trần, đúng luật) trích dẫn luật ngắn, hiện trong thông báo khi giá trị chạm sàn hoặc trần
//   lockReason    (mục khoá) lý do khoá; vắng thì dùng basis
// Ghi chú cho lập trình viên (mặc định của mã, chi phí, giai đoạn, nguồn trong mã, bản help/basis cũ) nằm ở các trường API KHÔNG gửi cho giao diện:
// phase, cost và devNote (src/params/store.ts → view chỉ gửi defaultNote đã cắt phần nguồn).
// applyPlainText là hàm thuần trên mảng mục; apply-plain-text.js dùng nó để vá registry.data.json đã có.
const text = require('./plain-text.json');
const firstRunText = require('./first-run-text.json'); // Đề xuất và căn cứ của Cài đặt ban đầu (cùng quy tắc chữ)

// Mức sàn, trần có ghi chú tiếng nhà phát triển: thay bằng lời (theo id mục)
const LIMIT_NOTES = {
  'level.<type>.<level>': 'Chỉ cảnh báo cho tới khi pháp chế xác nhận',
  'holiday.makeupRate': 'Tạm thời, chờ pháp chế xác nhận'
};
const OPTION_NOT_READY = 'Chưa dùng được; sẽ có ở bản sau';
const ROW_RULES = {
  'level.<type>.<level>': 'Thêm bậc ở cuối được; không bớt được bậc đang có người giữ'
};
const LABELS = {
  'attendance.tiers': 'Bảng giảm theo bậc (số ngày nghỉ và % giữ lại)',
  'time.shiftStructure': 'Ca qua đêm thuộc ngày bắt đầu ca',
  'system.auth.trustProxyMaxHops': 'Số tầng máy chủ trung gian tối đa được tin'
};
// Mặc định của app không có phần giá trị (chỉ có nguồn trong mã) thì để trống; vài mục viết lại bằng lời
const DEFAULT_NOTES = {
  'contract.expiryWarnDays': '30',
  'formula.tongThuNhap': 'Công thức có sẵn của hệ thống',
  'formula.phuCapDiLai': 'Công thức có sẵn của hệ thống',
  'formula.phuCapChuyenCan': 'Công thức có sẵn của hệ thống',
  'formula.luongKpi': 'Công thức có sẵn của hệ thống',
  'formula.heSoNgayKpi': 'Công thức có sẵn của hệ thống',
  'formula.tyLeNgayDiLam': 'Công thức có sẵn của hệ thống',
  'formula.tamUng': 'Công thức có sẵn của hệ thống'
};
const DEV_SOURCE = /\.js\b|\.md\b|\.html\b|→|TAX_RULES|calcMonth|calcNet|calcDay|DEFAULT_GRAPH|AGENTS|PARAM_/;
const SOURCE_SEPARATOR = ' · ';

function applyPlainText(entries?) {
  for (const e of entries) {
    const t = text[e.id];
    if (!t) throw new Error(`plain-text.json: thiếu mục ${e.id}`);
    // bản cũ (có tên tệp, mã) giữ lại một lần cho lập trình viên; chạy lại không ghi đè
    if (!e.devNote)
      e.devNote = {
        help: e.help ?? null,
        basis: e.basis ?? null,
        defaultNote: e.defaultNote ?? null,
        lockReason: e.lockReason ?? null,
        legalBasis: e.legal && e.legal.basis ? e.legal.basis : null
      };
    e.help = t.help;
    e.basis = t.basis;
    if (e.ui) e.ui.help = t.help;
    // Mặc định của app: chỉ phần giá trị, bỏ phần nguồn trong mã sau dấu " · "
    const note = e.devNote.defaultNote;
    if (typeof note === 'string') {
      const value = note.split(SOURCE_SEPARATOR)[0];
      e.defaultNote = note.includes(SOURCE_SEPARATOR) || !DEV_SOURCE.test(value) ? value : '';
    }
    if (DEFAULT_NOTES[e.id]) e.defaultNote = DEFAULT_NOTES[e.id];
    if (firstRunText[e.id]) e.firstRun = { recommended: firstRunText[e.id].recommended, why: firstRunText[e.id].why };
    if (e.lockReason !== undefined) e.lockReason = t.lockReason || t.basis;
    if (e.legal) {
      if (t.legalBasis) e.legal.basis = t.legalBasis;
      for (const side of ['floor', 'ceiling'])
        if (e.legal[side] && e.legal[side].note && LIMIT_NOTES[e.id]) e.legal[side].note = LIMIT_NOTES[e.id];
    }
    for (const option of e.options || [])
      if (option.available === false) {
        option.note = OPTION_NOT_READY;
        delete option.phase;
      }
    if (ROW_RULES[e.id] && e.ui && e.ui.table) e.ui.table.rowRules = ROW_RULES[e.id];
    if (LABELS[e.id]) e.label = LABELS[e.id];
  }
  return entries;
}

module.exports = { applyPlainText, text };
