# Bộ lọc nhân sự, chọn nhiều, tab Yêu cầu: kế hoạch

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đưa bộ lọc nhân sự dùng chung, chế độ chọn nhiều và tab Yêu cầu vào app admin. Phần này chạy trên mock.

**Architecture:**
- Hai nhóm thành phần dùng chung (`components/staff-scope`, `components/select-mode`) được gắn vào từng màn có sẵn.
- Tab Yêu cầu là một view mới. Nó đọc đơn chờ từ nguồn chung của chuông (`mock/inbox`) và xử lý đơn qua `useShellStore().decide`.

**Tech Stack:** Vue 3 + Vite + Pinia, test Playwright (`web/tests`).

**Spec:** `docs/superpowers/specs/2026-11-06-admin-loc-chon-nhieu-yeu-cau-design.md`

## Global Constraints

- Chữ trên giao diện bằng tiếng Việt.
- Ô nhập và nhãn kết quả có góc 8px, không dùng dạng viên tròn. Nhãn trạng thái là chữ thường kèm chấm màu.
- Chặn trước, không báo lỗi: thao tác không làm được thì ẩn hoặc khoá, kèm `title` giải thích.
- Bảng mỗi ô một giá trị. Lý do và chi tiết nằm trong ngăn chi tiết.
- Màn hình nhân viên trên máy tính không liên quan tới kế hoạch này.
- Kiểm: `cd web && npm run test:ui`. Không chạy `npm test` ở gốc repo, không typecheck, không prettier.
- Ở chế độ BE thật, chỉ dùng route BE đã có (spec R1, R8).

## Review Focus

1. Đổi bộ lọc trong lúc đang chọn: số "Đã chọn N / M" chỉ đếm dòng đang hiện. Nút chạy chỉ gửi dòng đang hiện và chọn được.
2. Chạy xong hay bấm Huỷ thì cột ô chọn ẩn, lựa chọn bị xoá, vào lại chế độ chọn thì bắt đầu từ 0.
3. Dòng không chọn được (người đã nghỉ việc, phiếu đã duyệt, việc không phải nhắc, đơn đã xử lý) không bao giờ vào danh sách gửi đi, kể cả khi bấm "chọn tất cả".
4. Duyệt ở tab Yêu cầu thì chuông và thẻ Việc cần duyệt cũng hết đơn đó, và ngược lại. Cả hai đọc cùng `mock/inbox`.
5. `?don=` trỏ tới id không có thì ngăn chi tiết không mở và đường dẫn bỏ `?don`, không báo lỗi.

---

### Task 1: Thành phần dùng chung và màn Nhân sự (I, I3)

**Files:**
- Create:
  - `web/src/components/staff-scope/staffScope.ts`
  - `web/src/components/staff-scope/StaffScopeFilter.vue`
  - `web/src/mock/people-status.ts`
  - `web/src/components/select-mode/useSelectMode.ts`
  - `web/src/components/select-mode/SelectBar.vue`
  - `web/src/components/select-mode/SelectCheck.vue`
  - `web/src/components/select-mode/BulkButton.vue`
  - `web/src/components/select-mode/ResultLine.vue`
- Modify:
  - `web/src/views/admin/staff/StaffView.vue`
  - `web/src/views/admin/staff/parts/StaffToolbar.vue`
  - `web/src/views/admin/staff/parts/StaffTable.vue`
  - `web/src/views/admin/staff/staffFilter.ts`
  - `web/src/mock/staff.ts`: hàm đổi phòng ban.
  - `web/src/services/admin-hr.ts`: `moveStaffDept`, `assignStaffShift`, `staffBulkSupported`.
- Test: `web/tests/admin-staff.spec.ts`

**Interfaces:**
- **staffScope.ts**:
  - `type PersonStatus = 'ok' | 'try' | 'off' | 'out'`
  - `type StaffPst = 'all' | 'work' | 'mine' | 'try' | 'off' | 'out'`
  - `PST_OPTIONS: { value: StaffPst; label: string }[]`
  - `matchScope(p: { dept: string; ps?: PersonStatus }, s: { pst: StaffPst; dept: string }, mine: string[] | null): boolean`
  - `deptOptions(rows: { dept: string }[]): string[]`
  - `useMineDepts(): string[] | null`
- **StaffScopeFilter.vue**: các model `pst`, `dept` (chuỗi rỗng nghĩa là tất cả phòng ban), prop `depts: string[]`.
- **useSelectMode**:
  - `useSelectMode()` trả `{ mode: Ref<string | null>, picked: Ref<Set<string>>, enter(m), quit(), toggle(id), toggleAll(ids: string[]), stateOf(ids): 'true' | 'false' | 'mixed', countIn(ids): number }`
- **SelectBar.vue**:
  - Props: `title`, `count`, `total`, `unit`, `note?`, `goLabel`, `goDisabled`.
  - Emit: `quit`, `run`.
  - Slot mặc định: ô chọn thêm.
