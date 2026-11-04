# Chuông thông báo, Chấm công theo tuần và Hồ sơ chấm công — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Làm ngăn kéo chuông (C), màn Chấm công theo tuần (E) và Hồ sơ chấm công (F) trên dữ liệu giả, với một nguồn việc chờ xử lý dùng chung cho chuông, Tổng quan và Chấm công.

**Architecture:**

- `web/src/mock/inbox.ts` giữ 13 việc chờ. Mọi lần xử lý đi qua `useShellStore().decide(id)`, store tăng `version`; các màn đưa `shell.version` vào khoá `useLoad` nên tải lại cùng lúc.
- `web/src/mock/attendance.ts` dựng ô chấm công (ghi nhận gốc + lớp "cần xử lý" đọc từ inbox). `mock/attendance-employee.ts` dựng hồ sơ một người từ cùng dữ liệu đó.
- Màn Chấm công cũ (theo BE) bị thay hẳn; các đường dẫn cũ chuyển hướng.

**Tech Stack:** Vue 3.5 + Pinia + Vue Router 5, Vite 8, Playwright 1.64. Không thêm thư viện.

**Spec:** [docs/superpowers/specs/2026-11-04-admin-bell-attendance-design.md](../specs/2026-11-04-admin-bell-attendance-design.md)

**Mốc trước khi sửa (đo 04/11/2026 trên `a45a3ba`):**

- `npm --prefix web run test:ui`: 40 passed, 47 skipped, 0 failed.
- `npm test` (BE): 24 pass, 0 fail (ledger đợt trước, cùng commit).

## Global Constraints

- Đồng hồ giả: `MOCK_NOW = '2026-10-28T02:40:00.000Z'` (09:40 thứ Tư 28/10/2026 giờ VN), `MOCK_MONTH = '2026-10'`, `MOCK_TODAY = '2026-10-28'`. Dữ liệu giả nằm trong bộ nhớ, tải lại trang thì về ban đầu.
- Không thêm phụ thuộc npm. Không sửa `src/`, `migrations/`, `test/v2/`, `spec/` ở thư mục gốc; không đọc, không trích `spec/` gốc.
- Không cài luật nghiệp vụ chưa xác nhận. Xử lý một việc chỉ bỏ việc khỏi danh sách; ô chấm công về ghi nhận gốc; không đổi công, trễ, OT, lương (spec mục 1.3, R8).
- Lịch: mọi người làm thứ Hai – thứ Bảy; Chủ nhật là ngày nghỉ duy nhất. Ngày có lịch chỉ hỏi `isScheduled(date)` của `mock/attendance.ts`; không builder hay view nào mã cứng "cuối tuần = thứ Bảy + Chủ nhật". Tháng 10/2026: 27 ngày có lịch, công chuẩn 26; mỗi người `worked + leave + isat + pending + unpaid = 27` (spec mục 4.2, R16).
- Màu theo design system GFT:
  - nền và chữ: `surface-dark` #1c1c1c, `surface-dark-raised` #2a2a2a, `ink` #212121, `ink-muted` #616161, `ink-on-dark-muted` #9e9e9e;
  - vàng: `gold` #e8c372, `gold-light` #fce8b2, `gold-pale` #fff9ec;
  - trạng thái: `status-done` #2f5aa8, `status-pending` #eb973d, `status-rejected` #b43f3f, `status-draft` #e0e0e0;
  - 5 nhóm chấm công: đi làm #1c1c1c (chữ trắng), đi muộn/về sớm #e8c372 (chữ `ink`), nghỉ có phép #2f5aa8 (chữ trắng), vắng #b43f3f (chữ trắng), cần xử lý = nền trắng viền 2px #eb973d (chữ `ink`).
  - Vàng không làm chữ hay viền trên nền sáng. Mỗi màn có tối đa một thẻ nền `gold`.
- Bo góc 8 / 12 (dòng chuông) / 16 / 24px, viên thuốc 50px. Không đổ bóng.
- Chữ: Geist, `tabular-nums` cho số. League Spartan 600 chỉ cho tiêu đề trang 28px. Thang cỡ chữ 12 / 14 / 18 / 28 / 32px.
- Câu chữ cố định:
  - "Đã duyệt yêu cầu của <tên>." / "Đã từ chối yêu cầu của <tên>." / "Đã nhắc <tên> giải trình." / "Đã ghi nhận khai thay cho <tên>." / "Yêu cầu này đã được xử lý.";
  - "Không còn yêu cầu nào chờ duyệt.", "Bấm một yêu cầu để xem chi tiết.", "Không có nhân viên nào khớp.", "Không còn việc nào cần xử lý.", "Không tìm thấy nhân viên này.", "Chưa có dữ liệu chấm công giả cho tháng M/YYYY.".
- Không đặt nút giả (spec R9).
- Test: Playwright, không `page.route`. Mỗi file test mới hoặc viết lại có bộ ghi request `/api` (như `trackApi` trong `admin-shell.spec.ts`) và kiểm danh sách rỗng ở test đầu file.
- Xác minh chỉ bằng test: `npm --prefix web run test:ui` và `npm test`. Không chạy typecheck hay prettier.

## Review Focus

1. Xử lý một việc đã bị xử lý ở nơi khác (hộp chi tiết ngày đang mở, việc bị duyệt từ chuông hay tab khác): phải báo "Yêu cầu này đã được xử lý.", không báo thành công. Test ở Task 3.
2. Kéo lưới rồi thả tay trên một ô hoặc một tên: không mở hộp ngày, không đổi trang; bấm thường vẫn mở. Test ở Task 4.
3. Đường dẫn hộp ngày sai (`nv` không có, `ngay` ngoài dữ liệu hoặc sai định dạng): không mở hộp, bỏ `hop`/`nv`/`ngay`, lưới vẫn hiện. Test ở Task 3.
4. Bàn phím trong chuông: Escape đóng chi tiết trước rồi mới đóng ngăn kéo, focus về đúng chỗ; xử lý việc cuối thì focus nằm trên tab "Cần duyệt", không rơi về `body`. Test ở Task 1.
5. Màn 375px: ngăn kéo và thẻ chi tiết nằm trong màn; Chấm công và Hồ sơ không cuộn ngang cả trang, lưới và dải ngày cuộn trong vùng riêng nhận focus. Test ở Task 1, Task 4, Task 5.

## File Structure

