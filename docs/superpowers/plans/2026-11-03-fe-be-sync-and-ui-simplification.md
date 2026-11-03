# Đồng bộ FE–BE và Tinh gọn UI/UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Đồng bộ toàn bộ các điểm lệch hợp đồng dữ liệu giữa Vue 3 frontend (`web/src`) và NestJS backend (`src/modules`), xoá bỏ các nhánh dữ liệu giả/kịch bản cứng, đồng thời tinh gọn cấu trúc tab và mật độ hiển thị trên các màn Chấm công, Bảng lương, KPI và khung Admin.

**Architecture:** Triển khai theo 2 chặng tuần tự: Chặng 1 (Task 1–3) sửa dứt điểm các service và builder ở tầng dữ liệu FE (`admin-payroll`, `admin-attendance`, `staff-desktop`) kèm unit test kiểm chứng hợp đồng API; Chặng 2 (Task 4–6) tái cấu trúc các route/tab thừa, làm gọn bảng chấm công, hộp chi tiết ngày, thanh kỳ lương, màn KPI và cập nhật `spec/reference/web-routes.md`.

**Tech Stack:** TypeScript, Vue 3 (`<script setup lang="ts">`), Pinia, Vue Router 4, Vite, Node.js test runner (`node:test`), NestJS backend.

**Spec:** [`docs/superpowers/specs/2026-11-03-fe-be-sync-and-ui-simplification-design.md`](../specs/2026-11-03-fe-be-sync-and-ui-simplification-design.md)

## Global Constraints

- Không sử dụng cụm từ bị cấm trong `test/unit/no-tam-tinh-text.test.ts` ở bất kỳ file mã, chú thích hay tài liệu nào.
- Không vượt ngưỡng kích thước file trong `test/unit/file-size-budget.test.ts` (mềm 800 dòng, cứng 1.200 dòng).
- Mọi thay đổi trong `web/src/router/**` phải chạy `npm run spec:gen` để cập nhật `spec/reference/web-routes.md` và vượt qua `test/unit/spec-reference.test.ts`.
- Giữ nguyên `npm run typecheck`, `npm run typecheck:web`, `npm run format:check` và `npm --prefix web run build` xanh sau mỗi task.
- Không thay đổi công thức tính lương trong `src/engine/**` hay lược đồ DB trong `migrations/postgres/**`.

## Review Focus

1. Kỳ lương có từ 2 trang phiếu trở lên và có phiếu lỗi (`status === 'error'`) nằm ở trang 2: hộp thoại phê duyệt kỳ (`ApprovePeriodDialog.vue`) phải tải đủ mọi phiếu lỗi qua `getPeriodApprovalSummary(month)` và gửi đủ mảng `excludeErrors` lên `POST /api/periods/:month/approve` (Task 1).
2. Kỳ lương ở bất kỳ tháng nào (kể cả `2026-11`): giao diện không được rơi vào nhánh gán cứng `month === '2026-11'` làm khoá nút *Chốt công* hoặc ẩn thẻ *Khoản cộng/trừ thêm* (Task 1).
3. Nhân viên Check-in trên giao diện máy tính (`staffCheck('in')` trong `web/src/services/staff-desktop.ts`) khi công ty bật `geofenceRequired`: phải lấy toạ độ GPS và gửi `location` lên `POST /api/punch`, tránh bị đánh dấu ngoài vùng oan (Task 3).
4. Admin sửa giờ trong `DayDetailDialog.vue` có nhập lý do (`reason`): lý do phải được truyền qua `saveTimeFix` lên `PUT /api/sheet` thay vì bị rơi ở tầng view (Task 2).
5. Các liên kết cũ trỏ tới `/admin/cham-cong/sua-gio` (như từ `BellPopover.vue` hoặc bookmark cũ) và `/admin/cham-cong/ca-lam`: phải tự động chuyển hướng sang `/admin/cham-cong?filter=pending` và `/admin/nhan-su?loc=chua-co-ca`, đồng thời `TimesheetView.vue` phải đọc `route.query.filter` để kích hoạt đúng bộ lọc (Task 4).