- **SelectCheck.vue**:
  - Props: `state: 'true' | 'false' | 'mixed'`, `label`, `disabled?`, `why?`.
  - Emit: `toggle`.
- **BulkButton.vue**: props `icon`, `count?`, `disabled?`, `title?`. Slot là chữ.
- **ResultLine.vue**: prop `text`. Chuỗi rỗng thì ẩn.

- [ ] **Step 1: Viết test fail** trong `admin-staff.spec.ts`:
  - `không còn công tắc chưa kích hoạt và không có cột ô chọn mặc định`: không có `role=switch`, không có `role=checkbox` trong bảng.
  - `lọc theo trạng thái nhân sự và phòng ban`:
    - Chọn "Đã nghỉ việc": còn 1 dòng, là Đặng Văn Phúc.
    - Chọn "Đang làm việc" và phòng "Sản xuất": còn 2 dòng (Bùi Quốc Huy, Phan Minh Khoa).
    - Chọn "Tài khoản tôi quản lý": chỉ còn người phòng Sản xuất.
  - `đổi phòng ban cho nhiều người`:
    - Bấm "Đổi phòng ban": hiện thanh, nút chạy khoá với chữ "Chọn ít nhất 1 người".
    - Ô chọn của Đặng Văn Phúc bị khoá.
    - Chọn Nguyễn Thu Hà: chữ thành "Chọn phòng ban mới".
    - Chọn phòng "Marketing", rồi chạy: câu báo "Đã chuyển 1 người sang phòng Marketing.", cột ô chọn ẩn, ô Phòng ban của Nguyễn Thu Hà là Marketing.
  - `gán ca cho tất cả người chọn được`:
    - Bấm "Gán ca", bấm ô ở đầu cột: "Đã chọn 9 / 9".
    - Chạy: câu báo "Đã gán ca Hành chính · 08:00–17:00 cho 9 người."
  - `Huỷ thoát chế độ chọn`: Huỷ thì thanh và cột ô chọn ẩn. Vào lại thì "Đã chọn 0".
- [ ] **Step 2: Chạy test, thấy fail:** `cd web && npx playwright test tests/admin-staff.spec.ts`
- [ ] **Step 3: Làm các thành phần dùng chung và màn I theo spec §3 và §4-I.** Xoá `inactiveOnly` khỏi `staffFilter.ts`.
- [ ] **Step 4: Chạy lại test, thấy pass.** Chạy thêm các test cũ có nhắc "kích hoạt": `npx playwright test -g "kích hoạt|Nhân sự"`
- [ ] **Step 5: Commit** `feat(admin): shared staff filter and select mode on Nhân sự`

### Task 2: Bảng lương (G, G2)

**Files:**
- Modify:
  - `web/src/views/admin/payroll/PayrollView.vue`
  - `web/src/views/admin/payroll/parts/PayToolbar.vue`
  - `web/src/views/admin/payroll/parts/PayTable.vue`
  - `web/src/services/admin-payroll.ts`: `calculatePayroll(month, employeeIds?)`.
  - Mock tính lương theo danh sách người.
- Test: `web/tests/payroll-bulk.spec.ts` (mới). Sửa các test cũ có nhắc nút "Tính lại" ở đầu trang hay ô chọn `.pk`.

- [ ] **Step 1: Viết test fail:**
  - `bảng lương có cặp bộ lọc, các nút trạng thái ở hàng dưới`.
  - `tính lại lương: phiếu đã duyệt bị khoá, chọn tất cả chỉ lấy phiếu tính lại được`:
    - Bấm "Tính lại lương", rồi ô ở đầu cột: N bằng số phiếu chưa duyệt đang hiện.
    - Chạy: câu báo "Đã tính lại N phiếu lương."
  - `không có cột ô chọn mặc định`.
  - `kỳ đã phê duyệt thì không có nút Tính lại lương`.
- [ ] **Step 2: Chạy test, thấy fail.**
- [ ] **Step 3: Làm theo spec §4-G.**
- [ ] **Step 4: Chạy test của màn G** (`npx playwright test tests/payroll-*.spec.ts`), thấy pass.
- [ ] **Step 5: Commit** `feat(admin): Bảng lương staff filter and bulk recalculate`

### Task 3: Chấm công tuần và Cần xử lý: bộ lọc (E, L2)

**Files:**
- Modify:
  - `web/src/views/admin/attendance/AttendanceWeekView.vue`
  - Hàng công cụ của màn này (ô `?pb`).
  - `web/src/mock/attendance.ts`: mỗi dòng và mỗi việc chờ kèm `ps`.
- Test: `web/tests/admin-scope-filter.spec.ts` (mới)

- [ ] **Step 1: Viết test fail:**
  - `chấm công tuần lọc theo trạng thái nhân sự (?ns) và phòng ban (?pb)`.
  - `cần xử lý dùng cùng cặp bộ lọc`.
