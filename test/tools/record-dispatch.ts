'use strict';
// Ghi / so "bảng vàng điều phối" của máy chủ:
// cho MỌI khoá của src/platform/authz.ts → ROUTE_CAPS và một danh sách đường dẫn lạ, gọi API thật (DB trong bộ nhớ, đồng hồ giả)
// với ba loại người dùng (chưa đăng nhập, nhân sự qa_nv, Admin) và ghi: mã HTTP, mã lỗi, thông báo lỗi, HÌNH DẠNG phản hồi
// (chỉ tên khoá và kiểu, không bao giờ giá trị) và vài tiêu đề phản hồi (Set-Cookie chỉ ghi các thuộc tính, không ghi giá trị).
// Không ghi tên người, tiền hay điểm. Bảng ghi trên mã cũ rồi mọi lần chia file phải khớp từng dòng.
//
//   node test/tools/record-dispatch.ts --write    ghi lại test/fixtures/route-dispatch-golden.json (sau khi CÓ LÝ DO đổi hành vi,
//                                                 ví dụ thêm route mới: thêm kịch bản ở SCENARIOS rồi ghi lại)
//   node test/tools/record-dispatch.ts            ghi ra màn hình (không đụng file)
//   node test/tools/record-dispatch.ts --check    so với file, in từng chỗ lệch, thoát 1 nếu lệch
// test/api/route-dispatch-golden.test.ts dùng cùng hàm record() này nên bảng và test không thể lệch cách ghi.
//
// Mỗi ô (kịch bản × người dùng) chạy trên DB vừa xoá sạch rồi gieo lại cùng một "thế giới" nhỏ, nên thứ tự các ô
// không ảnh hưởng nhau, trừ: nhật ký kiểm toán và bản ghi chỉ-thêm không bị xoá, và giới hạn đăng nhập (trong bộ nhớ) được tránh
// bằng cách đẩy đồng hồ giả 16 phút cho mỗi ô đăng nhập.
const path = require('node:path');
const fs = require('node:fs');

// Môi trường cố định TRƯỚC khi nạp bất cứ file nào của dự án: chuỗi rỗng chặn .env điền vào, và không dựa vào máy đang chạy.
const PINNED = {
  SESSION_SECRET: 'qa-route-dispatch-golden',
  SESSION_DAYS: '',
  SESSION_COOKIE_NAME: '',
  COOKIE_SECURE: '',
  TRUST_PROXY: '',
  NODE_ENV: 'test'
};
for (const [key, value] of Object.entries<any>(PINNED)) process.env[key] = value;

const ROOT = path.join(__dirname, '../..');
const GOLDEN = path.join(ROOT, 'test/fixtures/route-dispatch-golden.json');
const fx = require('../helpers/api-fixture');
const { store, auth } = fx;
const authz = require('../../src/platform/authz');

const MONTH = '2026-11'; // tháng của đồng hồ giả (thứ Hai 02/11/2026 09:00)
const PREV = '2026-10';
const IDENTITIES = ['anon', 'staff', 'admin'];
const USERS = { staff: 'qa_nv', admin: 'admin' };
const BIG = 'x'.repeat(1_000_001); // vượt MAX_BODY_BYTES (1 MB) của readJson

/* ---------- kịch bản ----------
 * { method, path (sau /api, có thể kèm ?query), body? (object) | raw? (chuỗi gửi nguyên), name, odd?, identities? }
 * Mỗi khoá của ROUTE_CAPS phải được ít nhất một kịch bản KHÔNG `odd` chạm tới (test kiểm). `odd` = đường dẫn lạ,
 * để bảng bắt cả hành vi rơi xuống 404 / 403 NO_ROUTE_POLICY. Thêm route thì thêm kịch bản rồi ghi lại bảng.
 */
