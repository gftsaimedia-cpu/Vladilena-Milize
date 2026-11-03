# Bộ máy tính lương (payroll engine)

Tài liệu mô tả code **đang làm gì**, viết từ code (không từ comment). Số dòng `file:dòng` đúng với code hiện tại; nếu lệch vài dòng thì tìm theo tên hàm hoặc tên biến. Đường dẫn test có tiền tố ngày được ghi bằng dấu `*` (ví dụ `test/unit/*(đã bỏ)`).

---

## 1. Phạm vi và file

Bộ máy là một khối module UMD/IIFE trong `public/`, dùng chung trình duyệt và Node (`require`). Máy chủ là nơi duy nhất tính tiền chính thức; trình duyệt nạp lại cùng file để hiển thị. Mọi module đều thuần: không I/O, không DOM, không con số nghiệp vụ viết cứng (số đến từ bộ tham số phẳng). Ngoại lệ về đồng hồ: `calcMonth` khi nhận `upTo === undefined` thì đọc đồng hồ của máy chủ để lấy ngày đang chạy (`payroll-engine.ts`); `computeMonth` luôn truyền `upTo` từ đầu vào.

### 1.1 File lõi (trình duyệt + máy chủ)

| File | Vai trò |
| --- | --- |
| `src/engine/payroll-engine.ts` | Lõi: `calcDay` :390, `calcMonth` :631, `finishMonth` :802, `netFrame` :1069, `calcNet` :1127, `repinMonth` :1132, `prepare` :1544, `computeMonth` :1550, `create` :1594. `ENGINE_VERSION = 'payroll-engine-14'` :48. Chứa `BUILTINS`, `VARIABLES`, `FORMULAS` (dữ liệu từ vựng công thức). |
| `src/engine/payroll-day-parts.ts` | `partsOfDay` :11 (các thành phần có tên của một dòng ngày), `columnsOfDay` :30 (bốn cột tiền của phiếu), `DAY_VARIABLES` :51, `dayArraysOf` :119. Engine nạp qua `DEPS.PayrollDayParts`. |
| `src/engine/payroll-params.ts` | `DEFAULTS`, `resolveParamSet` :1086, `derive` :1117, `OVERRIDES` :986, `entitlement` :994, `overlay` :1004, `LATE_KEYS` :1020, `fillLate` :1041, `buildParamClasses` :1137, `typeKeyOf` :981. |
| `src/engine/payroll-calendar.ts` | Tách giờ theo ngày dân sự: `splitMainWork` :53 (ca chính), `splitExtraWork` :112 (đoạn OT / làm bù). |
| `src/engine/work-schedule.ts` | Lịch làm việc một nguồn: `scheduleOf` :110, `isWorkDay` :142, `isRestDay` :145, `workdaysOf` :162, `monthView` :170, `forPerson` :188, `validate` :248. |
| `src/engine/approval-view.ts` | Áp khoản tự khai theo trạng thái duyệt: `itemOf` :143, `effectiveStatus` :182, `applyAction` :190, `payView` :234. |
| `src/engine/actual-hours.ts` | Giờ công từ Check-in/out: `cutMin` :174, `analyseShift` :215, `cutsOf` :248, `clipExtra` :264, `holidayWindow` :304, `LOCKED_FIELDS` :313, `inspectDay` :352, `bestShift` :387, `punchTimesOf` :417, `apply` :432. |
| `src/engine/punch.ts` | Ca cố định, múi giờ, bảng đổi mã ca (engine và actual-hours nạp qua `PunchRules`). |
| `src/engine/pay-options-calc.ts` | Phương án cách tính: `levelView` :19, `adjustBase` :39, `roundShort` :52, `tiered` :60, `advanceBase` :71, `advanceEligible` :74. |
| `src/engine/pay-tail-calc.ts` | Phần đuôi (bảo hiểm, thuế): `assertAvailable` :50, `assertParams` :59, `insuranceBase` :86, `taxMethodOf` :111, `ariseThreshold` :114. |
| `src/engine/pay-blocks-calc.ts` | Khối phụ cấp C&B thêm: `amountOf` :48, `lostOf` :68, `attach` :100, `sumsOf` :112, `mergeSums` :125. |
| `src/engine/pay-entries-calc.ts` | Khoản cộng/trừ điền thêm theo tháng: `sums` :41, `attach` :72, `sumsOf` :79, `netOf` :82. |
| `src/engine/kpi-score.ts` | KPI năm thành phần: `checkScore` :51, `pay` :64, `evaluate` :105. |
| `src/engine/leave.ts` | Phép năm: `accrued` :63, `counted` :108, `ledger` :132, `settlementFor` :160. |
| `src/engine/payroll-pins.ts` | Ghim ô số lượng trên phiếu: `pinsOf` :38, `apply` :50, `kpiInput` :136. |
| `src/engine/formula.ts` | Cây công thức: `evaluate` :1758, `validate` :1878, `parse` :2708, `serialize` :1610, `deserialize` :1630, `dependencies` :1723, `describe` :1745. |
| `src/engine/formula-vocab.ts` | Từ vựng công thức (sinh bằng `scripts/params/gen-formula-vocab.ts`). |
| `src/engine/payroll-graph.ts` | Bảy công thức tháng mặc định bằng chữ (`TEXTS`, `ORDER`), `treesWith` :125, `validateTree` :116, `extraVariables` :133, `contextFor` :163, `evalNamed` :185. |

### 1.2 File máy chủ

| File | Vai trò |
| --- | --- |
| `src/params/store.ts` | Bộ tham số hiệu lực của tháng: `resolveUncached` :37, `resolve` :108 (bộ nhớ đệm tối đa 64 mục), `view` :240, `firstRun` :456. |
| `src/params/save.ts` | Lưu / xem trước / hoàn tác tham số: `preview` :632, `save` :704, `revert` :850, `addPosition` :880. |
| `src/params/validate.ts` | Kiểm giá trị và công thức: `checkFormula` :212, `shiftKindOf` :467, `crossChecks` :547. |
| `src/params/registry.ts`, `config-rev.ts`, `block-defs.ts`, `positions.ts`, `attributes.ts` | Mục registry, quyền ghi, số phiên bản cấu hình, định nghĩa khối phụ cấp, chức vụ, thuộc tính bậc. |
| `src/domain/payroll/policy.ts` | `PayrollPolicy.paramRows` (hai khoá chính sách + số tháng thâm niên), `tenureContract`, `contractFor`. |
| `src/domain/catalog-params.ts` | Dòng tham số sinh từ danh mục chức vụ / bậc / ca, kèm dòng chính sách. |
| `src/domain/payroll/payroll-service.ts` | Gom đầu vào: `kpiOf` :82, `payrollPeople` :106, `leaveSettlements` :144, `withPersonSchedules` :158, `loadInputs` :169; tính: `computeFor` :265, `digestOf` :294, `thanhPhanOf` :322. |
| `src/domain/period/periods.ts` | Vòng đời kỳ lương: `lockAttendance` :284, `slipOf` :320, `calculate` :347, `aiReview` :381, `decidePayslips` :421, `approve` :492, `markPaid` :516, `reopen` :528, `payslips` :772, `estimatesOfMonth` :832, `estimateOne` :883, `payslip` :938, `verify` :995, `allowanceStatus` :1055, `estimate` :1080. |
| `src/domain/payroll/slip-paid.ts` | Số chi trả của phiếu: `slipBasisOf` :33, `cellsOf` :65, `paidFigures` :97, `taxFromOf` :129, `staffPaidSnapshot` :195, `dayFiguresOf` :256, `withPunchTimes` :274, `staffDayNotesOf` :302. |
| `src/domain/payroll/slip-pins.ts` | `repinned` :10: tính lại bản chụp theo ô số lượng ghim. |
| `src/domain/payroll/slip-formulas.ts` | `formulasOf` :519: công thức dưới từng dòng "Chi tiết" của phiếu Admin. |
| `src/domain/advance/advance-cap.ts` | Mức tạm ứng tối đa: `figureFor` :22, `figuresOf` :41, `capOf` :51. |
| `src/domain/advance/` | `advance-approvals.ts` (trạng thái yêu cầu theo người theo tháng), `src/modules/advance/advance-approvals.handlers.ts` (route duyệt), `index.ts`. |
| `src/domain/explanation/` | Giải trình ngày công; `heldByUser` cho engine biết ngày bị giữ lương. |
| `src/domain/attendance/admin-presence.ts` | Lượt chấm công nguồn Admin (Admin khai thay giờ vào/ra, duyệt giải trình quên chấm). |
| `src/domain/isat-rule.ts` | Điều kiện hợp lệ của ngày iSAT (`isatRefusal`). |
| `src/domain/payroll/pay-entries.ts` | `approvedByUser(month)`: khoản điền thêm đã duyệt đưa vào engine. |
| `src/http/api-gate.ts`, `src/platform/authz.ts` | Route HTTP và bảng quyền `ROUTE_CAPS`. |
| `src/platform/events.ts`, `src/platform/audit.ts` | SSE và nhật ký (mục 5). |
| `src/platform/db.ts` | Bảng, khoá kỳ (`SCOPE_LOCKED_FROM` :1009, `assertPeriodOpen` :1080), `rowToStaff`. |
| `scripts/dev/sandbox-server.ts`, `sandbox-ops.ts` | Máy chủ thử nghiệm riêng và thao tác phụ trợ (mục 2.7). |

### 1.3 Nơi khác gọi bộ máy (ngoài phạm vi file này)

- `web/` là giao diện Vue; khi đã build thì `src/platform/http.ts` phục vụ `web/dist`. Thư mục này không thuộc tài liệu này.

---

## 2. Dữ liệu

### 2.1 Bảng DB (`src/platform/db.ts`)

| Bảng / nguồn | Dùng cho |
| --- | --- |
| `param_versions` | Dòng tham số do người dùng/hệ thống ghi: chỉ thêm (trigger chặn sửa, xoá), có `effectiveMonth`, `batch_id`, `id`, `createdBy`. |
| `settings` | `params_mode` (mặc định `defaults-only`), `config_rev`, `catalog_rev`, `holidays`, `agents_enabled`, khoá `advance_approvals_<YYYY-MM>` (yêu cầu tạm ứng), geofence. |
| `payroll_periods` | Trạng thái kỳ + `rev` (khoá lạc quan). |
| `payroll_runs` | Mỗi lần tính: `engineVersion`, `paramsHash`, `paramsRev`, `params_json`, `switches_json`, `inputsDigest`. |
| `payslips` | `snapshot_gz` (bản chụp `m`), `staff_terms_json` (hồ sơ lúc tính), `override_json`, `flags_json`, `status` (`draft`, `error`...), `errorCode`. |
| `slip_overrides` | Số Admin chỉnh trên phiếu (ô tiền và ô số lượng ghim). |
| `kpi_scores` | Điểm KPI năm thành phần, lưu số nguyên = điểm × 100. |
| `staff` | `type`, `level`, `contract`, `insured`, `dependants`, `tax_on`, `deduct_on`, `advance_on`, `start_date`, `resigned_on`, `idorm`, `night_pct`, `shift_code`, `leave_adjust`, `birthday`. |
| `explanations` | Giải trình ngày công; trạng thái `requested`, `answered`, `rejected`, `approved`. |
| chấm công | Phiên chấm công (`listSessions`) với `entry` (`presIn`, `presOut`, `plannedShift`, `origin`, `reason`). |

`rowToStaff` (`src/platform/db.ts`): `insured` NULL ⇒ theo hợp đồng; hợp đồng mặc định của loại `tts` là `short` (viết cứng), loại khác lấy từ bộ giải được cài bằng `setDefaultContractResolver` (`src/modules/**/*.controller.ts`, đọc `type.<mã>.defaultContract`).

Khoá kỳ: `SCOPE_LOCKED_FROM` = `{ attendance: 'attendance_locked', params: 'attendance_locked', kpi: 'approved', slip: 'approved' }`. `assertPeriodOpen` áp cho mọi tháng như nhau.

### 2.2 Bộ tham số của tháng

Bộ tham số là object **phẳng** `{ 'khoá.chấm': giá trị }`, đóng băng. Thứ tự chồng (thấp → cao):

