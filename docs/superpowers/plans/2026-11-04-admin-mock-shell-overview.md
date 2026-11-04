# Khung Admin và Tổng quan trên dữ liệu giả — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tách `web/` khỏi máy chủ bằng dữ liệu giả theo màn, rồi làm lại khung Admin (thanh bên nổi tối/sáng, thanh trên) và màn Tổng quan theo concept.

**Architecture:**

- Thư mục mới `web/src/mock/` giữ dữ liệu giả ở đúng dạng màn cần. Các service đã chuyển trả dữ liệu qua `respond()`, không gọi `api()`.
- `api()` còn lại cho các service chưa chuyển, nhưng luôn từ chối với lỗi `mock_missing`. Vì vậy không còn lời gọi mạng nào.
- Số đếm của khung nằm trong store Pinia `useShellStore`. Khi duyệt ở Tổng quan, màn gọi lại store đó nên badge và chuông cập nhật ngay.

**Tech Stack:** Vue 3.5 + Pinia + Vue Router 5, Vite 8, TypeScript (vue-tsc), Playwright 1.64. Không thêm thư viện.

**Spec:** [docs/superpowers/specs/2026-11-04-admin-mock-shell-overview-design.md](../specs/2026-11-04-admin-mock-shell-overview-design.md)

**Mốc trước khi sửa (đo 04/11/2026 trên `3c5f5eb`):**

- `npm --prefix web run test:ui`: 61 passed.
- `npm test` (BE): 24 pass, 0 fail.
- `npm run typecheck:web`: exit 0.

## Global Constraints

- Đồng hồ giả: `MOCK_NOW = '2026-10-28T02:40:00.000Z'` (09:40 thứ Tư 28/10/2026 giờ VN). Tháng hiện tại là `2026-10`.
- Khoá phiên giả: `localStorage['aicb.mock.session']`; giá trị là tên đăng nhập, hoặc `'none'` khi đã đăng xuất. Không có khoá thì là `admin`.
- Lỗi của `api()`: `ApiError(501, 'Màn này chưa có dữ liệu giả (<METHOD> <path>).', { code: 'mock_missing' })`.
- Không thêm phụ thuộc npm. Không sửa `src/`, `migrations/`, `test/v2/`, `spec/` ở thư mục gốc.
- Màu theo design system GFT:
  - nền và chữ: `surface-dark` #1c1c1c, `surface-dark-raised` #2a2a2a, `ink` #212121, `ink-muted` #616161, `ink-on-dark-muted` #9e9e9e;
  - vàng: `gold` #e8c372, `gold-light` #fce8b2;
  - trạng thái: `status-done` #2f5aa8 (chữ trắng), `status-pending` #eb973d (chữ `ink`), `status-rejected` #b43f3f (chữ trắng), `status-draft` #e0e0e0 (nền kem: #e6dcc6, chữ `ink`).
  - Vàng không làm chữ hay viền trên nền sáng. Mỗi màn có tối đa một thẻ nền `gold`.
- Bo góc: `radius-sm` 8px (nút, ô nhập, mục menu), `radius-md` 16px (thẻ KPI), `radius-lg` 24px (thẻ lớn, thanh bên), viên thuốc 50px. Không đổ bóng.
- Chữ: Geist cho giao diện, có `tabular-nums` cho số. League Spartan 600 chỉ cho tiêu đề trang 28px. Thang cỡ chữ: 12 / 14 / 18 / 28 / 32px.
- Câu chữ cố định (copy):
  - đăng nhập: "Bản mockup: mật khẩu bất kỳ. Tên `admin` vào khu quản trị, tên khác vào khu nhân viên.";
  - toast: "Đã duyệt yêu cầu của <tên>." / "Đã từ chối yêu cầu của <tên>.";
  - trạng thái trống: "Không còn yêu cầu nào chờ duyệt." và "Không có phiếu nào khớp.".
- Không đặt nút giả (nút không có chức năng trong mockup).

## Review Focus

1. Trình duyệt chặn `localStorage` (cửa sổ ẩn danh, cấu hình chặn): app vẫn mở vào Admin, không trắng trang. Test ở Task 1.
2. Đăng xuất rồi tải lại trang: vẫn ở `/dang-nhap`, không tự đăng nhập lại. Test ở Task 1.
3. Mở thẳng một màn chưa có dữ liệu giả (ví dụ `/admin/yeu-cau`): khung (thanh bên, thanh trên) vẫn hiện. Test ở Task 3.
4. Duyệt hết 9 yêu cầu: thẻ ghi câu trống, KPI về 0, badge Yêu cầu biến mất. Test ở Task 5.
5. Màn 375px: Tổng quan không cuộn ngang cả trang; bảng cuộn trong hộp riêng và hộp nhận focus. Test ở Task 5.