| File | Trách nhiệm |
|------|-------------|
| `web/src/mock/inbox.ts` (mới, thay `approvals.ts`) | 13 việc chờ, nhóm, tin hệ thống; xử lý một việc |
| `web/src/mock/shell.ts`, `services/shell.ts`, `stores/shell.ts` | Số chuông; `version` và `decide` |
| `web/src/services/admin-main.ts` | `getInbox`, `resolveRequest`, `decisionText`; bỏ `getBell` |
| `web/src/components/shell/BellDrawer.vue` (mới, thay `BellPopover.vue`) | Ngăn kéo "Thông báo" |
| `web/src/components/shell/InboxDetail.vue` (mới) | Thẻ chi tiết một việc + nút xử lý; dùng lại trong hộp ngày |
| `web/src/components/shell/AdminLayout.vue`, `AdminTopbar.vue`, `AdminSidebar.vue`, `views/admin/settings/nav.ts` | Gắn ngăn kéo; nhãn chuông; bỏ mục Yêu cầu |
| `web/src/mock/overview.ts`, `views/admin/overview/OverviewView.vue`, `parts/ApprovalsCard.vue` | Tổng quan đọc inbox |
| `web/src/mock/attendance.ts` (mới) | Nhân viên, ô chấm công, thẻ chỉ số, chi tiết ngày |
| `web/src/mock/attendance-employee.ts` (mới) | Hồ sơ một người theo tháng |
| `web/src/services/admin-attendance.ts` (viết lại) | `getAttendance`, `getDayDetail`, `getEmployeeAttendance` |
| `web/src/views/admin/attendance/AttendanceWeekView.vue` (mới) | Màn tuần: tiêu đề, thẻ, tab, lọc, URL |
| `web/src/views/admin/attendance/parts/WeekGrid.vue`, `PendingList.vue` (mới) | Lưới tuần; tab Cần xử lý |
| `web/src/views/admin/attendance/useGridScroll.ts` (mới) | Kéo, bắt cột, phím, nút tuần |
| `web/src/views/admin/attendance/useDayHop.ts` (mới), `DayDetailDialog.vue` (viết lại) | Hộp chi tiết ngày theo URL |
| `web/src/views/admin/attendance/AttendanceEmployeeView.vue`, `parts/MonthStrip.vue`, `parts/HistoryList.vue` (mới) | Hồ sơ chấm công |
| `web/src/views/admin/attendance/attendance.css` (mới) | Viên ô, chú giải nhóm màu dùng chung E và F |
| `web/src/views/admin/attendance/links.ts` | Thêm `employeePath` |
| `web/src/utils/format.ts` | Thêm `weekdayName` |
| `web/src/router/routes/admin-attendance.ts` | Route tuần, route hồ sơ, chuyển hướng |
| `web/tests/fixtures/in-app.ts` (mới) | Chạy module mock trong trình duyệt |
| `web/tests/admin-bell.spec.ts`, `attendance-mock.spec.ts`, `attendance-employee.spec.ts` (mới); `admin-shell.spec.ts`, `admin-overview.spec.ts`, `attendance-ux.spec.ts` (sửa / viết lại) | Test |

Ruling: Task 2 chỉ thêm module mock chấm công, chưa đụng service và màn cũ — để app và test cũ vẫn chạy giữa Task 2 và Task 3 — rủi ro nếu sai: thêm một task nhỏ.

Ruling: test gọi module mock bằng `import('/src/…')` trong `page.evaluate` (hàm `inApp`) — `web/` không có bộ chạy unit, và cách này dùng đúng bản module app đang dùng — rủi ro nếu sai: phụ thuộc URL `/src/…` của Vite dev, chỉ ảnh hưởng test.

Ruling: liên kết "Mở hồ sơ chấm công" (Task 1, Task 3) và tên trong lưới (Task 3) có trước route hồ sơ (Task 5); giữa chừng chúng dẫn tới trang NotFound. Test của Task 1 và Task 3 chỉ kiểm `href` — để mỗi thành phần xong trọn trong task của nó — rủi ro nếu sai: bấm thử giữa Task 1 và Task 5 ra trang trống.

Ruling: Task 3 đặt `scrollLeft = 1344` khi mở và `start` cố định 14; nút tuần, kéo, phím và `start` theo cuộn thuộc Task 4 — để Task 3 không có nút chưa chạy — rủi ro nếu sai: không.

---

### Task 1: Nguồn việc chung, ngăn kéo chuông, bỏ mục Yêu cầu

**Files:**

- Create: `web/src/mock/inbox.ts`, `web/src/components/shell/BellDrawer.vue`, `web/src/components/shell/InboxDetail.vue`, `web/tests/fixtures/in-app.ts`, `web/tests/admin-bell.spec.ts`
- Modify: `web/src/mock/shell.ts`, `web/src/mock/overview.ts`, `web/src/services/shell.ts`, `web/src/services/admin-main.ts` (khối mock ở cuối file), `web/src/stores/shell.ts`, `web/src/components/shell/AdminLayout.vue`, `AdminTopbar.vue`, `AdminSidebar.vue`, `web/src/views/admin/settings/nav.ts`, `web/src/views/admin/overview/OverviewView.vue`, `parts/ApprovalsCard.vue`, `web/src/views/admin/attendance/links.ts`, `web/src/styles/base.css` (khối `.bell`), `web/tests/admin-shell.spec.ts`, `web/tests/admin-overview.spec.ts`
- Delete: `web/src/mock/approvals.ts`, `web/src/components/shell/BellPopover.vue`

**Interfaces:**

- Consumes: `respond`, `MOCK_MONTH` (đợt trước); `initials` (`utils/format`); `registerOverlayFocus`, `lockScroll`, `unlockScroll` (`components/ui/overlay-lock`); `useLoad`; `toast`.
- Produces:
  - `mock/inbox.ts`: `type InboxGroup`, `type InboxItem` (đúng spec mục 1.1), `type SystemNote = { id: string; text: string; when: string }`, `INBOX_GROUPS: { key: InboxGroup; label: string }[]`, `pendingInbox(): InboxItem[]`, `resolveInboxItem(id: string): InboxItem | null`, `SYSTEM_NOTES: SystemNote[]`. 13 việc theo bảng ở spec mục 1.1, id `ib-c1` … `ib-a2`.
  - `services/admin-main.ts`:
    - `getInbox(): Promise<{ items: InboxItem[]; notes: SystemNote[] }>`;
    - `resolveRequest(id: string): Promise<InboxItem | null>`;
    - `approveRequest(id: string, _opts?: unknown)` và `rejectRequest(id: string, _opts?: unknown)`: bí danh của `resolveRequest` (RequestsView còn import);
    - `type DecisionVerb = 'approve' | 'reject' | 'remind' | 'declare'`, `decisionText(verb: DecisionVerb, name: string): string`, `ALREADY_HANDLED = 'Yêu cầu này đã được xử lý.'`;
    - xoá `getBell`.
  - `mock/shell.ts`: `shellCounts(): { bell: number }` (= `pendingInbox().length`); xoá `Bell`, `bellView`.
  - `services/shell.ts`: `getShell(): Promise<{ me: ShellMe; bell: number }>`.
  - `useShellStore()`: state `{ me: ShellMe; bell: number; version: number }`; `load(): Promise<void>`; `decide(id: string): Promise<InboxItem | null>` = `resolveRequest(id)`, rồi `version += 1`, rồi `await load()`.
  - `InboxDetail.vue`: props `item: InboxItem`, `showPerson?: boolean` (mặc định `true`), `profileLink?: boolean` (mặc định `true`); emit `decided: [result: { id: string; ok: boolean; text: string }]`. Tự gọi `shell.decide`; nút tắt khi đang xử lý.
  - `links.ts`: `employeePath(id: string): string` → `/admin/cham-cong/nhan-vien/${id}`.
  - `OverviewView.approvals: InboxItem[]` (việc `decide`).
  - `web/tests/fixtures/in-app.ts`: `inApp<T>(page: Page, body: string): Promise<T>` chạy `page.evaluate(\`(async () => { ${body} })()\`)`. Trang phải đã mở một URL của app.