const S = (method?, route?, name?, extra: any = {}) => ({ method, path: route, name, ...extra });
const SCENARIOS = [
  // đăng nhập, phiên
  S('POST', '/login', 'sai mật khẩu', { body: { username: 'qa_nv', password: 'sai-mat-khau' }, login: true }),
  S('POST', '/login', 'tên không có thật', { body: { username: 'khong_co', password: 'x' }, login: true }),
  S('POST', '/login', 'thân rỗng', { body: {}, login: true }),
  S('POST', '/login', 'tài khoản bị khoá', { body: { username: 'qa_locked', password: 'test-pass' }, login: true }),
  S('POST', '/login', 'đúng', { body: { username: 'qa_nv', password: 'test-pass' }, login: true }),
  S('POST', '/login', 'JSON hỏng', { raw: '{không phải json', login: true }),
  S('POST', '/logout', 'đăng xuất'),
  S('GET', '/me', 'xem mình'),
  S('PUT', '/password', 'thân rỗng', { body: {} }),
  S('PUT', '/password', 'mật khẩu hiện tại sai', { body: { current: 'sai', next: 'mat-khau-moi' } }),
  S('PUT', '/password', 'đúng', { body: { current: 'test-pass', next: 'mat-khau-moi' } }),
  S('PUT', '/password', 'mật khẩu mới quá ngắn', { body: { current: 'test-pass', next: 'abc' } }),

  // lịch ước tính, ngày lễ, KPI
  S('GET', '/holidays', 'đọc'),
  S('PUT', '/holidays', 'thân rỗng', { body: {} }),
  S('PUT', '/holidays', 'ngày sai dạng', { body: { dates: ['2026-13-40'] } }),
  S('PUT', '/holidays', 'đúng', { body: { dates: ['2026-11-20'] } }),
  S('PUT', '/holidays', 'thân quá lớn (413)', { raw: JSON.stringify({ dates: [BIG] }), identities: ['admin'] }),
  S('GET', '/me/estimate', 'tháng hiện tại'),
  S('GET', '/me/estimate', 'tháng sai dạng', { path: '/me/estimate?month=abc' }),
  S('GET', `/sheet?month=${MONTH}`, 'của mình'),
  S('GET', '/sheet', 'thiếu tháng'),
  S('GET', `/sheet?month=${MONTH}&user=qa_nv2`, 'của người khác'),
  S('PUT', '/sheet', 'thân rỗng', { body: {} }),
  S('PUT', '/sheet', 'tháng đúng, ngày rỗng', { body: { month: MONTH, days: {} } }),
  S('PUT', '/sheet', 'loại ngày lạ', { body: { month: MONTH, days: { '2026-11-03': { kind: 'khong_co_loai_nay' } } } }),
  S('PUT', '/sheet', 'thân quá lớn (413)', { raw: JSON.stringify({ month: MONTH, days: BIG }), identities: ['staff'] }),
  S('PUT', '/sheet', 'JSON hỏng', { raw: '[1,2' }),
  S('PUT', '/sheet/bulk', 'thân rỗng', { body: {} }),
  S('PUT', '/sheet/bulk', 'không có người', {
    body: { month: MONTH, usernames: [], days: { '2026-11-02': { kind: 'work', preset: 'n2' } } }
  }),
  S('PUT', '/sheet/bulk', 'ca lạ', {
    body: { month: MONTH, usernames: ['qa_nv'], days: { '2026-11-02': { kind: 'work', preset: 'khong_co' } } }
  }),
  S('PUT', '/sheet/bulk', 'ngày chưa tới', {
    body: { month: MONTH, usernames: ['qa_nv'], days: { '2026-11-03': { kind: 'work', preset: 'n2' } } }
  }),
  S('PUT', '/sheet/bulk', 'tên không có thật', {
    body: { month: MONTH, usernames: ['qa_nv', 'khong_co'], days: { '2026-11-02': { kind: 'work', preset: 'n2' } } }
  }),
  S('PUT', '/sheet/bulk', 'đúng', {
    body: { month: MONTH, usernames: ['qa_nv', 'qa_nv2'], days: { '2026-11-02': { kind: 'work', preset: 'n2' } } }
  }),
  S('GET', '/kpi/scores', 'thiếu tháng'),
  S('GET', `/kpi/scores?month=${PREV}`, 'đọc'),
  S('PUT', '/kpi/scores', 'thân rỗng', { body: {} }),
  S('PUT', '/kpi/scores', 'điểm sai', { body: { user: 'qa_nv', month: PREV, scores: { khong_co: 5 } } }),
  S('PUT', '/kpi/scores', 'đúng', { body: { user: 'qa_nv', month: PREV, scores: { wework: 80 } } }),

  // duyệt khoản tự khai, cảnh báo
  S('GET', '/approvals', 'mặc định'),
  S('GET', '/approvals?status=hong', 'trạng thái lạ'),
  S('GET', '/approvals/count', 'đếm'),
  S('GET', '/alerts', 'thiếu tháng'),
  S('GET', `/alerts?month=${MONTH}`, 'đọc'),
  S('PUT', '/approvals/decide', 'thân rỗng', { body: {} }),
  S('PUT', '/approvals/decide', 'từ chối không lý do', {
    body: { action: 'reject', items: [{ username: 'qa_nv', date: '2026-11-03', rev: 1, fingerprint: 'abc' }] }
  }),
  S('PUT', '/approvals/decide', 'duyệt khoản không có', {
    body: { action: 'approve', items: [{ username: 'qa_nv', date: '2026-11-03', rev: 1, fingerprint: 'abc' }] }
  }),

  // phiếu lương
  S('GET', `/slip-override?user=qa_nv&month=${PREV}`, 'đọc'),
  S('GET', '/slip-override', 'thiếu tham số'),
  S('PUT', '/slip-override', 'thân rỗng', { body: {} }),
  S('PUT', '/slip-override', 'mục lạ', { body: { user: 'qa_nv', month: PREV, values: { khong_co: 1 } } }),
  S('PUT', '/slip-override', 'values rỗng thiếu lý do', { body: { user: 'qa_nv', month: PREV, values: {} } }),
  S('PUT', '/slip-override', 'values rỗng kèm lý do', {
    body: { user: 'qa_nv', month: PREV, values: {}, reason: 'Bỏ hết số đã sửa trên phiếu' }
  }),

  // Check-in/out
  S('GET', '/punch', 'trạng thái'),
  S('POST', '/punch', 'thân rỗng', { body: {} }),
  S('POST', '/punch', 'check-in', { body: { type: 'in', requestId: 'req-golden-0001' } }),
  S('POST', '/punch', 'check-out thiếu sessionId', { body: { type: 'out', requestId: 'req-golden-0002' } }),
  S('GET', '/ot', 'danh sách'),
  S('POST', '/ot', 'thân rỗng', { body: {} }),
  S('PUT', '/ot', 'thân rỗng', { body: {} }),
  S('GET', '/today', 'hôm nay'),
  // giải trình (Check-out muộn, Admin yêu cầu): chỉ ca lỗi / không có, không tạo dữ liệu
  S('GET', '/explanations', 'danh sách'),
  S('POST', '/explanations', 'thân rỗng', { body: {} }),
  S('POST', '/explanations/99999/answer', 'yêu cầu không có', { body: { text: 'thử trả lời' } }),
  S('POST', '/explanations/99999/decide', 'yêu cầu không có', { body: { approve: true } }),
  S('GET', '/attendance', 'thiếu tháng'),
  S('GET', `/attendance?month=${MONTH}`, 'đọc'),

  // dữ liệu và AI
  S('GET', '/events', 'luồng báo tin', { stream: true }),

  // công tắc và tham số
  // cài đặt ngày bắt đầu Check-in không có route: mặc định từ chối
  S('PUT', '/settings/checkin', 'đã xoá 23/10/2026', { odd: true, body: {} }),
  S('PUT', '/settings/checkin', 'đã xoá, thân cũ', { odd: true, body: { from: '2026-11-05' } }),
  S('PUT', '/settings/geofence', 'thân rỗng', { body: {} }),
  S('PUT', '/settings/geofence', 'tắt', { body: { geofence: null } }),
  // công tắc KPI 5 thành phần không có route: mặc định từ chối
  S('PUT', '/settings/kpi-five', 'đã xoá 23/10/2026', { odd: true, body: {} }),
  S('PUT', '/settings/kpi-five', 'đã xoá, thân cũ', { odd: true, body: { from: null } }),
  S('GET', '/settings/params', 'đọc'),
  S('GET', '/settings/params?month=abc', 'tháng sai dạng'),
  S('GET', '/settings/params?group=x', 'nhóm sai'),
  S('GET', '/settings/first-run', 'đọc'),
  S('GET', '/settings/version', 'đọc'),
  S('PUT', '/settings/params', 'thân rỗng', { body: {} }),
  S('POST', '/settings/params/preview', 'thân rỗng', { body: {} }),
  S('POST', '/settings/params/revert', 'thân rỗng', { body: {} }),

  // hồ sơ nhân sự
  S('GET', '/staff', 'danh sách'),
  S('GET', '/team', 'thiếu tháng'),
  S('GET', `/team?month=${MONTH}`, 'đọc'),
  S('PUT', '/staff/qa_moi', 'thân rỗng', { body: {} }),
  S('PUT', '/staff/qa_moi', 'tạo mới', {
    body: { name: 'Người mới thử', role: 'staff', type: 'tts', password: 'abcdef' }
  }),
  S('PUT', '/staff/qa_nv2', 'loại lạ', { body: { name: 'Người thử 2', type: 'khong_co' } }),
  S('PUT', '/staff/QA%', 'tên đăng nhập sai', { body: {} }),
  S('PUT', '/staff/qa_nv2', 'khoá', { body: { locked: true } }),
  S('PUT', '/staff/admin', 'khoá chính mình', { body: { locked: true } }),
  S('PUT', '/staff/khong_co', 'khoá người không có', { body: { locked: true } }),
  S('DELETE', '/staff/qa_nv2', 'đã bỏ route', { odd: true }),
  S('GET', '/roles', 'danh sách vai trò'),
  S('PUT', '/staff/qa_nv/roles', 'thân rỗng', { body: {} }),
  S('PUT', '/staff/qa_nv/roles', 'vai trò lạ', { body: { roles: ['khong_co'], reason: 'thử vai trò' } }),
  S('PUT', '/staff/qa_nv/roles', 'đúng', { body: { roles: ['staff'], reason: 'thử gán vai trò' } }),
  S('PUT', '/staff/khong_co/roles', 'tài khoản không có', { body: { roles: ['staff'], reason: 'thử gán vai trò' } }),
  S('PUT', '/staff/shift-bulk', 'thân rỗng', { body: {} }),
  S('PUT', '/staff/shift-bulk', 'ca lạ', { body: { usernames: ['qa_nv'], preset: 'khong_co' } }),
  S('PUT', '/staff/shift-bulk', 'đúng', {
    body: { usernames: ['qa_nv', 'qa_nv2'], preset: 'n2', reason: 'đổi ca thử nghiệm' }
  }),

  // kỳ lương
  S('GET', '/periods', 'danh sách'),
  S('GET', `/periods/${PREV}`, 'xem kỳ'),
  S('POST', `/periods/${PREV}/lock-attendance`, 'chốt công: thân rỗng', { body: {} }),
  S('POST', `/periods/${PREV}/lock-attendance`, 'chốt công: rev 0', { body: { rev: 0 } }),
  S('POST', `/periods/${PREV}/calculate`, 'tính lương: thân rỗng', { body: {} }),
  S('POST', `/periods/${PREV}/calculate`, 'tính lương: rev 0', { body: { rev: 0 } }),
  S('POST', `/periods/${PREV}/approve`, 'duyệt kỳ: thân rỗng', { body: {} }),
  S('POST', `/periods/${PREV}/approve`, 'duyệt kỳ: rev 0', { body: { rev: 0 } }),
  S('POST', `/periods/${PREV}/mark-paid`, 'đã chi trả: thân rỗng', { body: {} }),
  S('POST', `/periods/${PREV}/mark-paid`, 'đã chi trả: rev 0', { body: { rev: 0, paidAt: '2026-11-05' } }),
  S('POST', `/periods/${PREV}/reopen`, 'mở lại: thân rỗng', { body: {} }),
  S('POST', `/periods/${PREV}/reopen`, 'mở lại: rev 0', { body: { rev: 0, reason: 'thử mở lại kỳ lương' } }),
  S('GET', `/periods/${PREV}/payslips`, 'phiếu của kỳ'),
  S('GET', `/periods/${PREV}/estimates`, 'số ước tính'),
  S('GET', `/periods/${PREV}/estimates/qa_nv`, 'phiếu ước tính của một người'),
  S('GET', `/periods/${PREV}/payslips/qa_nv`, 'phiếu của mình'),
  S('GET', `/periods/${PREV}/payslips/qa_nv2`, 'phiếu của người khác'),
  S('PUT', `/periods/${PREV}/payslips/decide`, 'thân rỗng', { body: {} }),
  S('GET', `/periods/${PREV}/verify`, 'kiểm chuỗi'),
  S('GET', '/periods/abc', 'tháng sai dạng'),
  S('POST', '/periods/abc/lock-attendance', 'tháng sai dạng', { body: {} }),
  S('GET', '/periods/abc/payslips', 'tháng sai dạng'),

  // chức vụ là dữ liệu và bảng quyền lợi
  S('GET', `/positions?month=${MONTH}`, 'đọc'),
  S('GET', '/positions', 'thiếu tháng'),
  S('GET', `/entitlements?month=${MONTH}`, 'đọc'),
  S('GET', '/entitlements', 'thiếu tháng'),
  S('POST', '/positions', 'thân rỗng', { body: {} }),
  S('POST', '/positions/nv/levels', 'thân rỗng', { body: {} }),
  S('POST', '/positions/khong_co/levels', 'chức vụ không có', {
    body: { name: 'Bậc thử', base: 7000000, effectiveMonth: MONTH, reason: 'thử thêm bậc' }
  }),
  S('POST', '/positions/nv/levels', 'thêm bậc 5 cho NV', {
    body: { name: 'Bậc thử', base: 8000000, kpi: 1000000, effectiveMonth: MONTH, reason: 'thử thêm bậc' }
  }),
  S('POST', '/positions', 'nguồn lạ', {
    body: { label: 'Chức vụ thử', copyFrom: 'khong_co', effectiveMonth: MONTH, reason: 'thử sao chép chức vụ' }
  }),

  // danh mục chức vụ/bậc/ca trong DB, nhân viên theo uuid, sổ phép
  S('GET', `/catalog/positions?month=${MONTH}`, 'đọc'),
  S('PUT', '/catalog/positions/nv', 'thiếu expectedRev', {
    body: { changes: { name: 'NV thử' }, effectiveMonth: MONTH, reason: 'thử đổi tên chức vụ' }
  }),
  S('PUT', '/catalog/levels', 'thân rỗng', { body: {} }),
  S('GET', '/catalog/shifts', 'đọc'),
  S('PUT', '/catalog/shifts', 'thiếu expectedRev', { body: { code: 'Flex2', changes: { name: 'Flex thử' } } }),
  S('GET', '/employees/00000000-0000-4000-8000-000000000000', 'uuid không có'),
  S('GET', '/employees/khong-phai-uuid', 'uuid sai dạng'),
  S('GET', '/employees/00000000-0000-4000-8000-000000000000/trace', 'lịch sử của uuid không có'),
  S('GET', '/leave/ledger', 'sổ phép của mình'),
  S('POST', '/leave/refresh', 'cập nhật số phép', { body: {} }),

  // khoản điền thêm theo người theo tháng
  S('GET', `/pay-entries?month=${MONTH}`, 'đọc'),
  S('GET', '/pay-entries', 'thiếu tháng'),
  S('POST', '/pay-entries', 'thân rỗng', { body: {} }),
  S('POST', '/pay-entries', 'khoản đúng', {
    body: {
      username: 'qa_nv2',
      month: MONTH,
      direction: 'add',
      amount: 500000,
      label: 'Thưởng một lần',
      reason: 'Thưởng hoàn thành dự án thử nghiệm'
    }
  }),
  S('POST', '/pay-entries/bulk', 'thân rỗng', { body: {} }),
  S('PUT', '/pay-entries/999', 'thân rỗng', { body: {} }),
  S('PUT', '/pay-entries/999/decide', 'thân rỗng', { body: {} }),
  S('PUT', '/pay-entries/999/decide', 'khoản không có', { body: { decision: 'approved', rev: 1 } }),
  S('POST', '/pay-entries/999/void', 'khoản không có', { body: { rev: 1 } }),
  S('POST', '/pay-entries/999/confirm-flags', 'khoản không có', { body: { rev: 1 } }),

  // khối phụ cấp do C&B thêm
  S('POST', '/blocks', 'thân rỗng', { body: {} }),
  S('PUT', '/blocks/khong_co/confirm', 'khối không có', {
    body: { basis: 'căn cứ thử nghiệm', effectiveMonth: MONTH }
  }),

  // lịch làm việc riêng từng người
  S('GET', `/staff/qa_nv/schedule?month=${MONTH}`, 'đọc'),
  S('PUT', '/staff/qa_nv/schedule', 'đã gỡ: không còn đường dẫn ghi lịch riêng', { body: {}, odd: true }),
  S('POST', '/staff/qa_nv/schedule/preview', 'đã gỡ: không còn đường dẫn xem trước lịch riêng', {
    body: {},
    odd: true
  }),

  // vai trò tuỳ chỉnh và ca làm sửa được (Cài đặt › Phân quyền, Ca làm)
  S('POST', '/roles', 'thân rỗng', { body: {} }),
  S('POST', '/roles', 'sao chép vai trò C&B', {
    body: { label: 'Vai trò thử', copyFrom: 'cb', reason: 'thử tạo vai trò' }
  }),
  S('PUT', '/roles/khong_co', 'vai trò không có', { body: { rev: 0, label: 'Tên mới', reason: 'thử sửa vai trò' } }),
  S('PUT', '/roles/cb', 'vai trò mặc định chỉ đọc', {
    body: { rev: 0, label: 'Tên mới', reason: 'thử sửa vai trò mặc định' }
  }),
  S('POST', '/roles/khong_co/deprecate', 'vai trò không có', { body: { rev: 0, reason: 'thử ngưng dùng' } }),
  S('POST', '/roles/cb/deprecate', 'vai trò mặc định không ngưng dùng được', {
    body: { rev: 0, reason: 'thử ngưng dùng' }
  }),
  S('GET', `/settings/shifts?month=${MONTH}`, 'đọc'),
  S('PUT', '/settings/shifts', 'thân rỗng', { body: {} }),
  S('PUT', '/settings/shifts', 'thiếu expectedRev', {
    body: { shifts: [{ code: 'n1', in: '08:30', out: '17:30' }], effectiveMonth: MONTH, reason: 'thử đổi giờ ca' }
  }),
  S('PUT', '/settings/shifts', 'giờ ca đúng', {
    body: {
      shifts: [{ code: 'n1', in: '08:30', out: '17:30' }],
      effectiveMonth: MONTH,
      reason: 'thử đổi giờ ca'
    },
    withRev: true
  }),

  // Admin đặt lại mật khẩu của tài khoản khác
  S('POST', '/staff/qa_nv/password', 'đặt lại có lý do', {
    body: { password: 'mat-khau-moi-thu', reason: 'nhân viên quên mật khẩu' }
  }),
  S('POST', '/staff/qa_nv/password', 'thiếu lý do', { body: { password: 'mat-khau-moi-thu' } }),

  // yêu cầu ứng lương
  S('GET', `/advance-requests?month=${PREV}`, 'đọc'),
  // duyệt tạm ứng theo tháng
  S('GET', `/advance-approvals?month=${PREV}`, 'đọc'),
  S('POST', '/advance-approvals/request', 'thân rỗng', { body: {} }),
  S('POST', '/advance-approvals/withdraw', 'thân rỗng', { body: {} }),
  S('POST', '/advance-approvals/approve', 'thân rỗng', { body: {} }),
  S('POST', '/advance-approvals/reject', 'thân rỗng', { body: {} }),
  S('POST', '/advance-approvals/cancel', 'thân rỗng', { body: {} }),
  S('POST', '/advance-approvals/approve-all', 'thân rỗng', { body: {} }),

  // theo dõi máy chủ: công khai, không lộ dữ liệu nghiệp vụ
  S('GET', '/health', 'còn sống'),

  // nhật ký
  S('GET', '/audit', 'đọc'),
  S('GET', '/audit?limit=0', 'limit sai'),
  S('GET', '/audit/verify', 'kiểm chuỗi'),

  // đường dẫn lạ: không được đổi hành vi khi chia file
  S('GET', '/khong-co-route', 'route không có', { odd: true }),
  S('POST', '/khong-co-route', 'route không có (POST)', { odd: true, body: {} }),
  S('GET', '/', 'gốc /api/', { odd: true }),
  S('DELETE', '/holidays', 'sai phương thức', { odd: true }),
  S('POST', '/advance-requests', 'đã bỏ route', { odd: true, body: {} }),
  S('PUT', '/advance-requests/99999/decide', 'đã bỏ route', { odd: true, body: { decision: 'approved' } }),
  S('POST', '/advance-requests/99999/cancel', 'đã bỏ route', { odd: true, body: {} }),
  S('PATCH', '/sheet', 'sai phương thức', { odd: true, body: {} }),
  S('POST', '/sheet', 'sai phương thức', { odd: true, body: {} }),
  S('GET', '/sheet/extra', 'thừa đoạn đường dẫn', { odd: true }),
  S('GET', `/sheet/extra?month=${MONTH}`, 'thừa đoạn đường dẫn, có tháng', { odd: true }),
  S('PUT', '/sheet/', 'dấu / ở cuối', { odd: true, body: {} }),
  S('GET', '/me/', 'dấu / ở cuối', { odd: true }),
  S('GET', '/me/extra', 'thừa đoạn đường dẫn', { odd: true }),
  S('PUT', '/settings/params/x/y', 'đoạn con thừa', { odd: true, body: {} }),
  S('PUT', '/settings/params/lung-tung', 'đoạn con lạ', { odd: true, body: {} }),
  S('POST', '/settings/params', 'POST không đoạn con', { odd: true, body: {} }),
  S('GET', '/settings/params/preview', 'GET của route POST', { odd: true }),
  S('DELETE', '/settings/params', 'sai phương thức', { odd: true }),
  S('GET', '/settings/khong-co', 'cài đặt lạ', { odd: true }),
  S('GET', '/periods/2026-10/khong-co', 'bước lạ', { odd: true }),
  S('POST', '/periods/2026-10/payslips', 'POST của route GET', { odd: true, body: {} }),
  S('GET', '/periods/2026-10/payslips/a/b', 'quá nhiều đoạn', { odd: true }),
  S('DELETE', '/periods/2026-10', 'sai phương thức', { odd: true }),
  S('GET', '/staff/qa_nv', 'GET của route PUT/DELETE', { odd: true }),
  S('POST', '/staff/qa_nv', 'POST của route PUT/DELETE', { odd: true, body: {} }),
  S('PUT', '/staff', 'thiếu tên', { odd: true, body: {} }),
  S('GET', '/audit/khac', 'đoạn lạ', { odd: true }),
  S('GET', '/staff/qa_nv/roles', 'GET của route PUT', { odd: true }),
  S('POST', '/staff/shift-bulk', 'POST của route PUT', { odd: true, body: {} }),
  S('PUT', '/staff/qa_nv/roles/x', 'thừa đoạn', { odd: true, body: {} }),
  S('GET', '/roles/x', 'thừa đoạn', { odd: true }),
  S('GET', '/%E0%A4%A', 'đường dẫn mã hoá sai', { odd: true })
];

