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
5. Các liên kết cũ trỏ tới `/admin/cham-cong/sua-gio` (như từ `BellPopover.vue`, `overview.ts` hoặc bookmark cũ) và `/admin/cham-cong/ca-lam`: phải tự động chuyển hướng sang `/admin/cham-cong?filter=pending` và `/admin/nhan-su?loc=chua-co-ca`, đồng thời `TimesheetView.vue` phải đọc `route.query.filter` để kích hoạt đúng bộ lọc (Task 4).
6. Ngăn kéo phiếu lương (`buildDrawer` trong `web/src/builders/payslip/drawer.ts`) với phiếu `status === 'draft'` phải bật `canApprove = true` (trừ khi kỳ đã `approved`/`paid`) và không hiển thị 2 pill `"Bản nháp"` trùng nhau (Task 1).
7. Giao diện Nhân viên trên điện thoại (`staff-phone/home.ts`, `staff-phone/attendance.ts`, `HomeView.vue`): đọc đúng trường `r.late` cho phút đi trễ, tính phút bị trừ theo giờ thiếu (`m.short`) thay vì tiền trừ (`m.cut`), và không hiển thị câu cụt khi `payslipDate`/`requestDeadline` là `null` (Task 3 & Task 5).

---

## File Structure Map

| File | Trách nhiệm | Thao tác |
| --- | --- | --- |
| `web/src/builders/admin-payroll/payroll.ts` | Dựng mô hình hiển thị kỳ lương từ dữ liệu BE (`buildPeriodView`, `buildCloseChecks`) | Sửa tách `draft` khỏi `pending` chặn duyệt, thêm `unapproved` |
| `web/src/builders/payslip/drawer.ts` | Dựng mô hình ngăn kéo phiếu lương 1 người (`buildDrawer`) | Bật `canApprove` cho phiếu `draft`, bỏ pill `"Bản nháp"` bị lặp đôi |
| `web/src/services/admin-payroll.ts` | Gọi API kỳ lương & phiếu lương | Thêm `getPeriodApprovalSummary`, truyền `{ rev, excludeErrors }` ở `approvePeriod`, bỏ `approveBatch`/`approveOne` cũ |
| `web/src/views/admin/payroll/scenarios.ts` | Mô tả tiêu đề phụ, nút bước kỳ và ghi chú theo trạng thái kỳ | Xoá nhánh cứng `month === '2026-11'`, xoá chữ cứng `/2026` và câu giả ở `can-tinh-lai` |
| `web/src/views/admin/payroll/PayrollView.vue` | Màn hình chính Bảng lương | Bỏ logic chọn từng phiếu và ép `2026-11`, dùng luồng duyệt cả kỳ |
| `web/src/views/admin/payroll/parts/ApprovePeriodDialog.vue` | Hộp thoại xác nhận phê duyệt kỳ lương | Gọi `getPeriodApprovalSummary`, truyền `excludeErrors` vào `approvePeriod` |
| `web/src/views/admin/payroll/parts/PayrollDialogs.vue` | Điều phối các hộp thoại trên màn Bảng lương | Gỡ `ApproveBatchDialog`, nối `ApprovePeriodDialog` mới |
| `web/src/services/admin-attendance.ts` | Gọi API chấm công, ca làm, OT, sổ phép | Truyền `reason` trong `saveTimeFix`, thêm `decideOvertime`, xoá `getTimeFixRequests` mock |
| `web/src/builders/admin-attendance/timesheet.ts` | Dựng dữ liệu Bảng công, Hôm nay, Chi tiết ngày, OT | Thêm `shiftShort`/`shiftTooltip` cho dòng nhân sự, giữ `sessionId`/`version` ở `buildOvertime`, truyền `reason` ở `buildSheetBody` |
| `web/src/builders/admin-main/overview.ts` | Dựng dữ liệu màn Tổng quan Admin (`buildOverview`) | Đổi link `forgot` sang `/admin/cham-cong?filter=pending`, `open` sang `/admin/cham-cong/hom-nay`, chỉ đếm `noStart` khi `type !== 'tts'` |
| `web/src/views/admin/attendance/OvertimeView.vue` | Tab đối chiếu và duyệt giờ OT thực tế | Thêm nút Đồng ý / Từ chối gọi `decideOvertime` |
| `web/src/views/admin/attendance/RequestTable.vue` | Bảng dùng chung cho tab OT | Hỗ trợ cột thao tác (`actions` slot) |
| `web/src/services/staff-desktop.ts` | Gọi API cho giao diện nhân viên trên máy tính | Đồng bộ lấy GPS `location` khi `geofenceRequired` trong `staffCheck` |
| `web/src/builders/staff-phone/home.ts` | Dựng dữ liệu màn Hôm nay trên điện thoại (`buildHome`) | Đọc `r.late ?? r.lateMin` cho số phút đi trễ |
| `web/src/builders/staff-phone/attendance.ts` | Dựng dữ liệu màn Chấm công trên điện thoại (`buildAttendance`) | Đọc `r.late ?? r.lateMin` cho phút đi trễ, tính phút bị trừ từ `m.short * 60` thay vì `m.cut` (tiền VNĐ) |
| `web/src/services/admin-main.ts` | Gọi API Tổng quan, Yêu cầu, Chuông | Xoá `changePassword` và `logout` dùng `mockSave` |
| `web/src/router/routes/admin-attendance.ts` | Khai báo route cụm Chấm công, Nhân sự, KPI | Chuyển `sua-gio` và `ca-lam` thành redirect |
| `web/src/views/admin/attendance/AttendanceShell.vue` | Khung 4 tab Chấm công & phép | Rút gọn còn 4 tab, đổi nút Chốt công khoá cứng thành liên kết sang Bảng lương |
| `web/src/views/admin/attendance/TimesheetView.vue` | Bảng chấm công tháng | Đọc `?filter=` từ URL, thu gọn cột Nhân sự, phụ đề và thanh chú giải |
| `web/src/views/admin/attendance/DayDetailDialog.vue` | Hộp chi tiết ngày & sửa giờ | Bỏ dòng `.pun` lặp giờ lần 3, bỏ `.note` thừa, truyền `reason` vào `saveTimeFix` |
| `web/src/components/shell/BellPopover.vue` | Hộp thông báo việc cần xử lý | Trỏ "Quên Check-in/out" về `/admin/cham-cong?filter=pending` |
| `web/src/components/shell/PeriodStrip.vue` | Thanh chọn tháng và bước kỳ lương | Ẩn dải 5 bước trên các màn ngoài chu kỳ lương (`duyet`, `ho-so`, `cai-dat`) |
| `web/src/views/admin/requests/RequestsView.vue` | Màn Yêu cầu Admin | Truyền `@approve="approve"` vào `GroupClean` |
| `web/src/views/admin/requests/GroupClean.vue` | Bảng yêu cầu chờ xử lý của tháng hiện tại | Đổi tiêu đề `"Không có cảnh báo"` thành `"Yêu cầu chờ xử lý"`, thêm nút `"Đồng ý"` lẻ trên từng dòng |
| `web/src/views/admin/kpi/KpiShell.vue` | Khung màn Đánh giá KPI | Xoá tab `OKR · Sắp có`, thu gọn dải trọng số `.wts` |
| `web/src/views/staff-phone/HomeView.vue` | Màn Hôm nay trên điện thoại | Ẩn câu cụt khi `payslipDate`/`requestDeadline` là `null`, xoá nút chết `Sửa giờ · Sắp có` |
| `test/unit/fe-be-sync-ui.test.ts` | Kiểm thử đơn vị cho builder, service và kịch bản FE mới | Tạo mới |

