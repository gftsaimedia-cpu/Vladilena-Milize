/* Nhãn trạng thái chấm công, dùng chung cho màn Admin (window.AttendanceStatus) và màn nhân viên (require trong Node để kiểm thử).
   Máy chủ phân loại từng lượt Check-in/out và gửi kèm mỗi lượt: status (mã trạng thái) và statusNote (lý do ngắn). Ở đây chỉ đổi mã
   ra chữ, chọn mã đại diện cho một ô ngày có nhiều lượt và lấy lý do để hiện thành chữ nhỏ; không tự phân loại lại giờ vào, ra. */
(function (root: any) {
  'use strict';
  const LABEL = Object.freeze({
    'checked-in': 'Đã Check-in',
    'checked-out': 'Đã Check-out',
    pending: 'Chờ xử lý',
    approved: 'Được phê duyệt',
    rejected: 'Bị từ chối',
    admin: 'Đã chấm công'
  });
  // Thứ tự ưu tiên khi một ngày có nhiều lượt: lượt đứng trước quyết định nhãn của ô ngày
  const DAY_ORDER = Object.freeze(['pending', 'rejected', 'checked-in', 'approved', 'admin', 'checked-out']);
  // Màu nhãn: on (đang mở lượt), done (đã xong), pending (cần xử lý), rejected (bị từ chối); mỗi màn đổi sang lớp màu của mình
  const TONE = Object.freeze({
    'checked-in': 'on',
    'checked-out': 'done',
    pending: 'pending',
    approved: 'done',
    rejected: 'rejected',
    admin: 'done'
  });

  /* Mã trạng thái của một lượt: lấy status do máy chủ gửi. Dữ liệu cũ chưa có status thì suy tối thiểu từ chính lượt:
     entry.kind 'pending' (trừ lượt đang mở, reason 'open') là "Chờ xử lý", còn lại theo state: 'open' là "Đã Check-in",
     lượt đã đóng là "Đã Check-out". */
  function statusOf(session?) {
    const s = session || {};
    if (Object.prototype.hasOwnProperty.call(LABEL, s.status)) return s.status;
    const e = s.entry || {};
    const open = s.state === 'open' || s.open === true;
    if (e.kind === 'pending' && e.reason !== 'open' && !open) return 'pending';
    return open ? 'checked-in' : 'checked-out';
  }
  const labelOf = (session?) => LABEL[statusOf(session)];
  // Lý do ngắn của lượt (chữ nhỏ dưới nhãn); máy chủ chỉ ghi cho Chờ xử lý, Được phê duyệt, Bị từ chối
  const noteOf = (session?) => (session && typeof session.statusNote === 'string' ? session.statusNote.trim() : '');

  /* Các lượt quyết định nhãn của ngày: bỏ lượt máy chủ đánh dấu superseded (lượt bị lượt khác cùng ngày công thay khi tính giờ, ví dụ
     lượt quên Check-out khi ngày đã có lượt Admin khai thay). Nếu mọi lượt đều bị đánh dấu thì giữ nguyên danh sách. */
  function dayList(sessions?) {
    const list = Array.isArray(sessions) ? sessions : [];
    const kept = list.filter(s => !(s && s.superseded === true));
    return kept.length ? kept : list;
  }
  /* Mã của một ô ngày: mã đứng đầu DAY_ORDER trong các lượt quyết định nhãn của ngày; ngày không có lượt trả '' */
  function dayStatus(sessions?) {
    const list = dayList(sessions);
    if (!list.length) return '';
    const codes = new Set<any>(list.map(statusOf));
    return DAY_ORDER.find(code => codes.has(code)) || '';
  }
  // Các lý do khác nhau của những lượt quyết định nhãn của ngày, theo thứ tự lượt
  const dayNotes = (sessions?) => [...new Set<any>(dayList(sessions).map(noteOf).filter(Boolean))];

  const api = { LABEL, DAY_ORDER, TONE, statusOf, labelOf, noteOf, dayStatus, dayNotes };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AttendanceStatus = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