- [ ] **Step 1: Viết `web/tests/admin-bell.spec.ts`** (khung 1440×900; `bell = page.locator('.topbar .bell')`; `drawer = page.getByRole('dialog', { name: 'Thông báo' })`; `detail = page.getByRole('region', { name: 'Chi tiết yêu cầu' })`):
  - `bell drawer lists one line per pending item in five groups`:
    - danh sách `/api` rỗng; `bell` có tên đọc "Thông báo, 13 việc cần xử lý";
    - mở chuông; tab /^Cần duyệt/ có `aria-selected=true` và chứa "13";
    - các heading nhóm trong ngăn kéo theo thứ tự có chữ "Chấm công" + "2", "Đơn nghỉ" + "3", "Làm thêm, làm bù" + "2", "Giải trình" + "4", "Tạm ứng" + "2";
    - có nút tên "Bùi Quốc Huy, Đơn nghỉ: Nghỉ ốm 28/10" và nút "Mai Phương Thảo, Tạm ứng: 3.000.000 ₫";
    - `detail` đếm được 0; có chữ "Bấm một yêu cầu để xem chi tiết.".
  - `sick leave detail shows the leave type and the reason as separate facts`: bấm dòng Bùi Quốc Huy → `detail` được focus, có heading "Nghỉ ốm · 1 ngày"; dòng "Hình thức" là "Nghỉ ốm"; dòng "Lý do" là "“Sốt cao, đã đi khám.”"; dòng "Đính kèm" là "Giấy khám bệnh · 1 tệp".
  - `approving in the bell updates the bell, the overview and selects the next item` (trên `/admin/tong-quan`):
    - bấm dòng Nguyễn Thu Hà, bấm "Duyệt yêu cầu của Nguyễn Thu Hà";
    - thấy "Đã duyệt yêu cầu của Nguyễn Thu Hà." trong ngăn kéo; `bell` có tên "Thông báo, 12 việc cần xử lý";
    - `detail` có tên "Bùi Quốc Huy" (việc kế tiếp);
    - Escape hai lần; article "Yêu cầu chờ duyệt" `.kpi-v` = "10"; dòng đầu list "Việc cần duyệt" chứa "Bùi Quốc Huy".
  - `forgotten punches offer a reminder and a stand-in entry`:
    - bấm dòng Trịnh Văn Long → có nút "Nhắc giải trình", "Khai thay giờ ra"; liên kết "Mở hồ sơ chấm công" có `href` `/admin/cham-cong/nhan-vien/trinh-van-long`;
    - bấm "Nhắc giải trình" → "Đã nhắc Trịnh Văn Long giải trình.", chuông 12;
    - bấm dòng Lý Thanh Tâm → có "Khai thay giờ vào"; bấm → "Đã ghi nhận khai thay cho Lý Thanh Tâm.";
    - bấm dòng Mai Phương Thảo → không có liên kết "Mở hồ sơ chấm công".
  - `escape closes the detail first, then the drawer, returning focus` (Review Focus 4): bấm chuông, bấm dòng Lê Hoàng Nam; Escape → `detail` đếm 0, `drawer` vẫn hiện, dòng Lê Hoàng Nam được focus; Escape → `drawer` đếm 0, `bell` được focus.
  - `resolving the last item leaves focus on the Cần duyệt tab` (Review Focus 4):
    - `inApp` gọi `resolveInboxItem` cho 12 id trừ `ib-a2`;
    - mở chuông → 1 dòng; bấm dòng, bấm "Duyệt yêu cầu của Trương Quốc Việt";
    - thấy "Không còn yêu cầu nào chờ duyệt."; tab /^Cần duyệt/ được focus; `bell` có tên "Thông báo, 0 việc cần xử lý" và `bell.locator('i')` đếm 0.
  - `system news tab lists three read-only notes`: bấm tab "Tin hệ thống · 3" → panel của tab có 3 `listitem`, chứa "Đã nhận dữ liệu máy chấm công lúc 09:30.", không có nút nào trong panel.
- [ ] **Step 2: Sửa `admin-shell.spec.ts` và `admin-overview.spec.ts`** theo spec bảng 6.2:
  - `admin shell makes no /api requests while navigating`:
    - vòng bấm còn Tổng quan, Chấm công, Đánh giá KPI, Bảng lương, Nhân sự (so tên `exact`), bỏ chú thích "Yêu cầu 9";
    - thêm: navigation "Điều hướng" có 0 link tên /^Yêu cầu/;
    - mở chuông, bấm "Mở trang Yêu cầu" → URL `/admin/yeu-cau`; danh sách `/api` rỗng.
  - `bell shows the mock count and opens the task list` → đổi tên `bell shows the pending count and opens the notification drawer`: `bell` chứa "13", tên đọc "Thông báo, 13 việc cần xử lý"; bấm → dialog "Thông báo".
  - `navigation drops stale view queries without reopening a shell dialog`: mở chuông, bấm "Mở trang Yêu cầu" → URL đúng `/admin/yeu-cau?thang=2026-10`; dialog "Thông báo" đếm 0.
  - Thay `bell popover opens below the bell on desktop` bằng `bell drawer docks to the right edge on desktop` (1440×900): hộp dialog `x + width` = 1424 ±1, `y` = 16 ±1, `width` = 400 ±1, `height` = 868 ±1.
  - Thay `bell popover stays inside a 375px viewport` bằng `bell drawer and its detail stay inside a 375px viewport` (Review Focus 5): mở, bấm dòng đầu; hộp dialog và hộp `detail` đều nằm trong `[0, 375]`.
  - `admin-overview.spec.ts`:
    - bỏ `requestsLink`;
    - `overview shows the mock figures`: KPI chứa "2,48 tỷ", "128", "113"; `requestsKpi .kpi-v` = "11"; dòng đầu "Việc cần duyệt" chứa "Nguyễn Thu Hà" và "Đơn nghỉ · Phép năm · 29–30/10".
    - `approving updates the list, KPI, sidebar badge and toast` → đổi tên `approving updates the list, KPI, bell and toast`:
      - duyệt Nguyễn Thu Hà → KPI "10", chuông "Thông báo, 12 việc cần xử lý", toast, nút "Duyệt yêu cầu của Bùi Quốc Huy" được focus;
      - từ chối Bùi Quốc Huy → toast "Đã từ chối yêu cầu của Bùi Quốc Huy.", KPI "9", chuông 11.
    - `approving every request shows the empty state`: cuối test KPI "0", chuông "Thông báo, 2 việc cần xử lý", liên kết "Xem tất cả" được focus.
- [ ] **Step 3: Chạy `npm --prefix web exec playwright test tests/admin-bell.spec.ts tests/admin-shell.spec.ts tests/admin-overview.spec.ts`.** Kỳ vọng FAIL: chưa có dialog "Thông báo", KPI vẫn 9, thanh bên còn "Yêu cầu".
- [ ] **Step 4: Cài theo Interfaces và spec mục 1–3.**
  - `inbox.ts`: dựng dòng "Hình thức" và "Lý do" của đơn nghỉ từ `leave` (không viết tay hai dòng đó).
  - `BellDrawer.vue`:
    - không prop; emit `close`; `useLoad(getInbox, () => shell.version)`;
    - `registerOverlayFocus(root, closeTop, () => true)` với `closeTop` = có việc đang chọn thì bỏ chọn và focus dòng đó, không thì `emit('close')`;
    - chọn việc kế tiếp sau khi xử lý: việc đứng sau việc vừa xử lý trong thứ tự hiện, không có thì việc đầu, hết việc thì focus tab;
    - CSS kích thước theo spec mục 2.1, media `max-width: 839px`.
  - `AdminLayout.vue`: thay `BellPopover` bằng `BellDrawer`; bỏ `:counts`.
  - `AdminTopbar.vue`: tên đọc chuông `Thông báo, ${bell} việc cần xử lý`.
  - `AdminSidebar.vue`: bỏ prop `counts` và `span.cnt`. Grep `.cnt` trong `base.css`, xoá rule nếu không còn ai dùng.
  - `nav.ts`: bỏ mục `duyet`.
  - `OverviewView.vue`:
    - `useLoad` khoá `${period.month}|${shell.version}`;
    - `decide` gọi `shell.decide`; có kết quả thì `toast.ok(decisionText(...))`, `null` thì `toast.error(ALREADY_HANDLED)`.
  - `ApprovalsCard.vue`:
    - dòng phụ `${groupLabel} · ${what}` cộng ` · ${when}` khi có;
    - nhớ chỉ số dòng vừa bấm; khi `approvals` đổi thì `nextTick` focus nút Duyệt ở chỉ số đó (hoặc dòng cuối), hết dòng thì focus "Xem tất cả".
  - Grep `mock/approvals`, `getBell`, `bellView`, `BellPopover`, `counts.requests` → không còn.