---

## File Structure Map

| File | Trách nhiệm | Thao tác |
| --- | --- | --- |
| `web/src/builders/admin-payroll/payroll.ts` | Dựng mô hình hiển thị kỳ lương từ dữ liệu BE (`buildPeriodView`, `buildCloseChecks`) | Sửa tách `draft` khỏi `pending` chặn duyệt, thêm `unapproved` |
| `web/src/services/admin-payroll.ts` | Gọi API kỳ lương & phiếu lương | Thêm `getPeriodApprovalSummary`, truyền `{ rev, excludeErrors }` ở `approvePeriod`, bỏ `approveBatch`/`approveOne` cũ |
| `web/src/views/admin/payroll/scenarios.ts` | Mô tả tiêu đề phụ, nút bước kỳ và ghi chú theo trạng thái kỳ | Xoá nhánh cứng `month === '2026-11'`, xoá chữ cứng `/2026` và câu giả ở `can-tinh-lai` |
| `web/src/views/admin/payroll/PayrollView.vue` | Màn hình chính Bảng lương | Bỏ logic chọn từng phiếu và ép `2026-11`, dùng luồng duyệt cả kỳ |
| `web/src/views/admin/payroll/parts/ApprovePeriodDialog.vue` | Hộp thoại xác nhận phê duyệt kỳ lương | Gọi `getPeriodApprovalSummary`, truyền `excludeErrors` vào `approvePeriod` |
| `web/src/views/admin/payroll/parts/PayrollDialogs.vue` | Điều phối các hộp thoại trên màn Bảng lương | Gỡ `ApproveBatchDialog`, nối `ApprovePeriodDialog` mới |
| `web/src/services/admin-attendance.ts` | Gọi API chấm công, ca làm, OT, sổ phép | Truyền `reason` trong `saveTimeFix`, thêm `decideOvertime`, xoá `getTimeFixRequests` mock |
| `web/src/builders/admin-attendance/timesheet.ts` | Dựng dữ liệu Bảng công, Hôm nay, Chi tiết ngày, OT | Thêm `shiftShort`/`shiftTooltip` cho dòng nhân sự, giữ `sessionId`/`version` ở `buildOvertime`, truyền `reason` ở `buildSheetBody` |
| `web/src/views/admin/attendance/OvertimeView.vue` | Tab đối chiếu và duyệt giờ OT thực tế | Thêm nút Đồng ý / Từ chối gọi `decideOvertime` |
| `web/src/views/admin/attendance/RequestTable.vue` | Bảng dùng chung cho tab OT | Hỗ trợ cột thao tác (`actions` slot) |
| `web/src/services/staff-desktop.ts` | Gọi API cho giao diện nhân viên trên máy tính | Đồng bộ lấy GPS `location` khi `geofenceRequired` trong `staffCheck` |
| `web/src/services/admin-main.ts` | Gọi API Tổng quan, Yêu cầu, Chuông | Xoá `changePassword` và `logout` dùng `mockSave` |
| `web/src/router/routes/admin-attendance.ts` | Khai báo route cụm Chấm công, Nhân sự, KPI | Chuyển `sua-gio` và `ca-lam` thành redirect |
| `web/src/views/admin/attendance/AttendanceShell.vue` | Khung 4 tab Chấm công & phép | Rút gọn còn 4 tab, đổi nút Chốt công khoá cứng thành liên kết sang Bảng lương |
| `web/src/views/admin/attendance/TimesheetView.vue` | Bảng chấm công tháng | Đọc `?filter=` từ URL, thu gọn cột Nhân sự, phụ đề và thanh chú giải |
| `web/src/views/admin/attendance/DayDetailDialog.vue` | Hộp chi tiết ngày & sửa giờ | Bỏ dòng `.pun` lặp giờ lần 3, bỏ `.note` thừa, truyền `reason` vào `saveTimeFix` |
| `web/src/components/shell/BellPopover.vue` | Hộp thông báo việc cần xử lý | Trỏ "Quên Check-in/out" về `/admin/cham-cong?filter=pending` |
| `web/src/components/shell/PeriodStrip.vue` | Thanh chọn tháng và bước kỳ lương | Ẩn dải 5 bước trên các màn ngoài chu kỳ lương (`duyet`, `ho-so`, `cai-dat`) |
| `web/src/views/admin/kpi/KpiShell.vue` | Khung màn Đánh giá KPI | Xoá tab `OKR · Sắp có`, thu gọn dải trọng số `.wts` |
| `test/unit/fe-be-sync-ui.test.ts` | Kiểm thử đơn vị cho builder, service và kịch bản FE mới | Tạo mới |