/* ---------- thế giới nhỏ gieo lại cho mỗi ô ---------- */
let PASS_HASH: any = null;
async function seedWorld() {
  PASS_HASH = PASS_HASH || auth.hashPassword('test-pass'); // băm scrypt chậm: làm một lần
  await store.upsertStaff({
    username: 'admin',
    name: 'Quản trị thử',
    role: 'admin',
    type: 'tts',
    level: 0,
    passHash: PASS_HASH
  });
  // không dùng fx.person: nó băm lại mật khẩu mỗi lần gọi (scrypt ~45 ms)
  for (const username of ['qa_nv', 'qa_nv2', 'qa_locked'])
    await store.upsertStaff({
      username,
      name: 'Người thử ' + username,
      role: 'staff',
      type: 'nv',
      level: 1,
      nightPct: 40,
      shiftCode: 'n1',
      startDate: '2026-01-05',
      passHash: PASS_HASH
    });
  await store.lockStaff('qa_locked', 'admin');
  // staff_roles chỉ-thêm-dòng nên reset() không xoá được: thu hồi vai trò còn lại của ô trước
  await store.db
    .prepare('UPDATE staff_roles SET revoked_at = ? WHERE revoked_at IS NULL')
    .run(new Date(Date.now()).toISOString());
}

/* ---------- hình dạng phản hồi: tên khoá và kiểu, không giá trị ---------- */
const MAP_LIMIT = 30; // đối tượng nhiều khoá hơn thế là bản đồ theo tên người / ngày: chỉ ghi "map" và kiểu phần tử đầu
function shape(value?, depth = 0) {
  if (value === null) return 'null';
  if (Array.isArray(value))
    return value.length === 0 ? ['empty'] : ['array', depth >= 4 ? '...' : shape(value[0], depth + 1)];
  const type = typeof value;
  if (type !== 'object') return type;
  const keys = Object.keys(value).sort();
  if (depth >= 4) return 'object';
  if (keys.length > MAP_LIMIT) return { '<map>': shape(value[keys[0]], depth + 1) };
  return Object.fromEntries(keys.map(key => [key, shape(value[key], depth + 1)]));
}
// Set-Cookie: chỉ thuộc tính (giá trị cookie là bí mật), Max-Age giữ vì là hằng
const cookieAttrs = (header?) =>
  header
    .split(';')
    .slice(1)
    .map(part => part.trim())
    .sort();