1. `PayrollParams.DEFAULTS` (bản sao).
2. Dòng `param_versions` hiệu lực: chỉ khi `params_mode = 'active'`. Với mỗi khoá lấy dòng có `effectiveMonth ≤ tháng` lớn nhất, hoà thì `id` lớn nhất (`resolveParamSet`). Dòng của khoá `locked`/`fixed`/`removed` do người dùng ghi bị bỏ (`PARAM_LOCKED`), dòng không qua `validateValue` (structureOnly) bị bỏ và ghi `console.error` một lần mỗi dòng. Danh sách bỏ trả ở `skipped`.
3. Dòng danh mục và chính sách (`catalogParams.rows()`, `src/domain/catalog-params.ts`): `id = config.CATALOG_ROW_ID_BASE + chỉ số + 1`, nên thắng dòng `param_versions` cùng tháng. Sinh khoá `type.*`, `level.<t>.<l>.*` (gồm `nightPct`), `shift.kind.<mã>`, hiệu lực từ `config.CATALOG_BASE_MONTH` (mọi tháng). Ba khoá chính sách `shift.allowance.basis = 'assigned'`, `tax.contract.basis = 'tenure'`, `tax.longTermMonths = 3` nằm trong `DEFAULTS` như mọi tham số khác. **Áp ở cả hai chế độ** `defaults-only` và `active`. Dòng danh mục không tính vào `rev` / `applied`.
4. `derive` (`payroll-params.ts`), tính khi dựng nhân:
   - `insuranceCap.bhxh = insuranceCap.bhyt = law.luongCoSo × tax.insurance.capMultiple`; `insuranceCap.bhtn = law.regionMinWage.<law.region> × capMultiple` (null nếu thiếu lương tối thiểu vùng ⇒ `PARAM_MISSING`);
   - `holidayNightRate = round(night.otAddRate × ot.holidayRate)` (mặc định 0,6);
   - `holidayNightAdd = round(tax.exempt.nightPremium) + round(night.otAddRate) × tax.exempt.holidayRate` (mặc định 0,9); làm tròn theo `unit.percent`.

`store.resolve` trả `{ month, mode, params, classes, rev (id lớn nhất của dòng áp dụng), hash (sha256 của dạng canonical), applied, skipped }`. Bộ nhớ đệm khoá theo `mode:lastId:catalogRev`; xem trước (`drafts`/`active`) không vào bộ nhớ đệm.

### 2.3 Các "view" chồng lên tham số khi tính (`prepare`, `payroll-engine.ts`)

`fillLate` (điền `LATE_KEYS` thiếu trong bản chụp bằng mặc định) → `WorkSchedule.monthView(month)` (chỉ khi `pay.method = 'C'`: thay `type.<mã>.workdays` bằng số ngày làm thực của tháng theo lịch chức vụ) → `WorkSchedule.forPerson(staff, month)` (lịch của người theo loại nhân sự; nếu ngày công chuẩn của người lệch `type.<mã>.workdays` thì thay đúng khoá đó, mẫu số lương ngày, tỷ lệ ngày, miễn thuế, tạm ứng cùng đọc một mẫu số; `workdaysStd` chỉ ghi khi người mang mảng thứ `staff.sched` (dữ liệu mẫu, không có nơi ghi trong DB) hoặc `workdaysMode = 'computed'`) → `PayOptions.levelView(params, staff)` (ghi đè `level.<t>.<l>.(travel|attendance|flexBonus|nightOptions|benefit.*)` lên `type.<t>.*` khi khác null) → `kernelFor`.

Ghi đè theo chức vụ: `OVERRIDES` = `ot.rate`, `ot.weekendRate`, `advanceRate` → `advance.rate`, `overLimitHours` → `attendance.overLimitHours`. `entitlement(P, type, tail)` đọc `type.<mã>.<đuôi>` (khác null) → khoá toàn cục → mặc định; `overlay(P, type)` trả bộ tham số với các khoá toàn cục thay bằng giá trị của chức vụ (không có ghi đè thì trả đúng P).

Mọi bộ nhớ đệm (`kernelFor`, `KpiScore.create`, `LeaveRules.create`, `PayrollCalendar.create`, `ActualHours.create`, `ApprovalView.create`, `fillLate`, `overlay`, `levelView`, `defsOf` của khối, `engineFor` của `payroll-service`) là WeakMap theo **object params**: đổi tham số phải tạo object mới, không sửa tại chỗ.

### 2.4 Khoá tham số quan trọng và mặc định (`DEFAULTS`)

| Nhóm | Khoá → mặc định |
| --- | --- |
| Giờ | `time.workHoursPerDay` 8; nghỉ `time.breakHours` 1 giờ sau `time.breakAfterWorkHours` 4 giờ làm liền (một lần mỗi đoạn); `time.flexStartBeforeHour` 7; đêm `time.nightStartHour` 22 đến `time.nightEndHour` 6 |
| Chấm công | `attendance.graceMin` 15, `attendance.stepMin` 30, `attendance.cutRounding` halfUpStep, `lateEarlyRule` separate, `gapRule` step, `missingAllRule` absent, `missingOneSideRule` pending, `offScheduleRule` unpaid, `undeclaredPunchRule` report, `earlyCheckinMaxHours` 4 |
| OT | `ot.rate` 1,5; `ot.weekendRate` 2; `ot.holidayRate` 3; `ot.afterMakeup` block; `night.breakPremium` 0,3; `night.otAddRate` 0,2; sàn luật `law.floor.otRate` 1,5, `weekendOtRate` 2, `holidayRate` 3 |
| Ca | `shift.flex.bonus` 0,1; `shift.night.bonus` 0,3; `shift.allowance.basis` (chính sách đặt `assigned`); `shift.preset.<mã>.in/out` |
| Làm bù / lễ / iSAT | `holiday.makeupRate` 3 (hệ số phần làm bù rơi vào ngày lễ); `isat.weekday` 6 (Thứ Bảy) |
| Chuyên cần | `attendance.absentCompare` gte, `overLimitCompare` gte, `overLimitHours` 24, `overLimitTolerance` 0, `lossMode` all, `tiers` [], `shortHoursRounding` none |
| KPI | `kpi.overLimitCompare` gt, `kpi.overLimitHours` 24, `kpi.passCompare` gte, `kpi.weight.wework/user/peer/manager/self` = 40, 24, 18, 12, 6, `kpi.weworkMin` 75 |
| Tạm ứng | `advance.rate` 0,8; `advance.untilDay` 15; `advance.basis` byWorkedDays; `advance.eligibleTypes.<mã>` true |
| Tiền | `money.roundMode` halfUp, `money.roundTo` 1, `pay.method` A |
| Bảo hiểm | `insurance.base` baseSalary, `insurance.floorMode` none, `insurance.coverage.long` true, `short` false; `tax.insurance.employee` bhxh 0,08 / bhyt 0,015 / bhtn 0,01; `employer` 0,175 / 0,03 / 0,01; `capMultiple` 20; `skipCompare` gte; `skipDays` 14 |
| Luật | `law.luongCoSo` 2 530 000; `law.region` 1; `law.regionMinWage.<vùng>` |
| Thuế | `tax.brackets` (10 triệu 5%, 30 triệu 10%, 60 triệu 20%, 100 triệu 30%, còn lại 35%); `tax.deduction.personal` 15,5 triệu, `dependant` 6,2 triệu; `tax.casual.rate` 0,1, `threshold` 5 triệu, `thresholdCompare` gte; `tax.method.long` progressive, `short` flat; `tax.personalCompare` gt; `tax.arise.mode` personalDeduction; `tax.exempt.holidayRate` 3, `weekendRate` 2, `otRate` 1,5, `nightPremium` 0,3, `otMethod` byRate |
| Phép | `leave.accrual.perMonth` 1, `birthday` 1, `start` 0; `leave.seniority.stepYears` 5; `leave.expiry.month` 1 (0 = không hết hạn); `leave.expiry.fromYear` (năm của quỹ phép đầu tiên được quản lý) |
| Phiếu | `slip.staffVisibleFrom` afterPaid |
| Kỳ | `period.payDay` |
| Loại `nv` | `attendance` 0,25; `travel` 0,15; `maxAbsent` 3; `nightOptions` [40, 60]; `flexBonus` 0,2; `workdays` 26; `kpiPass` 75; `dows` Thứ Hai đến Thứ Bảy; mọi quyền lợi `benefit.*` bật |
| Loại `ctv` | `travel`, `attendance` 0; `flexBonus` 0,1; `workdays` 26; `kpiPass` 75; không có `approvedLeave`, `isat`, `idorm` |
| Loại `tts` | `workdays` 22; `defaultContract` short; `dows` Thứ Hai đến Thứ Sáu; `benefit.ot`, `paidHoliday`, `paidLeave`, `breakPay`, `kpi`, `leaveAccount` đều tắt |
| Bậc | `level.nv.1..4.base` 6; 6,5; 7; 7,5 triệu, `.kpi` bằng lương cơ bản; `level.ctv.1..4.base` 6 triệu, `.kpi` 1,5 / 3 / 4,5 / 6 triệu; `level.tts.1..6.base` 1 đến 5 triệu |
| Khoản chưa duyệt | `request.type.<khoản>.pendingRule / rejectedRule / countsAbsent` (khoản: `isat`, `approved`, `makeup_day`, `ot`, `makeup_hours`, `holiday_work`, `leave`, `willmakeup`) |
| Công thức | Bảy khoá `formula.<tên>` (khoá bị khoá, chứa `{ text, tree }`) |

Kernel dựng bảng `TYPES` bằng regex trên khoá `type.<t>.benefit.<f>`, `type.<t>.<f>`, `level.<t>.<l>.<f>` (`payroll-engine.ts`): quyền lợi `benefit.ot` thành `T.ot`, `benefit.paidLeave` thành `T.paidLeave`... Loại hoặc bậc không có trong bảng ⇒ `assertStaff` :198 ném `PAYROLL_BAD_TYPE` / `PAYROLL_BAD_LEVEL`.

### 2.5 Đầu vào một người một tháng (`loadInputs`, `payroll-service.ts`)

- `staff` (từ `payrollPeople` :106): người thuộc diện trả lương, đã bắt đầu làm trước hết tháng, chưa nghỉ việc trước đầu tháng, tài khoản khoá chỉ vào khi có dữ liệu trong tháng. Hợp đồng theo thâm niên khi `tax.contract.basis = 'tenure'` (`PayrollPolicy.contractFor`: đủ `tax.longTermMonths` tháng tròn tính từ ngày vào làm tới hết tháng lương thì `long`, chưa đủ thì `short`; người chưa có ngày vào làm giữ hợp đồng hồ sơ). `insured` NULL ⇒ `insurance.coverage.<hợp đồng>`.
- `days`: lịch ngày đã khai (`estimateDays`), `approvals`: dòng duyệt theo ngày, `sessions`: phiên chấm công của đúng tháng (mọi tháng đều trả lương theo Check-in/out).
- `kpi` (`kpiOf` :82): `method: 'five'` kèm `parts` (5 thành phần) ở mọi tháng, cùng `{ pct, amt, admPct, admAmt }`.
- Các trường chỉ có khi người đó có: `entries` (khoản điền thêm đã duyệt), `advance: true` (Admin duyệt tạm ứng của tháng), `explanationHold` (+ `explanationRejected`) cho ngày giải trình chưa được duyệt hoặc bị từ chối, `leaveSettleDays`, `history`.
- `explanationHold`: giải trình bị từ chối giữ ngày dù ngày đó có lượt Admin khai thay; giải trình chưa quyết (chờ trả lời hoặc đã trả lời) chỉ giữ ngày chưa có lượt Admin.
- `overrides`: số Admin chỉnh trên phiếu (đi vào băm đầu vào).
- `holidays`, `asOf`.

`digestOf` :294 băm chuẩn hoá `{ month, switches (kèm holidays, asOf), people, overrides? }` vào `payroll_runs.inputsDigest`.

### 2.6 Kết quả