---

### Task 1: Đồng bộ luồng Bảng lương & Phê duyệt kỳ (G9)

**Files:**
- Modify: `web/src/builders/admin-payroll/payroll.ts:62-170`
- Modify: `web/src/services/admin-payroll.ts:1-145`
- Modify: `web/src/views/admin/payroll/scenarios.ts:20-160`
- Modify: `web/src/views/admin/payroll/PayrollView.vue:30-260`
- Modify: `web/src/views/admin/payroll/parts/ApprovePeriodDialog.vue:1-98`
- Modify: `web/src/views/admin/payroll/parts/PayrollDialogs.vue:1-75`
- Test: `test/unit/fe-be-sync-ui.test.ts`

**Interfaces:**
- Produces:
  - `getPeriodApprovalSummary(month: string): Promise<{ rev: number; draft: number; legacyPending: number; approved: number; errors: Array<{ username: string; name: string; shortProblem: string }> }>` in `web/src/services/admin-payroll.ts`
  - `approvePeriod(month: string, opts?: { rev?: number; excludeErrors?: Array<{ username: string; reason: string }> }): Promise<any>` in `web/src/services/admin-payroll.ts`
  - `describeScenario(month: string, kb: string, f: Record<string, any>): any` without `month === '2026-11'` special-casing in `web/src/views/admin/payroll/scenarios.ts`

- [ ] **Step 1: Write the failing test in `test/unit/fe-be-sync-ui.test.ts`**

```ts
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildPeriodView } = require('../../web/src/builders/admin-payroll/payroll');
const { describeScenario } = require('../../web/src/views/admin/payroll/scenarios');

test('buildPeriodView: phiếu draft không tính vào facts.pending gây chặn duyệt kỳ', () => {
  const period = {
    status: 'calculated',
    rev: 7,
    run: { runNo: 1 },
    totals: { people: 10, gross: 100, insurance: 10, tax: 5, advance: 0, net: 85, approved: 0, pending: 0, draft: 9, error: 1 },
    stages: { attendanceLocked: { at: null }, approved: { at: null }, paid: { at: null } }
  };
  const list = { total: 10, page: 1, rows: [{ username: 'u1', name: 'A', type: 'nv', level: 1, status: 'draft' }] };
  const view = buildPeriodView('2026-11', period, list, { filter: 'all', pageSize: 14 });
  assert.equal(view.facts.pending, 0);
  assert.equal(view.facts.draft, 9);
  assert.equal(view.facts.unapproved, 9);
});

test('describeScenario: tháng 2026-11 dùng cùng kịch bản theo trạng thái kỳ, không khoá cứng nút Chốt công', () => {
  const ui = describeScenario('2026-11', 'tam-tinh', { calculated: 10, failed: 0, deadline: '' });
  const closeBtn = ui.actions.find((a: any) => a.key === 'close');
  assert.ok(closeBtn && !closeBtn.off);
  assert.equal(ui.extras, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/dev/ts.cjs --test test/unit/fe-be-sync-ui.test.ts`
Expected: FAIL (`view.facts.pending` is `9` and `closeBtn.off` is `true`).

- [ ] **Step 3: Update `payroll.ts`, `scenarios.ts`, `admin-payroll.ts`, `ApprovePeriodDialog.vue`, `PayrollDialogs.vue`, and `PayrollView.vue`**