- [ ] **Step 5: Chạy lại lệnh ở Step 3.** Kỳ vọng: 7 + 17 + 7 passed. Rồi chạy `npm --prefix web run test:ui`: 0 failed.
- [ ] **Step 6: Commit** `feat(web): shared inbox, bell drawer and sidebar without requests`. Chỉ add file của task.

### Task 2: Dữ liệu giả chấm công

**Files:**

- Create: `web/src/mock/attendance.ts`, `web/tests/attendance-mock.spec.ts`
- Modify: `web/src/utils/format.ts` (thêm `weekdayName`)

**Interfaces:**

- Consumes: `pendingInbox`, `InboxItem` (Task 1); `MOCK_TODAY`, `MOCK_MONTH`; `initials`, `dm`, `dmy`, `dowShort`; `inApp` (Task 1).
- Produces (`mock/attendance.ts`):

```ts
type CellKind = 'work' | 'late' | 'leave' | 'absent' | 'todo' | 'off' | 'fu' | 'nocheck';
type GroupKey = 'work' | 'late' | 'leave' | 'absent' | 'todo';
type Cell = { date: string; kind: CellKind; base: CellKind; text: string; in: string | null; out: string | null;
  live: boolean; itemId: string | null; label: string; aria: string };
type Person = { id: string; name: string; initials: string; dept: string; title: string; code: string; joined: string;
  contract: string; shift: string; leaveLeft: string; lateCount: number; avgIn: string; avgOut: string;
  sums: { late: number; ot: number };
  period: { worked: number; leave: number; isat: number; pending: number; unpaid: number } };  // tổng = 27
type AttendanceDay = { iso: string; dow: string; dm: string; scheduled: boolean; today: boolean; monday: boolean; periodStart: boolean };
type AttendanceRow = { person: Person; cells: Cell[] };          // 28 ô theo thứ tự days
type Tile = { key: 'todo' | 'present' | 'late' | 'leave' | 'absent' | 'ot'; label: string; value: string; note: string };
type PendingDay = { item: InboxItem; person: Person; date: string };
type AttendanceView = { month: string; subtitle: string; tiles: Tile[]; days: AttendanceDay[]; rows: AttendanceRow[];
  pending: PendingDay[]; total: number };                         // total = 128
type DayDetail = { person: Person; date: string; title: string; sub: string; cell: Cell; item: InboxItem | null };

ROSTER: Person[]; GROUPS: { key: GroupKey; label: string }[]; SHIFT = 'HC 08:00–17:00';
GRID_FROM = '2026-10-12'; GRID_DAYS = 28; STANDARD_DAYS = 26;
isScheduled(date: string): boolean;                              // nơi duy nhất biết lịch: false cho Chủ nhật
scheduledDays(month: string): number;                            // số ngày isScheduled trong tháng ('2026-10' → 27)
cellOf(personId: string, date: string): Cell | null;             // 2026-10-01 … 2026-11-08
attendanceView(month: string): AttendanceView | null;            // null khi month !== MOCK_MONTH
dayDetail(personId: string, date: string): DayDetail | null;
```

- `weekdayName(iso: string): string` trong `utils/format.ts` ("Thứ Hai" … "Chủ nhật", dùng mảng `DOW` sẵn có).
- Giá trị theo spec mục 4.2 (lịch, bảng nhân viên, bảng `period`, ô ghi tay, công thức, lớp phủ, bảng `label`/`aria`) và 4.3 (thẻ). `AttendanceDay.scheduled` lấy từ `isScheduled`; không chỗ nào khác xét thứ trong tuần để quyết định ngày nghỉ. `subtitle` = "Kỳ công 01–31/10/2026 · hôm nay Thứ Tư 28/10". `GROUPS` nhãn: Đi làm; Đi muộn, về sớm; Nghỉ có phép; Vắng; Cần xử lý.

- [ ] **Step 1: Viết `web/tests/attendance-mock.spec.ts`.** Mỗi test `goto('/admin/tong-quan')` rồi dùng `inApp` import `/src/mock/attendance.ts` (và `/src/mock/inbox.ts` khi cần xử lý việc):
  - `roster and days follow the board`: 11 id của `rows` đúng thứ tự spec; `days.length` 28; `days[0].iso` "2026-10-12"; `days[16]` có `iso` "2026-10-28", `today` true; `days[27].iso` "2026-11-08"; `days[20]` có `periodStart` true và `scheduled` false (Chủ nhật 01/11); `days[19].scheduled` true (thứ Bảy 31/10).
  - `everyone works Monday to Saturday and the period adds up to 27`:
    - `scheduledDays('2026-10')` = 27; `STANDARD_DAYS` = 26; `isScheduled('2026-10-31')` true; `isScheduled('2026-11-01')` false;
    - mọi người trong `ROSTER`: `worked + leave + isat + pending + unpaid` = 27;
    - `period` của Lê Hoàng Nam `{ worked: 25, leave: 1, isat: 0, pending: 1, unpaid: 0 }`, Đỗ Mai Linh `{ 25, 0, 0, 1, 1 }`, Nguyễn Thu Hà `{ 25, 0, 0, 2, 0 }`;
    - với mọi người: `leave`, `unpaid`, `pending` bằng số ô `leave`, `absent`, `todo` của `cellOf` từ 01/10 đến 31/10.
  - `hand-written cells match the board`:
    - `cellOf('le-hoang-nam','2026-10-26')` → work "07:56–17:10";
    - `cellOf('do-mai-linh','2026-10-13')` → absent "Vắng", aria "Vắng";
    - `cellOf('ngo-gia-bao','2026-10-19')` → leave "Nghỉ, làm bù";
    - `cellOf('ly-thanh-tam','2026-10-28')` → nocheck "Chưa vào";
    - `cellOf('pham-ngoc-anh','2026-10-28')` → late, `live` true, text "08:21–…", aria "Đi muộn, 08:21–…, đang làm";
    - `cellOf('hoang-minh-duc','2026-10-22')`: `base` late, `label` "Về sớm".
  - `other cells follow the generator`:
    - `cellOf('nguyen-thu-ha','2026-10-01').text` "07:45–17:00";
    - `cellOf('le-hoang-nam','2026-10-05').text` "07:51–17:06";
    - thứ Bảy là ngày làm: `cellOf('le-hoang-nam','2026-10-03').text` "07:45–17:08", `cellOf('le-hoang-nam','2026-10-31')` → fu;
    - Chủ nhật: `cellOf('le-hoang-nam','2026-10-04').kind` "off", aria "không có ca";
    - `cellOf('le-hoang-nam','2026-11-02')` → fu "08:00–17:00", aria "ca dự kiến 08:00–17:00";
    - `cellOf('le-hoang-nam','2026-11-09')` null.
  - `pending items overlay their days and lift when resolved`:
    - tổng ô `todo` trong `rows` = 12;
    - HN 27/10: todo, `itemId` "ib-e1", text "08:12–?", aria "Cần xử lý, Thiếu giờ ra";
    - TH 29/10 text "Phép năm"; QH 28/10 text "Nghỉ ốm";
    - `resolveInboxItem('ib-e1')` → HN 27/10 kind late, label "Đi muộn", `itemId` null; tổng todo 11;
    - `resolveInboxItem('ib-l2')` → QH 28/10 nocheck "Chưa vào".
  - `tiles count pending items by scope`:
    - tile todo value "11", note "2 quên chấm · 9 yêu cầu chờ duyệt"; tile leave note "3 đơn chờ duyệt"; tile ot note "2 yêu cầu chờ duyệt";
    - tên trong `pending` theo đúng thứ tự spec mục 4.6;
    - resolve `ib-c1` → todo "10", note "1 quên chấm · 9 yêu cầu chờ duyệt";
    - resolve `ib-a1` → todo vẫn "10".
  - `day detail and other months`:
    - `dayDetail('le-hoang-nam','2026-10-27')` → title "Lê Hoàng Nam · Thứ Ba 27/10/2026", sub "Kinh doanh · Nhân viên kinh doanh · Ca HC 08:00–17:00", `cell.in` "08:12", `cell.out` null, `item.id` "ib-e1";
    - `dayDetail('khong-co','2026-10-27')`, `dayDetail('le-hoang-nam','2026-09-30')`, `dayDetail('le-hoang-nam','2026-13-01')` đều null;
    - `attendanceView('2026-09')` null.
  - `weekdayName names every day`: import `/src/utils/format.ts`; `weekdayName('2026-10-27')` "Thứ Ba", `weekdayName('2026-11-01')` "Chủ nhật".
