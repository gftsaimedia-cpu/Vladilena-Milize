# Audit task trong plan (đợt 2): sản phẩm chính có trong code không

Ngày: 2026-11-05. Phạm vi: 11 plan trong `docs/superpowers/plans/`, tổng 94 task.
Cách kiểm: đường dẫn file, tên hàm/class/route/component và tên test trong plan, tìm bằng grep trong `src/`, `web/src/`, `test/v2/`, `web/tests/`. Khi plan đã đổi thiết kế thì đối chiếu với `git log`.
Mức kiểm: có/không có symbol, file, route, test. Chưa chạy test, chưa đọc sâu logic từng task.

Nhãn: OK = sản phẩm có trong code. Thiếu = không tìm thấy. Bỏ có chủ đích = plan ghi rõ đã bỏ và code khớp.

Ghi chú chung: nhiều plan tách file theo kiểu khác với code hiện tại (gộp file, đổi tên hàm). Các trường hợp này vẫn ghi OK, kèm ghi chú.

## 1. 2026-11-04-reference-allowances (1 task)

| Task | Nhãn | Bằng chứng |
|---|---|---|
| 1. Allowance calculation regression coverage and implementation | OK | `src/modules/payroll/domain/employee-payslip.ts:377-380` (makeupShortfallDays, keepsDiligence ngưỡng 5 ngày vắng); `src/modules/attendance/attendance-days.repository.ts:227` join `work_schedules as ws` lấy `schedule_type` (plan ghi là join trong payroll.repository, nay nằm ở attendance-days, ghi chú vị trí khác); `src/modules/payroll/domain/allowance-rates.ts:32-34` nightAllowancePct 60/40 |

## 2. 2026-11-05-me-apis (9 task)

| Task | Nhãn | Bằng chứng |
|---|---|---|
| 1. Khung module `me`, quy tắc danh tính | OK | `src/modules/me/me.controller.ts:29-31` hàm `who()` ném UnauthorizedError; `test/v2/me-controller.test.ts:53` "every handler only needs a session", `:60` "ignores foreign ids" (test gộp vào me-controller, không có me-identity.test.ts) |
| 2. GET /me/profile | OK | `src/modules/me/me.controller.ts:122` `@Get('profile')`; logic nằm inline, không có `domain/profile.ts` (ghi chú) |
| 3. Đơn từ của tôi | OK | `me.controller.ts:225,238` routes requests và requests/:id; `src/modules/me/domain/me-views.ts:162` stepsOf |
| 4. Chấm công hôm nay | OK | `me.controller.ts:141` `@Get('today')`, `:169` `@Post('punches')` |
| 5. Công tháng | OK | `me.controller.ts:192,207` attendance và attendance/:date; `me-views.ts:122` monthOf |
| 6. Thu nhập | OK | `me.controller.ts:305` `@Get('income')`; `src/modules/me/domain/me-income.ts:6` estimateIncomeOf |
| 7. KPI tự chấm | Bỏ có chủ đích | `docs/superpowers/plans/2026-11-05-me-apis.md:93-96` ghi "Đã bỏ (người dùng chốt 05/11/2026)"; không có route `kpi` trong `me.controller.ts`; `test/v2/me-controller.test.ts:521` "there is no route for scoring my own KPI" |
| 8. FE app nhân viên | OK | `web/src/builders/api/staff-phone.ts` có mặt; `web/src/services/staff-desktop.ts` đã xoá có chủ đích ở commit `32cc78e` (bỏ trang /nv-may-tinh cũ); không còn đường V1 `/punch`, `/kpi/scores` trong web/src |
| 9. Playwright với BE thật | OK | `web/tests/api/staff-app.spec.ts` |

## 3. 2026-11-05-payroll-period-lifecycle (7 task)