`calcMonth` trả object tháng `m`:
- `rows[]` mỗi ngày: `date`, `kind`, `daily`, `hourly`, `hours`, `short`, `cut`, `bonus`, `breakPay`, `makeupH`, `makeupPay`, `otH`, `otPay`, `otWeekendH/Pay`, `holMainH`, `holWorkH`, `holWorkPay`, `shift`, `total`, `debtBefore`, `debtAfter`, và (nếu có) `punchIn`, `punchOut`, `held`, `paidOff`, `holBase`;
- bộ đếm ngày: `count` (ngày công), `leave`, `unpaid`, `willmakeup`, `approved`, `isat`, `holiday`, `noshow`, `pending`, `makeup`, `paidDays`, `absent`;
- giờ: `otHours`, `makeupHours`, `holWorkHours`, `holNightHours`, `nightHours`, `otHoldHours`, `debt`, `makeupNeed`, `makeupDeclared`, `makeupCredit`, `overHours`;
- tiền: `base`, `basePay`, `off`, `cut`, `bonus`, `breakPay`, `makeupPay`, `otPay`, `holWorkPay`, `travel`, `attendance`, `allow`, `kpiPay`, `total`, `advanceBase`, `settleDays`, `settlePay`;
- `blocks`, `entries` (chỉ khi có), `kpi*` (`kpiPct`, `kpiAmt`, `kpiPass`, `kpiMethod`, `kpiParts`...), `attendOk`;
- `net` (từ `netFrame`: `gross`, `exemptNight`, `exemptOt`, `exempt`, `taxable`, `bhxh/bhyt/bhtn`, `insurance`, `employer`, `deduction`, `assessable`, `tax`, `advance`, `net`, `contract`, `insured`, `insuredMonth`, `noPayDays`...);
- `trace` (không liệt kê khi duyệt so sánh): các thành phần ngày, giá trị từng công thức tháng, `tamUngToiDa`, `thueTncn`, `baoHiem`, `mienThue`, `thuNhapChiuThue`, `thucLinh`, `quyetToanPhepDu`.

`computeMonth` trả `{ m, payDays, pendingItems, actualReport, trace }`; `m.workdaysStd` được ghi khi người mang `staff.sched` hoặc `workdaysMode = 'computed'`.

### 2.7 Máy chủ thử nghiệm (sandbox)

`scripts/dev/sandbox-server.ts` là tiến trình Node riêng: yêu cầu `SANDBOX_PG_CONTROL_URL` trỏ tới PostgreSQL control riêng có quyền `CREATEDB`; mỗi lần chạy tạo database sandbox tạm do nó sở hữu và dọn khi thoát bình thường hoặc nhận SIGINT/SIGTERM. Không dùng URL ứng dụng kế thừa. Server chỉ nghe loopback, dùng đồng hồ giả (`Date.now` đứng yên cho tới khi thao tác tua), cổng lấy từ `SANDBOX_PORT` (0 = hệ điều hành chọn). Dùng chính `src/modules/**/*.controller.ts` và bộ máy tính lương thật nên số tính ra cùng một đường với máy chủ chính; `POST /__sandbox/reset` (cần `confirm === true`, `resetSyntheticData`, `sandbox-server.ts`,) xoá các bảng `punch_requests`, `explanations`, `attendance_sessions`, `attendance_days`, `timesheets`, `slip_overrides`, `punches`, `corrections`, `sheet_approvals`, `kpi_scores`, `kpi_score_log`, `staff`, `settings`, xoá trạng thái kỳ lương (`clearPeriodState`) rồi tạo lại nhân sự thử. `sandbox-ops.ts` cung cấp các thao tác nạp dữ liệu mẫu (seed), bắt đầu và huỷ tải, sao lưu, làm hỏng dữ liệu thử, chạy công cụ, đọc tình trạng và chụp trạng thái, không có thao tác đặt lại.

---

## 3. API

Quyền theo `src/platform/authz.ts` `ROUTE_CAPS`; handler ở `src/http/api-gate.ts`, `src/domain/period/periods.ts`, `src/modules/advance/advance-approvals.handlers.ts`, `src/modules/explanations/explanations.controller.ts`.

| Route | Quyền | Việc |
| --- | --- | --- |
| `GET /api/settings/params` | `config.read` | `store.view`: bộ tham số + lớp + `skipped`. |
| `PUT /api/settings/params` | write(`config.read`) + quyền ghi theo khoá (`admin` → `config.payroll`, `accounting` → `config.legal`) | `save.save` :704; phát `params.changed`. Quyền ghi theo khoá: `registry.WRITE_CAP` (`src/params/registry.ts`, `src/params/save.ts`); lô trộn khoá của hai bên cần cả hai quyền. |
| `POST /api/settings/params/preview` | write(`config.read`); handler đòi thêm `payroll.view` + `salary.read` phạm vi all (`src/params/save.ts`) | `save.preview` :632; luôn trả 200 kèm lỗi trong thân. |
| `POST /api/settings/params/revert` | write(`config.read`) | `save.revert` :850. |
| `GET /api/settings/first-run` | theo `ROUTE_CAPS` | `store.firstRun`. |
| `GET /api/periods`, `GET /api/periods/:month` | `payroll.view` | Danh sách / chi tiết kỳ (kèm `period.payDay`). |
| `POST /api/periods/:month/lock-attendance` | `attendance.lock` | `open` → `attendance_locked`. |
| `POST /api/periods/:month/calculate` | `payroll.calculate` | `periods.calculate` :347: tạo run, tính từng người bằng `slipOf`. |
| `POST /api/periods/:month/ai-review` | `ai.review.read` (+ handler kiểm `payroll.calculate`) | Rà soát quy tắc. |
| `POST /api/periods/:month/approve` | `payroll.approve` | reviewed → approved. |
| `POST /api/periods/:month/mark-paid` | `payroll.pay` | approved → paid; phát `payslip.available`. |
| `POST /api/periods/:month/reopen` | `period.reopen` | Mở lại (không mở được kỳ `paid`). |
| `GET /api/periods/:month/payslips` | `payroll.view` | Danh sách phiếu. |
| `GET /api/periods/:month/payslips/:username` | `self-or:payroll.view` | `periods.payslip` :938. |
| `PUT /api/periods/:month/payslips/decide` | `payroll.approve` | Duyệt hoặc trả lại phiếu (`payslip.approve`, `payslip.return`). |
| `GET /api/periods/:month/verify` | `audit.read` | `periods.verify` :995: tính lại và so với bản chụp. |
| `GET /api/periods/:month/estimates`, `/estimates/:username` | `payroll.view` | `estimatesOfMonth` :832, `estimateOne` :883. |
| `GET /api/me/estimate` | đã đăng nhập | `periods.estimate` :1080. |
| `GET/PUT /api/slip-override` | `payroll.override` (PUT khoá kỳ phạm vi `slip`) | Ô tiền và ô số lượng ghim của phiếu. |
| `GET/PUT /api/kpi/scores` | `kpi.score.write` (PUT: chính chủ hoặc quyền đó; khoá kỳ phạm vi `kpi`) | Điểm KPI năm thành phần. |
| `GET/POST /api/advance-requests`, `PUT /api/advance-requests/:id/decide`, `POST /api/advance-requests/:id/cancel` | đã đăng nhập; duyệt cần `request.decide.*` | Lịch sử yêu cầu tạm ứng và mức tối đa (`capOf`). |
| `GET /api/advance-approvals`, `POST /api/advance-approvals/(request|withdraw|approve|reject|cancel|approve-all)` | đã đăng nhập; duyệt cần `request.decide.*` | Yêu cầu tạm ứng theo người theo tháng. |
| `GET/POST /api/explanations`, `POST /api/explanations/:id/(answer|decide)` | đã đăng nhập; `decide` cần `attendance.correct` | Giải trình ngày công. |

Mọi bước kỳ kiểm `rev` (khoá lạc quan) ⇒ 409 `*_STALE`. Các kiểm tra mềm chỉ ghi cảnh báo và chạy tiếp; lỗi bảo mật, định dạng và chống ghi đè luôn chặn.

### 3.1 Mã lỗi

| Nơi | Mã |
| --- | --- |
| Bộ máy | `PARAM_MISSING` (thiếu khoá, gồm `law.regionMinWage` khi trần bhtn null), `PARAM_INVALID_VALUE`, `PAYROLL_BAD_FORMULA`, `PAYROLL_BAD_TYPE`, `PAYROLL_BAD_LEVEL`, `PAYROLL_BAD_BLOCK`, `PAYROLL_BAD_ENTRY`, `PARAM_OPTION_UNAVAILABLE` (`PayTailCalc.assertAvailable`, chỉ `computeFor` của máy chủ gọi), `FORMULA_DIV_ZERO`, `FORMULA_MISSING_INPUT` |
| Lưu tham số | `PARAM_NO_CHANGES`, `PARAM_BATCH_TOO_LARGE`, `PARAM_UNKNOWN_KEY`, `PARAM_BACKED_BY_SETTINGS`, `PARAM_LOCKED`, `FORBIDDEN_CAP` 403, `PARAM_NOT_WIRED`, `SHIFT_EDIT_NOT_ALLOWED` / `SCHEDULE_EDIT_NOT_ALLOWED` 409, `PERIOD_LOCKED` 409, `PARAMS_DEFAULTS_ONLY` 409, `PARAMS_STALE` 409, `PARAM_REV_REQUIRED`, `REASON_REQUIRED`, `BASIS_REQUIRED`, `PARAM_FLOOR_ACK_REQUIRED`, `PARAM_CROSS_CHECK_FAILED`, `ATTR_TOO_MANY` |
| Phiếu | Phiếu lỗi khi tính: `status 'error'` + `errorCode` (`slipOf`, `periods.ts`); `PAYSLIP_NOT_VISIBLE` 403 (nhân sự xem phiếu khi kỳ chưa `paid`), `PAYSLIP_NOT_FOUND` 404; ước tính trả `reason` thuộc `PAYROLL_BAD_TYPE`, `PAYROLL_BAD_LEVEL`, `PAYROLL_BAD_FORMULA` thay vì 500 |
| Tạm ứng | `ADVANCE_ALREADY_REQUESTED`, `ADVANCE_NOT_PENDING`, `ADVANCE_NOT_APPROVED`, `ADVANCE_WINDOW_CLOSED`, `ADVANCE_MONTH_NOT_CURRENT` (409) |
| iSAT | `BENEFIT_NOT_ALLOWED`, `SHEET_ISAT_WEEKDAY` |

---

## 4. Cách tính / quy tắc

Tiền là số nguyên VND. Làm tròn duy nhất qua `roundDong` (`payroll-engine.ts`): `Math.round(x / roundTo) * roundTo`. Chỉ có `halfUp`; giá trị khác bị `PayTailCalc.assertParams` hoặc kiểm `ROUND_MODE` chặn (`PARAM_INVALID_VALUE`). Tiền theo ngày và theo giờ **không làm tròn** giữa chừng; chỉ làm tròn ở các điểm của `netFrame`, `tamUng` và `settlePay`.

### 4.1 Luồng tổng (`computeMonth`, :1550)

1. `prepare(params, staff, month)` (mục 2.3), rồi `assertStaff`.
2. `ApprovalView.payView(days, approvals, policy, { holidays, staffType, schedule })`: áp trạng thái duyệt của khoản tự khai (mục 4.2). Chính sách dựng từ `request.type.<khoản>.pendingRule / rejectedRule` (`approvalPolicy` :1534).
3. `ActualHours.apply(payDays, sessions, { asOf, staff, holidays, month })` (mọi tháng) thay giờ ca chính bằng giờ tính từ Check-in/out (mục 4.3).
4. Ngày trong `explanationHold`: ghi đè thành `{ kind: 'unpaid', punchIn?, punchOut?, held }` với `held = 'rejected'` nếu ngày có trong `explanationRejected`, ngược lại `'pending'`. Ngày đó là nghỉ không lương và tính vào số ngày nghỉ xét chuyên cần như mọi ngày `unpaid`, nhưng phiếu vẫn in giờ bấm thật.
5. `calcMonth(staff, payDays, kpi, holidays, month, upTo, entries, asOf, { advance: advanceApproved === true, settleDays })` → `finishMonth` → `netFrame`.
6. `m.workdaysStd = person.workdaysStd` nếu có.

