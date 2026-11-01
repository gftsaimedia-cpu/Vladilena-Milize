# Bảng route /api

> Sinh tự động bởi `scripts/docs/gen-spec.js` (`npm run spec:gen`) từ `lib/authz.ts` (`ROUTE_CAPS`) và các decorator `@Controller/@Get/@Post/@Put` trong `src/modules/**/*.controller.ts`. Đừng sửa tay: `test/unit/spec-reference.test.js` so sánh file này với bản dựng từ mã.

Mọi route đi qua `ApiGuard` (`src/http/api.guard.ts`): đọc phiên → tra `ROUTE_CAPS` (không có khoá thì 403 `NO_ROUTE_POLICY`) → kiểm năng lực → giới hạn tải → giới hạn tốc độ ghi → dựng ngữ cảnh nhật ký. Cột *khoá kỳ* là `periodScope`: loại ghi mà cổng khoá kỳ (`ctx.guardPeriod`) áp dụng.

Số route: **101**; đường dẫn không module nào nhận trả 404 sau cổng quyền (`src/http/not-found.controller.ts`).

| Khoá chính sách | Quyền | Khoá kỳ | Controller (file:dòng, phương thức) | Mô tả (chú thích trong mã) |
| --- | --- | --- | --- | --- |
| `GET /advance-approvals` | đã đăng nhập | — | [`src/modules/advance/advance.controller.ts:19`](../../src/modules/advance/advance.controller.ts#L19) `approvals` | ?month=[&username=] yêu cầu tạm ứng của tháng: người duyệt thấy người đã gửi yêu cầu, nhân sự thấy của mình |
| `POST /advance-approvals/approve` | `request.decide.*` | — | [`src/modules/advance/advance.controller.ts:37`](../../src/modules/advance/advance.controller.ts#L37) `approve` | { month, username, expectedRev? } duyệt yêu cầu đang chờ |
| `POST /advance-approvals/approve-all` | `request.decide.*` | — | [`src/modules/advance/advance.controller.ts:55`](../../src/modules/advance/advance.controller.ts#L55) `approveEveryone` | { month, expectedRev? } duyệt mọi yêu cầu ĐANG CHỜ |
| `POST /advance-approvals/cancel` | `request.decide.*` | — | [`src/modules/advance/advance.controller.ts:49`](../../src/modules/advance/advance.controller.ts#L49) `cancel` | { month, username, expectedRev?, reason? } huỷ duyệt (yêu cầu về lại chờ duyệt) |
| `POST /advance-approvals/reject` | `request.decide.*` | — | [`src/modules/advance/advance.controller.ts:43`](../../src/modules/advance/advance.controller.ts#L43) `reject` | { month, username, expectedRev?, reason? } từ chối yêu cầu đang chờ |
| `POST /advance-approvals/request` | đã đăng nhập | — | [`src/modules/advance/advance.controller.ts:25`](../../src/modules/advance/advance.controller.ts#L25) `request` | { month, expectedRev? } nhân sự xin tạm ứng cho chính mình (mỗi tháng một yêu cầu) |
| `POST /advance-approvals/withdraw` | đã đăng nhập | — | [`src/modules/advance/advance.controller.ts:31`](../../src/modules/advance/advance.controller.ts#L31) `withdraw` | { month, expectedRev? } nhân sự rút yêu cầu đang chờ của mình |
| `GET /advance-requests` | đã đăng nhập | — | [`src/modules/advance/advance.controller.ts:13`](../../src/modules/advance/advance.controller.ts#L13) `requests` | ?month=[&username=][&status=] lịch sử yêu cầu ứng lương: { month, scope, items, pending?, cap, granted, remaining, eligible, reason? } |
| `POST /ai/findings` | `ai.review.dismiss` | — | [`src/modules/ai/ai.controller.ts:29`](../../src/modules/ai/ai.controller.ts#L29) `postAiFindingsDismiss` |  |
| `GET /ai/review` | `ai.review.read` | — | [`src/modules/ai/ai.controller.ts:12`](../../src/modules/ai/ai.controller.ts#L12) `getAiReview` |  |
| `GET /alerts` | `request.decide.*` | — | [`src/modules/approvals/approvals.controller.ts:95`](../../src/modules/approvals/approvals.controller.ts#L95) `getAlerts` |  |
| `GET /approvals` | `request.decide.*` | — | [`src/modules/approvals/approvals.controller.ts:22`](../../src/modules/approvals/approvals.controller.ts#L22) `getApprovals` |  |
| `GET /approvals/count` | `request.decide.*` | — | [`src/modules/approvals/approvals.controller.ts:84`](../../src/modules/approvals/approvals.controller.ts#L84) `getApprovalsCount` |  |
| `PUT /approvals/decide` | `request.decide.*` | `attendance` (tháng: items[].date) | [`src/modules/approvals/approvals.controller.ts:157`](../../src/modules/approvals/approvals.controller.ts#L157) `putApprovalsDecide` |  |
| `GET /attendance` | `attendance.read` | — | [`src/modules/attendance/attendance.controller.ts:351`](../../src/modules/attendance/attendance.controller.ts#L351) `getAttendance` |  |
| `GET /audit` | `audit.read` | — | [`src/modules/audit/audit.controller.ts:14`](../../src/modules/audit/audit.controller.ts#L14) `getAudit` |  |
| `GET /audit/verify` | `audit.read` | — | [`src/modules/audit/audit.controller.ts:52`](../../src/modules/audit/audit.controller.ts#L52) `getAuditVerify` |  |
| `POST /blocks` | `config.payroll` | — | [`src/modules/blocks/blocks.controller.ts:14`](../../src/modules/blocks/blocks.controller.ts#L14) `add` | (config.payroll) { label, method, values \| positions, … } → { code, block, …kết quả save() } |
| `PUT /blocks/:code/confirm` | `config.legal` | — | [`src/modules/blocks/blocks.controller.ts:22`](../../src/modules/blocks/blocks.controller.ts#L22) `confirm` | (config.legal) { basis, effectiveMonth? } → { code, confirmedBy, confirmedAt, … } |
| `PUT /catalog/levels` | `config.payroll` | — | [`src/modules/catalog/catalog.controller.ts:75`](../../src/modules/catalog/catalog.controller.ts#L75) `saveLevel` | { type, level, changes, effectiveMonth, reason?, expectedRev? }; expectedRev bắt buộc khi sửa bậc đã có, bỏ trống khi thêm bậc kế tiếp |
| `GET /catalog/positions` | `config.read` | — | [`src/modules/catalog/catalog.controller.ts:36`](../../src/modules/catalog/catalog.controller.ts#L36) `listPositions` | ?month= → { month, baseMonth, benefits, positions: [{ code, name, …, benefits, rev, levels }] }; baseMonth: tháng của dòng nền nạp từ bộ mặc định |
| `PUT /catalog/positions/:code` | `config.payroll` | — | [`src/modules/catalog/catalog.controller.ts:50`](../../src/modules/catalog/catalog.controller.ts#L50) `savePosition` | { changes, effectiveMonth, reason?, expectedRev }; changes: một phần { name, workdays, flexPct, nightPct, travelPct, attendancePct, regularDows, benefits } |
| `GET /catalog/shifts` | `config.read` | — | [`src/modules/catalog/catalog.controller.ts:101`](../../src/modules/catalog/catalog.controller.ts#L101) `listShifts` | { shifts: [{ code, preset, name, kind, sort, deprecated, rev }] } |
| `PUT /catalog/shifts` | `config.payroll` | — | [`src/modules/catalog/catalog.controller.ts:110`](../../src/modules/catalog/catalog.controller.ts#L110) `saveShift` | { code, changes: { name?, kind?, sort?, deprecated? }, expectedRev, reason? } |
| `GET /employees/:uuid` | `profile.read` | — | [`src/modules/employees/employees.controller.ts:31`](../../src/modules/employees/employees.controller.ts#L31) `view` | ?month= hồ sơ + chức vụ/bậc của tháng + ca được xếp (Employee.view), che trường theo quyền như GET /api/staff |
| `GET /employees/:uuid/trace` | `audit.read` | — | [`src/modules/employees/employees.controller.ts:42`](../../src/modules/employees/employees.controller.ts#L42) `trace` | ?beforeId=&limit= nhật ký kiểm toán về người này, mới nhất trước (gộp cả dòng cũ ghi theo tài khoản) |
| `GET /entitlements` | `config.read` | — | [`src/modules/positions/positions.controller.ts:20`](../../src/modules/positions/positions.controller.ts#L20) `listEntitlements` | ?month= (config.read) |
| `GET /events` | đã đăng nhập | — | [`src/modules/system/system.controller.ts:18`](../../src/modules/system/system.controller.ts#L18) `getEvents` |  |
| `GET /explanations` | đã đăng nhập | — | [`src/modules/explanations/explanations.controller.ts:18`](../../src/modules/explanations/explanations.controller.ts#L18) `list` | [?status=][&user=] nhân sự: của mình; người có attendance.correct (Admin): mọi người (user= lọc một người) |
| `POST /explanations` | đã đăng nhập | — | [`src/modules/explanations/explanations.controller.ts:38`](../../src/modules/explanations/explanations.controller.ts#L38) `submit` | Ba dạng thân: { sessionId, text } nhân sự giải trình Check-out muộn của CHÍNH MÌNH; { date, text } nhân sự tự giải trình ngày vắng |
| `POST /explanations/:id/answer` | đã đăng nhập | — | [`src/modules/explanations/explanations.controller.ts:87`](../../src/modules/explanations/explanations.controller.ts#L87) `answer` | { text } nhân sự trả lời yêu cầu của mình |
| `POST /explanations/:id/decide` | `attendance.correct` | — | [`src/modules/explanations/explanations.controller.ts:96`](../../src/modules/explanations/explanations.controller.ts#L96) `decide` | { approve, note?, expectedRev? } Admin duyệt hoặc không duyệt. Giải trình Check-out muộn: duyệt thì giờ bấm thành giờ Check-out của lượt; |
| `GET /health` | công khai | — | [`src/modules/system/system.controller.ts:11`](../../src/modules/system/system.controller.ts#L11) `getHealth` |  |
| `GET /holidays` | đã đăng nhập | — | [`src/modules/settings/settings.controller.ts:25`](../../src/modules/settings/settings.controller.ts#L25) `getHolidays` |  |
| `PUT /holidays` | `config.payroll` | `attendance` (tháng: ngày lễ đổi (hiệu hai tập)) | [`src/modules/settings/settings.controller.ts:32`](../../src/modules/settings/settings.controller.ts#L32) `putHolidays` |  |
| `GET /kpi/scores` | `kpi.score.write` | — | [`src/modules/kpi/kpi.controller.ts:19`](../../src/modules/kpi/kpi.controller.ts#L19) `getKpiScores` |  |
| `PUT /kpi/scores` | `self-or:kpi.score.write` | `kpi` (tháng: body.month) | [`src/modules/kpi/kpi.controller.ts:39`](../../src/modules/kpi/kpi.controller.ts#L39) `putKpiScores` |  |
| `GET /leave/ledger` | `self-or:profile.read` | — | [`src/modules/leave/leave.controller.ts:25`](../../src/modules/leave/leave.controller.ts#L25) `ledger` | [?user=] số dư hiện tại + các lần cộng/hết hạn của một người (mặc định chính mình); xem người khác cần profile.read |
| `POST /leave/refresh` | `profile.write` | — | [`src/modules/leave/leave.controller.ts:45`](../../src/modules/leave/leave.controller.ts#L45) `refresh` | { user? } tính lại ngay một người (user) hoặc mọi người; cần profile.write |
| `POST /login` | công khai | — | [`src/modules/auth/auth.controller.ts:21`](../../src/modules/auth/auth.controller.ts#L21) `postLogin` |  |
| `POST /logout` | công khai | — | [`src/modules/auth/auth.controller.ts:63`](../../src/modules/auth/auth.controller.ts#L63) `postLogout` |  |
| `GET /me` | công khai | — | [`src/modules/auth/auth.controller.ts:74`](../../src/modules/auth/auth.controller.ts#L74) `getMe` |  |
| `GET /me/estimate` | đã đăng nhập | — | [`src/modules/sheet/sheet.controller.ts:31`](../../src/modules/sheet/sheet.controller.ts#L31) `getMeEstimate` |  |
| `GET /ot` | `attendance.correct` | — | [`src/modules/attendance/attendance.controller.ts:152`](../../src/modules/attendance/attendance.controller.ts#L152) `getOt` |  |
| `POST /ot` | `attendance.correct` | `attendance` (tháng: ngày của lượt) | [`src/modules/attendance/attendance.controller.ts:160`](../../src/modules/attendance/attendance.controller.ts#L160) `postOt` |  |
| `PUT /ot` | `attendance.correct` | `attendance` (tháng: ngày của lượt) | [`src/modules/attendance/attendance.controller.ts:218`](../../src/modules/attendance/attendance.controller.ts#L218) `putOt` |  |
| `PUT /password` | đã đăng nhập | — | [`src/modules/auth/auth.controller.ts:91`](../../src/modules/auth/auth.controller.ts#L91) `putPassword` |  |
| `GET /pay-entries` | `salary.read` | — | [`src/modules/pay-entries/pay-entries.controller.ts:26`](../../src/modules/pay-entries/pay-entries.controller.ts#L26) `list` | ?month=&username=&status= (salary.read) → { month, periodStatus, requireApproval, entries } |
| `POST /pay-entries` | `salary.write` | — | [`src/modules/pay-entries/pay-entries.controller.ts:45`](../../src/modules/pay-entries/pay-entries.controller.ts#L45) `create` | (salary.write) → { entry } |
| `PUT /pay-entries/:id` | `salary.write` | — | [`src/modules/pay-entries/pay-entries.controller.ts:61`](../../src/modules/pay-entries/pay-entries.controller.ts#L61) `update` | (salary.write) → { entry }; sửa khi chờ duyệt, cần rev |
| `POST /pay-entries/:id/confirm-flags` | `config.legal` | — | [`src/modules/pay-entries/pay-entries.controller.ts:84`](../../src/modules/pay-entries/pay-entries.controller.ts#L84) `confirmFlags` | { rev } (config.legal) → { entry }; Kế toán xác nhận cờ thuế, bảo hiểm |
| `PUT /pay-entries/:id/decide` | `payroll.approve` | — | [`src/modules/pay-entries/pay-entries.controller.ts:68`](../../src/modules/pay-entries/pay-entries.controller.ts#L68) `decide` | { decision, note, rev } (payroll.approve) → { entry } |
| `POST /pay-entries/:id/void` | `salary.write` | — | [`src/modules/pay-entries/pay-entries.controller.ts:76`](../../src/modules/pay-entries/pay-entries.controller.ts#L76) `void` | { rev?, reason? } (salary.write) → { entry } |
| `POST /pay-entries/bulk` | `salary.write` | — | [`src/modules/pay-entries/pay-entries.controller.ts:53`](../../src/modules/pay-entries/pay-entries.controller.ts#L53) `createBulk` | (salary.write) → { count, entries }; tất cả hoặc không |
| `GET /periods` | `payroll.view` | — | [`src/modules/periods/periods.controller.ts:73`](../../src/modules/periods/periods.controller.ts#L73) `getPeriods` |  |
| `GET /periods/:month` | `payroll.view` | — | [`src/modules/periods/periods.controller.ts:83`](../../src/modules/periods/periods.controller.ts#L83) `periodStep` |  |
| `POST /periods/:month/ai-review` | `ai.review.read` | — | [`src/modules/periods/periods.controller.ts:176`](../../src/modules/periods/periods.controller.ts#L176) `postPeriodsMonthAiReview` |  |
| `POST /periods/:month/approve` | `payroll.approve` | — | [`src/modules/periods/periods.controller.ts:181`](../../src/modules/periods/periods.controller.ts#L181) `postPeriodsMonthApprove` |  |
| `POST /periods/:month/calculate` | `payroll.calculate` | — | [`src/modules/periods/periods.controller.ts:171`](../../src/modules/periods/periods.controller.ts#L171) `postPeriodsMonthCalculate` |  |
| `GET /periods/:month/estimates` | `payroll.view` | — | [`src/modules/periods/periods.controller.ts:201`](../../src/modules/periods/periods.controller.ts#L201) `getPeriodsMonthEstimates` |  |
| `GET /periods/:month/estimates/:username` | `payroll.view` | — | [`src/modules/periods/periods.controller.ts:206`](../../src/modules/periods/periods.controller.ts#L206) `getPeriodsMonthEstimatesUsername` |  |
| `POST /periods/:month/lock-attendance` | `attendance.lock` | — | [`src/modules/periods/periods.controller.ts:166`](../../src/modules/periods/periods.controller.ts#L166) `postPeriodsMonthLockAttendance` |  |
| `POST /periods/:month/mark-paid` | `payroll.pay` | — | [`src/modules/periods/periods.controller.ts:186`](../../src/modules/periods/periods.controller.ts#L186) `postPeriodsMonthMarkPaid` |  |
| `GET /periods/:month/payslips` | `payroll.view` | — | [`src/modules/periods/periods.controller.ts:196`](../../src/modules/periods/periods.controller.ts#L196) `getPeriodsMonthPayslips` |  |
| `GET /periods/:month/payslips/:username` | `self-or:payroll.view` | — | [`src/modules/periods/periods.controller.ts:211`](../../src/modules/periods/periods.controller.ts#L211) `getPeriodsMonthPayslipsUsername` |  |
| `PUT /periods/:month/payslips/decide` | `payroll.approve` | — | [`src/modules/periods/periods.controller.ts:216`](../../src/modules/periods/periods.controller.ts#L216) `putPeriodsMonthPayslipsDecide` |  |
| `POST /periods/:month/reopen` | `period.reopen` | — | [`src/modules/periods/periods.controller.ts:191`](../../src/modules/periods/periods.controller.ts#L191) `postPeriodsMonthReopen` |  |
| `GET /periods/:month/verify` | `audit.read` | — | [`src/modules/periods/periods.controller.ts:221`](../../src/modules/periods/periods.controller.ts#L221) `getPeriodsMonthVerify` |  |
| `GET /positions` | `config.read` | — | [`src/modules/positions/positions.controller.ts:14`](../../src/modules/positions/positions.controller.ts#L14) `listPositions` | ?month= (config.read) |
| `POST /positions` | `config.read` | — | [`src/modules/positions/positions.controller.ts:26`](../../src/modules/positions/positions.controller.ts#L26) `addPosition` | thêm chức vụ bằng sao chép |
| `POST /positions/:code/levels` | `config.payroll` | — | [`src/modules/positions/positions.controller.ts:34`](../../src/modules/positions/positions.controller.ts#L34) `addLevel` | thêm bậc cho một chức vụ |
| `GET /punch` | đã đăng nhập | — | [`src/modules/attendance/attendance.controller.ts:32`](../../src/modules/attendance/attendance.controller.ts#L32) `getPunch` |  |
| `POST /punch` | đã đăng nhập | `attendance` (tháng: ngày công của lượt (ca đêm thuộc ngày bắt đầu)) | [`src/modules/attendance/attendance.controller.ts:48`](../../src/modules/attendance/attendance.controller.ts#L48) `postPunch` |  |
| `GET /roles` | `roles.manage` | — | [`src/modules/roles/roles.controller.ts:18`](../../src/modules/roles/roles.controller.ts#L18) `list` | danh sách vai trò mặc định + tuỳ chỉnh, khu vực của ma trận, loại yêu cầu duyệt, tài khoản |
| `POST /roles` | `roles.manage` | — | [`src/modules/roles/roles.controller.ts:24`](../../src/modules/roles/roles.controller.ts#L24) `create` | { label, copyFrom?, code?, caps? \| levels?+extras?, approvals?, scope?, reason? } tạo hoặc sao chép |
| `PUT /roles/:code` | `roles.manage` | — | [`src/modules/roles/roles.controller.ts:30`](../../src/modules/roles/roles.controller.ts#L30) `update` | { rev, label?, caps? \| levels?+extras?, approvals?, scope?, reason } sửa vai trò tuỳ chỉnh |
| `POST /roles/:code/deprecate` | `roles.manage` | — | [`src/modules/roles/roles.controller.ts:36`](../../src/modules/roles/roles.controller.ts#L36) `deprecate` | { rev, reason } ngưng dùng (không xoá) |
| `GET /settings/agents` | `roles.manage` | — | [`src/modules/settings/settings.controller.ts:125`](../../src/modules/settings/settings.controller.ts#L125) `getSettingsAgents` |  |
| `PUT /settings/agents` | `roles.manage` | — | [`src/modules/settings/settings.controller.ts:132`](../../src/modules/settings/settings.controller.ts#L132) `putSettingsAgents` |  |
| `GET /settings/first-run` | `config.read` | — | [`src/modules/settings/settings.controller.ts:196`](../../src/modules/settings/settings.controller.ts#L196) `getSettingsFirstRun` |  |
| `PUT /settings/geofence` | `config.payroll` | — | [`src/modules/settings/settings.controller.ts:156`](../../src/modules/settings/settings.controller.ts#L156) `putSettingsGeofence` |  |
| `GET /settings/params` | `config.read` | — | [`src/modules/settings/settings.controller.ts:183`](../../src/modules/settings/settings.controller.ts#L183) `getSettingsParams` |  |
| `PUT /settings/params` | `config.read` | — | [`src/modules/settings/settings.controller.ts:208`](../../src/modules/settings/settings.controller.ts#L208) `putSettingsParams` |  |
| `POST /settings/params/preview` | `config.read` | — | [`src/modules/settings/settings.controller.ts:226`](../../src/modules/settings/settings.controller.ts#L226) `postSettingsParamsPreview` |  |
| `POST /settings/params/revert` | `config.read` | — | [`src/modules/settings/settings.controller.ts:231`](../../src/modules/settings/settings.controller.ts#L231) `postSettingsParamsRevert` |  |
| `GET /settings/shifts` | `config.read` | — | [`src/modules/settings/settings-shifts.controller.ts:21`](../../src/modules/settings/settings-shifts.controller.ts#L21) `get` | ?month= → { month, paramsRev, editable, hours, shifts: [{ code, preset, name, kind, in, out }] } |
| `PUT /settings/shifts` | `config.read` | — | [`src/modules/settings/settings-shifts.controller.ts:29`](../../src/modules/settings/settings-shifts.controller.ts#L29) `put` | { shifts: [{ code, in, out }], effectiveMonth?, reason, expectedRev? } → như lưu tham số |
| `GET /settings/version` | đã đăng nhập | — | [`src/modules/settings/settings.controller.ts:201`](../../src/modules/settings/settings.controller.ts#L201) `getSettingsVersion` |  |
| `GET /sheet` | `self-or:attendance.read` | — | [`src/modules/sheet/sheet.controller.ts:41`](../../src/modules/sheet/sheet.controller.ts#L41) `getSheet` |  |
| `PUT /sheet` | đã đăng nhập | `attendance` (tháng: body.month) | [`src/modules/sheet/sheet.controller.ts:95`](../../src/modules/sheet/sheet.controller.ts#L95) `putSheet` |  |
| `PUT /sheet/bulk` | `request.decide.*` | `attendance` (tháng: body.month) | [`src/modules/sheet/sheet.controller.ts:152`](../../src/modules/sheet/sheet.controller.ts#L152) `putSheetBulk` |  |
| `GET /slip-override` | `payroll.override` | — | [`src/modules/periods/periods.controller.ts:24`](../../src/modules/periods/periods.controller.ts#L24) `getSlipOverride` |  |
| `PUT /slip-override` | `payroll.override` | `slip` (tháng: body.month) | [`src/modules/periods/periods.controller.ts:67`](../../src/modules/periods/periods.controller.ts#L67) `putSlipOverride` |  |
| `GET /staff` | `profile.read` | — | [`src/modules/staff/staff.controller.ts:32`](../../src/modules/staff/staff.controller.ts#L32) `getStaff` |  |
| `PUT /staff/:u` | `profile.write` | — | [`src/modules/staff/staff.controller.ts:217`](../../src/modules/staff/staff.controller.ts#L217) `putStaff` |  |
| `POST /staff/:u/password` | `roles.manage` | — | [`src/modules/staff/staff.controller.ts:92`](../../src/modules/staff/staff.controller.ts#L92) `postStaffPassword` |  |
| `PUT /staff/:u/roles` | `roles.manage` | — | [`src/modules/staff/staff.controller.ts:128`](../../src/modules/staff/staff.controller.ts#L128) `putStaffRoles` |  |
| `GET /staff/:u/schedule` | `self-or:profile.read` | — | [`src/modules/staff/staff.controller.ts:570`](../../src/modules/staff/staff.controller.ts#L570) `getStaffSchedule` | ?month= lịch làm việc hiệu lực của một người (self-or:profile.read); kiểm quyền TRƯỚC khi tra tên để không dò được tên đăng nhập |
| `PUT /staff/shift-bulk` | `profile.write` | — | [`src/modules/sheet/sheet.controller.ts:162`](../../src/modules/sheet/sheet.controller.ts#L162) `putStaffShiftBulk` |  |
| `GET /team` | `payroll.view` | — | [`src/modules/staff/staff.controller.ts:45`](../../src/modules/staff/staff.controller.ts#L45) `getTeam` |  |
| `GET /today` | `attendance.read` | — | [`src/modules/attendance/attendance.controller.ts:284`](../../src/modules/attendance/attendance.controller.ts#L284) `getToday` |  |