| Task | Nhãn | Bằng chứng |
|---|---|---|
| 1. Domain của kỳ | OK | `src/modules/periods/domain/period-state.ts`, `payday.ts`, `request-months.ts`, `periods.errors.ts` (BEFORE_PAYDAY, PERIOD_BLOCKED, PERIOD_LOCKED, PERIOD_STATE, REASON_REQUIRED) |
| 2. Schema, PeriodsRepository, PeriodGate | OK | `migrations/postgres/schema.sql:76` CHECK có đủ 5 trạng thái, không còn reviewed_by/reviewed_at trong `payroll_periods`; `src/database/schema.ts:141` PayrollPeriodsTable; `src/modules/periods/period-gate.ts` |
| 3. PeriodsService, controller, module; gỡ phần kỳ khỏi system | OK | `src/modules/periods/periods.service.ts:72,120,128`; `src/modules/periods/periods.controller.ts`; `src/app.module.ts` có PeriodsModule; không còn listPeriods/getPeriod/lockPeriod trong `src/modules/system/` |
| 4. Nối với Bảng lương | OK | `src/modules/payroll/payroll.service.ts` (PeriodsService, markCalculated, resetDecision); `src/modules/payroll/payroll.errors.ts` PayrollFinalizedError; `payroll.controller.ts` map PAYROLL_FINALIZED |
| 5. Phê duyệt, Huỷ phê duyệt, Đã trả lương | OK | `periods.service.ts:144` approve, `:168` unapprove, `:186` pay; `periods.controller.ts` approvePeriod, unapprovePeriod, payPeriod; `test/v2/auth-access.test.ts:57-59` quyền payroll.approve |
| 6. Cổng kỳ ở chấm công và ngày lễ | OK | `src/modules/attendance/attendance.service.ts` periodGate (PERIOD_LOCKED); `src/modules/holidays/holidays.service.ts` PeriodGate; `test/v2/periods-gate-attendance.pg.test.ts` |
| 7. Cổng kỳ ở đơn từ và tự tính lại khi duyệt đơn | OK | `src/modules/requests/requests.service.ts` reviewAndRecalculate, PERIOD_LOCKED; `requests.controller.ts:240` trả recalculated; `test/v2/requests-period.pg.test.ts` |

## 4. 2026-11-05-payslip-a4-redesign (5 task)

| Task | Nhãn | Bằng chứng |
|---|---|---|
| 1. Dữ liệu giả tháng mẫu | OK | `web/src/mock/payslip-a4.ts` (A4Sheet, A4Line, A4Day); `web/tests/payslip-a4-data.spec.ts` |
| 2. Hàm định dạng của bản in | OK | `web/src/views/print/parts/a4-format.ts:7,10,13,16,23,26,29,40,46` blankNum, signedText, inOutText, qtyText, ruleText, actualText, scoreText, periodLine, staffLine |
| 3. Nối dữ liệu giả, khung tờ, đầu hai trang | OK | `web/src/services/payslip.ts:16` getPayslipSheet; `web/src/views/print/A4Payslip.vue` (43 dòng, dùng A4Attendance và A4Summary) |
| 4. Trang 1 · bảng chấm công | OK | `web/src/views/print/parts/A4Attendance.vue` (298 dòng) |
| 5. Trang 2 · các khoản, Thực nhận, chữ ký | OK | `web/src/views/print/parts/A4Summary.vue` (244 dòng) |

## 5. 2026-11-05-payslip-print (6 task)

| Task | Nhãn | Bằng chứng |
|---|---|---|
| 1. "Từ chối" không còn 500 và lưu lý do | OK | `migrations/postgres/schema.sql:104` CHECK status có 'rejected'; `src/modules/payroll/payroll.service.ts:292-316` decidePayslip lưu note; `test/v2/payroll-decision.test.ts` |
| 2. Loại, bậc, trạng thái nhân sự và phép năm còn lại | OK | `src/modules/payroll/payroll.repository.ts:104` mapMonthRows; `:128` isDormResident; không còn `|| 22` trong `src/modules/payroll` |
| 3. Giờ vào/ra thật trên dòng ngày | OK | `src/modules/payroll/domain/presence.ts`; `payroll.repository.ts:48,152` actualCheckIn; `test/v2/payroll-presence.test.ts` |
| 4. OT theo luật 04/11, tính từng ngày | OK | `src/modules/payroll/domain/overtime-pay.ts:113` OT_BUCKET_OF; `employee-payslip.ts:143` otPayTotal; `test/v2/payroll-overtime.test.ts` |
| 5. Hợp đồng API và 5 file yêu cầu FE | OK | `docs/api/v2-contract.md:1115` POST .../:username/decision; `docs/fe-yeu-cau/` có đủ 5 file (bang-luong--in-tat-ca.md, in-phieu-luong-a4--noi-api-v2.md, phieu-luong-ngan-keo x3) |
| 6. Số còn thiếu cho trang A4 mới | OK | `payroll.service.ts` dayOfWeekText; `overtime-pay.ts` otLinePayByRate:120; `employee-payslip.ts:144` dayRate; mục "Chưa quyết" về tiền OT đã bỏ trong `docs/fe-yeu-cau/in-phieu-luong-a4--noi-api-v2.md:21` |