1. In `web/src/builders/admin-payroll/payroll.ts`:
   - Set `facts.draft = t.draft || 0`, `facts.pending = t.pending || 0`, `facts.unapproved = (t.pending || 0) + (t.draft || 0)`.
   - In `chipsOf(stage, facts)`, use `facts.unapproved` for the `'pending'` (`'Chưa phê duyệt'`) chip count.
   - Map `r.shortProblem = r.errorMessage || r.problem || 'Hồ sơ hoặc công chưa hợp lệ'` in `buildRow(r)`.
2. In `web/src/views/admin/payroll/scenarios.ts`:
   - Remove the `if (month === '2026-11') { ... }` block so all months use `switch (kb)`.
   - In `tam-tinh`, append `` · đã qua hạn chốt công ${f.deadline}`` only when `f.deadline` is non-empty.
   - In `da-chot-cong`, replace `${f.closedAt}/2026` with `${f.closedAt}`.
   - In `can-tinh-lai`, remove `' Tạm ứng của 1 phiếu đã được sửa về 0.'` and set `selection: false`.
   - Set `selection: false` in `cho-phe-duyet`, `chon-phieu`, `da-duyet-50`.
3. In `web/src/services/admin-payroll.ts`:
   - Add `getPeriodApprovalSummary(month: string)` that fetches `GET /periods/:month` and loops `GET /periods/:month/payslips?status=error&pageSize=200&page=p` until all error rows are collected, returning `{ rev: period.rev, draft: t.draft || 0, legacyPending: t.pending || 0, approved: t.approved || 0, errors }`.
   - Update `approvePeriod(month: string, { rev, excludeErrors = [] }: any = {})` to send `{ rev: rev ?? (await currentRev(month)), ...(excludeErrors.length ? { excludeErrors } : {}) }`.
4. In `web/src/views/admin/payroll/parts/ApprovePeriodDialog.vue`:
   - Load summary on mount via `getPeriodApprovalSummary(props.month)` (falling back to props if already provided).
   - Validate each error row has a trimmed reason of 10–300 chars and pass `{ rev: summary.rev, excludeErrors: excluded }` to `approvePeriod(props.month, ...)`.
5. In `web/src/views/admin/payroll/PayrollView.vue` and `PayrollDialogs.vue`:
   - Remove `month.value === '2026-11'` special-casing in `toggleWide()` and `watch(baseKey)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node scripts/dev/ts.cjs --test test/unit/fe-be-sync-ui.test.ts && npm run typecheck:web`
Expected: PASS and exit 0.

- [ ] **Step 5: Commit**

```bash
git add web/src/builders/admin-payroll/payroll.ts web/src/services/admin-payroll.ts web/src/views/admin/payroll/ test/unit/fe-be-sync-ui.test.ts
git commit -m "fix(web): sync period approval flow with G9 backend and remove 2026-11 hardcoding"
```

---

### Task 2: Đồng bộ sửa giờ Chấm công, nối duyệt Giờ OT và dọn hàm mock thừa

**Files:**
- Modify: `web/src/builders/admin-attendance/timesheet.ts:110-185`
- Modify: `web/src/services/admin-attendance.ts:60-125`
- Modify: `web/src/views/admin/attendance/OvertimeView.vue:1-50`
- Modify: `web/src/views/admin/attendance/RequestTable.vue:1-94`
- Modify: `web/src/services/admin-main.ts:170-185`
- Modify: `web/src/services/payslip.ts:1-10`
- Delete: `web/src/services/mock.ts`
- Test: `test/unit/fe-be-sync-ui.test.ts`

**Interfaces:**
- Produces:
  - `buildSheetBody(detail: any, input: { date: string; checkIn: string; checkOut: string; shift?: string; reason?: string }): Record<string, any>` in `web/src/builders/admin-attendance/timesheet.ts`
  - `decideOvertime(input: { sessionId: number; version: number; action: 'approve' | 'reject'; reason?: string }): Promise<any>` in `web/src/services/admin-attendance.ts`

- [ ] **Step 1: Add failing tests for `buildSheetBody` (reason propagation) and `buildOvertime` (sessionId/version preservation) in `test/unit/fe-be-sync-ui.test.ts`**