---

### Task 1: Đồng bộ luồng Bảng lương, Ngăn kéo Phiếu lương & Phê duyệt kỳ (G9)

**Files:**
- Modify: `web/src/builders/admin-payroll/payroll.ts:62-170`
- Modify: `web/src/builders/payslip/drawer.ts:14-52,115-120`
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
  - `buildDrawer(month, username, period, data, extra)` with `canApprove: true` on `draft` payslips and non-duplicate draft pills in `web/src/builders/payslip/drawer.ts`

- [ ] **Step 1: Write the failing test in `test/unit/fe-be-sync-ui.test.ts`**

```ts
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildPeriodView } = require('../../web/src/builders/admin-payroll/payroll');
const { buildDrawer } = require('../../web/src/builders/payslip/drawer');
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

test('buildDrawer: phiếu draft bật canApprove và không lặp 2 pill Bản nháp', () => {
  const drawer = buildDrawer(
    '2026-11',
    'linh',
    { status: 'calculated' },
    {
      source: 'payslip',
      run: { runNo: 2 },
      payslip: { username: 'linh', name: 'Linh', type: 'nv', level: 1, status: 'draft', rev: 1, gross: 100, net: 90, cells: {} }
    }
  );
  assert.equal(drawer.canApprove, true);
  assert.equal(drawer.pills.length, 1);
  assert.equal(drawer.pills[0].label, 'Bản nháp · lần tính 2');
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
Expected: FAIL (`view.facts.pending` is `9`, `drawer.canApprove` is `false`, `drawer.pills.length` is `2`, and `closeBtn.off` is `true`).

- [ ] **Step 3: Update `payroll.ts`, `drawer.ts`, `scenarios.ts`, `admin-payroll.ts`, `ApprovePeriodDialog.vue`, `PayrollDialogs.vue`, and `PayrollView.vue`**

1. In `web/src/builders/admin-payroll/payroll.ts`:
   - Set `facts.draft = t.draft || 0`, `facts.pending = t.pending || 0`, `facts.unapproved = (t.pending || 0) + (t.draft || 0)`.
   - In `chipsOf(stage, facts)`, use `facts.unapproved` for the `'pending'` (`'Chưa phê duyệt'`) chip count.
   - Map `r.shortProblem = r.errorMessage || r.problem || 'Hồ sơ hoặc công chưa hợp lệ'` in `buildRow(r)`.
2. In `web/src/builders/payslip/drawer.ts`:
   - When `kind !== 'official'` and `kind !== 'estimate'`, if `slip.status === 'draft'` (or not in `PILL`), push a single pill `{ cls: 'p-draft', label: run ? \`Bản nháp · lần tính ${run.runNo}\`.trim() : 'Bản nháp' }`; only push `PILL[slip.status]` alongside the run pill when `slip.status !== 'draft'`.
   - Set `canApprove: (kind === 'draft' || kind === 'pending') && slip.status !== 'error' && period.status !== 'approved' && period.status !== 'paid'`.
3. In `web/src/views/admin/payroll/scenarios.ts`:
   - Remove the `if (month === '2026-11') { ... }` block so all months use `switch (kb)`.
   - In `tam-tinh`, append `` · đã qua hạn chốt công ${f.deadline}`` only when `f.deadline` is non-empty.
   - In `da-chot-cong`, replace `${f.closedAt}/2026` with `${f.closedAt}`.
   - In `can-tinh-lai`, remove `' Tạm ứng của 1 phiếu đã được sửa về 0.'` and set `selection: false`.
   - Set `selection: false` in `cho-phe-duyet`, `chon-phieu`, `da-duyet-50`.
4. In `web/src/services/admin-payroll.ts`:
   - Add `getPeriodApprovalSummary(month: string)` that fetches `GET /periods/:month` and loops `GET /periods/:month/payslips?status=error&pageSize=200&page=p` until all error rows are collected, returning `{ rev: period.rev, draft: t.draft || 0, legacyPending: t.pending || 0, approved: t.approved || 0, errors }`.
   - Update `approvePeriod(month: string, { rev, excludeErrors = [] }: any = {})` to send `{ rev: rev ?? (await currentRev(month)), ...(excludeErrors.length ? { excludeErrors } : {}) }`.
5. In `web/src/views/admin/payroll/parts/ApprovePeriodDialog.vue`:
   - Load summary on mount via `getPeriodApprovalSummary(props.month)` (falling back to props if already provided).
   - Validate each error row has a trimmed reason of 10–300 chars and pass `{ rev: summary.rev, excludeErrors: excluded }` to `approvePeriod(props.month, ...)`.
6. In `web/src/views/admin/payroll/PayrollView.vue` and `PayrollDialogs.vue`:
   - Remove `month.value === '2026-11'` special-casing in `toggleWide()` and `watch(baseKey)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node scripts/dev/ts.cjs --test test/unit/fe-be-sync-ui.test.ts && npm run typecheck:web`
Expected: PASS and exit 0.

- [ ] **Step 5: Commit**

```bash
git add web/src/builders/admin-payroll/payroll.ts web/src/builders/payslip/drawer.ts web/src/services/admin-payroll.ts web/src/views/admin/payroll/ test/unit/fe-be-sync-ui.test.ts
git commit -m "fix(web): sync period and payslip drawer approval with G9 backend"
```

---

### Task 2: Đồng bộ sửa giờ Chấm công, Tổng quan Admin, nối duyệt Giờ OT và dọn hàm mock thừa

**Files:**
- Modify: `web/src/builders/admin-attendance/timesheet.ts:110-185`
- Modify: `web/src/builders/admin-main/overview.ts:38-55,108-149`
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
  - `buildOverview` with updated action targets (`/admin/cham-cong?filter=pending`, `/admin/cham-cong/hom-nay`, `/admin/nhan-su?loc=thieu-ngay`, `/admin/nhan-su?loc=chua-co-ca`) and `noStart` excluding `tts` in `web/src/builders/admin-main/overview.ts`

- [ ] **Step 1: Add failing tests for `buildSheetBody`, `buildOvertime`, and `buildOverview` in `test/unit/fe-be-sync-ui.test.ts`**

```ts
const { buildSheetBody, buildOvertime } = require('../../web/src/builders/admin-attendance/timesheet');
const { buildOverview } = require('../../web/src/builders/admin-main/overview');

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

test('buildOverview: link quên Check-in/out trỏ về ?filter=pending và không đếm TTS thiếu ngày bắt đầu', () => {
  const ov = buildOverview({
    month: '2026-10',
    serverNow: '2026-10-15T03:00:00Z',
    requests: [],
    alerts: { missingPunches: [{ username: 'linh', date: '2026-10-02', kind: 'forgot-out' }], absentNoExplanation: [] },
    staff: [
      { username: 'tts1', payrollSubject: true, locked: false, type: 'tts', startDate: null, shiftCode: 'n1' },
      { username: 'nv1', payrollSubject: true, locked: false, type: 'nv', startDate: null, shiftCode: 'n1' }
    ],
    today: { rows: [] },
    period: null,
    estimates: null,
    holidays: []
  });
  const forgotRow = ov.blockers.rows.find((r: any) => r.key === 'forgot');
  const startRow = ov.blockers.rows.find((r: any) => r.key === 'start');
  assert.equal(forgotRow.action.to, '/admin/cham-cong?filter=pending');
  assert.equal(startRow.count, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/dev/ts.cjs --test test/unit/fe-be-sync-ui.test.ts`
Expected: FAIL (`body.reason` is `undefined`, `res.rows[0].sessionId` is `undefined`, `forgotRow.action.to` is `'/admin/cham-cong/sua-gio'`, `startRow.count` is `2`).

- [ ] **Step 3: Implement `buildSheetBody`, `buildOvertime`, `buildOverview`, `decideOvertime`, and remove `mock.ts` usages**

1. In `web/src/builders/admin-attendance/timesheet.ts`:
   - Update `buildSheetBody(detail, { date, checkIn, checkOut, shift, reason }: any)`: trim `reason`; if non-empty, include `note: reason` on `days[date]` and top-level `reason` on the returned body.
   - Update `buildOvertime`: include `sessionId: o.sessionId || o.id`, `version: o.version ?? 1`, and `canDecide: status === 'pending' && Boolean(o.sessionId || o.id)` on each row.
2. In `web/src/builders/admin-main/overview.ts`:
   - In `staffFigures(staff)`, count `noStart: active.filter(s => !s.startDate && s.type !== 'tts').length`.
   - Update action links: `forgot` → `'/admin/cham-cong?filter=pending'`, `open` → `'/admin/cham-cong/hom-nay'`, `start` → `'/admin/nhan-su?loc=thieu-ngay'`, `noshift` → `'/admin/nhan-su?loc=chua-co-ca'`.
3. In `web/src/services/admin-attendance.ts`:
   - Pass `reason` through `saveTimeFix({ personId, date, checkIn, checkOut, shift, reason })`.
   - Add `decideOvertime({ sessionId, version, action, reason }: any)` calling `api('PUT', '/ot', { sessionId: Number(sessionId), version: Number(version), status: action === 'approve' ? 'approved' : 'rejected', ...(reason ? { reason } : {}) })`.
   - Remove `getTimeFixRequests` and the `import { fromMock } from './mock'`.
4. In `web/src/views/admin/attendance/RequestTable.vue` and `OvertimeView.vue`:
   - Add an optional actions column in `RequestTable.vue` when `showActions` is true; wire *Đồng ý* and *Từ chối* (with prompt/input for rejection reason) in `OvertimeView.vue` to call `decideOvertime` and `reload()`.
5. Remove unused `mockSave` exports/imports from `web/src/services/admin-main.ts`, `web/src/services/payslip.ts`, and delete `web/src/services/mock.ts`.

- [ ] **Step 4: Run test and typecheck to verify**

Run: `node scripts/dev/ts.cjs --test test/unit/fe-be-sync-ui.test.ts && npm run typecheck:web`
Expected: PASS and exit 0.

- [ ] **Step 5: Commit**

```bash
git add web/src/builders/admin-attendance/timesheet.ts web/src/builders/admin-main/overview.ts web/src/services/ web/src/views/admin/attendance/ test/unit/fe-be-sync-ui.test.ts
git commit -m "fix(web): pass reason on time fix, sync overview links/counts, wire OT API, and remove dead mocks"
```

---

### Task 3: Đồng bộ giao diện Nhân viên Desktop (`staff-desktop.ts`) và Điện thoại (`staff-phone/{home,attendance}.ts`)

**Files:**
- Modify: `web/src/services/staff-desktop.ts:100-140`
- Modify: `web/src/builders/staff-phone/home.ts:60-70`
- Modify: `web/src/builders/staff-phone/attendance.ts:57-67`
- Test: `test/unit/fe-be-sync-ui.test.ts`

**Interfaces:**
- Produces:
  - `staffCheck(kind?: 'in' | 'out', explanation?: string, getPos?: () => Promise<{ lat: number; lng: number; accuracy: number }>): Promise<any>` in `web/src/services/staff-desktop.ts`
  - `buildHome` & `buildAttendance` reading `r.late ?? r.lateMin` and computing deducted minutes from `m.short` / `cutStartMin + cutEndMin + gapCutMin` in `web/src/builders/staff-phone/{home,attendance}.ts`

- [ ] **Step 1: Add failing tests for desktop `staffCheck` and phone `buildHome`/`buildAttendance` in `test/unit/fe-be-sync-ui.test.ts`**

```ts
const { buildPunchBodyForDesktop } = require('../../web/src/services/staff-desktop');
const { buildHome: buildPhoneHome } = require('../../web/src/builders/staff-phone/home');
const { buildAttendance: buildPhoneAttendance } = require('../../web/src/builders/staff-phone/attendance');

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

test('staff-phone buildHome & buildAttendance: đọc đúng r.late và tính Phút bị trừ từ giờ thiếu (không lấy tiền m.cut)', () => {
  const sheet = {
    days: { '2026-10-02': { kind: 'work' } },
    attendanceSessions: [{ date: '2026-10-02', entry: { presIn: '2026-10-02T01:20:00Z', presOut: '2026-10-02T10:30:00Z' } }],
    actualReport: {
      missing: [],
      report: { '2026-10-02': { state: 'ok', late: 20, cutStartMin: 30, cutEndMin: 0, gapCutMin: 0 } }
    }
  };
  const home = buildPhoneHome({
    me: { serverNow: '2026-10-02T11:00:00Z', user: { name: 'Linh', username: 'linh' } },
    punch: { serverNow: '2026-10-02T11:00:00Z', canCheckIn: true },
    sheet,
    estimate: { toDate: { count: 1, upTo: '2026-10-02' }, net: { net: 500000 } }
  });
  const lateFact = home.facts.find((f: any) => f.label === 'Đi trễ');
  assert.ok(lateFact);
  assert.equal(lateFact.value, '20 phút');

  const att = buildPhoneAttendance({
    month: '2026-10',
    sheet,
    estimate: { m: { count: 1, cut: 125000, short: 0.5 } },
    me: { holidays: [] },
    today: '2026-10-02',
    nav: {},
    shiftLine: 'Ca 1',
    nowIso: '2026-10-02T11:00:00Z'
  });
  assert.equal(att.stats.length, 3);
  assert.deepEqual(att.stats[1], { value: '20', label: 'Phút đi trễ' });
  assert.deepEqual(att.stats[2], { value: '30', label: 'Phút bị trừ' });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/dev/ts.cjs --test test/unit/fe-be-sync-ui.test.ts`
Expected: FAIL (`buildPunchBodyForDesktop` is not a function, `lateFact` is `undefined`, `att.stats` has length 2 and `125000` in `'Phút bị trừ'`).

- [ ] **Step 3: Implement `buildPunchBodyForDesktop` and fix `staff-phone/home.ts` & `staff-phone/attendance.ts`**

1. In `web/src/services/staff-desktop.ts`:
   - Extract pure helper `buildPunchBodyForDesktop({ type, requestId, explanation, me, punchState, getPos })`:
     - When `type === 'out'`, read `sessionId = punchState?.open?.id ?? punchState?.openSession?.id ?? null`.
     - When `type === 'in'` and `me?.geofenceRequired`, call `await getPos()` and attach `location` to body.
   - Update `staffCheck(kind?, explanation?)` to fetch `GET /me` when `type === 'in'` and use `buildPunchBodyForDesktop`.
2. In `web/src/builders/staff-phone/home.ts`:
   - Check `reports.some(r => r && (r.late != null || r.lateMin != null))` and sum `Number(r.late ?? r.lateMin) || 0`.
3. In `web/src/builders/staff-phone/attendance.ts`:
   - Always push `'Phút đi trễ'` to `stats` using `reports.reduce((s, r) => s + (Number(r && (r.late ?? r.lateMin)) || 0), 0)` so `.stats` always has 3 columns.
   - Compute `'Phút bị trừ'` from `m.short != null ? Math.round((Number(m.short) || 0) * 60) : reports.reduce((s, r) => s + (Number(r?.cutStartMin) || 0) + (Number(r?.cutEndMin) || 0) + (Number(r?.gapCutMin) || 0), 0)`.

- [ ] **Step 4: Run test to verify it passes**

Run: `node scripts/dev/ts.cjs --test test/unit/fe-be-sync-ui.test.ts && npm run typecheck:web`
Expected: PASS and exit 0.

- [ ] **Step 5: Commit**

```bash
git add web/src/services/staff-desktop.ts web/src/builders/staff-phone/home.ts web/src/builders/staff-phone/attendance.ts test/unit/fe-be-sync-ui.test.ts
git commit -m "fix(web): sync desktop GPS check-in and fix staff-phone late/deducted minutes"
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

### Task 5: Tinh gọn Thanh kỳ lương (`PeriodStrip`), màn Yêu cầu (`GroupClean`), Đánh giá KPI (`KpiShell`) và Hôm nay trên điện thoại (`HomeView`)

**Files:**
- Modify: `web/src/components/shell/AdminLayout.vue:60-80`
- Modify: `web/src/components/shell/PeriodStrip.vue:1-55`
- Modify: `web/src/views/admin/requests/RequestsView.vue:185-205`
- Modify: `web/src/views/admin/requests/GroupClean.vue:1-85`
- Modify: `web/src/views/admin/kpi/KpiShell.vue:30-130`
- Modify: `web/src/views/staff-phone/HomeView.vue:110-150`
- Test: `test/unit/fe-be-sync-ui.test.ts`

**Interfaces:**
- Consumes: `route.meta.nav` in `AdminLayout.vue`
- Produces:
  - `showSteps` prop on `PeriodStrip.vue` (`true` only when `route.meta.nav` is in `['tong-quan', 'cham-cong', 'kpi', 'luong']`)
  - `@approve` event on `GroupClean.vue` and updated heading `"Yêu cầu chờ xử lý"`

- [ ] **Step 1: Add test in `test/unit/fe-be-sync-ui.test.ts` verifying `KpiShell`, `GroupClean`, and `HomeView` cleanups**

```ts
const fs = require('node:fs');
const path = require('node:path');

test('KpiShell, GroupClean, HomeView: đã xoá các nhãn Sắp có / Không có cảnh báo thừa và nối nút duyệt lẻ', () => {
  const kpi = fs.readFileSync(path.join(__dirname, '../../web/src/views/admin/kpi/KpiShell.vue'), 'utf8');
  assert.ok(!kpi.includes('OKR <small>Sắp có</small>'));

  const clean = fs.readFileSync(path.join(__dirname, '../../web/src/views/admin/requests/GroupClean.vue'), 'utf8');
  assert.ok(!clean.includes('<h2>Không có cảnh báo</h2>'));
  assert.ok(clean.includes("emit('approve', r)"));

  const phoneHome = fs.readFileSync(path.join(__dirname, '../../web/src/views/staff-phone/HomeView.vue'), 'utf8');
  assert.ok(!phoneHome.includes('Sửa giờ <small>Sắp có</small>'));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/dev/ts.cjs --test test/unit/fe-be-sync-ui.test.ts`
Expected: FAIL (`kpi.includes('OKR <small>Sắp có</small>')` is true).

- [ ] **Step 3: Update `PeriodStrip.vue`, `AdminLayout.vue`, `GroupClean.vue`, `RequestsView.vue`, `KpiShell.vue`, and `HomeView.vue`**

1. In `web/src/components/shell/PeriodStrip.vue`:
   - Add prop `showSteps: { type: Boolean, default: true }`.
   - Render `<span v-if="showSteps" class="state" ...>` and `<div v-if="showSteps" class="steps" ...>` only when `showSteps` is true.
2. In `web/src/components/shell/AdminLayout.vue`:
   - Pass `:show-steps="['tong-quan', 'cham-cong', 'kpi', 'luong'].includes(String(route.meta.nav || ''))"` to `<PeriodStrip />`.
3. In `web/src/views/admin/requests/GroupClean.vue` and `RequestsView.vue`:
   - Change `<h2>Không có cảnh báo</h2>` to `<h2>Yêu cầu chờ xử lý</h2>`.
   - Add `'approve'` to `defineEmits` in `GroupClean.vue`, render `<button type="button" class="btn sm pri" style="margin-left: 8px" @click="emit('approve', r)">Đồng ý</button>` next to `Từ chối` in `#act`, and wire `@approve="approve"` on `<GroupClean />` in `RequestsView.vue`.
4. In `web/src/views/admin/kpi/KpiShell.vue`:
   - Remove `<span class="tab" aria-disabled="true">OKR <small>Sắp có</small></span>`.
   - Replace the tall 5-column `.wts` grid card with a compact inline weight strip (`<div class="wts-inline">`) so the 4 KPI cards and score table move above the fold.
5. In `web/src/views/staff-phone/HomeView.vue`:
   - Remove `<button type="button" class="off" disabled>Sửa giờ <small>Sắp có</small></button>`.
   - Guard `Phiếu lương chính thức gửi ngày {{ dm(data.payslipDate) }}.` with `<template v-if="data.payslipDate">` and render `Việc cần làm<template v-if="data.requestDeadline"> trước {{ dm(data.requestDeadline) }}</template>`.

- [ ] **Step 4: Run test and build verification**

Run: `node scripts/dev/ts.cjs --test test/unit/fe-be-sync-ui.test.ts && npm run typecheck:web && npm --prefix web run build`
Expected: PASS and build succeeds.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/shell/AdminLayout.vue web/src/components/shell/PeriodStrip.vue web/src/views/admin/requests/ web/src/views/admin/kpi/KpiShell.vue web/src/views/staff-phone/HomeView.vue test/unit/fe-be-sync-ui.test.ts
git commit -m "refactor(web): hide payroll steps outside cycle screens and clean up requests, KPI, and phone home UI"
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