- [ ] **Step 2: Chạy `npm --prefix web exec playwright test tests/attendance-mock.spec.ts`.** Kỳ vọng FAIL: không import được `/src/mock/attendance.ts`.
- [ ] **Step 3: Cài `mock/attendance.ts` và `weekdayName`.** Ô được dựng mỗi lần gọi (không cache) để lớp phủ luôn theo `pendingInbox()`. `dayDetail` trả null khi ngày không đúng dạng `YYYY-MM-DD` hoặc ngoài 01/10–08/11.
- [ ] **Step 4: Chạy lại lệnh ở Step 2.** Kỳ vọng: 8 passed.
- [ ] **Step 5: Commit** `feat(web): mock attendance data from the shared inbox`.

### Task 3: Màn Chấm công theo tuần

**Files:**

- Create: `web/src/views/admin/attendance/AttendanceWeekView.vue`, `parts/WeekGrid.vue`, `parts/PendingList.vue`, `useDayHop.ts`, `attendance.css`
- Modify: `web/src/router/routes/admin-attendance.ts`, `web/src/services/admin-attendance.ts` (viết lại toàn bộ), `web/src/views/admin/attendance/DayDetailDialog.vue` (viết lại toàn bộ), `web/tests/attendance-ux.spec.ts` (viết lại toàn bộ)
- Delete: `AttendanceShell.vue`, `TimesheetView.vue`, `TodayView.vue`, `TodayDialog.vue`, `OvertimeView.vue`, `OvertimeDialog.vue`, `RequestTable.vue`, `BulkPunchDialog.vue` (trong `views/admin/attendance/`), `web/src/builders/admin-attendance/timesheet.ts`, `web/src/builders/admin-attendance/shifts.ts`

**Interfaces:**

- Consumes:
  - Task 1: `InboxDetail` (`showPerson`, `profileLink`, `decided`), `useShellStore().version`, `employeePath`.
  - Task 2: `attendanceView`, `dayDetail`, các kiểu, `GROUPS`, `weekdayName`.
- Produces:
  - `services/admin-attendance.ts`: `getAttendance(month: string): Promise<AttendanceView | null>`, `getDayDetail(personId: string, date: string): Promise<DayDetail | null>`.
  - `useDayHop(): { day: ComputedRef<{ personId: string; date: string } | null>; openDay(personId: string, date: string): void; closeDay(): void }`:
    - `day` khác null khi `hop === 'chi-tiet-ngay'` và `nv`, `ngay` là chuỗi;
    - mở và đóng bằng `router.replace`; đóng chỉ bỏ `hop`, `nv`, `ngay`.
  - `DayDetailDialog.vue`:
    - props `personId: string`, `date: string`; emit `close`;
    - `useLoad` khoá `${personId}|${date}|${shell.version}`; kết quả null ở lần tải đầu thì `emit('close')`.
  - `WeekGrid.vue`:
    - props `days: AttendanceDay[]`, `rows: AttendanceRow[]`, `monthNo: number`; emit `open-day: [personId: string, date: string]`;
    - phần tử vùng cuộn có `ref="scroller"` (Task 4 gắn vào đây).
  - `PendingList.vue`: prop `pending: PendingDay[]`; emit `open-day`.
  - `attendance.css`: `.pill.work|late|leave|absent|todo|off|fu|nocheck`, `.pill .dot`, `.legend`, `.gc[data-group] .b` (ô màu), `.gc .ct` (số). Task 5 dùng lại.