```ts
const { buildSheetBody, buildOvertime } = require('../../web/src/builders/admin-attendance/timesheet');

test('buildSheetBody: truyền reason khi Admin sửa giờ', () => {
  const detail = { personId: 'linh', rev: 3, days: {} };
  const body = buildSheetBody(detail, {
    date: '2026-10-05',
    checkIn: '08:00',
    checkOut: '17:30',
    shift: 'n1',
    reason: 'Quên bấm ra'
  });
  assert.equal(body.reason, 'Quên bấm ra');
  assert.equal(body.days['2026-10-05'].note, 'Quên bấm ra');
});

test('buildOvertime: giữ sessionId và version để duyệt/từ chối OT', () => {
  const res = buildOvertime({
    ot: { ot: [{ sessionId: 42, version: 2, username: 'linh', name: 'Linh', date: '2026-10-05', shiftCode: 'n1', otHours: '2h' }] },
    month: '2026-10',
    status: 'pending'
  });
  assert.equal(res.rows[0].sessionId, 42);
  assert.equal(res.rows[0].version, 2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/dev/ts.cjs --test test/unit/fe-be-sync-ui.test.ts`
Expected: FAIL (`body.reason` is `undefined`, `res.rows[0].sessionId` is `undefined`).

- [ ] **Step 3: Implement `buildSheetBody`, `buildOvertime`, `decideOvertime`, and remove `mock.ts` usages**

1. In `web/src/builders/admin-attendance/timesheet.ts`:
   - Update `buildSheetBody(detail, { date, checkIn, checkOut, shift, reason }: any)`: trim `reason`; if non-empty, include `note: reason` on `days[date]` and top-level `reason` on the returned body.
   - Update `buildOvertime`: include `sessionId: o.sessionId || o.id`, `version: o.version ?? 1`, and `canDecide: status === 'pending' && Boolean(o.sessionId || o.id)` on each row.
2. In `web/src/services/admin-attendance.ts`:
   - Pass `reason` through `saveTimeFix({ personId, date, checkIn, checkOut, shift, reason })`.
   - Add `decideOvertime({ sessionId, version, action, reason }: any)` calling `api('PUT', '/ot', { sessionId: Number(sessionId), version: Number(version), status: action === 'approve' ? 'approved' : 'rejected', ...(reason ? { reason } : {}) })`.
   - Remove `getTimeFixRequests` and the `import { fromMock } from './mock'`.
3. In `web/src/views/admin/attendance/RequestTable.vue` and `OvertimeView.vue`:
   - Add an optional actions column in `RequestTable.vue` when `showActions` is true; wire *Đồng ý* and *Từ chối* (with prompt/input for rejection reason) in `OvertimeView.vue` to call `decideOvertime` and `reload()`.
4. Remove unused `mockSave` exports/imports from `web/src/services/admin-main.ts`, `web/src/services/payslip.ts`, and delete `web/src/services/mock.ts`.

- [ ] **Step 4: Run test and typecheck to verify**

Run: `node scripts/dev/ts.cjs --test test/unit/fe-be-sync-ui.test.ts && npm run typecheck:web`
Expected: PASS and exit 0.

- [ ] **Step 5: Commit**

```bash
git add web/src/builders/admin-attendance/timesheet.ts web/src/services/ web/src/views/admin/attendance/ test/unit/fe-be-sync-ui.test.ts
git commit -m "fix(web): pass reason on time fix, wire OT approval API, and remove dead mocks"
```

---

### Task 3: Đồng bộ Check-in GPS trên máy tính (`staff-desktop.ts`) với điện thoại

**Files:**
- Modify: `web/src/services/staff-desktop.ts:100-140`
- Test: `test/unit/fe-be-sync-ui.test.ts`

**Interfaces:**
- Produces:
  - `staffCheck(kind?: 'in' | 'out', explanation?: string, getPos?: () => Promise<{ lat: number; lng: number; accuracy: number }>): Promise<any>` in `web/src/services/staff-desktop.ts`