`create(params)` trả engine có `calcDay`, `thanhPhanNgay`, `calcMonth` (chỉ qua `levelView` + `assertStaff`, **không** qua `prepare`, :1603), `calcNet`, `payslip` (= `calcNet`), `taxFrom`, `progressiveTax`, `computeMonth`, `repin` (qua `prepare`, :1614), `BUILTINS`, `VARIABLES`, `FORMULAS`.

### 4.2 Khoản tự khai và duyệt (`approval-view.ts`)

Khoản cần duyệt (`itemOf`): `isat`, `approved` (nghỉ được duyệt), `leave` (phép năm), `willmakeup` (nghỉ có giờ bù dự kiến; vân tay là danh sách kế hoạch), ngày đi làm có đoạn làm thêm trước/sau ca (`ot` hoặc `makeup_hours`), và ngày đi làm có giờ vào/ra đúng ngày lễ nằm trong lịch của người có quyền lợi OT (OT ngày lễ, mục `ot` với `holiday: true`, vân tay `holiday_work|…`). Ngày có `src` hoặc `attendanceConfirmed` không phải khoản tự khai. Loại ngày `makeup` (làm bù cả ngày) không có khoản cần duyệt.

Trạng thái hiệu lực (`effectiveStatus`): `approved` chỉ khi dòng duyệt tồn tại, `status = 'approved'` và vân tay khớp ngày hiện tại; thiếu dòng hoặc vân tay lệch là `pending`; `rejected` giữ nguyên. Khoản không `approved` đi qua `applyAction` theo chính sách (từ chối và chờ duyệt mặc định tính y hệt nhau):

| Cách xử lý | Tác dụng |
| --- | --- |
| `unpaid` | ngày thành `{ kind: 'unpaid' }` (hoặc kèm `absentExempt: true` nếu `countsAbsent` của khoản là false) |
| `drop` | bỏ cả ngày khỏi lịch |
| `strip` | giữ ngày đi làm, bỏ đoạn làm thêm (không trả, không bù giờ thiếu) |

Mặc định: `isat`, `approved`, `leave`, `willmakeup` ⇒ `unpaid`; `makeup_day`, `holiday_work` ⇒ `drop`; `ot`, `makeup_hours` ⇒ `strip`. OT ngày lễ chưa duyệt theo hàng `holiday_work` (bỏ cả ngày, ngày lễ chỉ còn lương nghỉ lễ). Khi `payView` không có danh sách ngày lễ, nó vẫn tin dòng duyệt của máy chủ cho OT ngày lễ (`itemFromRow`).

### 4.3 Giờ công từ Check-in/out (`actual-hours.ts`)

Ba hằng: một công = `time.workHoursPerDay` giờ, ngưỡng miễn `attendance.graceMin` phút, bậc trừ `attendance.stepMin` phút. Ô chính sách (`POLICY_KEYS`) đọc từ khoá registry và chỉ nhận các giá trị trong `ALLOWED`.

`apply` làm theo từng ngày, từ ngày `from` trở đi:

- Gom lượt theo ngày công (ngày bắt đầu ca). `inspectDay` phân loại lượt: đang mở (`open`), chờ đối soát (`needs-review`), quên Check-in, quên Check-out, dùng được (đủ giờ vào/ra, có ca đã gán). Lượt Admin khai thay (`origin = 'sheet.onBehalf'`) bị bỏ qua nếu mới là lịch (chưa tới giờ ra); lượt bấm thật dùng được thắng lượt Admin; không có lượt thật dùng được thì lượt Admin dùng được thắng các lượt bấm bị chặn cùng ngày.
- Ngày trong lịch của người, từ ngày bật, từ ngày bắt đầu làm, đến ngày đang chạy, không phải ngày lễ và chưa có bản ghi nào được coi là ngày đi làm mặc định (không phải khai "Đi làm").
- Ngày chưa tới: chờ (`not-yet`). Có lượt đang mở / chờ đối soát / quên một đầu: ngày thành `pending` (báo Admin, không phải ngày nghỉ). Có lượt nhưng không khớp ca đã gán: `pending` (`off-shift`).
- Không có lượt nào: với `missingAllRule = 'absent'` (mặc định) ngày khai đi làm thành `{ kind: 'noshow' }` (nghỉ không phép) sau khi ca kết thúc; ca chưa kết thúc thì chờ. Ngày ngoài lịch có đoạn làm thêm đã duyệt mà không đến: bỏ ngày, không vắng.
- Ngày khai nghỉ (phép, không lương, iSAT, nghỉ lễ...) mà vẫn chấm công: giữ loại ngày đã khai, báo Admin (`declared-wins`). Ngày không khai loại ngày mà có chấm công: chưa tính tiền, chỉ báo.
- Chấm công ngoài lịch (Chủ nhật, ngày ngoài lịch của loại, ngày lễ không khai) mà không có khoản OT / làm bù đã duyệt: 0 giờ, 0 đồng, ngày bị bỏ khỏi bản tính. Có khoản đã duyệt: ngày `extraOnly` (ca chính không tính, chỉ trả đoạn làm thêm đã duyệt trong phạm vi có mặt).
- Ngày đi làm có lượt dùng được: chọn ca có nhiều phút làm việc được phủ nhất (`bestShift`). `analyseShift` chỉ đếm phút làm việc (giờ nghỉ không bao giờ là trễ, sớm hay khoảng trống). Phút trừ: trễ đầu ca, sớm cuối ca, khoảng trống giữa hai lượt, mỗi loại qua `cutMin`: chỉ trừ khi số phút thiếu lớn hơn `graceMin`; với `halfUpStep` trừ `stepMin × floor((2m + stepMin) / (2 × stepMin))` (trễ 16 đến 44 phút trừ 30, 45 đến 74 trừ 60), `ceilStep` làm tròn lên theo bậc, `exact` trừ đúng số phút; tối đa một công. Ngày có thể ghi: `cutStartMin`, `cutEndMin`, `breakMin` (= phút trừ khoảng trống), `preset` (= mã ca được gán hoặc ca Admin chọn cho ngày), `breakPayOff` (không phủ hết giờ nghỉ ⇒ không trả giờ nghỉ đêm ca chính), `makeupHolRate` (= `holiday.makeupRate` khi đoạn làm bù).
- Nếu trừ hết mọi phút làm việc của ca thì ngày thành `pending` (`off-shift`).
- OT / làm bù đã duyệt (`clipExtra`): chỉ trả phần có mặt liền mạch với biên ca và không quá số giờ đã duyệt theo ca khai. OT ngày lễ (`holidayWindow`): khung trả là khung giờ đã khai ∩ giờ có mặt liền mạch.
- Ca Admin chọn: khi Admin khai thay giờ vào/ra, lượt Admin mang ca của ngày (`day.preset`, mọi ca trong danh mục) nên `effective.preset` và loại ca tính phụ cấp theo ca đó; nhân sự tự bấm vẫn chấm theo ca được gán.
- `LOCKED_FIELDS` (:313) bị xoá khỏi ngày hiệu lực (`src`, `attendanceConfirmed`, `attendanceApproved`, `presIn`, `presOut`, `plannedShift`, `otReview`, `reason`, `cutStartMin`, `cutEndMin`, `breakPayOff`, `makeupHolRate`, `extraOnly`) trước khi gán lại các giá trị tính được.
- Cuối cùng giờ bấm thật `punchIn` / `punchOut` (giờ Việt Nam `HH:MM`) được ghi vào dòng ngày `work`, `noshow`, `pending` (trừ `not-yet`).

Kết quả `apply`: `{ days, report, missing (ngày chờ Admin xử lý), absent (ngày khai mà không chấm) }`; `computeMonth` trả `actualReport`.

### 4.4 Một ngày (`calcDay`, :390)

Ký hiệu: `daily = base / T.workdays`, `hourly = daily / HOURS` (`HOURS = time.workHoursPerDay`), `T` là bảng của loại nhân sự (đã qua `levelView`).

**Ngày không phải ngày làm** (trả `total` và dừng):

| `kind` | Tiền ngày |
| --- | --- |
| `invalid` (ngày hỏng) | 0 |
| `noshow`, `pending`, `unpaid`, `willmakeup`, `approved`, `makeup` (làm bù cả ngày) | 0 (không ngày công, không giờ làm bù) |
| `leave` | `daily` nếu `T.paidLeave`, `paidOff = T.paidLeave` |
| `isat` | `daily` nếu `T.isat` và ngày đúng thứ `isat.weekday`; không phụ cấp |
| `holiday` (ngày lễ không đi làm) | `holBase` = `daily` nếu `T.paidHoliday` và người đang trong thời gian làm việc (`inService`) |

Ngày làm:

- `attendanceConfirmed` ⇒ dùng ca kế hoạch `plannedShift` thay giờ vào/ra, `breakMin = 0`.
- **Loại ca** cho phụ cấp: khi `shift.allowance.basis = 'assigned'` (`BY_ASSIGNED`) dùng `shiftOfDay` :308 = `shift.kind.<mã>` với mã = `d.preset` hoặc `staff.shiftCode`, mã lạ hoặc chưa xếp ca là `normal`. Không có khoá này thì `shiftFor` :298: **đêm** nếu có phút nào trong khung đêm, **flex** nếu vào trước `time.flexStartBeforeHour` hoặc ra từ giờ bắt đầu đêm, còn lại `normal`.
- **Giờ nghỉ** (`breakSlots` :342): một lần nghỉ `time.breakHours` giờ sau `time.breakAfterWorkHours` giờ làm liền cho mỗi đoạn; phút nghỉ rơi trong khung đêm được trả (`paidH`). Đoạn OT không có giờ nghỉ. `T.breakPay === false` (TTS) ⇒ không trả giờ nghỉ đêm.
- `workedHours` :372 = khoảng vào–ra trừ giờ nghỉ, trừ `breakMin`, trừ `cutStartMin` và `cutEndMin`.
- `PayrollCalendar.splitMainWork` chia ca chính theo ngày dân sự của từng phút: `normalH`, `holidayH` (→ `holMainH`), `holidayNightH` (→ `holMainNightH`), `nightH`, `holidayBreakH`, `holidayBreakNightH`. Phút ngày thường bị trần một công; phút ngày lễ không bị trần và giờ nghỉ rơi vào ngày lễ vẫn là giờ làm.
- Quyền lợi OT là điều kiện duy nhất để có giờ làm ngày lễ: chức vụ không có `T.ot` ngày lễ thành `kind: 'holiday'` dù khai giờ (không có giờ làm lễ, vẫn có `holBase` nếu `T.paidHoliday`).
- **Đi làm ngày lễ** (`isHoliday` và có giờ vào/ra, `kind` không phải `noshow`): chỉ giữ đoạn `extraKind 'ot'`, làm bù bị bỏ. Ngày lễ khai "Đi làm" mà hết ca không có Check-in/out là `noshow` (mất cả lương nghỉ lễ). Ngày lễ có Check-in/out hợp lệ tính 1 ngày công (`c.hours > 0`).
- `holWorkH = holMainH + holExtraH` (`holExtraH` = phần ngày lễ của đoạn OT). `holWorkPay = holWorkH × hourly × ot.holidayRate + holNightH × hourly × derived.holidayNightRate`. Giờ trong ngày lễ tính thô, không trừ giờ nghỉ; phần ca chính rơi vào ngày lễ không còn nằm trong lương ngày (`daily − cut − (holMainH − holMainBreakH) × hourly`), vì `holMainBreakH` (giờ nghỉ của ca nằm trong ngày lễ) vốn không nằm trong 8 giờ của lương ngày. Phần OT trong ngày lễ không cần duyệt OT riêng và không bị chặn bởi giờ bù. Ca qua nửa đêm: phút sang ngày thường theo luật ngày thường; OT lễ cắt theo ngày dân sự của từng phút.
- **Làm bù** (`extraKind 'makeup'`): `makeupH = excess` = toàn bộ giờ làm thêm (đã trừ giờ nghỉ của đoạn) của đoạn làm bù đã duyệt, **không cắt** theo giờ còn thiếu và không có trần; `makeupPay = makeupH × hourly` cộng `makeupHolPremium` = (phần giờ làm bù rơi vào ngày lễ) × `hourly` × (`makeupHolRate` − 1). Ngày lễ không có làm bù. Dòng ngày có `makeupH` mà không có `extraOut` thì `makeupH = min(makeupH, max(0, giờ làm − HOURS))` (`payroll-engine.ts, :451-452`).
- Phụ cấp ca và giờ nghỉ đêm có lương (Off Paid) thuộc ca chính: ngày có giờ làm bù vẫn nhận hai khoản này như ngày thường; đoạn làm bù chỉ nhận lương giờ cơ bản và không có Off Paid riêng. Ngày `extraOnly` vẫn không có phụ cấp ca hay Off Paid; phần sàn phụ trội đêm ca qua ngày lễ vẫn giữ. Tiền OT được trả không làm mất phụ cấp ca hay Off Paid.
- **OT ngày thường** (`extraKind 'ot'`): `otNormalH = extra − phần ngày lễ`. Trả khi `T.ot`, không `owes`, và `otOk = !d.src || d.otReview.ok`. `owes` = `context.otBlocked` nếu có, ngược lại `avail > unit.owedHoursEpsilon`. `calcMonth` truyền `otBlocked = (ot.afterMakeup ≠ 'independent') và (số dư giờ bù trước ngày đó > 0)`; chỉ chặn khi còn giờ phải bù (bù nhiều hơn giờ thiếu không chặn). Giờ bị chặn nằm ở `otHold`, giờ chưa duyệt ở `otWait`.
- **Hệ số OT** theo ngày dân sự của từng phút (`splitExtraWork(entry, date, holidays, isRest)` trả thêm `weekendH`): phút ngày lễ ×`ot.holidayRate` (+ phụ trội đêm lễ); phút Thứ Bảy, Chủ nhật **không nằm trong lịch của người** (`WorkSchedule.isRestDay`, truyền qua `context.isRest`) ×`ot.weekendRate`; còn lại ×`ot.rate` (ngày thường có lịch và Thứ Bảy nằm trong lịch). Cả hai hệ số đọc theo chức vụ (`entitlementOf`). `otPay = otWeekdayPay + otWeekendPay`. Gọi `calcDay` lẻ không có `isRest` thì mọi OT ngày thường ×`ot.rate`. OT không trừ giờ nghỉ.
- `short` = `max(0, HOURS − min(hours, HOURS))`; bằng 0 với ngày lễ và `extraOnly`. `cut = extraOnly ? daily : short × hourly`.
- **Phụ cấp ca** `bonus`:
  - ca `flex`: `bonusOf × hourly × giờ làm` (ngày lễ: `normalWorkH + holMainH`), 0 nếu `noShiftAllowance`; `bonusOf(flex) = T.flexBonus ?? shift.flex.bonus`;
  - ca khác: `max(noShiftAllowance ? 0 : daily × bonusOf, (holMainH > 0 || ngày lễ) ? nightH × hourly × night.breakPremium : 0)`; ca `night` khi `assigned`: `bonusOf` = `level.<t>.<l>.nightPct` (không có thì `type.<t>.nightPct`, không có nữa thì mức đầu của `nightOptions`) chia `unit.percent`, dự phòng `shift.night.bonus`; khi không `assigned`: `staff.nightPct` hoặc mức đầu của `nightOptions`.
