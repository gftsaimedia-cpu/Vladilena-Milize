// Dữ liệu giả: Cài đặt › Nhật ký thay đổi. Mỗi mục là một việc; count > 1 = nhiều dòng giống nhau được gộp.
// at: 'YYYY-MM-DDTHH:mm' · changes: các dòng "Trường: cũ → mới" (code: mã quy tắc nhỏ bên cạnh)
export const LOG_PEOPLE = {
  demo_admin: 'Quản trị demo',
  demo_admin2: 'Quản trị demo 2'
};
export const LOG_PAGE_LINES = 25;

const e = (id, at, who, action, changes, reason = '—', count = 1) => ({ id, at, who, action, changes, reason, count });
const demo = text => `Dữ liệu demo: ${text}`;

const HEAD = [
  e('l1', '2026-11-26T12:03', 'demo_admin', 'Đánh dấu đã trả lương', [
    { text: 'Trạng thái: Đã phê duyệt → Đã trả lương' },
    { text: 'Ngày trả lương: trống → 26/11/2026' }
  ]),
  e('l2', '2026-11-26T12:03', 'demo_admin', 'Phê duyệt kỳ lương', [
    { text: 'Trạng thái: Đã kiểm tra → Đã phê duyệt' },
    { text: 'Phiếu loại ra: trống → 2' }
  ]),
  e(
    'l3',
    '2026-11-26T12:02',
    'demo_admin',
    'Phê duyệt phiếu lương',
    [{ text: 'Trạng thái: trống → Đã phê duyệt' }, { text: 'Phiên bản: 4' }],
    demo('duyệt riêng để minh hoạ.')
  ),
  e(
    'l4',
    '2026-11-26T12:02',
    'demo_admin',
    'Bỏ qua cảnh báo AI',
    [{ text: 'Quy tắc: Số sửa trên phiếu lệch', code: 'slip-override-gap' }, { text: 'Lượt kiểm tra: 1' }],
    demo('đã xem, bỏ qua để minh hoạ.')
  ),
  e('l5', '2026-11-26T12:02', 'demo_admin', 'AI kiểm tra dữ liệu', [
    { text: 'Trạng thái: trống → Đã kiểm tra' },
    { text: 'Phát hiện: 32 · và 1 trường khác' }
  ]),
  e(
    'l6',
    '2026-11-26T12:02',
    'demo_admin',
    'Sửa số trên phiếu lương',
    [{ text: 'Tạm ứng: trống → 0' }],
    'Dữ liệu demo: đưa tạm ứng về 0 để thực lĩnh khôn…'
  ),
  e(
    'l7',
    '2026-11-26T12:02',
    'demo_admin',
    'Phê duyệt phiếu lương',
    [{ text: 'Trạng thái: trống → Đã phê duyệt' }, { text: 'Phiên bản: 3' }],
    demo('duyệt riêng để minh hoạ.'),
    17
  ),
  e(
    'l8',
    '2026-11-26T12:02',
    'demo_admin',
    'Bỏ qua cảnh báo AI',
    [{ text: 'Quy tắc: Yêu cầu từng bị từ chối', code: 'previously-rejected' }, { text: 'Lượt kiểm tra: 1' }],
    demo('đã xem, bỏ qua để minh hoạ.')
  ),
  e(
    'l9',
    '2026-11-26T12:02',
    'demo_admin',
    'Bỏ qua cảnh báo AI',
    [{ text: 'Quy tắc: Chưa có ca cố định', code: 'missing-fixed-shift' }, { text: 'Lượt kiểm tra: 1' }],
    demo('đã xem, bỏ qua để minh hoạ.')
  )
];

// Các dòng cũ hơn (trang 2 trở đi): sinh theo mẫu để đủ 99 dòng
const TEMPLATES = [
  ['Chốt công', [{ text: 'Trạng thái: Đang mở → Đã chốt công' }], '—'],
  ['Tính lương', [{ text: 'Trạng thái: Đã chốt công → Đã tính lương' }], '—'],
  ['Phê duyệt phiếu lương', [{ text: 'Trạng thái: trống → Đã phê duyệt' }], demo('duyệt riêng để minh hoạ.')],
  [
    'Bỏ qua cảnh báo AI',
    [{ text: 'Quy tắc: Yêu cầu từng bị từ chối', code: 'previously-rejected' }, { text: 'Lượt kiểm tra: 1' }],
    demo('đã xem, bỏ qua để minh hoạ.')
  ],
  ['Đổi vai trò tài khoản', [{ text: 'Vai trò: Nhân viên → Quản lý' }], 'Chuyển nhóm phụ trách.'],
  ['Khoá tài khoản', [{ text: 'Trạng thái: Đang dùng → Đã khoá' }], 'Tài khoản tạm ngưng sử dụng.'],
  ['Sửa ngưỡng cảnh báo', [{ text: 'Trạng thái: Đề xuất → Đã chốt' }], 'Công ty đã xác nhận ngưỡng.']
];
const pad = n => String(n).padStart(2, '0');
const OLDER = Array.from({ length: 74 }, (_, i) => {
  const [action, changes, reason] = TEMPLATES[i % TEMPLATES.length];
  const day = 25 - Math.floor(i / 6);
  return e(
    `o${i}`,
    `2026-11-${pad(day)}T${pad(17 - (i % 6))}:${pad((i * 13) % 60)}`,
    i % 3 === 0 ? 'demo_admin2' : 'demo_admin',
    action,
    changes,
    reason
  );
});

export const AUDIT_LOG = [...HEAD, ...OLDER];