- [ ] **Step 1: Add failing test for desktop `staffCheck` reading `open.id` and `geofenceRequired` in `test/unit/fe-be-sync-ui.test.ts`**

```ts
const { buildPunchBodyForDesktop } = require('../../web/src/services/staff-desktop');

test('buildPunchBodyForDesktop: gửi location khi geofenceRequired bật và lấy sessionId từ state.open', async () => {
  const inBody = await buildPunchBodyForDesktop({
    type: 'in',
    requestId: 'rq-12345678',
    me: { geofenceRequired: true },
    getPos: async () => ({ lat: 21.0, lng: 105.8, accuracy: 12 })
  });
  assert.deepEqual(inBody.location, { lat: 21.0, lng: 105.8, accuracy: 12 });

  const outBody = await buildPunchBodyForDesktop({
    type: 'out',
    requestId: 'rq-87654321',
    punchState: { open: { id: 99 } }
  });
  assert.equal(outBody.sessionId, 99);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/dev/ts.cjs --test test/unit/fe-be-sync-ui.test.ts`
Expected: FAIL (`buildPunchBodyForDesktop` is not a function).

- [ ] **Step 3: Implement `buildPunchBodyForDesktop` and update `staffCheck` in `web/src/services/staff-desktop.ts`**

1. Extract pure helper `buildPunchBodyForDesktop({ type, requestId, explanation, me, punchState, getPos })`:
   - When `type === 'out'`, read `sessionId = punchState?.open?.id ?? punchState?.openSession?.id ?? null`.
   - When `type === 'in'` and `me?.geofenceRequired`, call `await getPos()` and attach `location` to body.
2. Update `staffCheck(kind?, explanation?)` to fetch `GET /me` when `type === 'in'` and use `buildPunchBodyForDesktop`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node scripts/dev/ts.cjs --test test/unit/fe-be-sync-ui.test.ts && npm run typecheck:web`
Expected: PASS and exit 0.

- [ ] **Step 5: Commit**

```bash
git add web/src/services/staff-desktop.ts test/unit/fe-be-sync-ui.test.ts
git commit -m "fix(web): include GPS location on desktop check-in when geofence is required"
```

---

### Task 4: Tinh gọn cụm Chấm công & phép (4 tab, Bảng công gọn, Hộp chi tiết ngày gọn)

**Files:**
- Modify: `web/src/router/routes/admin-attendance.ts:1-40`
- Modify: `web/src/views/admin/attendance/AttendanceShell.vue:1-57`
- Modify: `web/src/builders/admin-attendance/timesheet.ts:15-65`
- Modify: `web/src/views/admin/attendance/TimesheetView.vue:1-220`
- Modify: `web/src/views/admin/attendance/DayDetailDialog.vue:1-140`
- Modify: `web/src/components/shell/BellPopover.vue:40-65`
- Delete: `web/src/views/admin/attendance/EditRequestsView.vue`
- Delete: `web/src/views/admin/attendance/ShiftsView.vue`
- Modify: `spec/reference/web-routes.md` (via `npm run spec:gen`)
- Test: `test/unit/fe-be-sync-ui.test.ts`

**Interfaces:**
- Produces:
  - `buildTimesheet` rows with concise `sub` (`TTS · Ca HC`) and `shiftTooltip` (`Ca hành chính 08:00–17:30`) in `web/src/builders/admin-attendance/timesheet.ts`
  - Redirect routes for `sua-gio` → `/admin/cham-cong?filter=pending` and `ca-lam` → `/admin/nhan-su?loc=chua-co-ca` in `web/src/router/routes/admin-attendance.ts`

- [ ] **Step 1: Add failing test for concise `buildTimesheet` row subtitle and tooltip in `test/unit/fe-be-sync-ui.test.ts`**

```ts
const { buildTimesheet } = require('../../web/src/builders/admin-attendance/timesheet');