- `breakPay = breakH × hourly × (1 + night.breakPremium)` với `breakH` = giờ nghỉ đêm (đã trừ phần nghỉ nằm trong ngày lễ), 0 nếu `noShiftAllowance`.
- `total` = `(ngày lễ ? holBase + normalWorkH × hourly : daily − cut − (holMainH − holMainBreakH) × hourly) + holWorkPay + bonus + breakPay + makeupPay + otPay`.

`partsOfDay` chia `total` thành `tienNgayCong`, `phuCapCa`, `gioNghiDem`, `lamBu`, `tienOt`, `tienLamLe`, `ngayDiLam`; `columnsOfDay` gom thành bốn cột phiếu `luongNgay`, `phuCapCa` (phụ cấp ca + giờ nghỉ đêm), `lamThem` (làm bù + OT + OT lễ), `truGio`, phần lệch làm tròn dồn vào `luongNgay` để `luongNgay + phuCapCa + lamThem − truGio` = làm tròn của `total`.

### 4.5 Một tháng (`calcMonth`, :631)

- Tập ngày: các ngày có dữ liệu + ngày lễ trong lịch của người và trong thời gian làm việc, trong tháng `mk`, không sau `resignedOn`, và (thuộc lịch làm việc của người, hoặc ngày `extraOnly`); lọc `date ≤ upTo` nếu có `upTo`. Ngày lễ chỉ tính nếu cũng là ngày làm theo lịch. `noShowDates` luôn rỗng (vắng không phép đến từ `ActualHours`).
- Một lượt qua các ngày theo thứ tự: gọi `calcDay` với `otBlocked`, `isRest`, rồi cập nhật sổ giờ bù theo phút nguyên: `need` = `short` của ngày đi làm + `HOURS` cho mỗi ngày `willmakeup`; `made` = `makeupH`; `bal += need − made` (`debtBefore`, `debtAfter` trên dòng).
- Bộ đếm: `count` (ngày công) tăng với ngày `work` không `extraOnly` và ngày lễ có đi làm thật; ngày `work` cộng `base` (= `daily`), `cut`, `short`, `advanceBase` (chỉ ngày có `dayOfMonth ≤ advance.untilDay`; ngày `work` cộng `daily − cut`, ngày lễ có đi làm thật cộng `holBase`, OT ngày lễ không cộng; `advancePayOfDay`); ngày nghỉ (`leave`, `unpaid`, `willmakeup`, `approved`, `holiday`, `isat` chỉ khi hưởng lương, `noshow`, `pending`) cộng vào bộ đếm cùng tên và `off`; `holWork*`, `makeup*`, `ot*`, `breakPay`, `bonus`, `nightHours` (= `nightH − holMainNightH`, giờ đêm ca chính ngoài lễ), `paidDays` (theo `isPaidDay` :321: ngày công không `extraOnly`, ngày lễ có giờ làm, hoặc ngày nghỉ hưởng lương `paidOff`, và nằm trong thời gian làm việc).
- `PayOptions.adjustBase`: `pay.method` B (trần `basePay` ở lương tháng) hoặc D (lương tháng trừ ngày không lương × `daily`); A không đổi.
- `debt = max(0, need − made)` giờ thiếu chưa bù; `makeupCredit = max(0, made − need)` giờ bù thừa (đã được trả trong `makeupPay`).

### 4.6 Hoàn tất tháng (`finishMonth`, :802)

- `approvedCounted` = số ngày `approved` nếu `request.type.approved.countsAbsent`, ngược lại 0.
- **Giờ vượt ngưỡng** `overHours` = `roundShort(gioVuotNguong)` với `gioVuotNguong = (unpaid + approvedCounted − unpaidExempt + noshow) × HOURS + debt + leave × HOURS`; `null` khi loại không có `travel`, `attendance` hay `kpi`. `roundShort` làm tròn xuống theo `attendance.shortHoursRounding` (`none`, `halfHour` = bậc `attendance.stepMin`, `hour`).
- **Ngày nghỉ xét chuyên cần** `absent` = `max(0, leave + unpaid + approvedCounted − unpaidExempt + noshow + willmakeupCounted)`, trong đó `willmakeupCounted = min(số ngày willmakeup, ceil(debt / HOURS))` (giờ bù đã đủ thì ngày "nghỉ, sẽ làm bù" không tính; giờ thiếu của ngày đi làm trễ cũng xếp vào các ngày này). iSAT không làm tăng số ngày nghỉ xét chuyên cần; riêng khi tính tỷ lệ cho phụ cấp chuyên cần, ngày iSAT được cộng vào ngày đi làm để không làm giảm phụ cấp. Tỷ lệ và số ngày đi làm thực tế của phụ cấp đi lại vẫn không đổi.
- Chỉ loại có `travel` hoặc `attendance`: `r.absent = absent`, `r.attendOk = giuChuyenCan(absent, overHours, T.maxAbsent, ngưỡng giờ)` = `so(INVERSE[attendance.absentCompare], absent, maxAbsent) && so(INVERSE[attendance.overLimitCompare], overHours, ngưỡng)`. Ngưỡng giờ = `(T.overLimitHours ?? attendance.overLimitHours) + attendance.overLimitTolerance` (cùng số với khối phụ cấp C&B thêm và đường tiền). Mặc định `gte` ⇒ chạm ngưỡng là mất; `INVERSE` đảo phép so sánh (gte → lt).
- **KPI** (`T.kpi`): đầu vào `kpiPct` là số hoặc `{ pct, amt, admPct, admAmt, method, parts, totalPct }`. Mức KPI `amt` = Admin duyệt (`admAmt`) → đề xuất (`amt`) → `L.kpi`, kẹp 0..`L.kpi`.
  - `'five'`: `KpiScore.evaluate(parts, { pass: T.kpiPass })`: điểm × 100 là số nguyên, `units = Σ điểm × 100 × trọng số`; thiếu điểm nào là chưa đủ (`kpiPct = null`, `kpiPass = null`, tiền 0); điều kiện đạt: Base Wework ≥ `kpi.weworkMin` **và** tổng ≥ `kpiPass` (bằng mốc là đạt). `kpiPay = amt × units / 1 000 000 × hệ số ngày`. Ô ghim tổng KPI (`totalPct`) thay điểm thành phần khi tính đạt và tiền.
  - dạng phần trăm và số tiền: `p` = `admPct` nếu có, không thì % tự đánh giá; `kpiPass = so(kpi.passCompare, p, T.kpiPass)`; `tienKpiCu = amt × p / 100 × hệ số ngày`.
  - hệ số ngày KPI `heSoNgayKpi` = tỷ lệ ngày đi làm nếu `overHours` vượt ngưỡng `kpi.overLimitHours` theo `kpi.overLimitCompare`, ngược lại 1.
- Các công thức tháng (mục 4.7) đọc biến `v`: `luongCoBan`, `ngayCongChuan`, `ngayDiLam`, `gioVuotNguong`, `ngayNghiXetChuyenCan`, `iDorm`, `loaiCoPhuCap`, `coKpi`, `kpiDat`, `kpiNamThanhPhan`, `mucKpi`, `diemKpi`, `batTamUng` (= `staff.advanceOn !== false` và `advance.eligibleTypes.<mã>` khác false), `tienUng` (= `PayOptions.advanceBase`), `tongThanhPhanNgay` (= `r.work`). Thứ tự quan trọng: mọi biến được đặt xong trước khi đọc công thức nào.
- `r.travel = F.phuCapDiLai`; `r.attendance = PayOptions.tiered(...)` (`attendance.lossMode = 'tiers'`: nhân thêm tỷ lệ giữ theo bậc nghỉ; mặc định đúng `F.phuCapChuyenCan`); `r.total = F.tongThuNhap + (attendance − F.phuCapChuyenCan)`.
- Khối phụ cấp C&B thêm (`PayBlocksCalc.attach`): cộng vào `r.total` sau cây `tongThuNhap`. Mỗi khối bật theo chức vụ có số tiền theo `method` (`fixed`, `pctBase`, `byLevel`), nhân tỷ lệ ngày nếu `scalesWithDays`, bằng 0 nếu `loss` (nghỉ đủ số ngày xét chuyên cần hoặc giờ vượt ngưỡng, cùng phép so sánh với chuyên cần). Cờ miễn thuế và nền bảo hiểm của khối chỉ có hiệu lực khi `flagsConfirmedBy` khác rỗng. Không khối nào áp thì `m` không có `blocks`.
- Khoản điền thêm (`PayEntriesCalc.attach`): khoản `add` cộng vào `r.total` (chịu thuế, trừ phần miễn đã xác nhận), khoản `deduct` trừ **sau thuế** khỏi thực lĩnh.
- **Quyết toán phép dư** (`settleDays > 0`): `settlePay = roundDong(settleDays × L.base / T.workdays)` cộng vào `r.total`; chỉ tháng có phép quy tiền mới có `settleDays`, `settlePay`.
- `r.net = netFrame(staff, r, F, advance)`; `trace` gom giá trị từng công thức.