function headersOf(response?) {
  const out: Record<string, any> = {};
  const type = response.headers.get('content-type');
  if (type) out.contentType = type.split(';')[0];
  const cookies = response.headers.getSetCookie ? response.headers.getSetCookie() : [];
  if (cookies.length) out.setCookie = cookies.map(c => ({ name: c.split('=')[0], attrs: cookieAttrs(c) }));
  for (const name of ['retry-after', 'cache-control']) {
    const v = response.headers.get(name);
    if (v) out[name] = v;
  }
  return out;
}

async function fire(scenario?, identity?) {
  const headers: Record<string, any> = { 'Content-Type': 'application/json' };
  if (identity !== 'anon') headers.Cookie = auth.cookieHeader(await auth.createSession(USERS[identity]), 86400);
  const init: Record<string, any> = { method: scenario.method, headers };
  if (scenario.raw !== undefined) init.body = scenario.raw;
  const base = `http://127.0.0.1:${fx.server.address().port}`;
  if (scenario.body !== undefined && scenario.raw === undefined) {
    let body = scenario.body;
    // withRev: ca "đúng" của route cần expectedRev: đọc paramsRev hiện tại của thế giới này (rev phụ thuộc số dòng param_versions đã có, nên không viết cứng)
    if (scenario.withRev) {
      const adminCookie = auth.cookieHeader(await auth.createSession(USERS.admin), 86400);
      const view = await (
        await fetch(`${base}/api/settings/shifts?month=${MONTH}`, { headers: { Cookie: adminCookie } })
      ).json();
      body = { ...body, expectedRev: (view as any).paramsRev };
    }
    init.body = JSON.stringify(body);
  }
  const controller = new AbortController();
  init.signal = controller.signal;
  let response;
  try {
    response = await fetch(base + '/api' + scenario.path, init);
  } catch (error) {
    return { networkError: String(error.cause?.code || error.name) };
  }
  const cell: Record<string, any> = { status: response.status, headers: headersOf(response) };
  if (scenario.stream) {
    controller.abort(); // luồng không bao giờ kết thúc: chỉ cần mã và tiêu đề
    await response.body?.cancel().catch(() => {});
    return cell;
  }
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = undefined;
  }
  if (data === undefined) {
    cell.body = text ? 'non-json' : 'empty';
    return cell;
  }
  if (response.status >= 400) {
    cell.error = typeof data.error === 'string' ? data.error : undefined;
    if (typeof data.code === 'string') cell.code = data.code;
    const rest = { ...data };
    delete rest.error;
    delete rest.code;
    if (Object.keys(rest).length) cell.errorExtra = shape(rest);
  } else {
    cell.shape = shape(data);
  }
  return cell;
}