test('buildTimesheet: dòng nhân sự chỉ hiện loại và tên ca ngắn, tách giờ ca sang shiftTooltip', () => {
  const out = buildTimesheet({
    team: {
      month: '2026-10',
      rows: [{ staff: { username: 'linh', name: 'Linh', type: 'nv', shiftCode: 'n1' }, attendanceSessions: [] }]
    },
    shifts: { shifts: [{ code: 'n1', name: 'Ca 1', in: '08:00', out: '17:30' }] },
    today: '2026-10-15',
    holidays: []
  });
  assert.equal(out.rows[0].sub, 'NV · Ca 1');
  assert.equal(out.rows[0].shiftTooltip, 'Ca 1 08:00–17:30');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/dev/ts.cjs --test test/unit/fe-be-sync-ui.test.ts`
Expected: FAIL (`out.rows[0].sub` includes `'08:00–17:30'` and `shiftTooltip` is `undefined`).

- [ ] **Step 3: Implement attendance tab consolidation and declutter `TimesheetView.vue` & `DayDetailDialog.vue`**

1. In `web/src/builders/admin-attendance/timesheet.ts`:
   - Set `sub` to `[TYPE_SHORT[st.type], idx.get(st.shiftCode)?.name || st.shiftCode].filter(Boolean).join(' · ')` when `st.shiftCode` is present, and `shiftTooltip: shiftLine(idx, st.shiftCode)`.
2. In `web/src/router/routes/admin-attendance.ts`:
   - Replace `sua-gio` component route with `{ path: 'sua-gio', redirect: (to?) => ({ path: '/admin/cham-cong', query: { ...to.query, filter: 'pending' } }) }`.
   - Replace `ca-lam` component route with `{ path: 'ca-lam', redirect: (to?) => ({ path: '/admin/nhan-su', query: { ...to.query, loc: 'chua-co-ca' } }) }`.
   - Delete unused `web/src/views/admin/attendance/EditRequestsView.vue` and `web/src/views/admin/attendance/ShiftsView.vue`.
3. In `web/src/views/admin/attendance/AttendanceShell.vue`:
   - Update `TABS` to 4 items: `['', 'Bảng công']`, `['hom-nay', 'Hôm nay']`, `['gio-ot', 'Giờ OT']`, `['phep-con-lai', 'Phép còn lại']`.
   - Replace the disabled `<button class="btn off" disabled>` with `<RouterLink class="btn" :to="{ path: '/admin/bang-luong', query: { thang: route.query.thang } }"><Icon name="lock" />Chốt công ở Bảng lương</RouterLink>`.
4. In `web/src/views/admin/attendance/TimesheetView.vue`:
   - Initialize `filter` from `route.query.filter` (`['all', 'pending', 'tts', 'ctv', 'nv'].includes(String(route.query.filter)) ? String(route.query.filter) : 'all'`) and watch `route.query.filter`.
   - Reduce first `<col>` width from `244px` to `200px`, add `:title="r.shiftTooltip"` on `.who .s`, shorten `.card-h .cap` to `{{ range }}`, and shorten `LEGEND` labels (`['in', '', 'Đang làm']`, `['ok', '', 'Đủ công']`, `['w', '', 'Chờ xử lý']`, `['q', '', 'Từ chối']`).
5. In `web/src/views/admin/attendance/DayDetailDialog.vue`:
   - Remove the duplicate `.pun` block (lines 89–96) and the static `.note` block (lines 118–121).
6. In `web/src/components/shell/BellPopover.vue`:
   - Update the "Quên Check-in/out trong tháng" link to `:to="{ path: '/admin/cham-cong', query: { filter: 'pending' } }"`.
7. Run `npm run spec:gen` to regenerate `spec/reference/web-routes.md`.

- [ ] **Step 4: Run tests, spec check, and web typecheck**

Run: `npm run spec:gen && node scripts/dev/ts.cjs --test test/unit/fe-be-sync-ui.test.ts test/unit/spec-reference.test.ts && npm run typecheck:web`
Expected: PASS and exit 0.

- [ ] **Step 5: Commit**

```bash
git add web/src/router/routes/admin-attendance.ts web/src/views/admin/attendance/ web/src/builders/admin-attendance/timesheet.ts web/src/components/shell/BellPopover.vue spec/reference/web-routes.md test/unit/fe-be-sync-ui.test.ts
git commit -m "refactor(web): simplify attendance tabs and declutter timesheet and day detail UI"
```

---

### Task 5: Tinh gọn Thanh kỳ lương (`PeriodStrip`) và màn Đánh giá KPI (`KpiShell`)

**Files:**
- Modify: `web/src/components/shell/AdminLayout.vue:60-80`
- Modify: `web/src/components/shell/PeriodStrip.vue:1-55`
- Modify: `web/src/views/admin/kpi/KpiShell.vue:30-130`
- Test: `test/unit/fe-be-sync-ui.test.ts`

**Interfaces:**
- Consumes: `route.meta.nav` in `AdminLayout.vue`
- Produces: `showSteps` prop on `PeriodStrip.vue` (`true` only when `route.meta.nav` is in `['tong-quan', 'cham-cong', 'kpi', 'luong']`)

- [ ] **Step 1: Add test in `test/unit/fe-be-sync-ui.test.ts` verifying `KpiShell` and `PeriodStrip` cleanups**

```ts
const fs = require('node:fs');
const path = require('node:path');

test('KpiShell: không còn tab OKR Sắp có và đã thu gọn khối công thức .wts', () => {
  const vue = fs.readFileSync(path.join(__dirname, '../../web/src/views/admin/kpi/KpiShell.vue'), 'utf8');
  assert.ok(!vue.includes('OKR <small>Sắp có</small>'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/dev/ts.cjs --test test/unit/fe-be-sync-ui.test.ts`
Expected: FAIL (`vue.includes('OKR <small>Sắp có</small>')` is true).

- [ ] **Step 3: Update `PeriodStrip.vue`, `AdminLayout.vue`, and `KpiShell.vue`**

1. In `web/src/components/shell/PeriodStrip.vue`:
   - Add prop `showSteps: { type: Boolean, default: true }`.
   - Render `<span v-if="showSteps" class="state" ...>` and `<div v-if="showSteps" class="steps" ...>` only when `showSteps` is true.
2. In `web/src/components/shell/AdminLayout.vue`:
   - Pass `:show-steps="['tong-quan', 'cham-cong', 'kpi', 'luong'].includes(String(route.meta.nav || ''))"` to `<PeriodStrip />`.
3. In `web/src/views/admin/kpi/KpiShell.vue`:
   - Remove `<span class="tab" aria-disabled="true">OKR <small>Sắp có</small></span>`.
   - Replace the tall 5-column `.wts` grid card with a compact inline weight strip (`<div class="wts-inline">`) so the 4 KPI cards and score table move above the fold.

- [ ] **Step 4: Run test and build verification**

Run: `node scripts/dev/ts.cjs --test test/unit/fe-be-sync-ui.test.ts && npm run typecheck:web && npm --prefix web run build`
Expected: PASS and build succeeds.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/shell/AdminLayout.vue web/src/components/shell/PeriodStrip.vue web/src/views/admin/kpi/KpiShell.vue test/unit/fe-be-sync-ui.test.ts
git commit -m "refactor(web): hide payroll steps outside cycle screens and compact KPI header"
```

---

### Task 6: Kiểm chứng tổng thể (Full Gate) và đẩy lên Git

**Files:**
- Modify: `docs/superpowers/PROGRAM.md`

- [ ] **Step 1: Run all quality gates**

Run:
```bash
npm run typecheck
npm run typecheck:web
npm run spec:check
npm run format:check
node scripts/dev/ts.cjs --test test/unit/no-tam-tinh-text.test.ts test/unit/file-size-budget.test.ts test/unit/architecture.test.ts test/unit/fe-be-sync-ui.test.ts
npm --prefix web run build
```
Expected: All commands exit 0 with 0 failures.

- [ ] **Step 2: Record results in `docs/superpowers/PROGRAM.md` and commit**

```bash
git add docs/superpowers/PROGRAM.md
git commit -m "docs: record FE-BE sync and UI simplification in PROGRAM ledger"
git push origin main
```