### 4.7 Bảy công thức tháng (`payroll-graph.ts`)

Thứ tự `ORDER`: `tyLeNgayDiLam` → `phuCapDiLai` → `phuCapChuyenCan` → `heSoNgayKpi` → `luongKpi` → `tongThuNhap` → `tamUng`.

| Công thức | Nội dung |
| --- | --- |
| `tyLeNgayDiLam` | số ngày đi làm ÷ ngày công chuẩn |
| `phuCapDiLai` | loại có phụ cấp ? (iDorm ? 0 : lương cơ bản bậc × `type.<t>.travel` × tỷ lệ ngày đi làm) : 0 |
| `phuCapChuyenCan` | loại có phụ cấp ? (giữ được chuyên cần ? lương cơ bản bậc × `type.<t>.attendance` × tỷ lệ ngày đi làm : 0) : 0 |
| `heSoNgayKpi` | vượt ngưỡng giờ KPI ? tỷ lệ ngày đi làm : 1 |
| `luongKpi` | loại có KPI ? (đạt ? (năm thành phần ? tiền theo điểm : tiền theo %) : 0) : 0 |
| `tongThuNhap` | tổng sáu thành phần ngày + (đi lại + chuyên cần) + lương KPI |
| `tamUng` | bật tạm ứng ? `roundDong(advance.rate × cơ sở tạm ứng)` : 0, chỉ là **mức tối đa** xin được (`trace.tamUngToiDa`) |

Cây thực sự dùng là `params['formula.<tên>']` (`resolveFormulaTrees` :83: nạp lại và kiểm lại bằng `Formula.validate` theo từ vựng, đơn vị, vòng lặp; hỏng ⇒ `PAYROLL_BAD_FORMULA`, không quay về công thức mặc định âm thầm). Chữ trong `TEXTS` là nguồn của bộ mặc định và phải parse ra đúng cây đã lưu. `formulaCtx` dùng `overlay(P, type)` và `scope.type`; `monthFormulas` tính lười và nhớ kết quả.

`Formula.evaluate`: chia cho 0 ⇒ `FORMULA_DIV_ZERO`; thiếu đầu vào ⇒ `FORMULA_MISSING_INPUT`; hàm có sẵn trả boolean được đổi thành 1 hoặc 0; công thức tham chiếu nhau có nhớ và phát hiện vòng. Người dùng không nhập công thức: khoá `formula.*` bị khoá, dòng của người dùng cho các khoá này bị bỏ.

### 4.8 Thực lĩnh (`netFrame`, :1069; `calcNet`, :1127)

| Bước | Cách tính |
| --- | --- |
| Tổng thu nhập | `gross = roundDong(m.total)` |
| Miễn thuế (`mienThueOf` :997) | Chỉ phần trả **cao hơn** lương giờ thường của cùng số giờ được miễn (mỗi nhóm `max(0, min(tiền trả, mức luật) − hourly × giờ nhóm)`). `exemptNight = roundDong(Σ theo ngày min(giờ đêm ngoài lễ × hourly × tax.exempt.nightPremium, phụ cấp ca đã trả của ngày))`: ngày không có phụ cấp ca (ví dụ ca thường hoặc `extraOnly`) không được miễn giờ đêm; ngày làm bù vẫn có thể được miễn theo phụ cấp ca của ca chính; bản chụp không có dòng ngày thì `hourly × nightHours × nightPremium`. `exemptOt = roundDong(` OT ngày thường (mức `tax.exempt.otRate × hourly × giờ`) `+` OT cuối tuần ngoài lịch (`tax.exempt.weekendRate`) `+` OT ngày lễ (`hourly × (tax.exempt.holidayRate × giờ + holidayNightAdd × giờ đêm lễ)`), áp cho `holWorkPay`; bản chụp mang `otHolHours`, `otHolPay` thì phần đó được tính như OT lễ, bộ máy hiện tại không ghi các trường này `)`. Cộng miễn thuế của khối/khoản đã xác nhận (`entrySums(m).exempt`). `exempt = min(gross, exemptNight + exemptOt + …)`; `taxable = max(0, gross − exempt)`. Mặc định: đêm 30%, OT ngày thường 50%, cuối tuần 100%, lễ 200% trên lương giờ thường (hệ số 1,5; 2; 3 trừ đi 1). |
| Bảo hiểm (`baoHiemOf` :1043) | Nền theo `insurance.base` (`PayTailCalc.insuranceBase`), sàn `insurance.floorMode`, trần `insuranceCap`. `noPayDays = max(0, ngày công chuẩn − paidDays)`, ngày công chuẩn = `m.workdaysStd` hoặc `type.<mã>.workdays`; `paidDays` là số ngày có lương tính đến mốc tính (`isPaidDay`: ngày công, ngày lễ có giờ làm, phép năm, nghỉ lễ hưởng lương, iSAT hưởng lương; **không** tính nghỉ không lương, nghỉ được duyệt, vắng, chờ xử lý, ngày trước ngày bắt đầu hoặc sau ngày nghỉ việc, ngày chưa tới, ngày chỉ có giờ làm thêm). `insuredMonth = insured && !so(tax.insurance.skipCompare, noPayDays, tax.insurance.skipDays)` ⇒ từ 14 ngày không lương trở lên không đóng. Mức đóng không chia theo ngày; giữa tháng bảo hiểm chỉ xuất hiện khi `paidDays ≥ ngày công chuẩn − 13` (NV 13, TTS 9). Phần người lao động làm tròn **từng khoản** (bhxh, bhyt, bhtn); phần công ty làm tròn **một lần trên tổng**. |
| Giảm trừ | `deduction = tax.deduction.personal + dependants × tax.deduction.dependant` khi phương pháp thuế của hợp đồng là progressive và `staff.deductOn !== false`, ngược lại 0 |
| Thuế (`taxFrom` :971) | `contract` theo `contractOf` :985 (`staff.contract` hợp lệ, không thì `defaultContract` của chức vụ); phương pháp `PayTailCalc.taxMethodOf(P, contract)`. **progressive**: `income = taxable − insurance`; phát sinh khi `so(tax.personalCompare, income, ngưỡng)` (ngưỡng = giảm trừ bản thân khi `tax.arise.mode = personalDeduction`); `assessable = max(0, income − deduction)`; `tax = roundDong(progressiveTax(assessable))` theo `tax.brackets`. **flat**: khi `taxOn` (`contract = 'long'` hoặc `staff.taxOn !== false`) và `so(tax.casual.thresholdCompare, gross, tax.casual.threshold)` thì `roundDong(gross × tax.casual.rate)` trên **tổng thu nhập** (không trừ miễn thuế). **none**: 0. |
| Tạm ứng | `approved !== true ? 0 : (F ? F.tamUng : m.net.advance)`: chỉ trừ khi Admin đã duyệt tạm ứng của người đó trong tháng |
| Khoản điền thêm | `entrySums(m).deduct` trừ sau thuế; `PayEntriesCalc.netOf` thêm các trường của khoản |
| Thực lĩnh | `net = gross − insurance − tax − advance − entrySums(m).deduct` (có thể âm) |

`calcNet(staff, m)` tính lại phần này từ một `m` đã có (giữ cờ `advanceApproved` của `m.net`).

### 4.9 Ghim ô số lượng (`repinMonth`, :1132; `payroll-pins.ts`)

Khoá ghim hợp lệ (`Pins.KEYS`): ngày (`workDays`, `leaveDays`, `unpaidDays`, `isatDays`, `holidayDays`, `ot15H`, `ot20H`, `ot30H`, `debtH`), KPI (`kpiAmt`, `kpiPct`, `kpiBase`, `kpiUser`, `kpiQltt`, `kpiPeer`, `kpiSelf`), `settleDays`. Ba nhóm giờ OT: `ot15H` giờ ×`ot.rate`, `ot20H` giờ ×`ot.weekendRate`, `ot30H` giờ ngày lễ. Mỗi thay đổi số lượng đi kèm tiền của chính nó theo đơn giá hiện có của bản chụp (lương một ngày, trung bình tiền một giờ OT đang có, hoặc giờ × hệ số khi chưa có giờ nào). Các ô khác của `SLIP_QTY` ở `src/modules/periods/periods.helpers.ts` (`leaveLeft`, `kpiBonus`) được nhận và lưu nhưng không nằm trong `Pins.KEYS` nên không đổi tiền.

Luồng: sao chép bản chụp, bỏ `blocks`, `entries`, `settleDays`, `settlePay`, `trace` → `Pins.apply` (đơn giá `daily`, `hourly`, `otRate = need('ot.rate')`, `weekendRate = need('ot.weekendRate')`, `holidayRate`...) → `finishMonth` (tính lại phụ cấp, KPI, khối, miễn thuế, bảo hiểm, thuế, thực lĩnh) → `pinAdjust` (tiền ngày nghỉ, lễ, iSAT mà dòng ngày không đổi theo) → `pinned`. Không dùng lại lịch hay Check-in/out nên số luôn khớp bản chụp. Chỉ phương án `pay.method = 'A'` được hỗ trợ khi ghim. Ô tiền sửa thẳng áp **sau** (mục 4.12).

### 4.10 Tạm ứng

- Số theo quy tắc (`tamUngToiDa`) = `roundDong(advance.rate × cơ sở)`; cơ sở = `PayOptions.advanceBase`: `byWorkedDays` (tổng `daily − cut` các ngày công từ ngày 1 đến ngày `advance.untilDay`, cộng `holBase` của ngày lễ có đi làm thật; ngày lễ nghỉ hưởng lương và OT ngày lễ không vào) hoặc `fixedPctByLevel` (lương cơ bản bậc). `advance.rate` đọc theo chức vụ (`type.<mã>.advanceRate`). Bật khi `staff.advanceOn !== false` và chức vụ có trong `advance.eligibleTypes`.
- `src/domain/advance/advance-cap.ts` tính mức tối đa tới ngày đang chạy theo đồng hồ máy chủ (`upTo: undefined`, `src/domain/advance/advance-cap.ts`), kèm cờ `provisional` khi ngày đó chưa qua `advance.untilDay` của tháng. Điều kiện: tài khoản thuộc diện trả lương, `advanceOn`, chức vụ được ứng, đã bắt đầu làm việc.
- Nhân sự bấm xin tạm ứng (không nhập số tiền) chỉ vào ngày 16 và 17 hằng tháng (`ADVANCE_REQUEST_DAYS`; ngoài hai ngày đó 409 `ADVANCE_WINDOW_CLOSED`; tháng xin phải là tháng của hôm nay, khác thì 409 `ADVANCE_MONTH_NOT_CURRENT`); mỗi tháng một yêu cầu; Admin duyệt hoặc từ chối. `src/domain/advance/advance-approvals.ts` lưu `{ status: pending|approved|rejected, rev, requestedAt, decidedAt, ... }` theo người theo tháng trong `settings`; các bước `request`, `withdraw`, `approve`, `reject`, `cancel` có bảng bước chuyển hợp lệ (409 khi sai). Số trừ vào lương = số theo quy tắc **chỉ khi** yêu cầu `approved` (`approvedSet(month)` → `input.advanceApproved`); không xin, đang chờ hay bị từ chối đều là 0. Duyệt hoặc huỷ duyệt làm băm đầu vào đổi nên lần tính hiện có lỗi thời.

### 4.11 Phép năm (`leave.ts`)