## 6. 2026-11-05-positions-settings (10 task)

| Task | Nhãn | Bằng chứng |
|---|---|---|
| 1. Logic thuần: chuỗi phiên bản, kiểm số | OK | `src/modules/positions/domain/version-chain.ts`, `position-input.ts` (SaveLevelInput:19), `positions.errors.ts`; `test/v2/positions-domain.test.ts` |
| 2. Repository ghi phiên bản, danh mục kèm ô tick | OK | `src/modules/positions/positions.repository.ts`; `src/modules/employees/employees.repository.ts:463` listPositionCatalog |
| 3. Service, controller, đăng ký module | OK | `src/modules/positions/positions.service.ts`, `positions.controller.ts`, `positions.module.ts`; `test/v2/positions-service.test.ts` |
| 4. Lương đọc 4 mức % từ phiên bản chức vụ | OK | `src/modules/payroll/domain/allowance-rates.ts:2-8` AllowanceRates (flex, typeNight, levelNight, travel, attendance); `payroll.repository.ts:132-135` đọc từ typeRow và levelRow |
| 5. Builder FE cho hai màn | OK | `web/src/builders/api/catalog.ts`, `web/src/builders/api/benefits.ts`; `web/src/builders/api/staff.ts:56` activeOn; `web/src/builders/admin-catalog/positions.ts:13` leaveAccount 'Nghỉ phép năm' |
| 6. Dịch vụ FE và dữ liệu giả | OK | `web/src/mock/positions.ts`; `web/src/mock/accounts.ts:19` ADMIN_CAPS có 'config.write'; `getAllowanceFlags` không còn trong web/src |
| 7. Chặn từ màn hình ở Chức vụ và bậc | OK | `web/src/views/admin/settings/fields/FieldNum.vue`, `positions/PositionDialog.vue`, `positions/LevelDialog.vue`, `PositionsView.vue` có mặt (chỉ kiểm tồn tại, chưa đọc logic chặn) |
| 8. Màn Chế độ mỗi loại một dòng và hộp xác nhận | OK | `web/src/views/admin/settings/BenefitsView.vue` import ConfirmDialog; `benefits/ConfirmDialog.vue`; `fields/SaveBar.vue:10` prop saveLabel |
| 9. Test giao diện cho hai màn | OK | `web/tests/settings-positions.spec.ts` |
| 10. Xác minh toàn nhánh | OK | Mục kiểm, không có sản phẩm riêng |

## 7. 2026-11-05-settings-store-be (14 task)

| Task | Nhãn | Bằng chứng |
|---|---|---|
| 1. Phần dùng chung: chuỗi phiên bản, danh mục ca, helper DB tạm | OK | `src/common/version-chain.ts`, `src/common/shift-catalog.ts:13` SHIFT_CATALOG; `test/v2/helpers/pg-temp-db.ts`; `test/v2/positions-repository.pg.test.ts:10` import withTempDb |
| 2. Lược đồ | OK | `migrations/postgres/schema.sql`; `src/database/schema.ts`; `test/v2/settings-schema.pg.test.ts` |
| 3. Danh mục nhóm và kiểm giá trị | OK | `src/modules/settings/domain/setting-groups.ts:91` SETTING_GROUPS; `src/modules/settings/settings.errors.ts` |
| 4. Các hàm thuần còn lại | OK | `src/modules/settings/domain/settings-input.ts:15-39`; `work-week.ts:5,10,21`; `attendance-zone.ts:32,40`; `pay-days.ts:4` payDateOf; `min-month.ts:4` minMonthFrom |
| 5. Repository và SettingsReader | OK | `src/modules/settings/settings.repository.ts:45`; `settings-reader.ts:42` |
| 6. Service: 6 nhóm số, lịch sử, ngày trả lương | OK | `src/modules/settings/settings.service.ts:79` SettingsService |
| 7. Service: tuần làm việc riêng và vùng chấm công | OK | `settings.service.ts`; `attendance-zone.ts:40` validateZone |
| 8. Controller, module, quyền truy cập | OK | `src/modules/settings/settings.controller.ts:24-94` routes /api/v2/settings; `src/app.module.ts` import SettingsModule |
| 9. Chấm công: ân hạn đi trễ, vùng, ngày làm | OK | `src/modules/attendance/attendance.errors.ts`; `attendance-settings.port.ts:8` ân hạn; `test/v2/attendance-settings.test.ts` |
| 10. Danh mục ca trả giờ, fallback giờ ca | OK | `src/modules/employees/employees.service.ts` getShiftsCatalog |
| 11. Đơn từ theo tuần của từng người | OK | `src/modules/requests/requests.repository.ts:71` FALLBACK_SHIFT, `:342` findStaffContext; `src/modules/requests/staff-week.ts` |
| 12. App nhân viên (cổng đã vào main) | OK | `src/modules/me/domain/me-views.ts`; `src/modules/me/me.controller.ts:249` request-context, `:305` income |
| 13. Tính lương đọc kho cài đặt | OK | `test/v2/payroll-settings.test.ts` có mặt; `src/modules/payroll/payroll.service.ts` (chỉ kiểm tồn tại, chưa đọc sâu) |
| 14. Xác minh toàn nhánh | OK | Mục kiểm, không có sản phẩm riêng |

