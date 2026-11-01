'use strict';
const { AsyncList } = require('../../shared/async-list');
// Câu cảnh báo của kỳ lương: danh sách kiểm, thực lĩnh âm. Dùng cho src/domain/period/periods.ts.
const config = require('../../platform/config');
const { warn, warnIf } = require('../../platform/warnings');

// Câu nói chuyện gì bất thường, bao nhiêu, hệ quả cho tiền lương. Hệ quả đối chiếu với bộ máy:
//   ngày chờ Admin (quên Check-in/out, chờ đối soát, đang mở) có kind 'pending' nên chưa được tính tiền (src/engine/actual-hours.ts → setPending);
//   khoản tự khai chưa duyệt bị bỏ hoặc đổi theo src/engine/approval-view.ts → payView.
const CHECKLIST_TEXT = Object.freeze({
  MONTH_NOT_ENDED: (n?, m?) =>
    `Tháng ${m} chưa hết: chốt công bây giờ thì các ngày còn lại chưa có dữ liệu và chưa được tính tiền (số tiền chỉ tính các ngày đã tới).`,
  OPEN_SESSIONS: (n?) =>
    `Còn ${n} lượt Check-in chưa Check-out: ngày đó chưa có giờ ra nên chưa tính tiền cho tới khi Admin xử lý.`,
  FORGOT_PUNCH: (n?) =>
    `Còn ${n} ngày quên Check-in hoặc Check-out đang chờ Admin xử lý: các ngày này chưa tính tiền (0 ₫) cho tới khi xử lý (nếu đã tính lương theo giờ thực tế).`,
  PUNCH_REVIEW: (n?) =>
    `Còn ${n} ngày chờ đối soát (ngoài ca, nhiều lượt, không khớp ca): các ngày này chưa tính tiền cho tới khi Admin xử lý.`,
  EXPLANATION_PENDING: (n?) =>
    `Còn ${n} ngày có giải trình chưa được duyệt: các ngày này chưa tính công (0 ₫) cho tới khi Admin duyệt.`,
  ABSENT_NO_EXPLANATION: (n?) =>
    `Còn ${n} ngày trong lịch không có Check-in/out và chưa có giải trình: các ngày này tính vắng (0 công, 0 ₫) cho tới khi có giải trình được duyệt.`,
  PENDING_APPROVALS: (n?, m?) =>
    `Còn ${n} khoản tự khai của tháng ${m} chưa được duyệt: khoản chưa duyệt không vào tiền lương (tính như chưa khai; phép năm chưa duyệt tính là nghỉ không lương).`,
  MISSING_START_DATE: (n?) => `Có ${n} người CTV/NV thiếu ngày bắt đầu làm: phép năm của họ chưa tính được.`,
  ISAT_INVALID: (n?) =>
    `Có ${n} ngày iSAT sai thứ hoặc chức vụ không có quyền lợi iSAT: các ngày này không được trả lương (0 ₫) cho tới khi Admin sửa hoặc bỏ.`,
  MISSING_SHIFT: (n?) => `Có ${n} người chưa gán ca cố định: không Check-in được nên chưa có giờ thực tế để tính.`,
  PENDING_PAY_ENTRIES: (n?) => `Còn ${n} khoản điền thêm chờ duyệt: khoản chưa duyệt không vào lương kỳ này.`,
  RUN_STALE: () =>
    'Dữ liệu hoặc cài đặt đã đổi sau lần tính hiện hành: duyệt bây giờ chốt số cũ, hãy tính lại nếu muốn số mới.'
});
// Mọi mục của danh sách kiểm thành cảnh báo (severity 'warn') và mang câu nói hệ quả.
function soften(items?, month?) {
  return items.map(i => {
    const text = CHECKLIST_TEXT[i.code];
    return { ...i, severity: 'warn', acknowledgeable: false, ...(text ? { message: text(i.count, month) } : {}) };
  });
}

// Câu cảnh báo: người, số tiền âm và hệ quả; các khoản trừ lớn hơn thu nhập nên số chi trả sẽ âm nếu không sửa
const NEG_SHOWN = config.WARN_NAMES_SHORT; // số người nêu tên trong câu cảnh báo; còn lại ghi "và N người khác"
const negativeNetWarning = (negative?) =>
  `Thực lĩnh âm ở ${negative.length} người: ${negative
    .slice(0, NEG_SHOWN)
    .map(n => `${n.username} (${n.net.toLocaleString('vi-VN')} ₫)`)
    .join(
      ', '
    )}${negative.length > NEG_SHOWN ? ` và ${negative.length - NEG_SHOWN} người khác` : ''}. Các khoản trừ (bảo hiểm, thuế, tạm ứng) lớn hơn thu nhập: nếu duyệt, số chi trả của họ là số âm. Nên kiểm tra số đã sửa, tạm ứng, bảo hiểm hoặc công trước khi chi trả.`;

// Phiếu có thực lĩnh chi trả âm: cảnh báo đỏ nêu người và số âm
function warnNegativeNet(month?, negative?) {
  warnIf('PAYSLIP_NEGATIVE_NET', negative.length > 0, {
    severity: 'danger',
    message: () => negativeNetWarning(negative),
    details: { month, count: negative.length, items: negative }
  });
}
// Chốt công: blockers là các mục chưa được bỏ qua; mỗi mục một cảnh báo mang mã của mục
function warnLockChecklist(blockers?, items?) {
  const violated = blockers.length > 0;
  if (
    warnIf('PERIOD_NOT_READY', violated, {
      message: 'Chốt công khi còn việc chưa xử lý: xem từng cảnh báo bên dưới'
    })
  )
    for (const b of blockers.map(x => items.find(i => i.code === x.code)))
      warn(b.code, b.message, { count: b.count, link: b.link });
}

// Số phiếu store tự duyệt (draft, pending) và tự loại (phiếu lỗi chưa nêu trong excludeErrors) khi duyệt kỳ, để ghi vào nhật ký
function autoCounts(slips?, excludeErrors?) {
  const named = new Set<any>((Array.isArray(excludeErrors) ? excludeErrors : []).map(x => x && x.username));
  return {
    autoApproved: slips.filter(r => r.status === 'draft' || r.status === 'pending').length,
    autoExcluded: slips.filter(r => r.status === 'error' && !named.has(r.username)).length
  };
}

export = {
  autoCounts,
  CHECKLIST_TEXT,
  soften,
  negativeNetWarning,
  warnNegativeNet,
  warnLockChecklist
};