- [ ] **Step 2: Chạy test, thấy fail.** Rồi **Step 3: làm.** Rồi **Step 4: chạy pass**, cùng các test `attendance-*.spec.ts`.
- [ ] **Step 5: Commit** `feat(admin): staff filter on Chấm công tuần and Cần xử lý`

### Task 4: Cần xử lý: Nhắc giải trình nhiều người (L3)

**Files:**
- Modify:
  - `AttendanceWeekView.vue`
  - `web/src/views/admin/attendance/parts/PendingList.vue`
- Test: `web/tests/attendance-remind-bulk.spec.ts` (mới)

- [ ] **Step 1: Viết test fail:**
  - `nút Nhắc giải trình đếm số việc nhắc đang hiện`.
  - `chế độ nhắc: chỉ chọn được việc quên chấm công, khung phải liệt kê người được nhắc, chạy xong báo "Đã gửi nhắc giải trình cho N người."`.
  - `việc đã nhắc hiện "Đã nhắc" trên chuông`.
- [ ] **Step 2: Chạy test, thấy fail.** Rồi **Step 3: làm.** Rồi **Step 4: chạy pass**, cùng `attendance-pending.spec.ts`.
- [ ] **Step 5: Commit** `feat(admin): bulk remind on Cần xử lý`

### Task 5: Tổng quan: bộ lọc ở bảng lương (A)

**Files:**
- Modify: `web/src/views/admin/overview/parts/PayrollTable.vue`
- Test: thêm vào `admin-scope-filter.spec.ts`

- [ ] **Step 1: Viết test fail:** `Tổng quan: bảng lương có cặp bộ lọc thay nút Lọc`.
- [ ] **Steps 2–4:** chạy fail, làm, chạy pass cùng `admin-overview.spec.ts`.
- [ ] **Step 5: Commit** `feat(admin): staff filter on Tổng quan payroll card`

### Task 6: Tab Yêu cầu (Q1–Q4)

**Files:**
- Create:
  - `web/src/views/admin/requests/RequestsView.vue`
  - `web/src/views/admin/requests/parts/` (gồm `ReqTiles`, `ReqKinds`, `ReqTable`, `ReqDrawer`)
  - `web/src/mock/admin-requests.ts`
  - `web/src/builders/api/admin-requests.ts`
  - `web/src/services/admin-requests.ts`
- Modify:
  - `web/src/router/routes/admin-main.ts`
  - `web/src/components/shell/AdminSidebar.vue`
  - `web/src/mock/inbox.ts`: ghi lại việc vừa duyệt hoặc từ chối.
- Test: `web/tests/admin-requests.spec.ts` (mới). Sửa test cũ kiểm `/admin/yeu-cau` chuyển về Tổng quan.

**Interfaces:**
- `type ReqKind = 'leave' | 'makeup' | 'shift' | 'ot' | 'adv' | 'exp'`
- `type ReqStatus = 'pend' | 'ok' | 'rej' | 'cancel'`
- `type ReqRow = { id; kind; status; personId; name; initials; dept; title; ps; date; what; sent; sentAt; reviewedAt?; reviewNote?; head; sub; facts: Fact[] }`
- `getRequests(): Promise<ReqRow[]>`

- [ ] **Step 1: Viết test fail:**
  - `menu có mục Yêu cầu dưới Tổng quan, kèm số đơn chờ`.
  - `thẻ đếm lọc theo trạng thái, cột trái lọc theo loại`.
  - `duyệt ngay trên dòng: đơn rời nhóm chờ, chuông giảm 1`.
  - `từ chối: nút khoá tới khi có lý do; xong thì đơn ở nhóm Từ chối, xem lại thấy lý do`.
  - `?don sai thì bỏ khỏi đường dẫn`.
- [ ] **Steps 2–4:** chạy fail, làm, chạy pass cùng `admin-bell.spec.ts` và `admin-shell.spec.ts`.
- [ ] **Step 5: Commit** `feat(admin): Yêu cầu tab`

### Task 7: Duyệt nhiều đơn (Q5)

**Files:** `RequestsView.vue` và `ReqTable`. Test: `admin-requests.spec.ts`.

- [ ] **Step 1: Viết test fail:** `duyệt nhiều đơn: chỉ đơn chờ chọn được, nút Duyệt/Từ chối trên dòng ẩn, chạy xong báo "Đã duyệt N đơn."`.
- [ ] **Steps 2–5:** chạy fail, làm, chạy pass, commit `feat(admin): bulk approve on Yêu cầu`.

### Task 8: Xác minh toàn bộ

- [ ] Chạy `cd web && npm run test:ui`. Kết quả mong đợi: không có test fail.
- [ ] Review toàn nhánh bằng `superpowers:requesting-code-review`. Sửa những phát hiện đúng, chạy lại `test:ui`.