- [ ] **Step 1: Viết lại `web/tests/attendance-ux.spec.ts`** (xoá toàn bộ nội dung cũ; khung 1440×900 trừ khi ghi khác; `grid = getByRole('region', { name: 'Lưới chấm công' })`; `tile(name)` = article trong region "Chỉ số chấm công"; `cell(name)` = `getByRole('button', { name })`):
  - `attendance week shows tiles, the current week and today without calling /api`:
    - danh sách `/api` rỗng; heading "Chấm công"; chữ "Kỳ công 01–31/10/2026 · hôm nay Thứ Tư 28/10";
    - region "Chỉ số chấm công" có 6 article; `tile('Cần xử lý')` có `.tile-v` "11" và `.tile-n` "2 quên chấm · 9 yêu cầu chờ duyệt"; `tile('Nghỉ có phép') .tile-n` "3 đơn chờ duyệt";
    - tab "Tuần" được chọn; tab /^Cần xử lý/ chứa "11"; tab "Tháng" đếm 0;
    - `.wk-label` "26/10 – 01/11/2026"; `grid.evaluate(el => el.scrollLeft)` = 1344;
    - `tbody tr` đếm 11; chú giải `[data-group="work"] .ct` "25", `late` "2", `leave` "0", `absent` "0", `todo` "8";
    - chữ "Hiển thị 11 trong 128 nhân viên".
  - `cells read their state and off days are not buttons`:
    - `cell('Lê Hoàng Nam, Thứ Ba 27/10: Cần xử lý, Thiếu giờ ra')` có class `todo`;
    - `cell('Phạm Ngọc Anh, Thứ Tư 28/10: Đi muộn, 08:21–…, đang làm')` có class `late` và chứa `.dot`;
    - `getByRole('img', { name: 'Nguyễn Thu Hà, Chủ nhật 01/11: không có ca' })` hiện, và nút cùng tên đếm 0;
    - `cell('Nguyễn Thu Hà, Thứ Bảy 31/10: ca dự kiến 08:00–17:00')` là nút (thứ Bảy có lịch);
    - `cell('Ngô Gia Bảo, Chủ nhật 01/11: Cần xử lý, Làm bù')` có class `todo`;
    - `th[data-date="2026-11-01"]` có màu chữ `rgb(158, 158, 158)`, `th[data-date="2026-10-31"]` thì không;
    - liên kết "Lê Hoàng Nam" có `href` `/admin/cham-cong/nhan-vien/le-hoang-nam` và `draggable="false"`.
  - `name and department filters live in the URL and survive dialog, reload, back and forward` (thay test cũ `filter and search URL state…`):
    - từ `/admin/tong-quan` bấm "Chấm công" ở thanh bên; điền "Lọc theo tên" = "nam" → URL chứa `q=nam`, 1 dòng "Lê Hoàng Nam";
    - xoá ô tên, chọn "Phòng ban" = "Sản xuất" → URL chứa `pb=S%E1%BA%A3n`, 4 dòng;
    - bấm nút tên khớp `/^Bùi Quốc Huy, Thứ Hai 26\/10:/` → dialog hiện; Escape → URL vẫn có `pb`, vẫn 4 dòng;
    - `reload()` → 4 dòng, ô chọn giữ "Sản xuất";
    - `goBack()` → `/admin/tong-quan`; `goForward()` → URL vẫn có `pb`, 4 dòng;
    - điền "xyz" → "Không có nhân viên nào khớp.", "Hiển thị 0 trong 128 nhân viên".
  - `unknown department in the URL falls back to all`: `goto('/admin/cham-cong?pb=Kho')` → URL không còn `pb`, ô chọn "Phòng ban: Tất cả", 11 dòng.
  - `phone keeps the labelled filters inside the viewport` (thay phần lọc của `phone uses labeled employee filter…`; khung 375×812): ô "Lọc theo tên" và "Phòng ban" hiện, hộp nằm trong `[0, 375]`; điền "linh" → 1 dòng "Đỗ Mai Linh".
  - `pending tab lists every day to handle in date order`:
    - bấm tab /^Cần xử lý/ → URL chứa `xem=can-xu-ly`;
    - list "Việc cần xử lý chấm công" có 11 `listitem`; mục 1 chứa "Trần Minh Quân" và "15/10"; mục 4 "Lý Thanh Tâm"; mục 5 "Đỗ Mai Linh"; mục 11 "Phạm Ngọc Anh" và "03/11";
    - `reload()` giữ tab; bấm mục "Lê Hoàng Nam" → dialog "Lê Hoàng Nam · Thứ Ba 27/10/2026".
  - `day dialog deep-links, shows the request and closes back to the grid` (thay ý `?hop` của `Today openers share the hop URL…`):
    - `goto('/admin/cham-cong?thang=2026-10&q=nam')`; bấm ô HN 27/10 → URL chứa `hop=chi-tiet-ngay`, `nv=le-hoang-nam`, `ngay=2026-10-27`;
    - dialog có "Kinh doanh · Nhân viên kinh doanh · Ca HC 08:00–17:00", "Giờ vào" "08:12", "Giờ ra" "Chưa có", nút "Duyệt yêu cầu của Lê Hoàng Nam", liên kết "Mở hồ sơ chấm công";
    - `reload()` → dialog mở lại;
    - Escape → URL đúng `/admin/cham-cong?thang=2026-10&q=nam`;
    - mở lại bằng chuột, Escape → ô HN 27/10 được focus.
  - `approving in the day dialog updates the cell, the tile and the bell`:
    - mở ô HN 27/10, bấm "Duyệt yêu cầu của Lê Hoàng Nam" → toast "Đã duyệt yêu cầu của Lê Hoàng Nam.", dialog đóng;
    - `cell('Lê Hoàng Nam, Thứ Ba 27/10: Đi muộn, 08:12–?')` có class `late`;
    - `tile('Cần xử lý') .tile-v` "10"; chú giải todo "7"; chuông "Thông báo, 12 việc cần xử lý".
  - `deciding an item already handled elsewhere warns instead of confirming` (Review Focus 1):
    - `goto('/admin/cham-cong?hop=chi-tiet-ngay&nv=le-hoang-nam&ngay=2026-10-27')`; dialog hiện;
    - `inApp` gọi `resolveInboxItem('ib-e1')`; bấm "Duyệt yêu cầu của Lê Hoàng Nam";
    - thấy "Yêu cầu này đã được xử lý."; "Đã duyệt yêu cầu của Lê Hoàng Nam." đếm 0.
  - `bad day links close quietly` (Review Focus 3): với mỗi query `nv=khong-co&ngay=2026-10-27`, `nv=le-hoang-nam&ngay=2026-13-01`, `nv=le-hoang-nam&ngay=hom-qua` (kèm `hop=chi-tiet-ngay`) → dialog đếm 0, URL đúng `/admin/cham-cong`, `grid` hiện.
  - `other months show the empty line`: `goto('/admin/cham-cong?thang=2026-09')` → "Chưa có dữ liệu chấm công giả cho tháng 9/2026."; `grid` đếm 0.
  - `old attendance links land on the week view`:
    - `/admin/cham-cong/bang-cong?thang=2026-10` → URL `/admin/cham-cong?thang=2026-10`;
    - `/admin/cham-cong/sua-gio` và `/admin/cham-cong/gio-ot` → URL chứa `xem=can-xu-ly`, tab /^Cần xử lý/ được chọn;
    - `/admin/cham-cong/hom-nay` → URL `/admin/cham-cong`, không dialog.
- [ ] **Step 2: Chạy `npm --prefix web exec playwright test tests/attendance-ux.spec.ts`.** Kỳ vọng FAIL: màn cũ gọi `api()` và không có region "Chỉ số chấm công".
- [ ] **Step 3: Cài.**
  - Route theo spec mục 4.1: một route `/admin/cham-cong` không con, cộng các route chuyển hướng `bang-cong`, `hom-nay`, `phep-con-lai`, `sua-gio`, `gio-ot`, `ca-lam` viết dạng `path: '/admin/cham-cong/<tên>'`.
  - Xoá các file ở mục Delete. Grep tên từng file và `builders/admin-attendance/timesheet|shifts` → không còn ai import. Giữ `common.ts`.
  - `AttendanceWeekView.vue`:
    - `useLoad` khoá `${period.month}|${shell.version}`;
    - bộ lọc đọc và ghi `q`, `pb`, `xem` bằng `router.replace` (giữ các khoá khác); `pb` lạ thì bỏ;
    - lọc tên bằng `fold()` của `builders/admin-attendance/common.ts`;
    - render `DayDetailDialog` khi `useDayHop().day` khác null.
  - `WeekGrid.vue`:
    - bố cục và kích thước theo spec mục 4.4; `max-width: 1084px`; đầu cột ngày là `th.dc` có `data-date`; xám khi `day.scheduled` false; 3 cột tổng đọc `period.worked`, `sums.late`, `sums.ot`;
    - `onMounted`: `scroller.scrollLeft = 1344`; `start` cố định 14 (Task 4 thay);
    - nhãn tuần và số chú giải tính từ `days[start..start+6]` trên `rows`;
    - tên là `RouterLink` tới `employeePath(id)` (giữ `thang`), `draggable="false"`;
    - dòng gợi ý chân bảng đúng câu ở spec mục 4.3.
  - `DayDetailDialog.vue`:
    - `AppModal` với title, sub, các dòng thân theo spec mục 4.7;
    - `InboxDetail` với `:show-person="false" :profile-link="false"`;
    - `@decided`: `ok` thì `toast.ok(text)`, không thì `toast.error(text)`; rồi `emit('close')`;
    - liên kết "Mở hồ sơ chấm công" ẩn khi `route.path === employeePath(personId)`.
  - `attendance.css`: import trong `AttendanceWeekView.vue` (như `settings-extra.css`).
- [ ] **Step 4: Chạy lại lệnh ở Step 2.** Kỳ vọng: 12 passed. Rồi `npm --prefix web run test:ui`: 0 failed, skipped 38.
- [ ] **Step 5: Commit** `feat(web): weekly attendance view on mock data`.

### Task 4: Cuộn lưới tuần: kéo, bắt cột, phím, nút tuần

**Files:**

- Create: `web/src/views/admin/attendance/useGridScroll.ts`
- Modify: `web/src/views/admin/attendance/parts/WeekGrid.vue`, `attendance.css`, `web/tests/attendance-ux.spec.ts` (thêm test cuối file và `test.use({ reducedMotion: 'reduce' })` đầu file)

**Interfaces:**

- Consumes: `WeekGrid.vue` và `ref="scroller"` (Task 3).
- Produces: `COL = 96`, `WEEK = 672`, `TODAY_LEFT = 1344`, `MAX_START = 21`; `useGridScroll(scroller: Ref<HTMLElement | null>): { start: Ref<number>; atStart: ComputedRef<boolean>; atEnd: ComputedRef<boolean>; prevWeek(): void; nextWeek(): void; thisWeek(): void }`.