const keyOf = (scenario?) => {
  const url = new URL(scenario.path, 'http://x');
  return authz.routeKey(scenario.method, ['api', ...url.pathname.split('/').filter(Boolean)]);
};

function pad(n?) {
  return String(n).padStart(2, '0');
}

async function record() {
  const out: any[] = [];
  let loginIndex = 0;
  await fx.start();
  try {
    for (const scenario of SCENARIOS) {
      const entry = {
        id: `${scenario.method} ${scenario.path} #${scenario.name}`,
        method: scenario.method,
        path: scenario.path,
        ...(scenario.odd ? { odd: true } : {}),
        key: keyOf(scenario),
        request:
          scenario.raw !== undefined
            ? { raw: scenario.raw.length > 80 ? `<${scenario.raw.length} ký tự>` : scenario.raw }
            : scenario.body === undefined
              ? null
              : scenario.body,
        results: {} as Record<string, any>
      };
      for (const identity of scenario.identities || IDENTITIES) {
        await fx.reset();
        await seedWorld();
        if (scenario.login) {
          loginIndex += 1; // cách nhau 16 phút: hết cửa sổ khoá 15 phút của lần thử sai trước
          const minutes = 9 * 60 + loginIndex * 16;
          await fx.at(`2026-11-02T${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}:00`);
        } else await fx.at(`${MONTH}-02T09:00:00`);
        entry.results[identity] = await fire(scenario, identity);
      }
      out.push(entry);
    }
  } finally {
    await fx.stop();
  }
  return {
    meta: {
      about:
        'Bảng vàng điều phối của máy chủ, ghi trên mã trước khi chia server.js. Tạo bằng: node test/tools/record-dispatch.ts --write. Chỉ có mã HTTP, mã lỗi, thông báo lỗi, tên khoá và kiểu của phản hồi.',
      clock: '2026-11-02T09:00:00+07:00',
      identities: IDENTITIES,
      routeKeys: Object.keys(authz.ROUTE_CAPS).length,
      scenarios: out.length,
      cells: out.reduce((n, e) => n + Object.keys(e.results).length, 0)
    },
    scenarios: out
  };
}

