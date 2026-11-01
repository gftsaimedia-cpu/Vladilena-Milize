# Bảng route /api

> Sinh tự động bởi `scripts/docs/gen-spec.ts` (`npm run spec:gen`) từ `src/platform/authz.ts` (`ROUTE_CAPS`) và các decorator `@Controller/@Get/@Post/@Put` trong `src/modules/**/*.controller.ts`. Đừng sửa tay: `test/unit/spec-reference.test.ts` so sánh file này với bản dựng từ mã.

Mọi route đi qua `ApiGuard` (`src/http/api.guard.ts`): đọc phiên → tra `ROUTE_CAPS` (không có khoá thì 403 `NO_ROUTE_POLICY`) → kiểm năng lực → giới hạn tải → giới hạn tốc độ ghi → dựng ngữ cảnh nhật ký. Cột *khoá kỳ* là `periodScope`: loại ghi mà cổng khoá kỳ (`ctx.guardPeriod`) áp dụng.

Số route: **96**; đường dẫn không module nào nhận trả 404 sau cổng quyền (`src/http/not-found.controller.ts`).

| Khoá chính sách | Quyền | Khoá kỳ | Controller (file:dòng, phương thức) | Mô tả (chú thích trong mã) |
| --- | --- | --- | --- | --- |
| `GET /advance-approvals` | đã đăng nhập | — | [`src/modules/advance/advance.controller.ts:24`](../../src/modules/advance/advance.controller.ts#L24) `approvals` | ?month=[&username=] yêu cầu tạm ứng của tháng: người duyệt thấy người đã gửi yêu cầu, nhân sự thấy của mình |
| `POST /advance-approvals/approve` | `request.decide.*` | — | [`src/modules/advance/advance.controller.ts:42`](../../src/modules/advance/advance.controller.ts#L42) `approve` | { month, username, expectedRev? } duyệt yêu cầu đang chờ |
| `POST /advance-approvals/approve-all` | `request.decide.*` | — | [`src/modules/advance/advance.controller.ts:60`](../../src/modules/advance/advance.controller.ts#L60) `approveEveryone` | { month, expectedRev? } duyệt mọi yêu cầu ĐANG CHỜ |
| `POST /advance-approvals/cancel` | `request.decide.*` | — | [`src/modules/advance/advance.controller.ts:54`](../../src/modules/advance/advance.controller.ts#L54) `cancel` | { month, username, expectedRev?, reason? } huỷ duyệt (yêu cầu về lại chờ duyệt) |
| `POST /advance-approvals/reject` | `request.decide.*` | — | [`src/modules/advance/advance.controller.ts:48`](../../src/modules/advance/advance.controller.ts#L48) `reject` | { month, username, expectedRev?, reason? } từ chối yêu cầu đang chờ |
| `POST /advance-approvals/request` | đã đăng nhập | — | [`src/modules/advance/advance.controller.ts:30`](../../src/modules/advance/advance.controller.ts#L30) `request` | { month, expectedRev? } nhân sự xin tạm ứng cho chính mình (mỗi tháng một yêu cầu) |
| `POST /advance-approvals/withdraw` | đã đăng nhập | — | [`src/modules/advance/advance.controller.ts:36`](../../src/modules/advance/advance.controller.ts#L36) `withdraw` | { month, expectedRev? } nhân sự rút yêu cầu đang chờ của mình |
| `GET /advance-requests` | đã đăng nhập | — | [`src/modules/advance/advance.controller.ts:18`](../../src/modules/advance/advance.controller.ts#L18) `requests` | ?month=[&username=][&status=] lịch sử yêu cầu ứng lương: { month, scope, items, pending?, cap, granted, remaining, eligible, reason? } |
| `GET /alerts` | `request.decide.*` | — | [`src/modules/approvals/approvals.controller.ts:108`](../../src/modules/approvals/approvals.controller.ts#L108) `getAlerts` |  |
| `GET /approvals` | `request.decide.*` | — | [`src/modules/approvals/approvals.controller.ts:32`](../../src/modules/approvals/approvals.controller.ts#L32) `getApprovals` |  |
| `GET /approvals/count` | `request.decide.*` | — | [`src/modules/approvals/approvals.controller.ts:97`](../../src/modules/approvals/approvals.controller.ts#L97) `getApprovalsCount` |  |
| `PUT /approvals/decide` | `request.decide.*` | `attendance` (tháng: items[].date) | [`src/modules/approvals/approvals.controller.ts:170`](../../src/modules/approvals/approvals.controller.ts#L170) `putApprovalsDecide` |  |
| `GET /attendance` | `attendance.read` | — | [`src/modules/attendance/attendance.controller.ts:363`](../../src/modules/attendance/attendance.controller.ts#L363) `getAttendance` |  |
| `GET /audit` | `audit.read` | — | [`src/modules/audit/audit.controller.ts:21`](../../src/modules/audit/audit.controller.ts#L21) `getAudit` |  |
| `GET /audit/verify` | `audit.read` | — | [`src/modules/audit/audit.controller.ts:59`](../../src/modules/audit/audit.controller.ts#L59) `getAuditVerify` |  |
| `POST /blocks` | `config.payroll` | — | [`src/modules/blocks/blocks.controller.ts:17`](../../src/modules/blocks/blocks.controller.ts#L17) `add` | (config.payroll) { label, method, values \| positions, … } → { code, block, …kết quả save() } |
| `PUT /blocks/:code/confirm` | `config.legal` | — | [`src/modules/blocks/blocks.controller.ts:25`](../../src/modules/blocks/blocks.controller.ts#L25) `confirm` | (config.legal) { basis, effectiveMonth? } → { code, confirmedBy, confirmedAt, … } |
| `PUT /catalog/levels` | `config.payroll` | — | [`src/modules/catalog/catalog.controller.ts:80`](../../src/modules/catalog/catalog.controller.ts#L80) `saveLevel` | { type, level, changes, effectiveMonth, reason?, expectedRev? }; expectedRev bắt buộc khi sửa bậc đã có, bỏ trống khi thêm bậc kế tiếp |
| `GET /catalog/positions` | `config.read` | — | [`src/modules/catalog/catalog.controller.ts:41`](../../src/modules/catalog/catalog.controller.ts#L41) `listPositions` | ?month= → { month, baseMonth, benefits, positions: [{ code, name, …, benefits, rev, levels }] }; baseMonth: tháng của dòng nền nạp từ bộ mặc định |
| `PUT /catalog/positions/:code` | `config.payroll` | — | [`src/modules/catalog/catalog.controller.ts:55`](../../src/modules/catalog/catalog.controller.ts#L55) `savePosition` | { changes, effectiveMonth, reason?, expectedRev }; changes: một phần { name, workdays, flexPct, nightPct, travelPct, attendancePct, regularDows, benefits } |
| `GET /catalog/shifts` | `config.read` | — | [`src/modules/catalog/catalog.controller.ts:106`](../../src/modules/catalog/catalog.controller.ts#L106) `listShifts` | { shifts: [{ code, preset, name, kind, sort, deprecated, rev }] } |
| `PUT /catalog/shifts` | `config.payroll` | — | [`src/modules/catalog/catalog.controller.ts:115`](../../src/modules/catalog/catalog.controller.ts#L115) `saveShift` | { code, changes: { name?, kind?, sort?, deprecated? }, expectedRev, reason? } |
| `GET /employees/:uuid` | `profile.read` | — | [`src/modules/employees/employees.controller.ts:39`](../../src/modules/employees/employees.controller.ts#L39) `view` | ?month= hồ sơ + chức vụ/bậc của tháng + ca được xếp (Employee.view), che trường theo quyền như GET /api/staff |
| `GET /employees/:uuid/trace` | `audit.read` | — | [`src/modules/employees/employees.controller.ts:50`](../../src/modules/employees/employees.controller.ts#L50) `trace` | ?beforeId=&limit= nhật ký kiểm toán về người này, mới nhất trước (gộp cả dòng cũ ghi theo tài khoản) |
| `GET /entitlements` | `config.read` | — | [`src/modules/positions/positions.controller.ts:26`](../../src/modules/positions/positions.controller.ts#L26) `listEntitlements` | ?month= (config.read) |
| `GET /events` | đã đăng nhập | — | [`src/modules/system/system.controller.ts:24`](../../src/modules/system/system.controller.ts#L24) `getEvents` |  |
| `GET /explanations` | đã đăng nhập | — | [`src/modules/explanations/explanations.controller.ts:25`](../../src/modules/explanations/explanations.controller.ts#L25) `list` | [?status=][&user=] nhân sự: của mình; người có attendance.correct (Admin): mọi người (user= lọc một người) |
| `POST /explanations` | đã đăng nhập | — | [`src/modules/explanations/explanations.controller.ts:45`](../../src/modules/explanations/explanations.controller.ts#L45) `submit` | Ba dạng thân: { sessionId, text } nhân sự giải trình Check-out muộn của CHÍNH MÌNH; { date, text } nhân sự tự giải trình ngày vắng |
| `POST /explanations/:id/answer` | đã đăng nhập | — | [`src/modules/explanations/explanations.controller.ts:95`](../../src/modules/explanations/explanations.controller.ts#L95) `answer` | { text } nhân sự trả lời yêu cầu của mình |
| `POST /explanations/:id/decide` | `attendance.correct` | — | [`src/modules/explanations/explanations.controller.ts:104`](../../src/modules/explanations/explanations.controller.ts#L104) `decide` | { approve, note?, expectedRev? } Admin duyệt hoặc không duyệt. Giải trình Check-out muộn: duyệt thì giờ bấm thành giờ Check-out của lượt; |
| `GET /health` | công khai | — | [`src/modules/system/system.controller.ts:17`](../../src/modules/system/system.controller.ts#L17) `getHealth` |  |
| `GET /holidays` | đã đăng nhập | — | [`src/modules/settings/settings.controller.ts:34`](../../src/modules/settings/settings.controller.ts#L34) `getHolidays` |  |
| `PUT /holidays` | `config.payroll` | `attendance` (tháng: ngày lễ đổi (hiệu hai tập)) | [`src/modules/settings/settings.controller.ts:41`](../../src/modules/settings/settings.controller.ts#L41) `putHolidays` |  |
| `GET /kpi/scores` | `kpi.score.write` | — | [`src/modules/kpi/kpi.controller.ts:29`](../../src/modules/kpi/kpi.controller.ts#L29) `getKpiScores` |  |
| `PUT /kpi/scores` | `self-or:kpi.score.write` | `kpi` (tháng: body.month) | [`src/modules/kpi/kpi.controller.ts:49`](../../src/modules/kpi/kpi.controller.ts#L49) `putKpiScores` |  |
| `GET /leave/ledger` | `self-or:profile.read` | — | [`src/modules/leave/leave.controller.ts:30`](../../src/modules/leave/leave.controller.ts#L30) `ledger` | [?user=] số dư hiện tại + các lần cộng/hết hạn của một người (mặc định chính mình); xem người khác cần profile.read |
| `POST /leave/refresh` | `profile.write` | — | [`src/modules/leave/leave.controller.ts:50`](../../src/modules/leave/leave.controller.ts#L50) `refresh` | { user? } tính lại ngay một người (user) hoặc mọi người; cần profile.write |
| `POST /login` | công khai | — | [`src/modules/auth/auth.controller.ts:30`](../../src/modules/auth/auth.controller.ts#L30) `postLogin` |  |
| `POST /logout` | công khai | — | [`src/modules/auth/auth.controller.ts:72`](../../src/modules/auth/auth.controller.ts#L72) `postLogout` |  |
| `GET /me` | công khai | — | [`src/modules/auth/auth.controller.ts:83`](../../src/modules/auth/auth.controller.ts#L83) `getMe` |  |
| `GET /me/estimate` | đã đăng nhập | — | [`src/modules/sheet/sheet.controller.ts:43`](../../src/modules/sheet/sheet.controller.ts#L43) `getMeEstimate` |  |
| `GET /ot` | `attendance.correct` | — | [`src/modules/attendance/attendance.controller.ts:164`](../../src/modules/attendance/attendance.controller.ts#L164) `getOt` |  |
| `POST /ot` | `attendance.correct` | `attendance` (tháng: ngày của lượt) | [`src/modules/attendance/attendance.controller.ts:172`](../../src/modules/attendance/attendance.controller.ts#L172) `postOt` |  |
| `PUT /ot` | `attendance.correct` | `attendance` (tháng: ngày của lượt) | [`src/modules/attendance/attendance.controller.ts:230`](../../src/modules/attendance/attendance.controller.ts#L230) `putOt` |  |
| `PUT /password` | đã đăng nhập | — | [`src/modules/auth/auth.controller.ts:99`](../../src/modules/auth/auth.controller.ts#L99) `putPassword` |  |
| `GET /pay-entries` | `salary.read` | — | [`src/modules/pay-entries/pay-entries.controller.ts:32`](../../src/modules/pay-entries/pay-entries.controller.ts#L32) `list` | ?month=&username=&status= (salary.read) → { month, periodStatus, requireApproval, entries } |
| `POST /pay-entries` | `salary.write` | — | [`src/modules/pay-entries/pay-entries.controller.ts:51`](../../src/modules/pay-entries/pay-entries.controller.ts#L51) `create` | (salary.write) → { entry } |
| `PUT /pay-entries/:id` | `salary.write` | — | [`src/modules/pay-entries/pay-entries.controller.ts:67`](../../src/modules/pay-entries/pay-entries.controller.ts#L67) `update` | (salary.write) → { entry }; sửa khi chờ duyệt, cần rev |
| `POST /pay-entries/:id/confirm-flags` | `config.legal` | — | [`src/modules/pay-entries/pay-entries.controller.ts:90`](../../src/modules/pay-entries/pay-entries.controller.ts#L90) `confirmFlags` | { rev } (config.legal) → { entry }; Kế toán xác nhận cờ thuế, bảo hiểm |
| `PUT /pay-entries/:id/decide` | `payroll.approve` | — | [`src/modules/pay-entries/pay-entries.controller.ts:74`](../../src/modules/pay-entries/pay-entries.controller.ts#L74) `decide` | { decision, note, rev } (payroll.approve) → { entry } |
| `POST /pay-entries/:id/void` | `salary.write` | — | [`src/modules/pay-entries/pay-entries.controller.ts:82`](../../src/modules/pay-entries/pay-entries.controller.ts#L82) `void` | { rev?, reason? } (salary.write) → { entry } |
| `POST /pay-entries/bulk` | `salary.write` | — | [`src/modules/pay-entries/pay-entries.controller.ts:59`](../../src/modules/pay-entries/pay-entries.controller.ts#L59) `createBulk` | (salary.write) → { count, entries }; tất cả hoặc không |
| `GET /periods` | `payroll.view` | — | [`src/modules/periods/periods.controller.ts:81`](../../src/modules/periods/periods.controller.ts#L81) `getPeriods` |  |
| `GET /periods/:month` | `payroll.view` | — | [`src/modules/periods/periods.controller.ts:91`](../../src/modules/periods/periods.controller.ts#L91) `periodStep` |  |
| `POST /periods/:month/approve` | `payroll.approve` | — | [`src/modules/periods/periods.controller.ts:175`](../../src/modules/periods/periods.controller.ts#L175) `postPeriodsMonthApprove` |  |
| `POST /periods/:month/calculate` | `payroll.calculate` | — | [`src/modules/periods/periods.controller.ts:170`](../../src/modules/periods/periods.controller.ts#L170) `postPeriodsMonthCalculate` |  |
| `GET /periods/:month/estimates` | `payroll.view` | — | [`src/modules/periods/periods.controller.ts:195`](../../src/modules/periods/periods.controller.ts#L195) `getPeriodsMonthEstimates` |  |
| `GET /periods/:month/estimates/:username` | `payroll.view` | — | [`src/modules/periods/periods.controller.ts:200`](../../src/modules/periods/periods.controller.ts#L200) `getPeriodsMonthEstimatesUsername` |  |
| `POST /periods/:month/lock-attendance` | `attendance.lock` | — | [`src/modules/periods/periods.controller.ts:165`](../../src/modules/periods/periods.controller.ts#L165) `postPeriodsMonthLockAttendance` |  |
| `POST /periods/:month/mark-paid` | `payroll.pay` | — | [`src/modules/periods/periods.controller.ts:180`](../../src/modules/periods/periods.controller.ts#L180) `postPeriodsMonthMarkPaid` |  |
| `GET /periods/:month/payslips` | `payroll.view` | — | [`src/modules/periods/periods.controller.ts:190`](../../src/modules/periods/periods.controller.ts#L190) `getPeriodsMonthPayslips` |  |
| `GET /periods/:month/payslips/:username` | `self-or:payroll.view` | — | [`src/modules/periods/periods.controller.ts:205`](../../src/modules/periods/periods.controller.ts#L205) `getPeriodsMonthPayslipsUsername` |  |
| `PUT /periods/:month/payslips/decide` | `payroll.approve` | — | [`src/modules/periods/periods.controller.ts:210`](../../src/modules/periods/periods.controller.ts#L210) `putPeriodsMonthPayslipsDecide` |  |
| `POST /periods/:month/reopen` | `period.reopen` | — | [`src/modules/periods/periods.controller.ts:185`](../../src/modules/periods/periods.controller.ts#L185) `postPeriodsMonthReopen` |  |
| `GET /periods/:month/verify` | `audit.read` | — | [`src/modules/periods/periods.controller.ts:215`](../../src/modules/periods/periods.controller.ts#L215) `getPeriodsMonthVerify` |  |
| `GET /positions` | `config.read` | — | [`src/modules/positions/positions.controller.ts:20`](../../src/modules/positions/positions.controller.ts#L20) `listPositions` | ?month= (config.read) |
| `POST /positions` | `config.read` | — | [`src/modules/positions/positions.controller.ts:32`](../../src/modules/positions/positions.controller.ts#L32) `addPosition` | thêm chức vụ bằng sao chép |
| `POST /positions/:code/levels` | `config.payroll` | — | [`src/modules/positions/positions.controller.ts:40`](../../src/modules/positions/positions.controller.ts#L40) `addLevel` | thêm bậc cho một chức vụ |
| `GET /punch` | đã đăng nhập | — | [`src/modules/attendance/attendance.controller.ts:44`](../../src/modules/attendance/attendance.controller.ts#L44) `getPunch` |  |
| `POST /punch` | đã đăng nhập | `attendance` (tháng: ngày công của lượt (ca đêm thuộc ngày bắt đầu)) | [`src/modules/attendance/attendance.controller.ts:60`](../../src/modules/attendance/attendance.controller.ts#L60) `postPunch` |  |
| `GET /roles` | `roles.manage` | — | [`src/modules/roles/roles.controller.ts:18`](../../src/modules/roles/roles.controller.ts#L18) `list` | danh sách vai trò mặc định + tuỳ chỉnh, khu vực của ma trận, loại yêu cầu duyệt, tài khoản |
| `POST /roles` | `roles.manage` | — | [`src/modules/roles/roles.controller.ts:24`](../../src/modules/roles/roles.controller.ts#L24) `create` | { label, copyFrom?, code?, caps? \| levels?+extras?, approvals?, scope?, reason? } tạo hoặc sao chép |
| `PUT /roles/:code` | `roles.manage` | — | [`src/modules/roles/roles.controller.ts:30`](../../src/modules/roles/roles.controller.ts#L30) `update` | { rev, label?, caps? \| levels?+extras?, approvals?, scope?, reason } sửa vai trò tuỳ chỉnh |
| `POST /roles/:code/deprecate` | `roles.manage` | — | [`src/modules/roles/roles.controller.ts:36`](../../src/modules/roles/roles.controller.ts#L36) `deprecate` | { rev, reason } ngưng dùng (không xoá) |
| `GET /settings/first-run` | `config.read` | — | [`src/modules/settings/settings.controller.ts:177`](../../src/modules/settings/settings.controller.ts#L177) `getSettingsFirstRun` |  |
| `PUT /settings/geofence` | `config.payroll` | — | [`src/modules/settings/settings.controller.ts:137`](../../src/modules/settings/settings.controller.ts#L137) `putSettingsGeofence` |  |
| `GET /settings/params` | `config.read` | — | [`src/modules/settings/settings.controller.ts:164`](../../src/modules/settings/settings.controller.ts#L164) `getSettingsParams` |  |
| `PUT /settings/params` | `config.read` | — | [`src/modules/settings/settings.controller.ts:189`](../../src/modules/settings/settings.controller.ts#L189) `putSettingsParams` |  |
| `POST /settings/params/preview` | `config.read` | — | [`src/modules/settings/settings.controller.ts:207`](../../src/modules/settings/settings.controller.ts#L207) `postSettingsParamsPreview` |  |
| `POST /settings/params/revert` | `config.read` | — | [`src/modules/settings/settings.controller.ts:212`](../../src/modules/settings/settings.controller.ts#L212) `postSettingsParamsRevert` |  |
| `GET /settings/shifts` | `config.read` | — | [`src/modules/settings/settings-shifts.controller.ts:27`](../../src/modules/settings/settings-shifts.controller.ts#L27) `get` | ?month= → { month, paramsRev, editable, hours, shifts: [{ code, preset, name, kind, in, out }] } |
| `PUT /settings/shifts` | `config.read` | — | [`src/modules/settings/settings-shifts.controller.ts:35`](../../src/modules/settings/settings-shifts.controller.ts#L35) `put` | { shifts: [{ code, in, out }], effectiveMonth?, reason, expectedRev? } → như lưu tham số |
| `GET /settings/version` | đã đăng nhập | — | [`src/modules/settings/settings.controller.ts:182`](../../src/modules/settings/settings.controller.ts#L182) `getSettingsVersion` |  |
| `GET /sheet` | `self-or:attendance.read` | — | [`src/modules/sheet/sheet.controller.ts:53`](../../src/modules/sheet/sheet.controller.ts#L53) `getSheet` |  |
| `PUT /sheet` | đã đăng nhập | `attendance` (tháng: body.month) | [`src/modules/sheet/sheet.controller.ts:107`](../../src/modules/sheet/sheet.controller.ts#L107) `putSheet` |  |
| `PUT /sheet/bulk` | `request.decide.*` | `attendance` (tháng: body.month) | [`src/modules/sheet/sheet.controller.ts:164`](../../src/modules/sheet/sheet.controller.ts#L164) `putSheetBulk` |  |
| `GET /slip-override` | `payroll.override` | — | [`src/modules/periods/periods.controller.ts:32`](../../src/modules/periods/periods.controller.ts#L32) `getSlipOverride` |  |
| `PUT /slip-override` | `payroll.override` | `slip` (tháng: body.month) | [`src/modules/periods/periods.controller.ts:75`](../../src/modules/periods/periods.controller.ts#L75) `putSlipOverride` |  |
| `GET /staff` | `profile.read` | — | [`src/modules/staff/staff.controller.ts:42`](../../src/modules/staff/staff.controller.ts#L42) `getStaff` |  |
| `PUT /staff/:u` | `profile.write` | — | [`src/modules/staff/staff.controller.ts:228`](../../src/modules/staff/staff.controller.ts#L228) `putStaff` |  |
| `POST /staff/:u/password` | `roles.manage` | — | [`src/modules/staff/staff.controller.ts:103`](../../src/modules/staff/staff.controller.ts#L103) `postStaffPassword` |  |
| `PUT /staff/:u/roles` | `roles.manage` | — | [`src/modules/staff/staff.controller.ts:139`](../../src/modules/staff/staff.controller.ts#L139) `putStaffRoles` |  |
| `GET /staff/:u/schedule` | `self-or:profile.read` | — | [`src/modules/staff/staff.controller.ts:585`](../../src/modules/staff/staff.controller.ts#L585) `getStaffSchedule` | ?month= lịch làm việc hiệu lực của một người (self-or:profile.read); kiểm quyền TRƯỚC khi tra tên để không dò được tên đăng nhập |
| `PUT /staff/shift-bulk` | `profile.write` | — | [`src/modules/sheet/sheet.controller.ts:174`](../../src/modules/sheet/sheet.controller.ts#L174) `putStaffShiftBulk` |  |
| `GET /team` | `payroll.view` | — | [`src/modules/staff/staff.controller.ts:55`](../../src/modules/staff/staff.controller.ts#L55) `getTeam` |  |
| `GET /today` | `attendance.read` | — | [`src/modules/attendance/attendance.controller.ts:296`](../../src/modules/attendance/attendance.controller.ts#L296) `getToday` |  |