- [ ] **Step 1: Thêm test vào `attendance-ux.spec.ts`:**
  - `week buttons move by seven days and Hôm nay returns to this week` (thay test đang chạy `Today title action opens the today dialog…`):
    - bấm "Tuần trước" → `.wk-label` "19/10 – 25/10/2026"; chú giải work "62" (gồm thứ Bảy 24/10 của 11 người), late "1", leave "1", todo "2";
    - "Tuần trước" → "12/10 – 18/10/2026"; nút "Tuần trước" disabled; chú giải work "63", absent "1", leave "1", todo "1";
    - "Hôm nay" → "26/10 – 01/11/2026";
    - "Tuần sau" → "02/11 – 08/11/2026"; nút "Tuần sau" disabled.
  - `dragging scrolls, snaps to a day and opens nothing` (Review Focus 2):
    - lấy tâm ô HN 27/10; `mouse.down`, `mouse.move(x - 150, y, { steps: 10 })`, `mouse.up`;
    - `expect.poll(scrollLeft)` = 1536; dialog đếm 0; URL không có `hop`;
    - từ `scrollLeft` 1536, kéo 150px bắt đầu trên liên kết "Lê Hoàng Nam" → URL vẫn `/admin/cham-cong`;
    - bấm thường ô HN 27/10 → dialog hiện.
  - `keyboard scrolls the focused grid by day and by week`:
    - `grid.focus()`; → được 1440; ← ← được 1248; PageUp được 576;
    - Home: 0 và nhãn "12/10 – 18/10/2026";
    - End: `scrollLeft === scrollWidth - clientWidth` và nhãn "02/11 – 08/11/2026".
  - `end of the grid keeps names and totals in view` (thay `31-day month keeps every date…`; khung 1024×900): `grid.focus()`, End; hộp của chữ "Nguyễn Thu Hà", đầu cột "OT giờ" và đầu cột chứa "08/11" đều nằm trong hộp của `grid`.
  - `grid scrolls inside its own region at ${width}px` cho 375, 768, 1024, 1440 (thay vòng `timesheet stays in a keyboard-scrollable region…`; Review Focus 5):
    - `grid` có `tabindex="0"` và focus được;
    - `document.documentElement.scrollWidth <= innerWidth`; `grid` có `scrollWidth > clientWidth`;
    - `th.nm` rộng 140 ±1 ở 375, 220 ±1 ở các khổ khác;
    - `th.s3` có `position` `static` ở 375, `sticky` ở các khổ khác.
- [ ] **Step 2: Chạy `npm --prefix web exec playwright test tests/attendance-ux.spec.ts`.** Kỳ vọng FAIL ở các test mới: chưa có nút tuần, kéo không cuộn.
- [ ] **Step 3: Cài `useGridScroll` và gắn vào `WeekGrid` theo spec mục 4.5.**
  - Lắng nghe `pointerdown`/`pointermove`/`pointerup` trên vùng cuộn, bỏ qua khi `pointerType === 'touch'`.
  - `click` ở pha capture trên vùng cuộn: lượt kéo vừa xong thì `preventDefault` + `stopPropagation`.
  - `dragstart` → `preventDefault`.
  - `scrollTo` dùng `behavior` theo `matchMedia('(prefers-reduced-motion: reduce)')`.
  - `keydown` chỉ khi `event.target === scroller`.
  - `start` cập nhật trong `scroll` (passive).
  - Gỡ mọi listener trong `onBeforeUnmount`.
  - Thêm nút "Tuần trước" / "Tuần sau" (`disabled` theo `atStart` / `atEnd`) và "Hôm nay".
  - CSS: `.dragging { cursor: grabbing }`, `scroll-padding` theo spec, media `max-width: 767px` cho cột tên 140px và cột tổng `position: static`.
- [ ] **Step 4: Chạy lại lệnh ở Step 2.** Kỳ vọng: 20 passed. Rồi `npm --prefix web run test:ui`: 0 failed.
- [ ] **Step 5: Commit** `feat(web): drag, snap and keyboard scrolling for the attendance week`.

### Task 5: Hồ sơ chấm công

**Files:**

- Create: `web/src/mock/attendance-employee.ts`, `web/src/views/admin/attendance/AttendanceEmployeeView.vue`, `parts/MonthStrip.vue`, `parts/HistoryList.vue`, `web/tests/attendance-employee.spec.ts`
- Modify: `web/src/router/routes/admin-attendance.ts` (thêm route hồ sơ), `web/src/services/admin-attendance.ts` (thêm `getEmployeeAttendance`), `web/tests/attendance-mock.spec.ts` (thêm test cuối file)

**Interfaces:**

- Consumes:
  - Task 2: `ROSTER`, `cellOf`, `STANDARD_DAYS`, `Cell`, `CellKind`, `GroupKey`, `Person` (`period`, `sums`), `GROUPS`, `weekdayName`; `MOCK_TODAY`.
  - Task 1 và 3: `useDayHop`, `DayDetailDialog`, `attendance.css`, `employeePath`, `shell.version`.
- Produces (`mock/attendance-employee.ts`):

```ts
type StatTile = { label: string; value: string; note: string };
type StripDay = { date: string; dow: string; day: string; kind: CellKind; today: boolean; aria: string };
type TrackPart = { type: 'shift' | 'bar' | 'lunch' | 'late' | 'miss' | 'tick' | 'now' | 'leave'; from: number; to?: number; label?: string };
type HistoryRow = { date: string; dayLabel: string; kind: CellKind; range: string; sub: string; status: string;
  tone: GroupKey | 'nocheck'; inText: string; outText: string; parts: TrackPart[] };
type HistoryEntry = { type: 'row'; row: HistoryRow } | { type: 'fold'; label: string; rows: HistoryRow[] };
type EmployeeMonth = { pending: { count: number; date: string; text: string } | null; stats: StatTile[];
  chips: Record<GroupKey, number>; strip: StripDay[]; history: HistoryEntry[] };
type EmployeeView = { person: Person; month: string; index: number; total: number;
  prevId: string | null; nextId: string | null; data: EmployeeMonth | null };   // index tính từ 1

pct(t: string): number;                                            // spec mục 5
employeeView(personId: string, month: string): EmployeeView | null;  // null khi không có người; data null khi tháng khác 2026-10
```

- `getEmployeeAttendance(personId: string, month: string): Promise<EmployeeView | null>` (`services/admin-attendance.ts`).
- Route `/admin/cham-cong/nhan-vien/:id`, meta `{ layout: 'admin', nav: 'cham-cong', title: 'Hồ sơ chấm công' }`. Đặt trước các route chuyển hướng cùng tiền tố.