## File Structure

| File | Trách nhiệm |
|------|-------------|
| `web/src/mock/clock.ts` (mới) | `MOCK_NOW`, `MOCK_MONTH`, `MOCK_TODAY` |
| `web/src/mock/respond.ts` (mới) | `respond(value)`: Promise của bản sao sâu |
| `web/src/mock/accounts.ts` (mới) | Hai tài khoản giả; đọc/ghi tên phiên giả |
| `web/src/mock/approvals.ts` (mới) | 9 yêu cầu chờ duyệt trong bộ nhớ; duyệt/từ chối |
| `web/src/mock/period.ts` (mới) | Thanh kỳ lương dạng màn theo tháng |
| `web/src/mock/shell.ts` (mới) | Số đếm khung, nội dung chuông |
| `web/src/mock/overview.ts` (mới) | Dữ liệu dạng màn của Tổng quan |
| `web/src/services/http.ts` | `api()` luôn từ chối `mock_missing` |
| `web/src/services/session.ts`, `web/src/stores/session.ts` | Phiên giả |
| `web/src/stores/period.ts`, `web/src/builders/period-strip.ts` | Thanh kỳ lương đọc mock; xoá `buildStrip` |
| `web/src/stores/shell.ts` (mới) | `useShellStore`: me, counts, bell; `load()` |
| `web/src/services/shell.ts`, `web/src/services/admin-main.ts` | `getShell`, `getBell`, `getOverview`, `approveRequest`, `rejectRequest` đọc mock |
| `web/src/components/shell/AdminTopbar.vue` (mới) | Ô tìm kiếm, chọn tháng, chuông; slot `start` cho nút ngăn kéo |
| `web/src/components/shell/AdminLayout.vue`, `PeriodStrip.vue`, `BellPopover.vue`, `AdminSidebar.vue`, `AccountMenu.vue` | Khung mới |
| `web/src/styles/base.css` | Token thanh bên hai kiểu, khung thẻ nổi, thanh trên |
| `web/src/views/admin/overview/OverviewView.vue` + `parts/` (mới) | Tổng quan mới, tách theo thẻ |
| `web/vite.config.ts` | Bỏ proxy `/api` |
| `web/tests/auth-mock.spec.ts`, `admin-shell.spec.ts`, `admin-overview.spec.ts` | Test mới |