## 8. 2026-11-05-settings-store-fe (17 task)

| Task | Nhãn | Bằng chứng |
|---|---|---|
| 1. Kho giả mock/settings.ts | OK | `web/src/mock/settings.ts`; `web/src/builders/api/settings.ts:7` GROUP_PATH; `web/tests/settings-mock.spec.ts` |
| 2. Builder hiển thị chung | OK | `web/src/builders/api/settings.ts`; `web/tests/settings-builders.spec.ts` |
| 3. Dịch vụ settings-store và trang Lịch (đọc) | OK | `web/src/services/settings-store.ts`; `web/src/views/admin/settings/CalendarView.vue:18` import từ settings-store |
| 4. Thẻ Ngày trả lương, hộp xác nhận, useSettingsDraft | OK | `web/src/views/admin/settings/fields/SaveConfirmDialog.vue`; `lib/useSettingsDraft.ts`; `fields/FieldNum.vue:21` prop decimals |
| 5. Thẻ Vùng chấm công | OK | `CalendarView.vue:388` ô vĩ độ với decimals |
| 6. Quy tắc KPI chỉ xem | OK | `web/src/views/admin/settings/KpiRulesView.vue`; `web/src/builders/api/settings-screens.ts`; `getKpiRules` không còn trong web/src |
| 7. Tuần làm việc trong hồ sơ nhân sự | OK | `web/src/views/admin/staff/parts/WorkWeekDialog.vue`; `web/tests/staff-work-week.spec.ts` |
| 8. Cách tính lương: danh sách và 5 ngăn kéo | OK | `web/src/views/admin/settings/PayFormulaView.vue`; `pay/PayDrawer.vue`; `getPayFormula`, `getPayDrawer`, `savePayDrawer` không còn trong web/src |
| 9. Ngăn kéo Lương KPI | OK | `pay/PayDrawer.vue`; `web/tests/settings-pay.spec.ts` |
| 10. Tất cả cài đặt: nhóm, mục, lưu, tìm kiếm | OK | `web/src/views/admin/settings/AllSettingsView.vue`; `all/SettingItem.vue`; `getAllSettings`, `saveAllSettings` không còn. Các mục "Bỏ" (dải vàng, bộ lọc, chữ "sắp có") không còn trong views/admin/settings (`plan:1092`) |
| 11. Bảng biểu thuế 5 bậc | OK | `web/src/views/admin/settings/all/SettingItem.vue`; `web/tests/settings-search.spec.ts` |
| 12. Lịch sử và Hoàn tác | OK | `all/RevertDialog.vue:10` import revertLines/revertMonth/revertValues từ builders; `revertSetting`, `revertParam`, `previewParams` không còn trong web/src |
| 13. Dọn chữ và mã cũ | OK | `SaveBar.vue:10` saveLabel mặc định 'Lưu'; `getSettingsBadges`, `useLoad`, `cnt2` không còn trong `SettingsFrame.vue` |
| 14. checkInLock và khoảng cách (thuần) | OK | `web/src/builders/api/check-in.ts:20` checkInLock; `web/tests/check-in-lock.spec.ts` |
| 15. Khoá nút chấm công trong app nhân viên | OK | Plan ghi `locate()`; code có `watchLocation` trong `web/src/services/staff-phone.ts` (~dòng 105), đổi tên và thiết kế lại ở commit `093c540`; `ShiftCard.vue:13,42` dùng checkInLock; `web/playwright.config.ts:17-18` geolocation |
| 16. Chữ "nghỉ" và ngày trả lương | OK | `WeekCard.vue:27` và `MonthCalendar.vue:31` class off-cap; `HomeView.vue:52` và `NetCard.vue:20` "trả ngày"; `builders/api/staff-phone.ts:338` payDate |
| 17. Lưới chấm công Admin theo tuần từng người | OK | `web/src/builders/api/attendance.ts:63-66` baseCell có weekdays; `web/tests/attendance-weekdays.spec.ts` |