// Các khoá ROUTE_CAPS chưa kịch bản (không odd) nào chạm tới, và kịch bản chạm khoá không có trong ROUTE_CAPS dù không `odd`
function coverageGaps(recorded?) {
  const covered = new Set<any>(recorded.scenarios.filter(s => !s.odd).map(s => s.key));
  return {
    uncovered: Object.keys(authz.ROUTE_CAPS).filter(key => !covered.has(key)),
    unknown: [...covered].filter(key => !Object.hasOwn(authz.ROUTE_CAPS, key))
  };
}

// Danh sách chỗ lệch giữa hai bản ghi (rỗng = khớp)
function diff(expected?, actual?) {
  const problems: any[] = [];
  const byId = new Map<any, any>(expected.scenarios.map(s => [s.id, s]));
  const seen = new Set<any>();
  for (const now of actual.scenarios) {
    seen.add(now.id);
    const before = byId.get(now.id);
    if (!before) {
      problems.push(`${now.id}: kịch bản mới, chưa có trong bảng vàng (ghi lại kèm lý do)`);
      continue;
    }
    if (before.key !== now.key) problems.push(`${now.id}: khoá quyền ${before.key} -> ${now.key}`);
    for (const identity of new Set<any>([...Object.keys(before.results), ...Object.keys(now.results)])) {
      const a = JSON.stringify(before.results[identity]),
        b = JSON.stringify(now.results[identity]);
      if (a !== b) problems.push(`${now.id} [${identity}]\n    bảng vàng: ${a}\n    hiện tại:  ${b}`);
    }
  }
  for (const id of byId.keys()) if (!seen.has(id)) problems.push(`${id}: có trong bảng vàng nhưng kịch bản đã bị bỏ`);
  return problems;
}