Ruling: token màu mới của design system được **thêm** vào `:root` (`--surface-dark`, `--surface-dark-raised`, `--ink-on-dark-muted`, `--status-done`, `--status-pending`, `--status-rejected`, `--status-draft`, `--r-md`). Giá trị cũ dùng chung (`--ground`, `--border`…) giữ nguyên — để các màn chưa làm không đổi màu — rủi ro nếu sai: nền kem của app (#f4efe4) lệch nhẹ so với design system (#f2ead8) cho tới khi có một đợt chỉnh token chung.

Ruling: số đếm của khung chuyển từ `ref` nội bộ của `AdminLayout` sang `useShellStore` — để Tổng quan cập nhật được badge và chuông sau khi duyệt — rủi ro nếu sai: thêm một store; các màn khác không bị ảnh hưởng vì chỉ `AdminLayout` và Tổng quan dùng.

Ruling: danh sách yêu cầu chờ duyệt nằm trong `mock/approvals.ts`, không nằm trong `mock/overview.ts` như spec ghi — để `mock/shell.ts` (Task 3) đọc được trước khi có Tổng quan (Task 5), và để màn Yêu cầu sau này dùng chung — rủi ro nếu sai: chỉ là vị trí file.

Ruling: nhãn nút duyệt là "Duyệt yêu cầu của <tên>" / "Từ chối yêu cầu của <tên>" (canvas ghi theo loại đơn) — để test và trình đọc màn hình dùng một mẫu thống nhất — rủi ro nếu sai: chỉ là câu chữ.

---

### Task 1: Cắt kết nối BE và phiên giả

**Files:**

- Create: `web/src/mock/clock.ts`, `web/src/mock/respond.ts`, `web/src/mock/accounts.ts`
- Modify: `web/src/services/http.ts` (hàm `api`), `web/vite.config.ts`, `web/src/stores/session.ts` (`load`), `web/src/services/session.ts`, `web/src/views/auth/LoginView.vue`
- Test: `web/tests/auth-mock.spec.ts`

**Interfaces:**

- Produces:
  - `MOCK_NOW: string`, `MOCK_MONTH = '2026-10'`, `MOCK_TODAY = '2026-10-28'` (`mock/clock.ts`).
  - `respond<T>(value: T): Promise<T>`: trả `structuredClone(value)`.
  - `type MockAccount = { user: { username: string; name: string; role: string }; roles: string[]; caps: string[]; payrollSubject: boolean; serverNow: string }`.
  - `mockAccount(username: string): MockAccount`:
    - `'admin'` → tên "Quản trị viên", vai trò `admin`, `roles: ['admin']`, đủ 6 cap của `ADMIN_CAPS` (viết lại danh sách ngay trong file để tránh import vòng với store), `payrollSubject: false`.
    - Tên khác → tên "Nguyễn Thu Hà", vai trò `staff`, `roles: ['staff']`, `caps: []`, `payrollSubject: true`, giữ `username` đã gõ.
  - `readSessionName(): string | null` và `writeSessionName(name: string | null): void`. Khi `localStorage` ném lỗi, cả hai dùng một biến trong module thay cho storage.

- [ ] **Step 1: Viết test `web/tests/auth-mock.spec.ts`** (không dùng `page.route`). Mỗi test ghi lại mọi request có `pathname` bắt đầu bằng `/api` qua `page.on('request')`, và cuối test kiểm danh sách đó rỗng.
  - `opens straight into admin with the default mock session`: `goto('/')` → URL `/admin/tong-quan`.
  - `admin login lands on the overview`: chạy `addInitScript` đặt khoá `aicb.mock.session` = `none`, rồi `goto('/dang-nhap')`. Thấy câu chú thích mockup đúng copy. Nhập `admin` / `x` rồi bấm Đăng nhập → `/admin/tong-quan`.
  - `any other name lands in the staff area`: nhập `NhanVien ` / `x` → URL khớp `/\/nv-may-tinh/` (khung mặc định 1280px của Playwright, rộng hơn 767px).
  - `empty password shows the validation message`: chỉ nhập tên → thấy "Nhập tên đăng nhập và mật khẩu.", URL vẫn `/dang-nhap`.
  - `logout survives a reload`: từ `/admin/tong-quan`, bấm nút tài khoản (tên /Quản trị viên/) → Đăng xuất → `/dang-nhap`; `reload()` → vẫn `/dang-nhap`.
  - `blocked storage still opens admin`: `addInitScript` cho `localStorage.getItem`/`setItem` ném lỗi; `goto('/')` → `/admin/tong-quan`, thấy navigation "Điều hướng". Không kiểm heading Tổng quan, vì màn cũ chỉ được thay ở Task 5.
- [ ] **Step 2: Chạy `npm --prefix web exec playwright test tests/auth-mock.spec.ts`.** Kỳ vọng FAIL: không có máy chủ nên `/me` lỗi, app về `/dang-nhap`, và có request `/api`.
- [ ] **Step 3: Cài phần mock và sửa code.**
  - Tạo ba file mock theo Interfaces.
  - `api()` trả `Promise.reject` với lỗi trong Global Constraints, không còn `fetch`. Giữ nguyên `api.get/post/put/del`, `qs`, `newRequestId`, `onUnauthorized`, `onWarnings`, `ApiError`. Sửa chú thích đầu file.
  - `vite.config.ts`: bỏ `apiProxy`, `BACKEND_ORIGIN`, khoá `proxy`; sửa chú thích.
  - `session.load()`: `this.apply(name ? mockAccount(name) : null)`, với `name = readSessionName()`.
  - `login()`:
    - chuẩn hoá tên (đang có);
    - tên hoặc mật khẩu rỗng thì ném `new ApiError(400, 'Nhập tên đăng nhập và mật khẩu.')`;
    - ghi tên vào phiên giả, rồi `loadSession()`.
  - `logout()`: `writeSessionName(null)` rồi `clear()`.
  - `changePassword()`: `respond({ ok: true })`.
  - `LoginView.vue`: thêm dòng chú thích dưới nút Đăng nhập, cỡ 12px, màu `--muted`.
- [ ] **Step 4: Chạy lại lệnh ở Step 2.** Kỳ vọng: 6 passed. Chạy thêm `npm run typecheck:web`, kỳ vọng exit 0.
- [ ] **Step 5: Commit** `feat(web): run on mock session without backend`. Chỉ add các file của task này.

### Task 2: Cách ly test cũ phụ thuộc API

**Files:**

- Modify: `web/tests/admin-workflows.spec.ts`, `attendance-ux.spec.ts`, `kpi-ux.spec.ts`, `payroll-ux.spec.ts`, `settings-search.spec.ts`, `staff-ux.spec.ts`, `admin-overlays.spec.ts`, `admin-shell.spec.ts`

**Interfaces:** không đổi mã nguồn.

- [ ] **Step 1: Chạy cả bộ `npm --prefix web run test:ui` và ghi tên từng test đỏ.**
- [ ] **Step 2: Đánh dấu `test.fixme` cho từng test đỏ** (giữ nguyên thân test), lý do ở tham số đầu: `'Chờ dữ liệu giả cho màn <tên màn> (đợt sau)'`.
  - Các test trong `admin-shell.spec.ts` dùng lý do `'Viết lại ở Task 3–4 của plan khung mock'`.
  - Test Tổng quan cũ trong `admin-workflows.spec.ts` dùng lý do `'Thay bằng admin-overview.spec.ts ở Task 5'`.
  - Test nào vẫn xanh thì không đụng.
- [ ] **Step 3: Chạy lại cả bộ.** Kỳ vọng: 0 failed. Số passed cộng số fixme bằng tổng trước đó, cộng 6 test của Task 1. Ghi con số thật vào báo cáo task.
- [ ] **Step 4: Commit** `test(web): quarantine API-mocked tests until their screens get mock data`.

### Task 3: Dữ liệu khung, thanh trên, dải bước kỳ lương

**Files:**

- Create: `web/src/mock/approvals.ts`, `web/src/mock/period.ts`, `web/src/mock/shell.ts`, `web/src/stores/shell.ts`, `web/src/components/shell/AdminTopbar.vue`
- Modify: `web/src/services/shell.ts`, `web/src/services/admin-main.ts` (`getBell`), `web/src/stores/period.ts` (`refresh`), `web/src/builders/period-strip.ts` (xoá `buildStrip`, `STEP_LABELS`, `RANK`, `STATE_LABEL`, `FINAL`), `web/src/components/shell/AdminLayout.vue`, `PeriodStrip.vue`, `BellPopover.vue`, `web/src/views/admin/staff/StaffView.vue` (giá trị đầu của `q` lấy từ `route.query.q`), `web/src/styles/base.css` (khối `.period`, `.mpick`, `.bell`, media 767px/1100px)
- Test: `web/tests/admin-shell.spec.ts` (thay toàn bộ nội dung)

**Interfaces:**

- Consumes: `respond`, `MOCK_MONTH` (Task 1).
- Produces:
  - `type PendingRequest = { id: string; name: string; initials: string; kind: string; detail: string }`.
  - `pendingRequests(): PendingRequest[]` và `decideRequest(id: string): PendingRequest | null` (bỏ yêu cầu khỏi danh sách, trả yêu cầu vừa bỏ).
  - 9 yêu cầu theo thứ tự, id `rq-01` … `rq-09`, chữ viết tắt lấy bằng `initials()` của `utils/format`:
    1. Nguyễn Thu Hà · Nghỉ phép năm · 30–31/10, 2 ngày
    2. Trần Minh Quân · Tạm ứng lương · 5.000.000 ₫
    3. Lê Hoàng Nam · Giải trình quên chấm công · 27/10
    4. Phạm Ngọc Anh · Nghỉ phép năm · 02/11, 1 ngày
    5. Võ Đức Thịnh · Làm thêm giờ · 24/10, 3 giờ
    6. Đỗ Mai Linh · Giải trình đi muộn · 26/10
    7. Bùi Quốc Huy · Nghỉ ốm · 29/10, 1 ngày
    8. Hoàng Thị Mai · Tạm ứng lương · 3.000.000 ₫
    9. Ngô Gia Bảo · Làm bù · 31/10
  - `periodStrip(month: string): { month: string; state: string; stateCls: string; steps: [string, string][] }`:
    - `month` dùng `monthTitle(month)`;
    - với `MOCK_MONTH`: state `'Chờ phê duyệt'`, stateCls `'draft'`, các bước `done` Chấm công, Chốt công, Tính lương; `cur` Phê duyệt; `''` Trả lương;
    - tháng trước đó: state `'Đã trả lương'`, stateCls `'ok'`, mọi bước `done`.
  - `type Bell = { month: string; total: number; requests: number; explanations: number; overtime: number; forgotten: { count: number; items: { date: string; text: string }[] } }`.
  - `bellView(month: string): Bell`:
    - `requests = pendingRequests().length`, `explanations: 2`, `overtime: 1`;
    - `forgotten.items`: `{ date: '2026-10-27', text: 'Lê Hoàng Nam · quên Check-out' }`, `{ date: '2026-10-26', text: 'Đỗ Mai Linh · quên Check-in' }`;
    - `total = requests + explanations + forgotten.count` (ban đầu 13).
  - `shellCounts(): { requests: number; bell: number }`: `requests` là số yêu cầu chờ duyệt (ban đầu 9), `bell` là `bellView(MOCK_MONTH).total`.
  - `getShell(): Promise<{ me: ShellMe; counts: { requests: number }; bell: number }>` và `getBell(): Promise<Bell>`, cả hai trả qua `respond`. `ShellMe` là dạng của getter `useSessionStore().shellMe`: `{ username, name, roleLabel, initials }`.
  - `useShellStore()` (Pinia, id `'shell'`): state `{ me: {}, counts: {}, bell: 0 }`; action `load(): Promise<void>` gán kết quả `getShell()`.
  - `AdminTopbar.vue`:
    - prop `bell: number`; emit `'open-bell'`; slot `start` (AdminLayout đặt nút `.mobile-nav-toggle` vào đây, giữ `ref="menuButton"`, `aria-controls`, `aria-expanded`, nhãn Mở/Đóng điều hướng);
    - thẻ gốc `<header class="topbar">`;
    - ô tìm kiếm `aria-label="Tìm nhân viên"`, placeholder "Tìm nhân viên…". Enter khi chữ đã cắt khoảng trắng khác rỗng thì `router.push({ path: '/admin/nhan-su', query: { q, ...(thang ? { thang } : {}) } })`, với `thang` lấy từ `route.query.thang`; chữ rỗng thì không làm gì;
    - nhóm chọn tháng `.mpick` (chuyển nguyên từ `PeriodStrip`, giữ nhãn nút "Tháng trước" / "Tháng sau");
    - nút `.bell` (chuyển nguyên từ `PeriodStrip`).
  - `PeriodStrip.vue`: không còn prop `bell`, không còn emit, không còn `.mpick` và `.right`. `AdminLayout` chỉ render nó khi `route.meta.nav` thuộc `['cham-cong', 'kpi', 'luong']`.

- [ ] **Step 1: Thay `web/tests/admin-shell.spec.ts`** (không `page.route`, có bộ ghi request `/api` như Task 1):
  - `admin shell makes no /api requests while navigating`: lần lượt bấm Tổng quan, Yêu cầu, Chấm công, Đánh giá KPI, Bảng lương, Nhân sự, Cài đặt; cuối test danh sách request `/api` rỗng.
  - `unmocked screen keeps the shell`: `goto('/admin/yeu-cau')` → thấy navigation "Điều hướng" và ô tìm kiếm "Tìm nhân viên".
  - `topbar month picker changes ?thang and label`:
    - `/admin/tong-quan` có nhãn "Tháng 10/2026" và nút "Tháng sau" bị disabled;
    - bấm "Tháng trước" → URL chứa `thang=2026-09`, nhãn "Tháng 9/2026".
  - `bell shows the mock count and opens the task list`: `.topbar .bell` chứa "13"; bấm vào → dialog "Việc cần xử lý" hiện.
  - `steps strip shows only on attendance, KPI and payroll`:
    - `/admin/kpi`: `.period .state` có chữ "Chờ phê duyệt"; `.period .steps` có `role=region` và `tabindex=0`, focus được;
    - `/admin/tong-quan`: `.period` đếm được 0.
  - `search opens the staff list with q`: gõ "Quân" rồi Enter → URL khớp `/\/admin\/nhan-su\?q=Qu%C3%A2n/`.
  - Chuyển ba test cũ sang khung mới: ngăn kéo điện thoại bàn phím/`inert`/Escape/giữ query; đổi màn bỏ `?hop`; phóng to đóng ngăn kéo.
    - Tên nút tài khoản đổi thành /Quản trị viên/.
    - Sau Escape, phím Tab đầu tiên focus vào ô "Tìm nhân viên".
  - `topbar keeps controls inside the viewport at <w>px` cho 375, 768, 1024: hộp của `.topbar .mpick`, `.topbar .bell` và ô tìm kiếm nằm trong `[0, innerWidth]`.
- [ ] **Step 2: Chạy `npm --prefix web exec playwright test tests/admin-shell.spec.ts`.** Kỳ vọng FAIL ở các test thanh trên, chuông và dải bước (chưa có `.topbar`).
- [ ] **Step 3: Cài phần mock và component.**
  - Tạo các file mock, `stores/shell.ts` và `AdminTopbar.vue` theo Interfaces.
  - `period.refresh()` gán `this.base = periodStrip(month)` (giữ bước sao chép sang `strip`).
  - `AdminLayout` dùng `useShellStore` thay cho `shell` ref, và gọi `shell.load()` ở cùng các chỗ đang gọi `loadShell()`.
  - `BellPopover` đọc `data.overtime`, bỏ import và lời gọi `getOvertimeRequests`.
  - CSS: `.topbar` là flex wrap, cao tối thiểu 40px, cách `.period`/nội dung 24px. Ô tìm kiếm `flex: 1 1 280px`, rộng tối đa 440px, viền `--control`, bo 8px. Chuông tròn 40px. Dưới 768px ô tìm kiếm chiếm hết dòng và nút ngăn kéo không còn `position: fixed`. Bỏ CSS chết của `.period .right`.
- [ ] **Step 4: Chạy lại lệnh ở Step 2.** Kỳ vọng: mọi test trong file pass. Chạy thêm `npm run typecheck:web`, kỳ vọng exit 0.
- [ ] **Step 5: Commit** `feat(web): mock shell data, topbar and period steps strip`.

### Task 4: Thanh bên nổi hai kiểu và nút đổi kiểu

**Files:**

- Modify: `web/src/styles/base.css` (`:root` token, `:root[data-side='dark']`, `.app`, `.side`, `.side-in`, `.item`, `.grp`, `.me`), `web/src/components/shell/AdminSidebar.vue`, `web/src/components/shell/AccountMenu.vue`
- Test: `web/tests/admin-shell.spec.ts` (thêm test)

**Interfaces:**

- Consumes: `useUiStore().set({ side })` (đang có; giá trị `'dark' | 'light'`).
- Produces: hàng "Thanh bên" trong `AccountMenu`, hai nút "Tối" / "Sáng" giống mẫu hàng "Màu nền".

- [ ] **Step 1: Thêm test vào `admin-shell.spec.ts`** (khung 1440×900):
  - `sidebar defaults to the dark floating card`:
    - `html` có `data-side="dark"`;
    - `#admin-navigation` có `border-radius` `24px`, nền `rgb(28, 28, 28)`, rộng 248px (sai số ±1);
    - link `aria-current="page"` có màu `rgb(232, 195, 114)` và nền `rgb(42, 42, 42)`.
  - `light sidebar is chosen in the account menu and persists`:
    - mở nút tài khoản, bấm "Sáng" trong hàng "Thanh bên";
    - `html` có `data-side="light"`, nền `#admin-navigation` là `rgb(255, 255, 255)`, link đang chọn có nền `rgb(252, 232, 178)` và màu `rgb(33, 33, 33)`;
    - `reload()`, kết quả vẫn như vậy.
- [ ] **Step 2: Chạy `npm --prefix web exec playwright test tests/admin-shell.spec.ts -g "sidebar"`.** Kỳ vọng FAIL: bo góc 0px, nền sáng hiện là `--ground`, chưa có hàng "Thanh bên".
- [ ] **Step 3: Sửa CSS và component.**
  - Thêm token của design system (xem Ruling ở đầu plan).
  - Đặt giá trị `--side-*` theo bảng 2.1 của spec: tối là nền #1c1c1c, chữ trắng, nhóm #9e9e9e, mục chọn #2a2a2a/`gold`, badge #2a2a2a; sáng là nền #fff, viền `--border`, chữ `ink`, nhóm `ink-muted`, mục chọn `gold-light`/`ink`, badge `--status-draft`.
  - `.app`: `grid-template-columns: 248px minmax(0, 1fr)`, lề 16px, cột cách nhau 24px. `.side` bo 24px, dính khi cuộn, cao bằng khung nhìn trừ lề.
  - `.item` cao 40px, bo 8px, icon 20px.
  - Vòng focus trong `.side`: `gold` khi tối, `ink` khi sáng.
  - Ngăn kéo điện thoại giữ như cũ (không bo, phủ cạnh trái).
  - `AdminSidebar`: icon menu `:size="20"`.
  - `AccountMenu`: thêm hàng "Thanh bên" phía trên hàng "Màu nền".
- [ ] **Step 4: Chạy cả file `admin-shell.spec.ts`.** Kỳ vọng: tất cả pass, kể cả các test của Task 3.
- [ ] **Step 5: Commit** `feat(web): floating dark/light admin sidebar`.

### Task 5: Tổng quan mới

**Files:**

- Create: `web/src/mock/overview.ts`; `web/src/views/admin/overview/parts/KpiRow.vue`, `AttendanceCard.vue`, `PeriodCard.vue`, `ApprovalsCard.vue`, `PayrollTable.vue`
- Modify: `web/src/views/admin/overview/OverviewView.vue` (viết lại), `web/src/services/admin-main.ts` (`getOverview`, `approveRequest`, `rejectRequest`; bỏ import `builders/admin-main/overview`)
- Delete: `web/src/builders/admin-main/overview.ts` (sau Task 3 và 5 không còn ai import; kiểm bằng grep trước khi xoá); test Tổng quan cũ đã `fixme` trong `web/tests/admin-workflows.spec.ts`, cùng các hàm mock chỉ test đó dùng
- Test: `web/tests/admin-overview.spec.ts`

**Interfaces:**

- Consumes: `pendingRequests`, `decideRequest`, `PendingRequest` (Task 3); `useShellStore().load()` (Task 3); `toast.ok` (`components/shell/toast.ts`); `respond`, `MOCK_MONTH` (Task 1).
- Produces:

  ```ts
  type PayrollRow = { id: string; name: string; initials: string; title: string; dept: string;
    days: string; base: string; allowance: string; net: string; status: 'draft' | 'pending' | 'done' | 'rejected' };
  type OverviewView = {
    month: string;
    headline: { blocking: number; closeOn: string; daysLeft: number };
    kpis: { key: 'payroll' | 'staff' | 'present' | 'requests'; label: string; value: string; of?: string; unit?: string;
      delta?: { dir: 'up' | 'down'; text: string; good: boolean }; note: string; hero?: boolean }[];
    attendance: { todayRate: number; present: number; total: number;
      days: { dow: string; date: string; rate: number; today: boolean }[] };
    period: { title: string; statusLabel: string; range: string; payday: string; net: string; deductions: string;
      netShare: number; slips: { done: number; pending: number; draft: number; rejected: number; total: number } };
    approvals: PendingRequest[];
    payroll: { title: string; updatedAt: string; total: number; rows: PayrollRow[] };
  };
  ```

  - `overviewView(month: string): OverviewView`. Số liệu lấy từ mục 3.1 của spec. Nhãn có tên tháng tính theo `month` (m = số tháng, không có số 0 đứng trước):
    - `kpis[0].label` = `Quỹ lương tháng m`;
    - `period.title` = `Kỳ lương tháng m`; `payroll.title` = `Bảng lương tháng m`;
    - `period.range` = `01/MM – <ngày cuối>/MM/YYYY`;
    - `period.payday` = ngày 05 của tháng sau;
    - `headline.closeOn` = ngày cuối của tháng; `headline.blocking: 4`; `headline.daysLeft: 3`.
  - `kpis[3].value` = `String(approvals.length)`.
  - 6 dòng `payroll.rows` (tên · chức danh · phòng ban · ngày công · lương cơ bản · phụ cấp · thực nhận · trạng thái):
    1. Nguyễn Thu Hà · Kế toán tổng hợp · Tài chính · 22 / 22 · 16.000.000 · 1.800.000 · 15.932.000 · done
    2. Trần Minh Quân · Kỹ sư phần mềm · Kỹ thuật · 22 / 22 · 24.000.000 · 2.500.000 · 22.785.000 · done
    3. Lê Hoàng Nam · Nhân viên kinh doanh · Kinh doanh · 20 / 22 · 12.000.000 · 3.200.000 · 12.757.000 · pending
    4. Phạm Ngọc Anh · Chuyên viên nhân sự · Nhân sự · 22 / 22 · 14.000.000 · 1.500.000 · 13.878.000 · pending
    5. Võ Đức Thịnh · Trưởng nhóm QA · Kỹ thuật · 21 / 22 · 20.000.000 · 2.000.000 · 18.441.000 · draft
    6. Đỗ Mai Linh · Thiết kế đồ hoạ · Marketing · 19 / 22 · 13.000.000 · 1.200.000 · 11.059.000 · rejected
  - `getOverview(month: string): Promise<OverviewView>`.
  - `approveRequest(id: string, opts?: { reason?: string }): Promise<PendingRequest | null>` và `rejectRequest`, cùng chữ ký. Cả hai gọi `decideRequest` và bỏ qua `opts`. Tên export và tham số thứ hai giữ nguyên để `views/admin/requests` vẫn biên dịch được.
  - Các component con nhận dữ liệu qua props, không tự tải. `ApprovalsCard` emit `approve(id)` và `reject(id)`. `PayrollTable` giữ trạng thái lọc và chữ tìm của riêng nó.

- [ ] **Step 1: Viết `web/tests/admin-overview.spec.ts`** (không `page.route`; khung 1440×900 trừ khi ghi khác):
  - `overview shows the mock figures`:
    - heading "Tổng quan" và dòng "Còn 4 việc phải xong trước khi chốt lương tháng 10 · hạn 31/10, còn 3 ngày";
    - region "Chỉ số chính" chứa "2,48 tỷ", "128", "113", "9";
    - figure chấm công có `aria-label` chứa "hôm nay 28/10 88%";
    - thẻ "Kỳ lương tháng 10" chứa "Chờ duyệt" và "86";
    - list "Việc cần duyệt" có đúng 3 `listitem`, mục đầu là Nguyễn Thu Hà.
  - `approving updates the list, KPI, sidebar badge and toast`:
    - bấm "Duyệt yêu cầu của Nguyễn Thu Hà" → không còn mục Nguyễn Thu Hà;
    - KPI "Yêu cầu chờ duyệt" là "8"; link "Yêu cầu" trên thanh bên chứa "8";
    - thấy toast "Đã duyệt yêu cầu của Nguyễn Thu Hà.";
    - bấm "Từ chối yêu cầu của Trần Minh Quân" → thấy toast "Đã từ chối yêu cầu của Trần Minh Quân.", KPI là "7".
  - `approving every request shows the empty state`:
    - lặp bấm nút "Duyệt" đầu tiên cho tới khi hết;
    - thấy "Không còn yêu cầu nào chờ duyệt."; KPI là "0"; link "Yêu cầu" không còn badge số.
  - `payroll table filters by status and searches without accents`:
    - nút "Chờ duyệt" `aria-pressed=true`, còn 2 dòng: Lê Hoàng Nam, Phạm Ngọc Anh;
    - "Tất cả" → 6 dòng;
    - tìm "quan" → 1 dòng Trần Minh Quân; "QUÂN" → 1 dòng; "xyz" → "Không có phiếu nào khớp.".
  - `month change relabels the overview`: bấm "Tháng trước" → thấy "Kỳ lương tháng 9" và "Bảng lương tháng 9".
  - `overview fits 375px and the table scrolls in its own region` (khung 375×812):
    - `document.documentElement.scrollWidth <= innerWidth`;
    - region "Bảng lương tháng 10" có `tabindex=0` và `scrollWidth > clientWidth`.
- [ ] **Step 2: Chạy `npm --prefix web exec playwright test tests/admin-overview.spec.ts`.** Kỳ vọng FAIL: màn cũ gọi `getOverview` theo API nên báo lỗi `mock_missing`.
- [ ] **Step 3: Cài `mock/overview.ts`, sửa service, viết lại `OverviewView.vue` và các phần con theo mục 3.2–3.3 của spec.**
  - Biểu đồ cột và biểu đồ vòng vẽ bằng HTML/SVG như canvas (vòng tròn: `r=48`, nét 16, `stroke-dasharray` theo `netShare`).
  - Tìm kiếm bỏ dấu bằng `normalize('NFD')`, xoá dấu kết hợp, đổi `đ` thành `d`, rồi viết thường. Chép mẫu từ `builders/admin-hr/staff.ts`.
  - Sau khi duyệt hoặc từ chối: `reload()` dữ liệu màn, `useShellStore().load()`, `toast.ok(...)`.
  - Nhãn trạng thái dùng màu `--status-*` qua class riêng của màn (không dùng `.p-pend`/`.p-done` của `base.css`).
  - Xoá test Tổng quan cũ và hàm mock chỉ test đó dùng trong `admin-workflows.spec.ts`.
  - Grep `builders/admin-main/overview` rồi xoá file nếu không còn ai import.
- [ ] **Step 4: Chạy lại lệnh ở Step 2.** Kỳ vọng: 6 passed. Sau đó chạy `npm --prefix web run test:ui` (0 failed) và `npm run typecheck:web` (exit 0).
- [ ] **Step 5: Commit** `feat(web): rebuild admin overview on mock data`.

---

## Xác minh cuối (giai đoạn 6, sau review toàn nhánh)

| Lệnh | Kỳ vọng |
|------|---------|
| `npm --prefix web run test:ui` | 0 failed. Ghi số passed và số fixme. |
| `npm run typecheck:web` | exit 0 |
| `npm run format:check` | "All matched files use Prettier code style!" |
| `npm test` | 24 pass, 0 fail (như mốc) |
| `git diff --stat 3c5f5eb -- src migrations test spec` | rỗng |
| `grep -rn "fetch(" web/src` | không còn lời gọi tới `/api` |

Cuối cùng chụp `/admin/tong-quan` ở 1440px và 375px, với thanh bên tối và sáng.