- [ ] **Step 1: Thêm test module vào `attendance-mock.spec.ts`:**
  - `employee view for Lê Hoàng Nam matches the board`:
    - `index` 3, `total` 11, `prevId` "tran-minh-quan", `nextId` "pham-ngoc-anh";
    - `stats` value ["25 / 26", "1 lần", "07:59", "17:08"], note ["cả kỳ 01–31/10", "tổng 12 phút", "ca bắt đầu 08:00", "ca kết thúc 17:00"];
    - `chips` `{ work: 22, late: 0, leave: 1, absent: 0, todo: 1 }`;
    - `pending` `{ count: 1, date: '2026-10-27', text: '1 ngày cần xử lý · 27/10 thiếu giờ ra, chờ duyệt giải trình' }`;
    - `strip.length` 31, trong đó 4 ngày `off` (các Chủ nhật) và 27 ngày còn lại;
    - `history` thu gọn thành chuỗi (`row:<date>` / `fold:<label>`) = row 28, 27, 26, 24, 23/10; `fold:9 ngày đi làm · 13/10 – 22/10`; row 12/10; `fold:9 ngày đi làm · 01/10 – 10/10`.
  - `history rows carry the times and the track`:
    - 28/10: range "07:59 – …", sub "Đang làm · 1g 41p", có part `now` from 24.44;
    - 27/10: range "08:12 – ?", sub "Trễ 12 phút · chưa có giờ ra", status "Chờ duyệt giải trình", có `{ type: 'late', from: 13.33, to: 14.67 }` và `{ type: 'miss', from: 14.67, to: 76.67 }`;
    - 26/10: sub "Có mặt 9g 14p", status "Đi làm";
    - 12/10: range "Cả ngày", sub "Phép năm", status "Nghỉ có phép";
    - resolve `ib-e1` → 27/10 không còn part `miss`, status "Đi muộn"; `pending` null.
  - `unknown people and other months`: `employeeView('khong-co','2026-10')` null; `employeeView('le-hoang-nam','2026-09').data` null; `nguyen-thu-ha` có `prevId` null; `hoang-minh-duc` có `nextId` null.
- [ ] **Step 2: Viết `web/tests/attendance-employee.spec.ts`** (khung 1440×900; `goto('/admin/cham-cong/nhan-vien/le-hoang-nam')` trừ khi ghi khác):
  - `profile shows the employee, the month and the pending day`:
    - danh sách `/api` rỗng; heading "Hồ sơ chấm công"; liên kết "Chấm công" `href` `/admin/cham-cong`;
    - chữ "Mã GFT-0142 · vào làm 03/2024", "3 / 11", "1 ngày cần xử lý · 27/10 thiếu giờ ra, chờ duyệt giải trình";
    - region "Chỉ số tháng 10" chứa "25 / 26"; mục "Chấm công" ở thanh bên có `aria-current="page"`.
  - `previous and next follow the roster and stop at the ends`:
    - "Nhân viên sau" → URL `/admin/cham-cong/nhan-vien/pham-ngoc-anh`, "4 / 11";
    - `goto` `nguyen-thu-ha` → "Nhân viên trước" disabled; `goto` `hoang-minh-duc` → "Nhân viên sau" disabled.
  - `history folds plain work days and opens them`:
    - nút chứa "9 ngày đi làm · 13/10 – 22/10" có `aria-expanded="false"`; bấm → `true`, list "Dòng thời gian" có thêm 9 dòng, trong đó có "Thứ Bảy 17/10";
    - chữ "Thứ Ba 27/10", "Trễ 12 phút · chưa có giờ ra", "Chờ duyệt giải trình" hiện.
  - `exceptions filter and the hours table`:
    - bấm "Chỉ ngày có ngoại lệ" → `aria-pressed="true"`; list "Dòng thời gian" chỉ còn 2 dòng (27/10, 12/10), không còn nút gộp;
    - tab "Bảng giờ" → table "Bảng giờ" có đầu cột Ngày, Vào, Ra, Trạng thái và 2 dòng thân.
  - `week names, the bell and the day dialog open the profile`:
    - `/admin/cham-cong?thang=2026-10`: bấm liên kết "Lê Hoàng Nam" → URL `/admin/cham-cong/nhan-vien/le-hoang-nam?thang=2026-10`;
    - `/admin/tong-quan`: mở chuông, bấm dòng Lê Hoàng Nam, bấm "Mở hồ sơ chấm công" → URL hồ sơ; dialog "Thông báo" đếm 0;
    - `/admin/cham-cong`: mở ô HN 27/10, bấm "Mở hồ sơ chấm công" → URL hồ sơ, dialog ngày đếm 0.
  - `strip day opens the day dialog without a profile link and deciding clears the callout`:
    - region "Các ngày tháng 10" có nút "Thứ Ba 27/10: Cần xử lý, Thiếu giờ ra"; bấm → dialog "Lê Hoàng Nam · Thứ Ba 27/10/2026", liên kết "Mở hồ sơ chấm công" đếm 0;
    - bấm "Từ chối yêu cầu của Lê Hoàng Nam" → toast "Đã từ chối yêu cầu của Lê Hoàng Nam."; chữ "ngày cần xử lý" đếm 0;
    - "Xem ngày" đếm 0.
  - `unknown employee and other months`:
    - `nhan-vien/khong-co` → "Không tìm thấy nhân viên này."; liên kết "Về Chấm công" tới `/admin/cham-cong`;
    - `nhan-vien/le-hoang-nam?thang=2026-09` → "Lê Hoàng Nam" và "Chưa có dữ liệu chấm công giả cho tháng 9/2026." cùng hiện.
  - `profile fits 375px and the month strip scrolls in its own region` (Review Focus 5; khung 375×812): `scrollWidth <= innerWidth`; region "Các ngày tháng 10" có `tabindex="0"` và `scrollWidth > clientWidth`.
- [ ] **Step 3: Chạy `npm --prefix web exec playwright test tests/attendance-mock.spec.ts tests/attendance-employee.spec.ts`.** Kỳ vọng FAIL: chưa có module hồ sơ và route.
- [ ] **Step 4: Cài theo Interfaces và spec mục 5.**
  - `employeeView`:
    - ô tháng từ `cellOf` cho từng ngày 01–31;
    - `stats` từ `Person`: "Ngày công" = `${period.worked} / ${STANDARD_DAYS}`;
    - ngày `off` của dải và của lịch sử lấy từ `cellOf` (tức `isScheduled`), không xét thứ trong tuần;
    - `history` gồm ngày ≤ `MOCK_TODAY`, bỏ ô gốc `off`; 5 dòng đầu giữ nguyên; sau đó chuỗi liền nhau từ 3 dòng `work` không `live` trở lên thành `fold`;
    - `pending` đếm ô `todo` trong tháng, chữ lấy theo việc của ô `todo` đầu tiên.
  - `TrackPart` theo bảng trục giờ ở spec mục 5: `miss` chỉ khi ô đang `todo` và việc có `declared`; `lunch` chỉ khi thanh phủ 12:00–13:00.
  - `AttendanceEmployeeView.vue`:
    - `useLoad` khoá `${route.params.id}|${period.month}|${shell.version}`;
    - "Nhân viên trước/sau" là `button` gọi `router.push` tới `employeePath(prevId|nextId)` (giữ `thang`);
    - hộp ngày qua `useDayHop`;
    - bố cục lưới 1.55fr / 1fr, dưới 1024px một cột;
    - "Chỉ ngày có ngoại lệ" và tab lịch sử là state cục bộ.
  - `MonthStrip.vue` và `HistoryList.vue`: markup và tên vùng theo spec mục 5.
- [ ] **Step 5: Chạy lại lệnh ở Step 3.** Kỳ vọng: 11 + 8 passed. Rồi `npm --prefix web run test:ui`: 0 failed, skipped 38.
- [ ] **Step 6: Commit** `feat(web): employee attendance profile`.

---

## Xác minh cuối (giai đoạn 6, sau review toàn nhánh)

| Lệnh | Kỳ vọng |
|------|---------|
| `npm --prefix web run test:ui` | 0 failed, 38 skipped. Ghi số passed. |
| `npm test` | 24 pass, 0 fail (như mốc) |
| `git diff --stat a45a3ba -- src migrations test spec` | rỗng |
| `grep -rn "fetch(" web/src` | không có lời gọi tới `/api` |
| `grep -rn "mock/approvals\|BellPopover\|getBell\|AttendanceShell\|TimesheetView" web/src` | rỗng |

Cuối cùng mở `/admin/cham-cong` và `/admin/cham-cong/nhan-vien/le-hoang-nam` ở 1440px và 375px, và mở chuông ở cả hai khổ.