- Phép cộng: `leave.accrual.start` (ngày vào làm), `perMonth` mỗi tháng tròn, `leave.seniority.stepYears` năm tròn +1, sinh nhật (`birthday`, chỉ `nv`), cộng `leaveAdjust` của Admin (số mở đầu của quỹ đầu tiên). Chỉ loại có quyền lợi `leaveAccount` (và ngày vào làm hợp lệ) có sổ phép; ngày sinh nhật chỉ cho loại `nv` (viết cứng trong `leave.ts`).
- Mỗi năm dương lịch N là một quỹ riêng (phép cộng trong năm N); quỹ N hết hạn vào cuối tháng `leave.expiry.month` của năm N+1 (0 = không hết hạn). Dùng quỹ có năm nhỏ hơn trước. Phép cộng trước năm `leave.expiry.fromYear` không nằm trong quỹ nào (quỹ đầu tiên của một người là năm lớn hơn giữa năm vào làm và `fromYear`).
- `ledger` trả `{ …counted, used, expired, settled[{year,on,days}], balance, expiring }`. `settlementFor(staff, leaveDays, month)` = tổng ngày dư của các quỹ có ngày hết hạn nằm ở tháng liền trước tháng này. `payroll-service.loadInputs` chỉ đọc lịch nghỉ khi `tháng === (leave.expiry.month % 12) + 1`; kết quả vào `leaveSettleDays`, engine cộng `settlePay` (mục 4.6).

### 4.12 Số chi trả, công thức "Chi tiết" và cột ngày của phiếu

- **Số chi trả** (`src/domain/payroll/slip-paid.ts`): phiếu có ô tiền Admin chỉnh thì mọi nơi trên máy chủ trả số chi trả = số tự tính của bản chụp áp các ô chỉnh, tính lại tổng lương, miễn thuế, thuế (`taxFrom` của bộ tham số lần tính, nếu Admin không chỉnh tay thuế) và thực lĩnh (`paidFigures`); bản chụp trong DB không đổi và số chi trả tính lúc đọc. Ô tiền: `workBase`, `leavePay`, `settlePay`, `isatPay`, `holidayPay`, `otPay` (gồm OT, làm lễ, làm bù), `attendance`, `travel`, `flexPay`, `breakPay`, `nightPay`, `kpiPay`; ô trừ: `lateCut`, `exempt`, `insurance`, `tax`, `advance`. Tổng lương làm tròn bằng `Math.round`.
- **Phiếu nhân sự** (`self`): xem được sau khi kỳ `paid`; phiếu có số Admin chỉnh thì bản chụp và các dòng chi tiết theo số chi trả (`staffPaidSnapshot` bỏ các trường dẫn xuất không còn đúng), không có công thức. Mỗi ô tiền là một số cộng sẵn.
- **Công thức dưới từng dòng "Chi tiết"** (`src/domain/payroll/slip-formulas.ts` `formulasOf`): chỉ Admin nhận (`GET .../payslips/:username` không `self`), dựng lúc đọc từ bản chụp và bộ tham số **của lần tính** (qua cùng các view tham số của engine), không ghi DB. Mỗi công thức mang chữ và giá trị, chỉ giữ khi giá trị bằng số tự tính của dòng (lệch không quá 1 đồng mỗi bước làm tròn); không khớp thì dòng đó không có công thức.
- **Cột ngày**: `dayFiguresOf` gắn `cot = columnsOfDay(row)` cho ngày `work` và ngày lễ có giờ làm; `withPunchTimes` gắn `punchIn`, `punchOut` (giờ bấm thật, có sẵn trong dòng của bản chụp; bản chụp thiếu thì lấy từ các lượt của tháng bằng `ActualHours.punchTimesOf`) cho ngày làm, vắng, chờ xử lý (trừ chưa tới ngày) và ngày bị giữ vì giải trình (`held`). `staffDayNotesOf` thêm `holidayShifts` và `paidDays` (lễ, phép, iSAT hưởng lương) cho thẻ Thu nhập.
- `verify` so bản chụp với bản tính lại bỏ `punchIn`, `punchOut`, `held` (chỉ để hiển thị).

### 4.13 Ước tính của nhân sự (`periods.estimate`, :1080)

`GET /api/me/estimate` chỉ trả dữ liệu của người đăng nhập. Theo `slip.staffVisibleFrom` (mặc định `afterPaid`; `afterApproval` hoặc `estimateOnly`): khi đã tới mức cho phép và có phiếu của lần chạy cuối (`final`) không lỗi thì trả **bản chụp chính thức** (số chi trả, `official: true`); ngược lại tính lại bằng engine trên đầu vào hiện tại: `m`, `net`, `trace`, `allowanceStatus` tính **cả tháng** (bảo hiểm, thuế là khoản của tháng); tháng hiện tại có thêm `toDate` (phần tới ngày đang chạy, không kèm `net`). Hồ sơ sai loại hoặc bậc, công thức hỏng ⇒ trả `reason` kèm thông báo, không 500. `allowanceStatus` cho giao diện biết còn bao nhiêu ngày nghỉ hoặc giờ vượt thì mất chuyên cần, theo đúng phép so sánh `gte`/`gt`.

---

## 5. Realtime và nhật ký

### 5.1 SSE (`src/platform/events.ts`, `GET /api/events`)

| Sự kiện | Khi | Thân (đầy đủ / rút gọn) |
| --- | --- | --- |
| `params.changed` | Lưu / hoàn tác / đổi chế độ tham số | `{configRev, fromMonth, kind, groups, by}` / `{configRev, fromMonth}` |
| `period.changed` | Mỗi bước kỳ | `{month, status, rev}` / `{month, stage}` |
| `estimate.changed` | Ước tính của một người đổi | `{month}`, gửi theo người |
| `payslip.available` | `mark-paid` | `{month}` |
| `request.decided` | Duyệt/từ chối yêu cầu, gồm tạm ứng (`kind: 'advance'`) | `{month, date?, decision, kind}`, gửi theo người |
| `attendance.changed`, `approvals.changed`, `punch.changed`, `punch.corrected` | Thay đổi chấm công, duyệt khoản | theo danh mục `EVENTS` |

Thông báo khi lưu tham số (`save.ts`): `{configRev, paramsRev, paramsHash, fromMonth, keys, by}`; `config_rev` tăng qua `config-rev.ts`.

### 5.2 Nhật ký (`src/platform/audit.ts`)

| Hành động | Nơi |
| --- | --- |
| `param.set` (độ nhạy `pay` hoặc `normal`) | `save.save`, `save.revert` |
| `param.mode` | Đổi `params_mode` |
| `period.lock-attendance`, `period.calculate`, `period.ai-review`, `period.approve`, `period.mark-paid`, `period.reopen` | `src/domain/period/periods.ts` |
| `payslip.approve`, `payslip.return` | `periods.decidePayslips` |
| `slip.override` | `PUT /api/slip-override` |
| `advance.request`, `advance.withdraw`, `advance.approve`, `advance.reject`, `advance.cancel` | `src/modules/advance/advance-approvals.handlers.ts`; `advance.create`, `advance.decide`, `advance.cancel` ở `src/domain/advance/advance-requests.ts` |
| `explanation.request` | `src/modules/explanations/explanations.controller.ts` |

Mỗi run lưu `engineVersion`, `paramsHash`, `paramsRev`, `params`, `switches`, `inputsDigest` để `verify` tính lại được. `ENGINE_VERSION` được đặt tay trong mã; `verify` trả `engineChanged = (run.engineVersion ≠ ENGINE_VERSION hiện tại)`.

---

## 6. Phụ thuộc

### 6.1 Đồ thị gọi

```
src/modules/**/*.controller.ts ─┬─ src/domain/period/periods.ts ─┬─ src/domain/payroll/payroll-service.ts ── PayrollEngine.create / computeMonth / calcNet / repin
           │                  ├─ src/domain/payroll/slip-paid.ts, src/domain/payroll/slip-pins.ts, src/domain/payroll/slip-formulas.ts
           │                  └─ src/params/store.ts
           ├─ src/params/save.ts ── store, validate, registry, payroll-service
           ├─ src/domain/advance ── src/domain/advance/advance-cap.ts ── payroll-service
           └─ src/domain/explanation (heldByUser) ── payroll-service.loadInputs
(đã bỏ) ── bộ máy từ (đã bỏ) (calcMonth, computeMonth)

payroll-engine.ts ── payroll-params, payroll-calendar, kpi-score, approval-view, actual-hours, punch,
                     formula, formula-vocab, payroll-graph (nạp lười), pay-entries-calc, pay-blocks-calc,
                     work-schedule, pay-options-calc, pay-tail-calc, payroll-pins, payroll-day-parts
payroll-graph.ts ── formula, formula-vocab, (lười) payroll-engine, kpi-score
src/params/validate.ts ── payroll-graph.validateTree, formula
```

### 6.2 Đổi X thì phải kiểm tra Y

| Đổi | Phải kiểm tra |
| --- | --- |
| Công thức trong `calcDay` (`total`, `bonus`, `breakPay`, `otPay`, `makeupPay`) | `partsOfDay` / `columnsOfDay`, `src/domain/payroll/slip-paid.ts` `slipBasisOf` (ô flex/đêm trên phiếu), `src/domain/payroll/slip-formulas.ts`, `mienThueOf` (giờ đêm, OT), test golden (`payroll-golden`, `formula-golden`, `payroll-engine-differential`), tăng `ENGINE_VERSION` |
| `shiftFor` (phân loại ca) | `src/params/validate.ts` `shiftKindOf` :467 (bản viết lại), `shiftOfDay` khi `assigned` |
| `absent`, `gioVuotNguong` | Builtin `tinhGioVuotNguong`, `src/domain/period/periods.ts` `allowanceStatus`, KPI `heSoNgayKpi`, khối phụ cấp (`PayBlocksCalc`) |
| `otBlocked` / sổ giờ bù | `owes` trong `calcDay`, `ApprovalView` (`willmakeup`) |
| Hệ số OT (`ot.rate`, `ot.weekendRate`, `ot.holidayRate`) | `OVERRIDES`, `repinMonth` (dùng giá trị toàn cục), `tax.exempt.*`, `payroll-pins.ts` (`ot15H/20H/30H`) |
| Thêm/đổi khoá tham số | `DEFAULTS` là khối GENERATED (`npm run params:extract/lock/check`); `LATE_KEYS` nếu bản chụp tham số thiếu khoá; registry (`entryFor`, `WRITE_CAP`, cờ wired); `formula-vocab.ts` (sinh lại); `derive`; `validate.crossChecks`; FALLBACK của module (kiểm bằng `scripts/params/check-fallbacks.ts`) |
| `TEXTS` trong `payroll-graph.ts` | Cây phải parse ra **đúng** cây đã lưu `formula.<tên>`; test `formula-golden`, `formula-roundtrip`, `formula-locked` |
| `VARIABLES`, `DAY_VARIABLES` | `variablesOf`, `contextFor`, từ vựng công thức, `checkVocabulary` |
| `roundDong` / chế độ làm tròn | `PayTailCalc.assertParams`, `slip-paid.ts` (`Math.round` riêng), test `pay-tail-half-dong-boundary` |
| Bảo hiểm (`baoHiemOf`, `isPaidDay`) | `m.paidDays`, `tax.insurance.skipDays`, `src/domain/payroll/slip-formulas.ts` `insuranceOf`, test `insurance-paid-days`, `pay-tail-insurance-options` |
| Thuế (`taxFrom`, `contractOf`) | `PayrollPolicy.contractFor`, `tax.method.*`, `slip-paid.ts` `taxFromOf` |
| Tạm ứng | `payroll-graph` `batTamUng` / `tamUng`, `advance-cap.ts`, `netFrame`, `advance-approvals` |
| Ghim (`Pins.KEYS`) | `src/modules/periods/periods.helpers.ts` `SLIP_MONEY` / `SLIP_QTY`, `src/domain/payroll/slip-pins.ts`, `cellsOf` |
| `ENGINE_VERSION` | `verify` so với lần chạy đã lưu; bản chụp phiếu |
| `ActualHours.LOCKED_FIELDS` | Nhánh `d.src` / `otReview` / `attendanceConfirmed` trong `calcDay` (`payroll-engine.ts, :475`) |
| Danh mục chức vụ / ca | `catalog-params.ts`, `catalog_rev` (khoá bộ nhớ đệm store), `shift.kind.*` |
| `prepare` / view | `create().calcMonth` không qua `prepare` |
| Ngưỡng ngày/giờ miễn trừ của khoản chưa duyệt (`request.type.*.countsAbsent`) | `finishMonth` (`approvedCounted`, `unpaidExempt`) |

---

## 7. Test hiện có