async function formatJson(data?) {
  const prettier = require('prettier');
  const config = (await prettier.resolveConfig(GOLDEN)) || {};
  return prettier.format(JSON.stringify(data), { ...config, parser: 'json' });
}
const load = () => JSON.parse(fs.readFileSync(GOLDEN, 'utf8'));

module.exports = { record, diff, coverageGaps, load, formatJson, GOLDEN, SCENARIOS };

if (require.main === module) {
  (async () => {
    const mode = process.argv[2];
    const recorded = await record();
    const gaps = coverageGaps(recorded);
    if (gaps.uncovered.length || gaps.unknown.length) {
      console.error('Kịch bản chưa phủ khoá ROUTE_CAPS:', gaps.uncovered, 'khoá lạ:', gaps.unknown);
      if (mode === '--write') {
        console.error('Không ghi: thêm kịch bản vào SCENARIOS trong test/tools/record-dispatch.ts trước.');
        process.exit(1);
      }
    }
    if (mode === '--write') {
      fs.mkdirSync(path.dirname(GOLDEN), { recursive: true });
      fs.writeFileSync(GOLDEN, await formatJson(recorded));
      console.log(
        `Đã ghi ${path.relative(ROOT, GOLDEN)}: ${recorded.meta.scenarios} kịch bản, ${recorded.meta.cells} ô, ${recorded.meta.routeKeys} khoá quyền.`
      );
    } else if (mode === '--check') {
      const problems = diff(await load(), JSON.parse(JSON.stringify(recorded)));
      for (const p of problems) console.error(p);
      console.log(problems.length ? `${problems.length} chỗ lệch` : 'Khớp bảng vàng');
      process.exit(problems.length ? 1 : 0);
    } else {
      console.log(JSON.stringify(recorded, null, 2));
    }
    process.exit(0);
  })().catch(error => {
    console.error(error);
    process.exit(1);
  });
}