## 9. 2026-11-05-staff-desktop-one-page (7 task)

| Task | Nhãn | Bằng chứng |
|---|---|---|
| 1. Dữ liệu chung và ba thân hộp (phía điện thoại) | OK | `web/src/views/staff-phone/components/DayBody.vue`, `RequestBody.vue`, `PasswordForm.vue`; `web/tests/staff-phone-requests.spec.ts` |
| 2. Chọn giao diện theo bề ngang, thanh trên, menu tài khoản | OK | `web/src/composables/useStaffDesktop.ts:9`; `web/src/layouts/StaffLayout.vue`; `web/src/views/staff-desktop/parts/DesktopBar.vue`; `web/src/styles/staff-desktop.css` |
| 3. Ngăn kéo phải và đọc URL | OK | `web/src/views/staff-desktop/useDesktopDetail.ts:15`; `parts/SideDrawer.vue`; `web/tests/staff-desktop-drawers.spec.ts` |
| 4. Cột 1 · Hôm nay và Yêu cầu | OK | `web/src/views/staff-desktop/parts/TodayColumn.vue`; `staff-phone/components/ShiftCard.vue`, `WeekCard.vue`, `RequestList.vue`; `web/tests/staff-desktop-today.spec.ts` |
| 5. Cột 2 · Chấm công | OK | `parts/AttendanceColumn.vue`; `staff-phone/components/MonthTiles.vue`, `MonthCalendar.vue`, `RecentDays.vue`; `web/tests/staff-desktop-attendance.spec.ts` |
| 6. Cột 3 · Thu nhập | OK | `parts/IncomeColumn.vue`; `staff-phone/components/NetCard.vue`, `KpiCard.vue`, `IncomeLines.vue`; `web/tests/staff-desktop-income.spec.ts` |
| 7. Xoá mã cũ, mục lục thiết kế, chạy toàn bộ | OK | `web/src/design-index/staff-desktop.ts`; `web/tests/staff-desktop-shell.spec.ts`; `web/src/services/staff-desktop.ts` đã xoá ở `32cc78e` |

## 10. 2026-11-05-staff-requests-fe-mock (5 task)

| Task | Nhãn | Bằng chứng |
|---|---|---|
| 1. Data layer: mock store, service, builder | OK | `web/src/mock/staff-requests.ts`, `web/src/services/staff-requests.ts`, `web/src/builders/api/staff-requests.ts`; `web/src/builders/api/staff-phone.ts:135` CANCELLED -> 'cancel'; `test/v2/fe-staff-requests.test.ts` |
| 2. Create flow, menu J8, form nghỉ | OK | `web/src/views/staff-requests/NewRequestBody.vue`, `LeaveForm.vue`, `useNewRequest.ts`; `web/tests/staff-requests-create.spec.ts` |
| 3. Năm form còn lại | OK | `web/src/views/staff-requests/MakeupLeaveForm.vue`, `OvertimeForm.vue`, `ShiftChangeForm.vue`, `ExplanationForm.vue`, `AdvanceForm.vue`; `web/tests/staff-requests-forms.spec.ts` |
| 4. Điểm vào và huỷ | OK | `web/tests/staff-requests-entry.spec.ts`; `web/src/mock/staff-phone.ts:9` import dueOf, remindersOf |
| 5. Chuông Admin: nhắc giữ mục, không còn "Khai thay" | OK | `web/src/components/shell/BellDetail.vue:177` nút "Nhắc giải trình" / "Nhắc lại"; không còn "Khai thay" trong web/src; `web/tests/admin-bell.spec.ts` |