Chạy một file: `node --no-warnings=ExperimentalWarning --test <file>`. Tên có tiền tố ngày ghi bằng `*`.

| Nhóm | File |
| --- | --- |
| Lõi / golden | `test/unit/payroll-golden`, `payroll-engine-differential`, `payroll-engine-bad-staff`, `payroll-attendance`, `payroll-retest-fixes`, `levels-engine`, `levels-night-engine`, `ui-rules-engine`, `shared-rules-params` |
| Giờ công từ chấm công | `actual-hours`, `attendance-status`, `schedule-actual-hours`, `*-session-status-day-explanation` |
| Lễ | `payroll-holiday`, `holiday-break-paid-once`, `holiday-ot-after-night-shift`, `holiday-ot-approved-window`, `holiday-row-display`, `no-ot-benefit-holiday`, `slip-holiday-day-cells`, `approval-view-holiday-ot`, `*-holiday-rules`, `statutory-holiday-day-count` |
| OT | `ot-no-break`, `ot-weekend-rate`, `ot-unscheduled-day-paid`, `ot-day-allowance` |
| Làm bù / iSAT | `makeup-paid-in-full`, `makeup-surplus-removed`, `makeup-into-holiday`, `attendance-makeup-days`, `legacy-makeup-day-engine`, `schedule-isat-holiday-makeup`, `isat-calendar`, `isat-saturday-entitled`, `*-makeup-review-fixes` |
| Duyệt khoản | `approval-view`, `approval-view-leave`, `approval-rules-counts-absent`, `*-nghi-duoc-duyet-tinh-chuyen-can` |
| Phương án / đuôi | `pay-method-attendance-options`, `pay-tail-default-differential`, `pay-tail-half-dong-boundary`, `pay-tail-insurance-options`, `tax-block-exempt-flags`, `tax-methods-brackets`, `tax-family-deduction`, `pay-entries-tax-insurance`, `pay-tail-tax-options`, `tax-exempt-premium-only`, `insurance-paid-days`, `ai-review-insured-paid-days`, `pay-entries-calc`, `db-pay-entries` |
| KPI | `kpi-score`, `kpi-five-engine`, `kpi-max-drift`, `kpi-pass-drift` |
| Công thức | `formula-evaluate`, `formula-golden`, `formula-parse`, `formula-roundtrip`, `formula-safety`, `formula-suggest-flag-units`, `formula-tier-daysum`, `formula-validate`, `v1a-s6-formula-gaps` |
| Lịch | `schedule-module`, `schedule-workdays-computed`, `schedule-defaults-zero-drift`, `work-schedule-days` |
| Phiếu | `slip-detail-formulas`, `slip-formulas-merge-terms`, `slip-formulas-named-terms`, `slip-formulas-tax-exempt`, `*-slip-formulas-insurance-paid-days`, `slip-real-punch-times`, `*-slip-held-day-punch-times`, `slip-row-columns`, `slip-figures-v4`, `slip-entries-override` |
| Phép / tạm ứng / AI | `leave-rules`, `leave-year-settlement`, `leave-events-per-year`, `leave-negative-check`, `advance-approved-month`, `advance-options`, `advance-base-holiday`, `advance-holiday-base`, `ai-review-params` |
| Bản chụp tạo bởi phiên bản engine khác | `old-snapshot-counts-absent`, `phase2-old-snapshot` |
| API kỳ | `test/api/period-lifecycle`, `period-reopen`, `period-stale`, `period-lock-guards`, `period-permissions`, `period-aggregates`, `period-days-worked`, `period-estimate-one`, `period-payday-settings`, `period-sessions-month`, `v1a-s6-period-input-guards` |
| API phiếu | `payslip-snapshot`, `payslip-paid-numbers`, `payslip-negative-net`, `payslip-staff-paid-view`, `payroll-bad-profile`, `slip-override-reason`, `slip-detail-formulas`, `slip-row-columns-api`, `me-estimate`, `schedule-estimate-calendar`, `admin-entered-shift-pay` |
| API tham số / công thức | `params-resolve-robust`, `server-reads-params`, `server-reads-params-ot`, `formula-locked`, `settings-formula-tier`, `v1a-s6-formula-cycle-save`, `v1a-s6-formula-nested-sum-save`, `pay-tail-coverage`, `pay-tail-settings` |
| API KPI / tạm ứng / khoản / giải trình | `kpi-scores-api`, `kpi-scores-store`, `kpi-scores-migration`, `*-phan-6-kpi-tu-danh-gia`, `*-advance-approval`, `pay-entries-period`, `pay-entry`, `*-explanation-rejected-no-workday`, `*-explanation-forgot-punch-approved`, `*-explanation-late-early-approved`, `explanation-no-punch-pay` |

Chưa thấy test nào xác nhận trực tiếp các trường hợp biên: phụ cấp ca đêm khi ngày `work` không có giờ làm (mục 8, số 8), ghim `leaveLeft` / `kpiBonus` (bị bỏ qua), và sự khác nhau giữa `calcMonth` mặc định `upTo` của trình duyệt với máy chủ.

---

## 8. Điểm chưa nhất quán và giới hạn

| # | Chỗ | Mô tả |
| --- | --- | --- |
| 1 | `payroll-engine.ts` và | `owes` khi gọi `calcDay` lẻ dùng `avail > unit.owedHoursEpsilon` (giờ, có sai số); `calcMonth` dùng `bal > 0` theo phút nguyên. Cùng một khái niệm, hai cách tính. |
| 2 | `payroll-engine.ts` và | Builtin `tinhGioVuotNguong` không có `counted`, `exempt`, `noshow` và không trả `null`; `gioVuotNguong` có. |
| 3 | `payroll-graph.ts` và `payroll-engine.ts` | `batTamUng` ở `extraVariables` = `advanceOn !== false`, bỏ qua `advanceEligible`; engine có kiểm. |
| 4 | `payroll-graph.ts` và `payroll-engine.ts` | `extraVariables` với KPI năm thành phần tính lại từ `kpiParts`, bỏ qua ô ghim `totalPct`. |
| 5 | `payroll-engine.ts` và | `create().calcMonth` không qua `prepare` (thiếu `monthView`, `forPerson`) nên ngày công chuẩn có thể khác `computeMonth`; `repin` thì qua `prepare`. |
| 6 | `payroll-engine.ts` | `repinMonth` dùng `need('ot.rate')` toàn cục; `calcDay` dùng `entitlementOf('ot.rate')` (ghi đè theo chức vụ). Ghim giờ OT cho chức vụ có hệ số riêng dùng đơn giá toàn cục khi bản chụp chưa có giờ nào. |
| 7 | `payroll-engine.ts` | `R.advanceRate` được đọc nhưng không dùng (tạm ứng đi qua cây `tamUng` với `advance.rate` của `overlay`). |
| 8 | `payroll-engine.ts` | Với `shift.allowance.basis = 'assigned'`, phụ cấp ca đêm = `daily × pct` kể cả ngày `work` không có giờ làm. |
| 9 | `actual-hours.ts` và `payroll-engine.ts, :475` | `LOCKED_FIELDS` xoá `src`, `otReview`, `attendanceConfirmed` khỏi ngày hiệu lực, nên nhánh `plannedShift` và `otOk` dựa trên `d.src` chỉ chạy khi dòng ngày đầu vào mang `src` (`payroll-engine.ts, :475`). Trong `lib/` và `public/`, `src` chỉ được gán cho lượt chấm công (`src/domain/attendance/attendance-sessions.ts, :269`) và trong kiểm OT (`src/domain/ot.ts`); không thấy nơi nào gán `src` cho dòng ngày mà `payroll-service` đưa vào engine. Mức này là suy luận, chưa kiểm bằng test. |
| 10 | `payroll-engine.ts` | `gioVuotNguong` không tính iSAT; iSAT cũng không làm tăng `absent` hay giảm tỷ lệ ngày làm dùng riêng cho phụ cấp chuyên cần, nhưng tỷ lệ ngày làm thực tế dùng cho phụ cấp đi lại vẫn giữ nguyên; `willmakeup` vào `absent` (theo giờ thiếu) mà không phải ngày có lương của bảo hiểm; `leave` (phép) nằm trong cả `absent` lẫn `gioVuotNguong` và đồng thời là ngày có lương của bảo hiểm. |
| 11 | `payroll-engine.ts` | Bảo hiểm: phần người lao động làm tròn từng khoản, phần công ty làm tròn một lần trên tổng; tổng hai cách có thể lệch 1 đến 2 đồng. |
| 12 | `src/domain/period/periods.ts` | `allowanceStatus` dùng `attendance.overLimitHours` toàn cục, bỏ qua ghi đè theo chức vụ và `attendance.overLimitTolerance` (engine :843 có cả hai). |
| 13 | `src/params/validate.ts` | `shiftKindOf` viết lại `shiftFor` (giờ cố định 60 và 1440 viết cứng); hai bản có thể lệch nhau. |
| 14 | `src/platform/db.ts`, `src/engine/leave.ts` (hằng `NV_TYPE`) | Viết cứng `'tts'` ⇒ `short` (trùng `type.tts.defaultContract`) và loại `'nv'` được năm nhân viên và sinh nhật. |
| 15 | `src/engine/kpi-score.ts, :65, :116, :122` | Viết cứng 100 (:47), 1 000 000 (:65), 10 000 (:116, :122); giả định tổng `kpi.weight.*` bằng 100. `kpi.weworkMinCompare` không được đọc (mốc Base Wework so bằng `≥`). |
| 16 | `src/domain/payroll/slip-paid.ts` | Tổng lương dùng `Math.round` thay `roundDong` (bỏ qua `money.roundTo`). |
| 17 | `src/modules/periods/periods.helpers.ts` `SLIP_QTY` | `leaveLeft` và `kpiBonus` được nhận và lưu nhưng không có trong `Pins.KEYS` nên không đổi tiền; không có cảnh báo cho các ô này. Giới hạn giá trị viết cứng ở `src/modules/periods/periods.helpers.ts`. |
| 18 | `src/domain/payroll/slip-paid.ts` `slipBasisOf` | `flexPay` và `nightPay` lấy từ `bonus` theo `shift` của dòng; phần sàn phụ trội đêm ngày lễ của ca `normal` (nhánh `nightH × hourly × night.breakPremium` trong `bonus`) không vào ô flex hay ô đêm nào trên phiếu. |
| 19 | `src/domain/overtime/hour-limits.ts` | `DAY_HOURS_CAP` (12), `MONTH_OT_CAP` (40) đọc từ `DEFAULTS` của registry (`law.ceiling.otDayTotalHours`, `law.ceiling.otMonthHours`), một nơi khai số. |
| 20 | `src/engine/payroll-params.ts` DEFAULTS | Có trong DEFAULTS nhưng không tìm thấy code đọc theo chuỗi khoá: `kpi.ratioRule`, `kpi.payCurveRule`, `kpi.scoreDecimals`, `kpi.scoreMax`, `kpi.weworkMinCompare`, `ot.nightAddScope`, `net.deductionPriority`, `net.stepOrder`, `leave.birthdayMode`, `leave.accrualMode`, `leave.settleMethod`, `leave.useLeaveFirst`, `holiday.compensatory`, `time.maxSpanHours`, `attendance.graceCompare`, `attendance.makeupDayStepRule`. Ngoại lệ: `pay.otHourlyDivisor` có một chỗ đọc theo chuỗi ở (chọn bước hiển thị '2' hoặc '1' cho trang cấu hình), không ảnh hưởng tiền. |
| 21 | `payroll-calendar.ts` | Làm tròn số thực 1e10 viết cứng. |
| 22 | `payroll-engine.ts` và `payroll-service.ts` | `calcMonth` gọi trần có `upTo === undefined` thì tính tới ngày đang chạy (đọc đồng hồ máy chủ); `computeFor` mặc định `upTo = null` (cả tháng). Cùng đầu vào gọi từ hai nơi cho kết quả khác. |
| 23 | `payroll-engine.ts` | `mienThueOf` còn đọc `otHolHours`, `otHolPay`, `otHolNightHours` từ bản chụp, nhưng bộ máy hiện tại không ghi các trường này (luôn 0 ở bản chụp mới). |