## 11. 2026-11-05-staff-requests (13 task, Task 0 đến 12)

| Task | Nhãn | Bằng chứng |
|---|---|---|
| 0. Chuẩn bị nhánh | OK | Mục chuẩn bị nhánh, không có sản phẩm riêng |
| 1. Luật nộp đơn thuần | OK | `src/modules/requests/domain/filing-rules.ts:7,10,19` FiledBy, filingWindow, isWholeHour; `test/v2/requests-filing-rules.test.ts` |
| 2. Phát hiện trường hợp giải trình | OK | `src/modules/requests/domain/explanation-detect.ts:20` explanationCasesOf; `test/v2/requests-explanation-detect.test.ts` |
| 3. Tách create, tiêu đề server, xem trước | OK | `src/modules/requests/requests.service.ts:67,81` requestTitle, `ok`, `title` do server đặt; `test/v2/requests-preview.test.ts` |
| 4. Luật khi nhân viên tự nộp (filedBy 'self') | OK | `requests.service.ts:71-73` filedBy; `filing-rules.ts:7` 'self' \| 'admin'; `test/v2/requests-self-filing.test.ts` |
| 5. Tạm ứng do server tính | OK | `src/modules/payroll/domain/advance-quote.ts:8` AdvanceQuote; `requests.service.ts:627` createAdvanceRequest; `requests.controller.ts:105-109` createAdvance chỉ nhận employeeId và period |
| 6. Bảng explanation_reminders và repository | OK | `migrations/postgres/schema.sql`; `src/database/schema.ts`; `src/modules/requests/explanation-reminders.repository.ts`; `test/v2/explanation-reminders.pg.test.ts` |
| 7. Ngày cần giải trình và đơn giải trình theo luật mới | OK | `src/modules/requests/load-days.ts:18` loadEmployeeDays (plan gọi là loadDays, đã tách); `requests.service.ts:434-442` loadDays chỉ gọi lại; `src/modules/requests/explanations.service.ts:119` ExplanationsService; `requests.service.ts:1103` planExplanation |
| 8. Lời nhắc và route Admin | OK | `requests.controller.ts:177` GET explanations-due; `:189` POST explanations-due/remind |
| 9. requestContext và số phép dùng chung | OK | `src/modules/requests/domain/request-context.ts:38` RequestContextDTO; `requests.service.ts:505` requestContext |
| 10. Route /me và tài liệu API | OK | `src/modules/me/me.controller.ts:249` request-context; `test/v2/me-controller.test.ts` |
| 11. Nối FE với BE | OK | `web/src/services/staff-requests.ts:2,25` nhánh máy chủ thật, getRequestContext; `web/src/builders/api/inbox.ts` inboxFromDue; `web/src/services/admin-main.ts:5,127` |
| 12. Xác minh toàn bộ | OK | Mục kiểm, không có sản phẩm riêng. Ruling R-P9 đã bỏ có chủ đích (`docs/superpowers/plans/2026-11-05-staff-requests.md:77`), không thuộc task nào |

## Tổng kết

- OK: 93
- Thiếu: 0
- Bỏ có chủ đích: 1 (me-apis Task 7, KPI tự chấm)

Ngoài ra có 1 ruling đã bỏ ở staff-requests (R-P9) và một phần "Bỏ" trong settings-store-fe Task 10. Hai mục này không phải task riêng nên không tính vào số trên.

## Chưa chắc

- Đây là kiểm tra sự hiện diện. Không chạy test và không đọc logic từng task. Nhiều task có thể đúng về tên nhưng sai về hành vi.
- Các task "Xác minh toàn bộ" hoặc "Chuẩn bị nhánh" (positions 10, settings-be 14, staff-requests 0 và 12) không có sản phẩm riêng nên ghi OK theo quy ước.
- Có vài chênh lệch vị trí: me-apis tách file domain và test theo kiểu khác, reference-allowances join work_schedules ở attendance-days. Đã ghi chú trong bảng.
- settings-store-fe Task 15 đổi `locate()` thành `watchLocation`. Đây là thay đổi thiết kế, không phải thiếu.
- Chưa xác minh chi tiết: logic chặn trong positions Task 7, nội dung từng màn FE, và các test cụ thể trong settings-store-be Task 9 và Task 13.
