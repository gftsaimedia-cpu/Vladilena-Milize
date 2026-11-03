# Kỳ lương và phiếu lương

Mô tả hành vi của mã đang chạy. Số dòng `file:dòng` là vị trí tại thời điểm viết; khi mã dịch chuyển thì tìm lại theo tên hàm. Khi chú thích trong mã nói khác với mã, tài liệu này theo mã và ghi chỗ lệch ở mục 9.

Phạm vi: vòng đời kỳ lương (khoá công, tính lương, AI kiểm tra, duyệt phiếu, duyệt kỳ, chi trả, mở lại), lần chạy và phiếu, bản chụp, ước tính của Admin và của nhân sự, số Admin sửa trên phiếu (ô tiền, ô số lượng ghim), số chi trả, công thức hiện ở phần "Chi tiết" của phiếu Admin, kiểm lại bản chụp, cảnh báo kỳ lỗi thời, khoản điền thêm, phát hiện của AI gắn vào phiếu, và cách các khoản tiền của bộ máy lương đi vào phiếu. Chi tiết nội bộ của bộ máy tính ngày (`calcDay`) nằm ở `spec/payroll-engine.md`; chấm công, giải trình, yêu cầu nằm ở `spec/attendance.md` và `spec/requests.md`.

Thuật ngữ dùng trong tài liệu:

- **kỳ** = một dòng `payroll_periods` theo tháng `YYYY-MM`.
- **lần chạy** (run) = một dòng `payroll_runs`: một lần bấm "Tính lương".
- **phiếu** = một dòng `payslips` của một lần chạy (một người).
- **bản chụp** (snapshot) = kết quả tháng `m` của bộ máy lương (kèm `rows`, `net`, `trace`), nén gzip trong `payslips.snapshot_gz`.
- **số tự tính** = số do bộ máy tính, lưu ở cột phiếu và bản chụp.
- **số sửa** = giá trị Admin nhập ở `slip_overrides` (ô tiền hoặc ô số lượng).
- **số chi trả** = số tự tính đã áp số sửa, tính lúc ĐỌC, không bao giờ ghi vào bảng phiếu.
- **ghim** = ô số lượng có số sửa (ngày công, giờ OT, điểm KPI...): bộ máy tính lại tháng từ bản chụp theo ghim.
- **đóng băng** = phiếu của lần chạy `final` hoặc `superseded` không đổi nữa (trigger DB).

---

## 1. Phạm vi và file

| File | Việc |
| --- | --- |
| `src/domain/period/periods.ts` | Lõi của module: danh sách kiểm, xem kỳ, các bước ghi của vòng đời, đọc phiếu, ước tính cả kỳ cho Admin, ước tính một người, kiểm lại bản chụp, số ước tính của chính nhân sự (`GET /api/me/estimate`). |
| `src/domain/payroll/payroll-service.ts` | Chỉ đọc: chọn người vào bảng lương (`payrollPeople`), nạp đầu vào một tháng (`loadInputs`), chạy bộ máy cho một người (`computeFor`), băm đầu vào (`digestOf`), công tắc của lần chạy (`switchesOf`), ô KPI điền sẵn (`kpiSlipCells`), tách 8 thành phần (`thanhPhanOf`, chỉ dùng cho xem trước tham số). |
| `src/domain/payroll/slip-paid.ts` | Chỉ đọc: số chi trả. Cơ sở ô sửa từ bản chụp (`slipBasisOf`), ô sửa được (`cellsOf`), tính số chi trả (`paidFigures`, `paidRow`), chọn số sửa đang hiệu lực (`overrideValuesOf`), bản chụp gửi cho nhân sự (`staffPaidSnapshot`), số hiển thị của dòng ngày (`dayFiguresOf`, `dayRowsOf`, `withDayFigures`), bỏ trường chỉ để hiển thị khi so bản chụp (`withoutPunchTimes`), ghi chú ngày cho thẻ Thu nhập (`staffDayNotesOf`). |
| `src/domain/payroll/slip-pins.ts` | Chỉ đọc: tính lại bản chụp theo ô số lượng ghim (`repinned`, `hasPins`), gọi `engine.repin`. |
| `src/domain/payroll/slip-formulas.ts` | Chỉ đọc: dựng công thức chữ cho từng dòng "Chi tiết" của phiếu Admin (`formulasOf`). |
| `src/domain/period/period-warnings.ts` | Câu cảnh báo của kỳ (`CHECKLIST_TEXT`), làm mềm danh sách kiểm (`soften`), các cổng cảnh báo: thực lĩnh âm, phiếu còn cờ AI, khoá công khi còn việc, đếm phiếu tự duyệt/tự loại. |
| `src/domain/period/period-stale.ts` | `staleOf` (kỳ đã tính mà tham số hoặc đầu vào đã đổi), `errorSummaryOf` (phiếu lỗi gom theo mã). |
| `src/domain/period/period-allowance.ts` | `allowanceTotalOf`: tổng phụ cấp của một bản chụp. |
| `src/platform/warnings.ts` | Danh sách cảnh báo theo từng yêu cầu HTTP (AsyncLocalStorage): `run`, `warnIf`, `warn`, `selfDecision`, `optionalReason`, `take`, `codes`. |
| `src/domain/payroll/pay-entries.ts` | Khoản điền thêm theo người/tháng (bảng `pay_entries`): lập, lập lô, sửa, duyệt/từ chối, huỷ, xác nhận cờ thuế/bảo hiểm, liệt kê, nạp khoản đã duyệt cho bộ máy (`approvedByUser`). |
| `src/domain/pay-entries.ts` | Route HTTP của `/api/pay-entries/...`; phát `estimate.changed` khi khoản có hiệu lực. |
| `src/domain/advance/advance-cap.ts`, `src/domain/advance/*` | Số tạm ứng theo quy tắc và yêu cầu tạm ứng theo tháng; phiếu chỉ trừ tạm ứng khi Admin đã duyệt (mục 4.12). |
| `src/domain/payroll/payroll.ts` | Lớp `Payroll` chỉ giữ số (month, official, gross, insurance, tax, advance, net). Mã chạy thật không dùng (chỉ test). |
| `src/domain/payroll/policy.ts` | `PayrollPolicy`: hợp đồng theo thâm niên (`tenureContract`, `contractFor`). |
| `src/domain/payroll/index.ts` | Xuất lại `Payroll`. |
| `src/engine/payroll-engine.ts` | Bộ máy lương dùng chung trình duyệt và máy chủ: `computeMonth`, `repin`, `taxFrom`, `ENGINE_VERSION`; lớp thực lĩnh (`mienThueOf`, `baoHiemOf`, `netFrame`). |
| `src/engine/payroll-day-parts.ts` | `partsOfDay`, `columnsOfDay`: chia tiền một dòng ngày thành thành phần và bốn cột tiền. |
| `src/engine/payroll-pins.ts` | `PayrollPins`: khoá ghim, `apply`, `kpiInput`. |
| `src/platform/config.ts` | Giới hạn kỹ thuật dùng ở đây: `PAYSLIP_PAGE_DEFAULT` 50, `PAYSLIP_PAGE_MAX` 200, `REASON_MIN` 10, `REASON_MAX` 300, `WARN_NAMES_SHORT` 5, `WARN_MAX` 50, `WARN_CODES_AUDIT_MAX` 20, `COMPUTE_CACHE_TTL_MS` 15000, `COMPUTE_CACHE_MAX_ENTRIES` 64, `ENTRIES_LABEL_MAX` 80. |
| `src/platform/db.ts` (phần liên quan) | Lược đồ và trigger của `payroll_periods`, `payroll_runs`, `payslips`, `slip_overrides`, `ai_review_runs`, `pay_entries`; `store.periods` (máy trạng thái, rev), `store.payroll` (lần chạy, phiếu, duyệt phiếu), `store.aiReviews`, `assertPeriodOpen`, `getSlipOverride` / `setSlipOverride`, `padReason`, `softReason`. |
| `src/modules/periods/periods.helpers.ts` / `src/http/api-gate.ts` (phần liên quan) | `SLIP_MONEY`, `SLIP_QTY`, `warnFrozen`, `guardPeriod`, các route `/api/periods...`, `/api/me/estimate`, `/api/slip-override`, `/api/ai/review`, `/api/ai/findings/dismiss`; ánh xạ lỗi có mã sang HTTP. |
| `src/platform/authz.ts` (phần liên quan) | `ROUTE_CAPS` và `routeKey` của các route trên. |
| `src/platform/events.ts` (phần liên quan) | Sự kiện SSE `period.changed`, `payslip.available`, `estimate.changed`. |
| `scripts/dev/sandbox-server.ts` | Máy chủ thử: DB trong RAM, đồng hồ giả, route điều khiển `/__sandbox/...`; đặt lại dữ liệu xoá cả bảng kỳ lương (mục 4.17). |

Giao diện đọc các route trên: ứng dụng Vue ở `web/` (màn Bảng lương, hộp phiếu, phiếu chi tiết, bản in A4 `web/src/views/print/A4Payslip.vue`). Máy chủ phục vụ giao diện từ `web/dist` khi đã build (`src/platform/http.ts`).

---

## 2. Dữ liệu

### 2.1 Bảng

**`payroll_periods`** (`src/platform/db.ts`) — một dòng mỗi tháng; không có dòng nghĩa là `open`, `rev` 0.

| Cột | Ý nghĩa |
| --- | --- |
| `month` | khoá chính `YYYY-MM` |
| `status` | CHECK: `open`, `attendance_locked`, `calculated`, `reviewed`, `approved`, `paid` |
| `rev` | khoá lạc quan; mỗi bước `+1` (`advancePeriod`, `src/platform/db.ts`). Kỳ chưa có dòng được chèn với `rev` 0 rồi cập nhật lên 1 trong cùng lệnh. |
| `current_run_id` | lần chạy hiện hành; `null` khi chưa tính hoặc sau khi mở lại |
| `attendance_locked_by/at`, `calculated_by/at`, `reviewed_by/at`, `approved_by/at`, `paid_by/at`, `paid_ref` | ai/lúc nào của từng bước (`STAGE_COLUMNS`, `src/platform/db.ts`). `paid_at` là ngày chi trả người dùng nhập, không phải lúc bấm. Bước sau điểm quay về bị xoá khi tính lại (`clearAfter`) hoặc mở lại. |
| `reopen_count` | số lần mở lại |

Đối tượng `store.periods.get(month)` (`rowToPeriod`, `src/platform/db.ts`): `{ month, status, rev, exists, currentRunId, attendanceLockedBy, …, paidRef, reopenCount }`.

**`payroll_runs`** (`src/platform/db.ts`)

| Cột | Ý nghĩa |
| --- | --- |
| `id`, `month`, `run_no` | `UNIQUE(month, run_no)`; `run_no` = lớn nhất của tháng + 1 |
| `status` | `draft` → `final` (duyệt kỳ) hoặc `superseded`; `final` → `superseded` (mở lại) |
| `engine_version` | `Engine.ENGINE_VERSION` lúc tính (hiện `'payroll-engine-14'`, `src/engine/payroll-engine.ts`) |
| `params_hash`, `params_rev`, `params_json` | bộ tham số đã giải của tháng lúc tính (đóng băng) |
| `switches_json` | `{ holidays, asOf }` (`contextOf`, `src/domain/payroll/payroll-service.ts`); khoá khác trong cột của lần chạy cũ bị bộ máy bỏ qua |
| `inputs_digest` | sha256 của đầu vào chuẩn hoá (`digestOf`, `src/domain/payroll/payroll-service.ts`) |
| `slips_total`, `slips_error`, `finished_at` | ghi ở `finishRun` |
| `created_by`, `created_at` | |

Trigger `payroll_runs_no_delete` (không xoá), `payroll_runs_guard_update` (`src/platform/db.ts`): không đổi month, run_no, engine, tham số, công tắc, băm, người/lúc tạo; trạng thái chỉ đi `draft→final|superseded`, `final→superseded`; lần chạy `final|superseded` không đổi số đếm hay `finished_at`.

**`payslips`** (`src/platform/db.ts`)

| Cột | Ý nghĩa |
| --- | --- |
| `run_id`, `username` | `UNIQUE(run_id, username)` |
| `status` | `draft`, `pending`, `approved`, `error` |
| `rev` | khoá lạc quan của phiếu (duyệt/trả lại phải gửi đúng rev) |
| `error_code`, `error_detail` | phiếu lỗi; `error_detail` cắt 300 ký tự (`src/platform/db.ts`) |
| `gross`, `insurance`, `tax`, `advance`, `net` | số tự tính, đồng nguyên; `null` khi lỗi. KHÔNG chứa số sửa. |
| `staff_terms_json` | hồ sơ người lúc tính (bỏ `sessionVersion`, `toSafeStaff`, `src/domain/period/periods.ts`) |
| `snapshot_gz` | gzip(JSON(m)), gồm `rows`, `net`, `trace`; `{}` khi lỗi |
| `override_json` | số sửa đóng băng lúc duyệt kỳ: `{ values, reason, rev, updatedBy, updatedAt }` |
| `flags_json` | mảng mã luật AI gắn ở bước AI kiểm tra; `null` khi không có |
| `decided_by`, `decided_at`, `note` | người/lúc/ghi chú duyệt hoặc trả lại |

Trigger `payslips_no_delete`; `payslips_guard_update` (`src/platform/db.ts`): không đổi run, người, mã/chi tiết lỗi, 5 số tiền, hồ sơ, bản chụp; phiếu `error` không rời `error`. `payslips_frozen_update` (`src/platform/db.ts`): phiếu của lần chạy `final|superseded` không đổi gì (vì vậy `freezeOverrides` chạy TRƯỚC khi đặt lần chạy thành `final`).

**`slip_overrides`** (`src/platform/db.ts`, cột `reason`, `rev` ở `src/platform/db.ts`): khoá `(username, month)`; `values_json` (đối tượng ô → số), `updated_by`, `updated_at`, `reason`, `rev`. Ghi đè CẢ đối tượng `values` (không gộp). `values {}` giữ dòng (không xoá) để `rev` không quay về 1. `getSlipOverride` trả `{ values, updatedBy, updatedAt, reason, rev }`, chưa có dòng thì `rev` 0 (`src/platform/db.ts`). `setSlipOverride` kiểm `expectedRev` trong giao dịch.

**`ai_review_runs`** (`src/platform/db.ts`): chỉ thêm dòng; `month`, `run_id`, `rules_json`, `thresholds_hash`, `params_hash`, `findings_total`, `summary_json` (chỉ số đếm), `by`, `at`. `store.aiReviews.latest(month, runId)` là dấu "AI đã chạy cho lần tính này".

**`ai_finding_actions`** (`src/platform/db.ts`): chỉ thêm dòng; mỗi dòng là một lần bỏ qua một cờ của phiếu (`finding_id`, `digest`, `month`, `rule_id`, `by`, `at`, `note`), đọc qua `(đã bỏ)`.

**`pay_entries`** (`src/platform/db.ts`): `username`, `month`, `direction` (`add|deduct`), `amount` (số nguyên > 0), `label` (1–80), `slip_line`, `reason` (CHECK 10–300), `tax_mode` (`none|full|cap|null`), `tax_cap`, `insurance_base`, `flags_confirmed_by/at`, `status` (`pending|approved|rejected|void`), `rev`, `created_by/at`, `decided_by/at`, `decision_note`. Trigger: không xoá; không đổi người lập; `void` là cuối; `approved` chỉ sang `void`; khoản đã duyệt không đổi tiền, hướng, cờ, người, tháng (`src/platform/db.ts`).

Bảng đọc gián tiếp qua `loadInputs`: `staff`, `timesheets` (lịch khai + KPI cũ), `attendance_sessions`, duyệt khai (`store.approvals`), `kpi_scores`, giải trình (`src/domain/explanation/explanations.ts`), yêu cầu tạm ứng theo tháng (`src/domain/advance`), `settings.holidays`.

### 2.2 Khoá settings

| Khoá | Giá trị | Ghi chú |
| --- | --- | --- |
| `holidays` | mảng ngày lễ | lưu vào `switches_json.holidays` |

### 2.3 Khoá tham số (registry, theo tháng)

| Khoá | Mặc định (`src/engine/payroll-params.ts`) | Dùng ở |
| --- | --- | --- |
| `period.payDay` | 10 | `list()` → `paydayExpected` = tháng sau + ngày này |
| `slip.staffVisibleFrom` | `'afterPaid'` | `estimate()`: `afterApproval` / `afterPaid` / giá trị khác → luôn là số ước tính |
| `type.<mã>.startDateRequired` | ctv true, nv true, tts false | danh sách kiểm `MISSING_START_DATE` |
| `type.<mã>.workdays` | ctv 26, nv 26, tts 22 | `needType` (kiểm `type` hợp lệ), ngày công chuẩn khi bản chụp không có `workdaysStd` |
| `type.<mã>.attendance`, `type.<mã>.maxAbsent` | nv 0.25 / 3; ctv, tts 0 / không đặt | chuyên cần (mục 4.4), `allowanceStatus` |
| `attendance.absentCompare`, `attendance.overLimitCompare`, `attendance.overLimitHours`, `attendance.overLimitTolerance` | `gte`, `gte`, 24, 0 | chuyên cần (mục 4.4), `allowanceStatus` |
| `control.reasonRequired.slipOverride` | true | khoá còn trong sổ tham số; lý do sửa số phiếu không bắt buộc |
| `system.entries.requireApproval`, `.maxPerBatch`, `.maxAmount`, `.labelMaxLength` | true, 200, 100000000000, 80 | `src/domain/payroll/pay-entries.ts → limitsFor` |
| `control.reasonMinLength`, `control.reasonMaxLength` | 10, 300 | `limitsFor` (kẹp bởi `config.REASON_MIN/MAX`) |
| `leave.expiry.month` | 1 | `loadInputs`: chỉ tháng `(expiry % 12) + 1` mới quy tiền phép dư |
| `insurance.coverage.<hợp đồng>` | long true, short false | `payrollPeople`: người có `staff.insured IS NULL` |
| `tax.contract.basis`, `tax.longTermMonths` | `'tenure'`, 3 (trong DEFAULTS; bản chụp cũ thiếu khoá thì hợp đồng lấy từ hồ sơ) | `payrollPeople → PayrollPolicy.contractFor` |
| `money.roundTo`, `money.roundMode` | 1, `'halfUp'` | bộ máy `roundDong` (`src/engine/payroll-engine.ts`) |
| `ot.rate`, `ot.weekendRate`, `ot.holidayRate`, `ot.afterMakeup`, `night.otAddRate`, `night.breakPremium` | 1.5, 2, 3, `'block'`, 0.2, 0.3 | tiền OT, giờ đêm lễ, giờ nghỉ đêm (mục 4.3) |
| `tax.exempt.nightPremium`, `.otRate`, `.weekendRate`, `.holidayRate` | 0.3, 1.5, 2, 3 | miễn thuế (mục 4.5) |
| `tax.insurance.skipDays`, `.skipCompare` | 14, `gte` | không đóng bảo hiểm theo số ngày không lương (mục 4.5) |
| `tax.*`, `advance.*` | xem mục 4.5 và 4.12 | bộ máy |

### 2.4 Bộ nhớ đệm

| Bộ nhớ | Khoá / hết hạn | File |
| --- | --- | --- |
| `paramsStore.resolve` | theo tháng; xoá khi đổi chế độ tham số, dòng `param_versions` mới nhất hoặc rev danh mục; tối đa 64 | `src/params/store.ts` |
| `sharedCache.compute` | `estimates|<tháng>`; hợp lệ khi `total_changes()` của DB không đổi VÀ tuổi < 15 s; tối đa 64 mục | `src/domain/period/periods.ts`, `src/ops/compute-cache.ts` |
| `linesCache` | Map theo tháng, khoá `${run.id}:${run.inputsDigest}:${run.finishedAt}`; chỉ lưu khi lần chạy đã có `finishedAt`. Không giữ số sửa | `src/domain/period/periods.ts` |
| `taxFromCache` | WeakMap theo đối tượng tham số | `src/domain/payroll/slip-paid.ts` |
| `engines` | WeakMap theo đối tượng tham số → `Engine.create(params)` | `src/domain/payroll/payroll-service.ts` |

### 2.5 Trạng thái và chuyển trạng thái

**Kỳ** (`PERIOD_STATES`, `src/platform/db.ts`):

| Bước | Từ | Sang | Ghi chú |
| --- | --- | --- | --- |
| khoá công | `open` | `attendance_locked` | |
| tính lương | `attendance_locked`, `calculated`, `reviewed` | `calculated` | gắn `current_run_id`, xoá cột bước `reviewed` trở đi |
| AI kiểm tra | `calculated`, `reviewed` | `reviewed` | cần `current_run_id` |
| duyệt kỳ | `reviewed` hoặc `calculated` | `approved` | lần chạy → `final` |
| chi trả | `approved` | `paid` | |
| mở lại | bất kỳ trạng thái có hạng > đích, kỳ phải có dòng | `open`, `attendance_locked`, `calculated` | `paid` mở lại được kèm cảnh báo `PERIOD_STATE`; mọi lần chạy `draft|final` của tháng → `superseded`; `current_run_id` null; `reopen_count + 1` |

**Lần chạy**: `draft` (mới tạo; tính lại làm các `draft` cũ thành `superseded`) → `final` (duyệt kỳ) → `superseded` (mở lại).

**Phiếu**: tạo `draft` hoặc `error`. AI kiểm tra: `draft → pending`; cờ thay mới cho phiếu `draft|pending|error` (phiếu `approved` giữ nguyên). Duyệt: `pending → approved` (nhận cả `draft`; phiếu đã `approved` gửi lại thì giữ nguyên). Trả lại: `pending|approved → draft`. Duyệt kỳ: `draft|pending` còn lại → `approved` tự động. `error` không bao giờ đổi trạng thái; khi bị loại, chỉ ghi `note`, `decided_by/at`.

**Khoản điền thêm**: `pending → approved | rejected | void`; `approved → void`; khi `system.entries.requireApproval = false` khoản lập ra là `approved` ngay.

**Phạm vi khoá kỳ** (`SCOPE_LOCKED_FROM`, `src/platform/db.ts`) dùng bởi `assertPeriodOpen(month, scope)` (`src/platform/db.ts`) cho các module khác:

| Phạm vi | Khoá từ |
| --- | --- |
| `attendance`, `params` | `attendance_locked` |
| `kpi`, `slip` | `approved` |

Tháng chưa có dòng: luôn mở.

---

## 3. API

Chung cho mọi route:

- Cổng quyền ở `src/http/api-gate.ts`: route không có trong `ROUTE_CAPS` → 403 `NO_ROUTE_POLICY`; thiếu năng lực ở phạm vi `all` → 403 `FORBIDDEN_CAP`; chưa đăng nhập → 401. Cap dạng `self-or:X` qua cổng, handler tự kiểm.
- Lỗi có mã của store/periods (`{ code, httpStatus, details }`) với `httpStatus < 500` → `{ error, code, ...details }` (`src/modules/**/*.controller.ts`); `httpStatus >= 500` (vd `BAD_ARGS` 500) → 500 "Lỗi máy chủ".
- Phản hồi 2xx dạng đối tượng mang thêm `warnings: [{ code, message, severity, count?, link?, details? }]` khi có cảnh báo (`src/platform/http.ts`). Yêu cầu lỗi thì bỏ cảnh báo.
- `routeKey` (`src/platform/authz.ts`): `/api/periods/<m>` → `/periods/:month`; `/api/periods/<m>/payslips/decide`; `/api/periods/<m>/payslips/<u>`; `/api/periods/<m>/estimates/<u>`; `/api/periods/<m>/<bước>`.

### 3.1 Vòng đời kỳ

Mọi bước ghi trả `{ month, status, rev, ... }` và phát `period.changed` sau khi trả (`stepDone`, `src/modules/periods/periods.helpers.ts`). Không có `periodScope` (khoá kỳ do máy trạng thái lo).

| Method + path | Cap | Thân | Trả về |
| --- | --- | --- | --- |
| `GET /api/periods?year=` | `payroll.view` | — | `{ year, periods: [{ month, status, rev, managed (luôn `true`), counts, paydayExpected }] }` đủ 12 tháng |
| `GET /api/periods/:month` | `payroll.view` | — | `view()`: xem 3.1.1 |
| `POST /api/periods/:month/lock-attendance` | `attendance.lock` | `{ rev, acknowledge?: [mã], reason? }` | `{ month, status, rev, checklist }` |
| `POST /api/periods/:month/calculate` | `payroll.calculate` | `{ rev }` | `{ month, status, rev, run, counts }` |
| `POST /api/periods/:month/ai-review` | `ai.review.read` + handler đòi thêm `payroll.calculate` (`src/modules/periods/periods.controller.ts`); Agents tắt → 403 `AGENTS_DISABLED` | `{ rev }` | `{ month, status, rev, findings, bySeverity }` |
| `PUT /api/periods/:month/payslips/decide` | `payroll.approve` | `{ items: [{ username, rev }], action: 'approve'\|'return', note? }` | `{ items: [{ username, status, rev }] }` — KHÔNG phát SSE |
| `POST /api/periods/:month/approve` | `payroll.approve` | `{ rev, excludeErrors?: [{ username, reason }] }` | `{ month, status, rev }` |
| `POST /api/periods/:month/mark-paid` | `payroll.pay` | `{ rev, paidAt: 'YYYY-MM-DD', reference? }` | `{ month, status, rev, paidAt }`; phát thêm `payslip.available` |
| `POST /api/periods/:month/reopen` | `period.reopen`; đích khác `calculated` cần thêm `period.reopen.inputs` (`REOPEN_INPUTS_CAP`, `src/domain/period/periods.ts`; kiểm ở `src/modules/periods/periods.controller.ts`) | `{ rev, to, reason? }` | `{ month, status, rev }` |
| `GET /api/periods/:month/verify` | `audit.read` | — | `{ month, runId, runNo, engineVersion, engineChanged, checked, mismatched: [username] }`; chưa có lần chạy: `{ month, run: null, checked: 0, mismatched: [] }` |

#### 3.1.1 `GET /api/periods/:month` (`view`, `src/domain/period/periods.ts`)

Trả `{ month, status, rev, managed (luôn `true`), reopenCount, stages: { attendanceLocked, calculated, reviewed, approved, paid: { by, at, ref } }, run, counts, totals, errorSummary?, attendanceKept, needsRecalculate, stale, staleReasons, ai, checklist }`.

- `run`: lần chạy hiện hành (không kèm params) hoặc null. `counts`: `{ draft, pending, approved, error, total }`.
- `totals`: `{ people, gross, insurance, tax, advance, net, approved, pending, draft, error }` cộng trên SỐ CHI TRẢ (`paidRows`); phiếu lỗi cộng 0.
- `errorSummary`: `[{ code, count, message }]` (chỉ khi có lần chạy).
- `attendanceKept`: `{ kept, of }` từ dòng tự tính của bản chụp.
- `needsRecalculate = status === 'calculated' && currentRunId == null` (sau khi mở lại, kỳ ở `calculated` và `current_run_id` là `null`).
- `stale`, `staleReasons` (`'params'`, `'inputs'`): chỉ khi `calculated|reviewed`.
- `ai`: lần chạy AI mới nhất của lần tính hiện hành hoặc null.
- `checklist`: `open` → danh sách kiểm khoá công; `calculated` → danh sách kiểm duyệt (`forApprove`); `reviewed` → chỉ cảnh báo duyệt (`approvalWarnings`); khác → `[]`. Có tác dụng phụ ghi DB: `checklist()` gọi `closeStaleIn` đóng lượt Check-in quá hạn (`src/domain/period/periods.ts`).

#### 3.1.2 Lỗi chính của các bước

| Mã | HTTP | Khi nào |
| --- | --- | --- |
| `BAD_MONTH` | 400 | tháng sai dạng |
| `BAD_YEAR` | 400 | `year` của danh sách không phải số nguyên ≥ 0 |
| `BAD_REV` | 400 | `rev` không phải số nguyên (`precheck`) / không phải số nguyên không âm (store) |
| `PERIOD_STALE` | 409 | `rev` lệch; details `{ month, rev }` (rev hiện tại) |
| `PERIOD_STATE` | 409 | trạng thái không cho phép; details `{ month, status, expected, to? }` |
| `PERIOD_NOT_READY` | 409 | AI kiểm tra khi chưa có lần chạy; duyệt kỳ khi không có lần chạy `draft`. Cảnh báo (không chặn) khi khoá công còn mục chưa xong hoặc duyệt kỳ còn phiếu chưa xong |
| `REASON_REQUIRED` | 400 | lý do > 300 ký tự |
| `RUN_INVALID` | 409 | lần chạy không phải nháp của tháng |
| `PAYSLIP_NEGATIVE_NET` | 409 | cảnh báo (severity `danger`) khi còn phiếu thực lĩnh chi trả < 0; details `{ month, count, items: [{ username, net }] }` |
| `BAD_PAID_AT` | 400 | `paidAt` không phải ngày có thật `YYYY-MM-DD` |
| `BAD_TARGET` | 400 | `to` không thuộc `open|attendance_locked|calculated` |
| `BAD_ARGS` | 400 | `excludeErrors` sai dạng, `items` không 1–200, thiếu `username`/`rev`, phiếu lặp |
| `BAD_NOTE` | 400 | `note` không phải chữ |
| `NOTE_REQUIRED` / `NOTE_TOO_LONG` | 400 | ghi chú > 300 (`NOTE_REQUIRED` chỉ còn khi lưu ghi chú trống vào cột có ràng buộc độ dài) |
| `SELF_DECISION_FORBIDDEN` | 403 | cảnh báo khi duyệt/trả phiếu của chính mình (chỉ khi người gọi là `payrollSubject`) |
| `PAYSLIP_NOT_FOUND` | 404 | phiếu không thuộc lần chạy |
| `PAYSLIP_STALE` | 409 | `rev` phiếu lệch; details `{ username, rev }` |
| `PAYSLIP_ERROR` | 409 | duyệt phiếu lỗi (luôn chặn) |
| `PAYSLIP_STATE` | 409 | cảnh báo khi duyệt phiếu không `pending`; lỗi khi trả lại phiếu không `pending|approved` (luôn); lần chạy không còn nháp |
| `PAYSLIP_FLAGGED` | cảnh báo | duyệt lô > 1 phiếu có `flags_json`; duyệt riêng 1 phiếu còn phát hiện chưa bỏ qua |
| `BAD_TYPE` | 400 | `type` của danh sách không có `type.<mã>.workdays` trong bộ tham số của tháng |

#### 3.1.3 Hành vi các bước

| Bước | Hành vi |
| --- | --- |
| khoá công | luôn khoá; cảnh báo `PERIOD_NOT_READY` + một cảnh báo mỗi mục còn chưa bỏ qua (mã của mục, câu `CHECKLIST_TEXT`). Lý do tuỳ chọn |
| tính lương | không có cổng nghiệp vụ (không kiểm danh sách kiểm) |
| duyệt phiếu | duyệt được `draft`, lô có cờ; note tuỳ chọn; mỗi điểm là cảnh báo (`PAYSLIP_STATE`, `PAYSLIP_FLAGGED`, `PAYSLIP_NEGATIVE_NET` severity `danger`, `SELF_DECISION_FORBIDDEN`) |
| duyệt kỳ | từ `calculated` hoặc `reviewed` (cảnh báo `AI_NOT_RUN` khi Agents bật, và `PERIOD_STATE`); phiếu `draft|pending` tự duyệt (người duyệt = người bấm, note NULL); phiếu lỗi chưa loại tự loại với lý do `''`; cảnh báo `PERIOD_NOT_READY` nêu số; thực lĩnh âm chỉ cảnh báo |
| mở lại | mở được cả `paid` (cảnh báo `PERIOD_STATE`); lý do tuỳ chọn |

Khoá kỳ ảnh hưởng tới các route khác (sửa số phiếu, khoản điền thêm, lịch, KPI...): ghi được, cảnh báo `PERIOD_LOCKED` (`assertPeriodOpen`) và, qua `guardPeriod` khi kỳ `approved|paid`, thêm `PERIOD_FROZEN` (`warnFrozen`, `src/modules/periods/periods.helpers.ts` / `src/http/api-gate.ts`).

### 3.2 Phiếu và ước tính

| Method + path | Cap | Query | Trả về |
| --- | --- | --- | --- |
| `GET /api/periods/:month/payslips` | `payroll.view` | `status`, `q`, `flag` (`'1'`/khác), `type`, `page`, `pageSize` | `{ month, run: { id, runNo, status } \| null, total, page, pageSize, rows: [hàng gọn] }` |
| `GET /api/periods/:month/payslips/:username` | `self-or:payroll.view`; không phạm vi `all` thì chỉ được tên của mình (`src/modules/periods/periods.controller.ts`) | — | xem 3.2.2 |
| `GET /api/periods/:month/estimates` | `payroll.view` | `q`, `type`, `page`, `pageSize` | `{ month, source: 'estimate', run: null, period, paramsHash, engineVersion, asOf, total, page, pageSize, totals, attendanceKept, rows }` |
| `GET /api/periods/:month/estimates/:username` | `payroll.view` (phạm vi `all`) | — | `{ month, period, run: null, source: 'estimate', paramsHash, engineVersion, asOf, holidays, payslip: { ...hàng gọn, staffTerms, snapshot, override, cells, formulas, kpiSlip } }` |
| `GET /api/me/estimate?month=&rows=1` | đăng nhập | `month` mặc định tháng hiện tại (giờ VN), `rows=1` kèm dòng ngày | xem 3.2.3 |

#### 3.2.1 Hàng gọn (`slimSlip`, `src/domain/period/periods.ts`)

`{ username, name, type, level, status, rev, workDays, daysWorked, workdaysStd, tienNgayCong, phuCap, allowanceTotal, ot, kpi, truTreSom, khac, attendOk, [quyetToanPhep, quyetToanNgay], [khoanThem, khoanTru], [khoiThem, khoiThemChiTiet], gross, insurance, tax, advance, net, exempt, taxable, afterInsurance, [computed, overridden], flags, errorCode, errorDetail, decidedBy, decidedAt, note }`.

- `gross..net` là SỐ CHI TRẢ; `computed` (số tự tính 5 khoản) và `overridden: true` chỉ có khi phiếu có số sửa tiền hoặc ô ghim làm đổi tiền.
- Các dòng (`tienNgayCong`…`attendOk`) đọc từ `trace` của bản chụp, số thực CHƯA làm tròn; phiếu lỗi hoặc bản chụp không có `trace` → các dòng là `null` (`NO_LINES`). Phiếu có ô ghim: dòng lấy từ bản chụp đã tính lại (`linesFor`).
- `type` lọc theo `staffTerms.type` trong `periods.payslips` (lấy cả tập rồi cắt trang); `status`, `q`, `flag` lọc trong SQL. `type` không có `type.<mã>.workdays` trong bộ tham số hiện hành của tháng → 400 `BAD_TYPE` (kể cả khi chưa có lần chạy).
- `pageSize` kẹp 1…200, mặc định 50.

#### 3.2.2 Một phiếu (`payslip`, `src/domain/period/periods.ts`)

- Người không có phạm vi `all` (xem của mình, `self`): kỳ phải `paid`, không thì 403 `PAYSLIP_NOT_VISIBLE`. Không phụ thuộc `slip.staffVisibleFrom`.
- Chưa có lần chạy hiện hành → 404 `PAYSLIP_NOT_FOUND`; người không có phiếu → 404 `PAYSLIP_NOT_FOUND`.
- Trả `{ month, period: { month, status, rev }, run: { id, runNo, status, engineVersion, paramsHash, paramsRev }, payslip, source: 'snapshot' }`.
- Admin: `payslip` = hàng gọn + `staffTerms` + `snapshot` (bản chụp hoặc bản đã tính lại theo ghim; dòng ngày có thêm `cot` và giờ bấm thật, mục 4.8) + `override` (= `payslips.override_json`, chỉ có sau duyệt kỳ) + `cells` + `formulas` (mục 4.14) + `kpiSlip`.
- Nhân nhân sự: hàng gọn bỏ `flags, note, decidedBy, decidedAt, errorDetail, computed, overridden` (`selfView`); không có `override`, `cells`, `formulas`, `kpiSlip`; `snapshot` = `staffPaidSnapshot` khi phiếu có số sửa (xem 4.7), dòng chi tiết của nguồn đã bị bỏ thành `null` (`staffLinesOf`).

#### 3.2.3 `GET /api/me/estimate` (`estimate`, `src/domain/period/periods.ts`; route `src/modules/sheet/sheet.controller.ts`)

Luôn có `{ month, period, estimate, upTo, label }`; nhãn mặc định `'Số ước tính, chưa phải phiếu lương chính thức'`.

- Người không thuộc bảng lương: `{ ..., estimate: null, payrollSubject: false }`.
- **Phiếu chính thức** khi `slip.staffVisibleFrom = 'afterPaid'` và kỳ `paid`, hoặc `'afterApproval'` và kỳ `approved|paid`, VÀ có phiếu của lần chạy `final` mới nhất không lỗi, bản chụp có `net`: `{ ..., estimate: false, source: 'snapshot', official: true, label: 'Phiếu lương chính thức', paramsHash, engineVersion, allowanceStatus, overridden?, m, holidayShifts, paidDays, net, allowanceTotal, trace, toDate: null, pendingItems: null, actualReport: null }`. Số trong `m`, `net`, `trace` là số chi trả (số sửa đóng băng của phiếu, ô ghim).
- Không đủ điều kiện trên → **ước tính**: người chưa vào bảng lương tháng đó → `{ estimate: null, reason: 'NOT_STARTED' }`; hồ sơ sai (`PAYROLL_BAD_TYPE`, `PAYROLL_BAD_LEVEL`, `PAYROLL_BAD_FORMULA`) → `{ estimate: null, reason: <mã>, message }`; lỗi khác → 500. Thành công: `{ ..., source: 'estimate', official: false, upTo: null, m, holidayShifts, paidDays, net, allowanceTotal, toDate, pendingItems, actualReport, allowanceStatus, trace, paramsHash, engineVersion }`. Số sửa của Admin KHÔNG áp vào ước tính này.
- `m` không có `rows` trừ khi `rows=1` (khi có, mỗi dòng qua `dayRowsOf`: bốn cột tiền `cot` và giờ bấm thật). `holidayShifts`, `paidDays` từ `staffDayNotesOf` (mục 4.8).
- `toDate` chỉ khi tháng là tháng hiện tại: `{ upTo: <ngày hiện tại>, gross, ...m tới ngày hiện tại, rows? }` (không có `net`).

### 3.3 Số Admin sửa tay — `GET|PUT /api/slip-override` (`src/modules/periods/periods.controller.ts`)

- Cap `payroll.override`; PUT có `periodScope: 'slip'` (khoá từ `approved`).
- GET `?user=&month=` → `getSlipOverride`. PUT thân `{ user, month, values, reason?, expectedRev? }` → trả `getSlipOverride` sau khi lưu.
- Kiểm theo thứ tự: người tồn tại (404), tháng (400), `guardPeriod(month)` (cảnh báo `PERIOD_LOCKED` + `PERIOD_FROZEN`), tự sửa phiếu của mình (`selfDecision`: cảnh báo), `values` là object, mỗi khoá thuộc `SLIP_MONEY` hoặc `SLIP_QTY` (400 nếu lạ), giá trị là số hữu hạn, tiền trong `[0, 1e11]` làm tròn `Math.round`, số lượng `|v| ≤ 1e4` làm tròn 2 chữ số.
- Lý do: có gửi thì `optionalReason` (≤ 300); không gửi thì để trống.
- `expectedRev` (tuỳ chọn, số nguyên ≥ 0) khác `rev` hiện có → 409 `SLIP_STALE`. Không gửi → không kiểm.
- Ghi trong một giao dịch cùng nhật ký `slip.override` (một dòng mỗi ô đổi). Không phát SSE. Không ô nào bị từ chối vì "không có tác dụng": mọi khoá của `SLIP_MONEY`/`SLIP_QTY` được lưu (mục 9.3 nói ô nào không đổi số).

### 3.5 Khoản điền thêm — `/api/pay-entries` (`src/domain/pay-entries.ts`)

| Method + path | Cap | Thân / query | Trả về |
| --- | --- | --- | --- |
| `GET /api/pay-entries?month=&username=&status=` | `salary.read` | | `{ month, periodStatus, requireApproval, entries }` |
| `POST /api/pay-entries` | `salary.write` | `{ username, month, direction, amount, label, slipLine?, reason?, taxMode?, taxCap?, insuranceBase? }` | `{ entry }` |
| `POST /api/pay-entries/bulk` | `salary.write` | `{ entries: [...] }` hoặc `{ usernames: [...], ...trường chung }`; `month` ngoài là tháng chung | `{ count, entries }`, tất cả hoặc không |
| `PUT /api/pay-entries/:id` | `salary.write` | trường cần sửa + `rev` | `{ entry }` (chỉ khi `pending`) |
| `PUT /api/pay-entries/:id/decide` | `payroll.approve` | `{ decision: 'approved'\|'rejected', note?, rev }` | `{ entry }` |
| `POST /api/pay-entries/:id/void` | `salary.write` | `{ rev?, reason? }` | `{ entry }` |
| `POST /api/pay-entries/:id/confirm-flags` | `config.legal` | `{ rev, basis? }` | `{ entry }` |

Lỗi: `BAD_MONTH`, `BAD_BODY`, `BAD_FIELD`, `BAD_DIRECTION`, `BAD_AMOUNT` (không phải số nguyên > 0 hoặc > `maxAmount`), `BAD_TAX_MODE`, `BAD_TAX_CAP`, `BAD_INSURANCE_BASE`, `FLAGS_ON_DEDUCT`, `LABEL_FORBIDDEN` (khoản trừ có chữ phạt/fine/penalty; cảnh báo), `DUPLICATE_ENTRY` (cảnh báo), `TOO_MANY`, `BAD_USERNAME`, `NO_SUCH_STAFF` 404, `NOT_PAYROLL_SUBJECT`, `SELF_DECISION_FORBIDDEN` (cảnh báo), `EDIT_CREATOR_ONLY` (cảnh báo), `BAD_ID`, `ENTRY_NOT_FOUND` 404, `BAD_REV`, `REV_STALE` 409, `ENTRY_NOT_PENDING` 409, `ENTRY_NOT_VOIDABLE` 409, `ENTRY_NOT_CONFIRMABLE` 409, `NO_FLAGS`, `FLAGS_ALREADY_CONFIRMED` 409, `BASIS_TOO_LONG`, `PERIOD_LOCKED` 409 kèm `suggestMonth` khi kỳ `approved|paid`, `BAD_DECISION`.

## 4. Cách tính / quy tắc

### 4.1 Người vào bảng lương (`payrollPeople`, `src/domain/payroll/payroll-service.ts`)

Từ `store.listStaff()`, theo thứ tự:

1. Hợp đồng: `PayrollPolicy.contractFor(P, startDate, month, staff.contract)` — khi `tax.contract.basis = 'tenure'`: ngày đủ hạn = cùng ngày của tháng `start + tax.longTermMonths` (tháng ngắn thì lùi về ngày cuối); đủ hạn ≤ ngày cuối tháng lương → `'long'`, không thì `'short'`; thiếu/sai ngày → giữ hợp đồng hồ sơ (`src/domain/payroll/policy.ts`).
2. Người có `staff.insured IS NULL`: `insured = (P['insurance.coverage.<hợp đồng>'] === true)`.
3. Lọc: `payrollSubject`; trong `usernames` nếu có; `startDate` hợp lệ thì phải `≤ ngày cuối tháng`; `resignedOn` hợp lệ thì phải `≥ ngày 01 của tháng`; tài khoản đã khoá chỉ vào khi tháng đó có ngày khai trong lịch hoặc có lượt chấm công.

`P` = tham số truyền vào (kiểm lại bản chụp truyền bộ đã chụp) hoặc bộ đã giải của tháng.

### 4.2 Nạp đầu vào (`loadInputs`, `src/domain/payroll/payroll-service.ts`)

Trả `{ month, holidays, asOf, people: Map<username, person>, overrides }`.

- `asOf` = tham số hoặc bây giờ (ISO).
- Mỗi `person` (đã sao JSON sâu): `{ staff, days: estimateDays(lịch), approvals, sessions, kpi, entries?, advance?, explanationHold?, explanationRejected?, leaveSettleDays?, history? }`.
  - `estimateDays`: bỏ ngày `kind 'pending'`; ngày `work` và ngày `makeup` cũ giữ `kind, shift, in, out, extraKind, extraIn, extraOut, preset, breakMin` (ngày `makeup` cũ giữ giờ để `PUT /sheet` nhận ra ngày gửi lại không đổi; bộ máy tính 0); ngày khác chỉ `{ kind }`; giữ `punchNote`, `makeupPlans`/`makeupDate` của `willmakeup`; có `extraOut` mà thiếu `extraKind` → `extraKind = 'makeup'`.
  - `sessions`: `{ id, state, date, entry }` của tháng.
  - `kpi`: `{ method: 'five', parts, pct, amt, admPct: null, admAmt }`.
  - Trường tuỳ chọn chỉ xuất hiện khi có giá trị, để băm của người khác không đổi: `entries` (khoản điền thêm `approved` của tháng), `advance: true` (Admin đã duyệt tạm ứng của tháng), `explanationHold` (các ngày có giải trình chưa được duyệt hoặc bị từ chối) kèm `explanationRejected` (phần bị từ chối của các ngày đó), `leaveSettleDays` (chỉ tháng `(leave.expiry.month % 12) + 1`).
  - `explanationHold` (`heldFor`,): lấy từ `explanations.heldByUser(month)` (mọi giải trình chưa `approved`; một ngày nhiều giải trình thì ưu tiên trạng thái bị từ chối, rồi đã trả lời, rồi chờ trả lời). Ngày bị từ chối luôn bị giữ; ngày chưa quyết (chờ trả lời, đã trả lời) chỉ bị giữ khi ngày đó chưa có lượt Admin khai thay (`AdminPresence.declaredDates`).
- `overrides`: `{ username: values }` của người có số sửa khác rỗng.

`digestOf(inputs)` = sha256 của `Params.canonical({ month, context: contextOf(inputs), people, overrides? })`; `overrides` chỉ vào khi khác rỗng. Hệ quả: lưu số sửa sau khi tính làm kỳ `stale` (lý do `inputs`).

### 4.3 Một người (`computeFor`) và các khoản tiền của bộ máy

`computeFor` (`src/domain/payroll/payroll-service.ts`): `PayTailCalc.assertAvailable(params)` (phương án chưa dùng được → lỗi `PARAM_OPTION_UNAVAILABLE`, danh sách ở 9.2), rồi `Engine.create(params).computeMonth({ staff, days, approvals, sessions, kpi, entries?, advanceApproved?, leaveSettleDays?, explanationHold?, explanationRejected?, holidays, month, upTo, asOf })`. `upTo`: không truyền khoá → `null` (cả tháng); truyền `upTo: '<ngày>'` → tới ngày đó; truyền `upTo: undefined` → tới ngày chạy (giờ VN). Không có `person` → lỗi `NO_INPUT`.

Bộ máy (`computeMonth`, `src/engine/payroll-engine.ts`): `assertStaff` (loại/bậc lạ → `PAYROLL_BAD_TYPE` / `PAYROLL_BAD_LEVEL`); `ApprovalView.payView` (khoản tự khai chưa duyệt bị bỏ/đổi → `pendingItems`); `ActualHours.apply` (mọi tháng; giờ thực tế theo Check-in/out → `actualReport: { report, missing, absent }`); ngày trong `explanationHold` thành `{ kind: 'unpaid', punchIn?, punchOut?, held }` với `held = 'rejected'` nếu thuộc `explanationRejected`, không thì `'pending'` (ngày không tính lương, như nghỉ không lương, dù có Check-in/out; dòng ngày giữ giờ bấm thật); `calcMonth`; `m.workdaysStd` khi người mang `staff.sched` hoặc tự đếm. Trả `{ m, payDays, pendingItems, actualReport, trace }`.

Các khoản tiền chính vào `m` (chi tiết tính ngày ở `spec/payroll-engine.md`):

| Khoản | Cách tính |
| --- | --- |
| Lương ngày công | `daily = lương cơ bản của bậc ÷ type.<mã>.workdays`; mỗi ngày đi làm cộng `daily` trừ `cut` (giờ thiếu × lương giờ, `lương giờ = daily ÷ time.workHoursPerDay`). Ngày công = ngày có Check-in/out hợp lệ hoặc ngày Admin ghi nhận; ngày khai đi làm mà không chấm công là vắng (`attendance.missingAllRule = 'absent'`), không ngày công. |
| OT ngày có lịch | giờ × lương giờ × `ot.rate` (1,5), cần Admin duyệt khi giờ lấy từ Check-in; bị giữ (`otHold`) khi trước ngày đó còn giờ phải bù và `ot.afterMakeup` khác `'independent'`. |
| OT thứ Bảy, Chủ nhật ngoài lịch | phần giờ rơi vào ngày nghỉ cuối tuần của người: giờ × lương giờ × `ot.weekendRate` (2) (`otWeekendH`, `otWeekendPay`). |
| Làm ngày lễ | giờ rơi vào ngày lễ (tính theo ngày dương lịch của từng phút, kể cả ca đêm sang ngày lễ) × lương giờ × `ot.holidayRate` (3), cộng thêm phần giờ trong khung đêm × lương giờ × `night.otAddRate × ot.holidayRate` (0,6). Phần ca chính rơi vào ngày lễ được trừ khỏi lương ngày (`holMainH`) và trả theo mức lễ; giờ nghỉ của ca trong ngày lễ tính như giờ làm. Chức vụ không có quyền lợi OT không có OT hay giờ làm lễ. |
| Lương ngày lễ | ngày lễ trong lịch của người, trong thời gian làm việc, chức vụ có `paidHoliday`: `daily`; khai đi làm lễ mà không chấm công là vắng, không có lương lễ. |
| Giờ làm bù | giờ làm thêm loại `makeup` trả đủ: giờ × lương giờ × 1, cộng phần trả thêm của giờ rơi vào ngày lễ theo hệ số làm bù ngày lễ. Không cắt theo giờ còn nợ; giờ làm bù nhiều hơn giờ cần bù không bị bỏ (`makeupCredit`). `debt` = giờ thiếu chưa bù = max(0, giờ thiếu của ngày đi làm + một công cho mỗi ngày "Nghỉ, sẽ làm bù" − giờ làm bù). |
| Phụ cấp ca, giờ nghỉ đêm | phụ cấp ca Night/Flex của ca chính và giờ nghỉ trong khung đêm của ca chính × lương giờ × (1 + `night.breakPremium`). Ngày có giờ làm bù vẫn giữ hai khoản của ca chính; đoạn làm bù chỉ nhận lương giờ cơ bản và không có Off Paid riêng. Ngày chỉ có đoạn OT ngoài lịch (`extraOnly`) KHÔNG có hai khoản này; ngày có OT vẫn giữ. Ca đêm sang ngày lễ vẫn giữ phần sàn giờ đêm × lương giờ × `night.breakPremium`. |
| iSAT | ngày iSAT hưởng lương (`paidOff`): `daily`; chỉ thứ Bảy (`isat.weekday`) và chỉ chức vụ/bậc có quyền lợi iSAT; luật này áp cả với Admin (`isatRefusal`); ngày iSAT sai thứ hoặc sai quyền lợi lưu từ trước tính 0 và hiện ở mục `ISAT_INVALID`. |
| Nghỉ phép | chức vụ `paidLeave`: `daily`; không thì 0. Nghỉ không lương, nghỉ được duyệt, vắng, chờ xử lý, ngày giữ vì giải trình: 0. |
| Phép dư hết hạn | xem 4.11. |
| KPI | `T.kpi`: 5 thành phần (điểm × trọng số `kpi.weight.*`) hoặc % tự đánh giá; tiền theo công thức `luongKpi`; ghim KPI qua `PayrollPins.kpiInput`. |
| Khối phụ cấp, khoản điền thêm | `PayBlocksCalc.attach`, `PayEntriesCalc.attach` (mục 4.13). |

### 4.4 Chuyên cần và phụ cấp đi lại

`finishMonth` (`src/engine/payroll-engine.ts`), chỉ với chức vụ có `travel` hoặc `attendance`:

- **Số ngày nghỉ xét chuyên cần** (`absent`,) = nghỉ phép + nghỉ không lương (gồm ngày bị giữ vì giải trình) + nghỉ được duyệt (khi `request.type.approved.countsAbsent` bật) − khoản được miễn tính là ngày nghỉ + vắng không phép + số dòng iSAT (mỗi dòng iSAT một ngày, đủ hạn mức hay vượt đều tính) + số ngày "Nghỉ, sẽ làm bù" chưa được bù, bằng `min(số ngày willmakeup, làm tròn lên(giờ bù còn thiếu ÷ time.workHoursPerDay))`.
- **Giờ vượt ngưỡng** (`overHours`) = `(nghỉ không lương + nghỉ được duyệt tính vào − miễn + vắng) × giờ mỗi công + giờ thiếu chưa bù + ngày phép năm × giờ mỗi công`, làm tròn theo `attendance.shortHoursRounding`.
- **Giữ chuyên cần** (`attendOk`) khi: `absent` không chạm ngưỡng `type.<mã>.maxAbsent` theo `attendance.absentCompare`, VÀ `overHours` không chạm ngưỡng theo `attendance.overLimitCompare`; ngưỡng giờ = `type.<mã>.overLimitHours` (nếu có) hoặc `attendance.overLimitHours`, cộng `attendance.overLimitTolerance`. Chạm ngưỡng nghĩa là mất khi so `gte`, phải vượt mới mất khi so `gt`.
- **Phụ cấp chuyên cần** = lương cơ bản × `type.<mã>.attendance` × (số ngày đi làm ÷ ngày công chuẩn) khi giữ chuyên cần, không thì 0. **Phụ cấp đi lại** = lương cơ bản × `type.<mã>.travel` × (số ngày đi làm ÷ ngày công chuẩn); người ở iDorm thì 0. "Ngày đi làm" là số ngày thực đi làm (kể cả ngày lễ có giờ làm), không tính nghỉ hay giờ làm bù.
- Người không có `travel`/`attendance` thì `attendOk` là `null` và không có dòng chuyên cần.

### 4.5 Lớp thực lĩnh của bộ máy (`netFrame`, `src/engine/payroll-engine.ts`)

Đơn vị VND; `roundDong(x) = Math.round(x / money.roundTo) * money.roundTo` (mặc định làm tròn tới đồng).

1. `gross = roundDong(m.total)` (`m.total` gồm khoản điền thêm kiểu cộng và khối phụ cấp, phép dư quy tiền).
2. **Miễn thuế** (`mienThueOf`,): chỉ phần trả cao hơn lương giờ thường của cùng số giờ. `hourly = base ÷ type.workdays ÷ time.workHoursPerDay`.
   - `exemptNight = roundDong(Σ theo ngày min( max(0, giờ đêm − giờ đêm của ca chính rơi vào ngày lễ) × lương giờ × tax.exempt.nightPremium, phụ cấp ca đã trả của ngày đó ))`. Ngày không có phụ cấp ca thì giờ đêm không được miễn; giờ đêm ngày lễ không vào mục này. Bản chụp không có `rows` thì dùng tổng giờ đêm × lương giờ × `tax.exempt.nightPremium`.
   - `exemptOt = roundDong(Σ bốn nhóm của max(0, min(tiền trả, mức luật của nhóm) − lương giờ × giờ của nhóm))`: OT ngày có lịch (mức luật = `tax.exempt.otRate` × lương giờ × giờ), OT cuối tuần (`tax.exempt.weekendRate`), OT ngày lễ (`tax.exempt.holidayRate`, cộng `holidayNightAdd` × giờ đêm lễ, `holidayNightAdd = tax.exempt.nightPremium + night.otAddRate × tax.exempt.holidayRate`) và giờ làm lễ (cùng mức lễ). Giờ làm bù không có mục miễn thuế.
   - `exempt = min(gross, exemptNight + exemptOt + phần miễn thuế của khoản điền thêm và khối phụ cấp)`; phần miễn của khoản/khối chỉ có khi cờ đã xác nhận: `full` = cả khoản, `cap` = tới `taxCap`. `taxable = max(0, gross − exempt)`.
3. **Bảo hiểm** (`baoHiemOf`,): nền theo `insurance.base` (cộng phần khoản/khối có cờ đã xác nhận khi `withFlaggedAllowances`). **Ngày có lương** (`m.paidDays`) = ngày công (kể cả ngày lễ có giờ làm) + nghỉ phép năm hưởng lương + nghỉ lễ hưởng lương + iSAT hưởng lương, tính trong thời gian làm việc, không tính ngày chỉ có giờ làm thêm; bản chụp không có `paidDays` thì đếm lại từ `rows`. **Ngày không lương** = `max(0, ngày công chuẩn của người (m.workdaysStd hoặc type.<mã>.workdays) − ngày có lương)`. Không đóng khi người không `insured` hoặc khi ngày không lương so với `tax.insurance.skipDays` (14) theo `tax.insurance.skipCompare` (mặc định `gte`) đạt ngưỡng. Vì ngày chưa tới không phải ngày có lương, giữa tháng chưa đủ ngày có lương thì chưa trừ bảo hiểm (với ngưỡng mặc định: chuẩn 26 cần ≥ 13 ngày có lương, chuẩn 22 cần ≥ 9). Mỗi khoản `roundDong(min(nền, trần) × tỷ lệ)` với `tax.insurance.employee.bhxh/bhyt/bhtn` = 0.08 / 0.015 / 0.01; `insurance = bhxh + bhyt + bhtn`; phần công ty `employer` theo `tax.insurance.employer.*` (0.175 / 0.03 / 0.01). Mức đóng không chia theo ngày. Trần từ `tax.insurance.capMultiple` (20) và lương cơ sở / lương tối thiểu vùng.
4. **Thuế** (`taxFrom`,) theo `tax.method.<hợp đồng>` (long `progressive`, short `flat`):
   - `progressive`: `income = taxable − insurance`; phát sinh khi `income` so (`tax.personalCompare`, `gt`) với ngưỡng (mặc định giảm trừ bản thân); `assessable = max(0, income − deduction)`, `deduction = tax.deduction.personal (15 500 000) + người phụ thuộc × tax.deduction.dependant (6 200 000)` khi `deductOn`; thuế = `roundDong(lũy tiến tax.brackets)` (5%/10%/20%/30%/35% với trần 10/30/60/100 triệu).
   - `flat`: nếu `taxOn` và `gross` so (`tax.casual.thresholdCompare`, `gte`) `tax.casual.threshold` (5 000 000) → `roundDong(gross × tax.casual.rate (0.1))`, không thì 0.
5. **Tạm ứng**: chỉ khi `advanceApproved === true`, số theo công thức `tamUng` (mục 4.12); không thì 0.
6. `net = gross − insurance − tax − advance − tổng khoản điền thêm kiểu trừ` (trừ sau thuế). `m.net` có thêm `entriesAdd`, `entriesDeduct` khi có khoản; `m.net` còn mang `insuredMonth`, `noPayDays`, `exemptNight`, `exemptOt`, `bhxh/bhyt/bhtn`, `employer`, `deduction`, `assessable`, `taxDue`, `advanceDays`.

Bản chụp lưu `m` gồm `trace` (số thực chưa làm tròn của các thành phần). Cột phiếu `gross..net` = `m.net.*` (đồng nguyên).

### 4.6 Danh sách kiểm (`checklist`, `src/domain/period/periods.ts`)

`people = payrollPeople(month)`. Mục `{ code, count, severity, link, acknowledgeable }` chỉ thêm khi `count > 0`; `acknowledgeable = !forApprove && severity === 'block' && code ∉ {MONTH_NOT_ENDED, OPEN_SESSIONS}`.

| Mã | Điều kiện | Mức | link |
| --- | --- | --- | --- |
| `MONTH_NOT_ENDED` | ngày hiện tại (giờ VN) ≤ ngày cuối tháng | block | attendance |
| `OPEN_SESSIONS` | số phiên `state 'open'` của người trong bảng (sau khi `closeStaleIn` đóng phiên quá hạn) | block | attendance |
| `FORGOT_PUNCH` | số (người, ngày) có phiên `entry.kind 'pending'`, `reason 'forgot-out'`, cộng ngày `report` có `state forgot-in|forgot-out`; trừ ngày có giải trình bị từ chối | block | attendance |
| `PUNCH_REVIEW` | ngày trong `actualReport.missing` của tháng mà không thuộc `FORGOT_PUNCH`, trừ ngày có giải trình bị từ chối (chỉ khi `afterSwitch`) | như trên | attendance |
| `EXPLANATION_PENDING` | số (người, ngày) có giải trình chưa quyết (chưa duyệt, chưa bị từ chối) | warn | approvals |
| `ABSENT_NO_EXPLANATION` | số (người, ngày) trong `actualReport.absent` của tháng (ngày trong lịch, không có lượt nào) mà không có giải trình nào ở bất kỳ trạng thái | warn | attendance |
| `PENDING_APPROVALS` | khoản tự khai `pending` của tháng của người trong bảng | block | approvals |
| `ISAT_INVALID` | ngày kind `isat` đã lưu của người trong bảng mà `isatRefusal` báo sai thứ `isat.weekday` hoặc chức vụ / bậc không có `benefit.isat` | warn | attendance |
| `MISSING_SHIFT` | (chỉ khi `afterSwitch`) người không khoá, không có `shiftCode` | warn | staff |
| `MISSING_START_DATE` | `type.<mã>.startDateRequired` bật và `startDate` không hợp lệ | block | staff |
| `AI_NOT_RUN` | (chỉ `forApprove`, chỉ khi Agents bật) chưa có lần chạy hiện hành hoặc chưa có `ai_review_runs` cho lần chạy đó | block | ai-review |
| `PENDING_PAY_ENTRIES` | (`forApprove` hoặc `approvalWarnings`) khoản điền thêm `pending` của người trong bảng | warn | pay-entries |
| `RUN_STALE` | (như trên) `staleOf(...).stale` | warn | periods |

Lỗi tính của từng người trong lúc dựng `PUNCH_REVIEW` bị nuốt. `raw: true` trả danh sách gốc; mặc định trả `soften(items, month)`: mọi mục thành `severity 'warn'`, `acknowledgeable false`, thêm `message` từ `CHECKLIST_TEXT` (`src/domain/period/period-warnings.ts`).

### 4.7 Từng bước ghi

Mọi bước ghi chạy trong `store.transaction` cùng dòng nhật ký. `precheck(month, rev, from)` (`src/domain/period/periods.ts`) chạy TRƯỚC việc nặng để báo đúng mã: tháng, `rev` số nguyên, `rev` khớp, trạng thái thuộc `from`. Store kiểm lại `rev` và trạng thái trong giao dịch (`loadPeriodForChange`, `advancePeriod`).

**Khoá công** (`lockAttendance`,): `precheck(['open'])` → `raw = checklist(raw)`, `items = soften(raw)`, `blockers` = mục `block` của `raw` trừ mục acknowledgeable có trong `acknowledge` → `warnLockChecklist` (cảnh báo `PERIOD_NOT_READY` và một cảnh báo mỗi mục) → nếu có mục được acknowledge thì `cleanText(reason)` → `store.periods.lockAttendance` → nhật ký `period.lock-attendance` (`before { status: 'open' }`, `after { status, acknowledged, checklist: {mã: count} }`, `reason`). Trả kèm `checklist: items`.

**Tính lương** (`calculate`,): `precheck(['attendance_locked','calculated','reviewed'])`, `resolved = paramsStore.resolve(month)`; trong giao dịch: `loadInputs(month)` → `createRun` (các `draft` cũ → `superseded`; `run_no` mới; lưu engine, tham số, `switchesOf`, `digestOf`) → mỗi người `slipOf` → `addPayslip` → `finishRun({ total, errors })` → `markCalculated` (gắn `current_run_id`, xoá cột bước sau) → nhật ký `period.calculate` (`after { status, runNo, slips, errors, paramsRev }`). Không kiểm danh sách kiểm.

`slipOf`: thành công → `{ status 'draft', gross, insurance, tax, advance, net (= m.net.*), staffTerms, snapshot: { ...m, trace } }`; ném lỗi → `{ status 'error', errorCode: e.code (chuỗi) hoặc 'CALC_ERROR', errorDetail (≤ 300; lỗi PAYROLL_BAD_FORMULA được thêm tiền tố "Công thức đã lưu không hợp lệ: " bởi `errorMessageOf`), staffTerms, snapshot: {} }`.

**AI kiểm tra** (`aiReview`,): `precheck(['calculated','reviewed'])`; không có `currentRunId` → 409 `PERIOD_NOT_READY`. Trong giao dịch: `runAi(month)` (= `aiReviewResult(month, false)` của `(đã bỏ)`, tính mới) → cờ theo người = các `rule` của `result.findings` có `username`, bỏ trùng, sắp xếp (phát hiện cấp hệ thống `systemFindings` không gắn cờ vào phiếu nào) → `applyAiReview` (`draft → pending`, thay `flags_json`, `rev + 1` khi trạng thái hoặc cờ đổi) → `aiReviews.add` (`thresholdsHash = sha256(canonical(result.thresholds || THRESHOLDS))`, `paramsHash` của lần chạy, chỉ số đếm) → `markReviewed` → nhật ký `period.ai-review` (`after { status, findings, flagged }`).

**Duyệt / trả lại phiếu** (`decidePayslips`,): tháng; có `currentRunId` (không thì 409 `PERIOD_STATE`); `note` là chữ hoặc vắng; `selfDecision` nếu có `items[i].username === me.username` và `me.payrollSubject`. Trong giao dịch, theo thứ tự:
1. Duyệt: `warnFlagged` (một cảnh báo `PAYSLIP_FLAGGED` nêu ≤ 5 tên).
2. Duyệt: thực lĩnh chi trả âm của các phiếu được chọn → `warnNegativeNet`.
3. `store.payroll.decidePayslips` (`src/platform/db.ts`): 1–200 phiếu; note > 300 → `NOTE_TOO_LONG`; lần chạy phải `draft`; mỗi item cần `username` + `rev`, không lặp, phiếu tồn tại, `rev` khớp; duyệt: phiếu lỗi → `PAYSLIP_ERROR`; phiếu không `pending` → cảnh báo `PAYSLIP_STATE`; lô > 1 có `flags_json` → cảnh báo `PAYSLIP_FLAGGED`; trả lại: phiếu không `pending|approved` → `PAYSLIP_STATE`. Ghi `status`, `rev + 1`, `decided_by/at`, `note`; phiếu đã `approved` được duyệt lại thì giữ nguyên.
5. Nhật ký `payslip.approve` / `payslip.return` mỗi phiếu (`entityId '<tháng>:<username>'`, `after { status, rev }`, `reason` = note).

**Duyệt kỳ** (`approve`,): `precheck(['calculated','reviewed'])`; `calculated` → cảnh báo `AI_NOT_RUN`. Trong giao dịch: thực lĩnh chi trả âm của MỌI phiếu → `warnNegativeNet`; `autoCounts` (`autoApproved` = số phiếu `draft|pending`, `autoExcluded` = phiếu lỗi không có trong `excludeErrors`) → `store.periods.approve` (`src/platform/db.ts`): `calculated` → cảnh báo `PERIOD_STATE`; lần chạy phải `draft`; `excludeErrors` mỗi mục `{ username (chuỗi), reason (softReason) }`; phiếu chưa xong → cảnh báo `PERIOD_NOT_READY`; tự duyệt phiếu chưa xong; ghi `note` lý do cho phiếu lỗi loại; `freezeOverrides` (chép `slip_overrides` khác rỗng của tháng vào `payslips.override_json`); lần chạy → `final`; kỳ → `approved`. Nhật ký `period.approve` (`before { status: 'reviewed' }`, `after { status, excluded: số mục excludeErrors, autoApproved?, autoExcluded? }`).

**Chi trả** (`markPaid`,): `precheck(['approved'])`; `paidAt` phải là ngày có thật `YYYY-MM-DD` (400 `BAD_PAID_AT`); store lưu `paid_at = paidAt`, `paid_ref` = `reference` cắt 100 ký tự (rỗng → null). Nhật ký `period.mark-paid` (`after { status, paidAt }`, không ghi `reference`). Route sau đó phát `payslip.available` cho `payslipUsers(month)` (người có phiếu không lỗi của lần chạy hiện hành).

**Mở lại** (`reopen`,): không `precheck`. `cleanText(reason)` → store `reopen` (`src/platform/db.ts`): `to` hợp lệ (400 `BAD_TARGET`), `softReason`, `rev`, kỳ có dòng và hạng hiện tại > hạng đích (không thì `PERIOD_STATE`), `paid` → cảnh báo `PERIOD_STATE`, mọi lần chạy `draft|final` của tháng → `superseded`, `advancePeriod(from [status], to, extra { current_run_id: null, reopen_count + 1 }, clearAfter)`. Nhật ký `period.reopen` (`before { status }`, `after { status, to, reopenCount }`, `reason`). Hệ quả: mở về `calculated` để lại kỳ `calculated` không có lần chạy (`needsRecalculate`); AI kiểm tra, duyệt kỳ, duyệt phiếu đều lỗi cho tới khi tính lại. Mở kỳ `approved|paid` làm lần chạy `final` thành `superseded`: `finalPayslip` không còn tìm thấy phiếu chính thức, nhân sự quay về số ước tính.

### 4.8 Số chi trả (`src/domain/payroll/slip-paid.ts`, `src/domain/payroll/slip-pins.ts`)

Giá trị số sửa đang hiệu lực (`overrideValuesOf`, `slip-paid.ts`): lần chạy `final` → `payslips.override_json.values` (đóng băng); khác → `slip_overrides.values` hiện tại.

Ô sửa (`src/modules/**/*.controller.ts`):

- `SLIP_MONEY` (tiền, ≥ 0, đồng): `workBase, leavePay, settlePay, isatPay, holidayPay, otPay, attendance, travel, flexPay, breakPay, nightPay, kpiPay, kpiAmt, lateCut, exempt, insurance, tax, advance`.
- `SLIP_QTY` (số lượng): `workDays, unpaidDays, leaveDays, settleDays, isatDays, holidayDays, ot15H, ot20H, ot30H, kpiPct, debtH, leaveLeft, kpiBase, kpiUser, kpiQltt, kpiPeer, kpiSelf, kpiBonus`.

Hai đường áp số sửa, theo thứ tự:

1. **Ghim** (`repinned`): khoá ghim = `PayrollPins.KEYS` = `workDays, leaveDays, unpaidDays, isatDays, holidayDays, ot15H, ot20H, ot30H, debtH, kpiAmt, kpiPct, kpiBase, kpiUser, kpiQltt, kpiPeer, kpiSelf, settleDays`. Ba ô giờ OT: `ot15H` = OT trả theo `ot.rate` (ngày có lịch), `ot20H` = OT trả theo `ot.weekendRate` (cuối tuần ngoài lịch), `ot30H` = giờ ngày lễ (làm lễ + OT lễ). Có ghim có tác dụng → `engine.repin(snapshot, staffTerms, pins, month)` với bộ tham số của lần chạy (ước tính: bộ đã giải của tháng): áp ghim lên số tổng hợp theo đơn giá của bản chụp (`PayrollPins.apply`: ngày theo `daily`, giờ OT theo đơn giá trung bình đang có của loại đó, hoặc lương giờ × hệ số khi chưa có giờ nào), chạy lại `finishMonth` (phụ cấp, KPI, khối, miễn thuế, bảo hiểm, thuế, thực lĩnh); gắn `pinAdjust` (tiền/ngày của dòng ngày mà `rows` không đổi theo) và `pinned`. Lỗi → `null` (giữ bản chụp gốc). Không đọc lại lịch hay Check-in/out. Chỉ bộ phương án mặc định `pay.method = 'A'` được ghim.
2. **Ô tiền** (`paidFigures`, `slip-paid.ts`) trên cơ sở `basis = slipBasisOf(bản chụp đã ghim hoặc gốc)`:
   - `auto` (`slipBasisOf`,): `workBase = basePay − off + cut`; `leavePay = Σ rows.total (kind leave) + pinAdjust.leavePay`; `settlePay`; `isatPay = Σ rows.total (isat) + pinAdjust.isatPay`; `holidayPay = Σ rows.holBase (holiday) + pinAdjust.holidayPay`; `otPay = otPay + holWorkPay + makeupPay`; `attendance`; `travel`; `flexPay = Σ rows.bonus (shift flex)`; `breakPay`; `nightPay = Σ rows.bonus (shift night)`; `kpiPay`; `lateCut = max(0, cut)`; `exempt, insurance, tax, advance` của `m.net`. Thiếu `net`/`rows`/`total` → `null`.
   - `V(k)` = số sửa nếu có (số hữu hạn), không thì `auto[k]`.
   - Không ô thu nhập (`SLIP_INCOME_KEYS` = 12 ô từ `workBase` tới `kpiPay`), không `lateCut`, không ô trừ (`lateCut, exempt, insurance, tax, advance`) và không `force` → `null` (giữ số lưu từng đồng).
   - `total = Math.round(basis.total + Σ_{k∈INCOME} (V(k) − auto[k]) − (V(lateCut) − auto.lateCut))`.
   - `exempt = số sửa exempt` nếu có, không thì `min(total, n.exempt)`; `taxable = max(0, total − exempt)`; `insurance = V(insurance)`.
   - `tax = số sửa tax` nếu có, không thì `taxFrom({ contract: n.contract, taxOn: n.taxOn, deduction: n.deduction }, total, taxable, insurance).tax` của bộ tham số lần chạy (`taxFromOf`); không dựng được bộ máy → `n.tax` và `taxStale = true` khi có số sửa ở ô thu nhập.
   - `advance = V(advance)`; `net = total − insurance − tax − advance − n.entriesDeduct`.
   - `force = true` khi có bản chụp ghim: luôn trả số chi trả.
3. `paidRow`: phiếu lỗi → `null`; có số chi trả → hàng với `gross..net` = số chi trả, `exempt`, `taxable`, `afterInsurance = gross − insurance`, `computed` (5 số lưu), `overridden: true`.
4. Không có số chi trả (`withPaid`, `periods.ts`): giữ số lưu, thêm `exempt`, `taxable` của bản chụp, `afterInsurance = gross − insurance`.

`cellsOf(snapshot, original)`: mọi ô sửa được theo số tự tính — ô tiền = `auto` của bản đã ghim; ô số lượng từ bản gốc: `kpiAmt`, `workDays = count`, `leaveDays = leave`, `unpaidDays = unpaid + approved + noshow`, `isatDays`, `holidayDays = số dòng holiday có holBase > 0 + pinAdjust.holidayDays`, `settleDays`, `ot15H = otHours − otWeekendHours − otHolHours`, `ot20H = otWeekendHours`, `ot30H = holWorkHours + otHolHours`, `debtH = debt`, `kpiPct`, 5 điểm KPI từ `kpiParts`.

**Bản chụp cho nhân sự** (`staffPaidSnapshot`,) khi có số chi trả: bản sao với `total`, `net.{gross, exempt, taxable, insurance, tax, advance, net}` = số chi trả; bỏ `net.assessable`, `net.taxDue`; bỏ `exemptNight/exemptOt` khi miễn thuế đổi; bỏ `bhxh/bhyt/bhtn/employer` khi sửa bảo hiểm; bỏ `advanceDays`, `advanceBase` khi sửa tạm ứng; ô `attendance, travel, kpiPay, breakPay` ghi thẳng vào `m` và `trace` (`PAID_DIRECT`), `allow = travel + attendance`; sửa một ô thuộc nhóm `PAID_WITHHELD` (tiền ngày công; OT/lễ/làm bù; flex/night) → bỏ các trường chi tiết của nhóm và bỏ `rows`; bản chụp ghim cũng bỏ `rows`; `trace.{tongThuNhap, mienThue, thuNhapChiuThue, baoHiem, thueTncn, tamUng, thucLinh}` = số chi trả.

### 4.9 Dòng ngày của phiếu

Mỗi phần tử `m.rows` là một ngày: `{ date, kind, shift, daily, hourly, hours, short, cut, bonus, breakPay, makeupH, makeupPay, otH, otPay, otWeekendH, holWork, holWorkH, holWorkPay, holBase, paidOff, total, punchIn?, punchOut?, held?, reason?, ... }`. `kind` có các giá trị: `work`, `holiday`, `leave`, `isat`, `unpaid`, `approved`, `willmakeup`, `makeup` (loại cũ, 0 ₫), `noshow` (vắng), `pending` (chờ xử lý; `reason 'not-yet'` là chưa tới ngày), `invalid`.

- **Bốn cột tiền** (`dayFiguresOf`, `src/domain/payroll/slip-paid.ts`): dòng `work` có `daily` và dòng `holiday` có `hours > 0` được gắn `cot = { luongNgay, phuCapCa, lamThem, truGio }` từ `Engine.columnsOfDay` (`src/engine/payroll-day-parts.ts`; số nguyên đồng): `luongNgay` = tiền ngày công (`partsOfDay.tienNgayCong`, gồm lương ngày lễ và tiền giờ ngày thường) + giờ trừ; `phuCapCa` = phụ cấp ca + giờ nghỉ đêm; `lamThem` = làm bù + OT + OT ngày lễ; `truGio` = `cut` của dòng `work`. `luongNgay + phuCapCa + lamThem − truGio` = làm tròn đồng của `total` (phần lệch làm tròn dồn vào `luongNgay`). Dòng đã lưu không có `cot` được tính lại từ chính các trường của dòng.
- **Giờ bấm thật** (`withPunchTimes`,): `punchIn`, `punchOut` là giờ Việt Nam `HH:MM` (ca qua nửa đêm: giờ ra là giờ đồng hồ sáng hôm sau), `null` khi thiếu bên đó. Bộ máy ghi sẵn vào dòng khi tính; dòng của bản chụp cũ chưa có thì lấy lúc đọc từ các lượt chấm công của tháng (`ActualHours.punchTimesOf`). Chỉ ngày đi làm, ngày lễ có giờ làm, vắng, chờ xử lý (trừ chưa tới ngày) và ngày bị giữ vì giải trình có hai trường này. `dayRowsOf` = `dayFiguresOf` + `withPunchTimes`; `verify` và so sánh bản chụp bỏ `punchIn/punchOut/held` (`withoutPunchTimes`).
- **Ngày giữ vì giải trình**: dòng `kind 'unpaid'` có `held = 'rejected'` (nhãn "Bị từ chối") hoặc `'pending'` (nhãn "Chờ xử lý"), giữ giờ bấm thật, 0 ₫, không phải ngày công.
- **Bản in A4**: trang 1 là bảng chấm công từng ngày: cột Vào – ra in `punchIn – punchOut` với `--:--` cho bên thiếu (ngày vắng, chờ xử lý, ngày bị giữ in giờ bấm thật thay chữ ghi chú); mỗi ô tiền là MỘT số (Lương ngày = `cot.luongNgay`, Phụ cấp ca = `cot.phuCapCa`, Làm thêm = `cot.lamThem`, Trừ giờ = `−cot.truGio`, Thành tiền = `total`), bốn ô cộng trừ đúng Thành tiền; ô trống là gạch ngang. Trang 2 là Tổng hợp lương. Giao diện chỉ chọn ô và định dạng, không cộng trừ tiền.
- **Thẻ Thu nhập của nhân sự**: mỗi khoản thu nhập là một số tiền lấy từ `trace`/`m` của máy chủ, không kèm câu giải thích cách tính hay công thức; các khoản cộng lại bằng tổng thu nhập.
- **Ghi chú ngày cho nhân sự** (`staffDayNotesOf`,): `holidayShifts` = các ca có giờ làm lễ `[{ date, onHoliday }]` (ca bắt đầu ngày thường rồi sang lễ: `onHoliday false`); `paidDays = { holiday, leave, isat }` = số ngày nghỉ hưởng lương có tiền nằm trong "Tiền ngày công", đếm theo dòng. Phiếu đã bỏ `rows` (có số sửa, ô ghim) thì không có hai trường này.

### 4.10 Dòng của phiếu (`linesOf`, `src/domain/period/periods.ts`)

Từ bản chụp (không làm tròn): `workDays = daysWorked = count`; `workdaysStd` (`m.workdaysStd`, hoặc `type.<mã>.workdays` sau `WorkSchedule.monthView` của bộ tham số lần chạy, `workdaysStdOf`); `tienNgayCong = trace.tienNgayCong`; `phuCap = phuCapDiLai + phuCapChuyenCan`; `allowanceTotal = allowanceTotalOf(snapshot)` = `phuCapCa + gioNghiDem + phuCapDiLai + phuCapChuyenCan + Σ blocks.amount` (null nếu thiếu một khoá trace); `ot = tienOt`; `kpi = luongKpi`; `truTreSom = cut` (đã nằm trong `tienNgayCong`); `khac = phuCapCa + gioNghiDem + lamBu + tienLamLe`; `attendOk` (boolean hoặc null); `quyetToanPhep/quyetToanNgay` khi có `settlePay`; `khoanThem/khoanTru = net.entriesAdd/entriesDeduct` khi có khoản; `khoiThem`, `khoiThemChiTiet` khi có khối.

### 4.11 Quyết toán phép dư

`leaveSettlements` (`src/domain/payroll/payroll-service.ts`): chỉ tháng `(leave.expiry.month % 12) + 1` (với `leave.expiry.month >= 1`) mới nạp lịch nghỉ của mọi người; người có quyền lợi `leaveAccount` và `startDate` hợp lệ nhận `leaveSettleDays = LeaveRules.settlementFor(staff, leaveDates(staff), month)`: số ngày phép còn dư của quỹ từng năm đã hết hạn ở tháng liền trước (quỹ năm N hết hạn cuối tháng `leave.expiry.month` của năm N+1; phần chưa dùng của quỹ năm nào thì quy tiền theo năm đó, không cộng dồn sang quỹ khác). Bộ máy: `settlePay = roundDong(settleDays × lương cơ bản ÷ ngày công chuẩn)` cộng vào `total`; chỉ tháng có ngày quy tiền mới có `m.settleDays`, `m.settlePay` và `trace.quyetToanPhepDu`.

### 4.12 Tạm ứng

- Số tạm ứng theo quy tắc là `trace.tamUngToiDa = roundDong(advance.rate (0.8, theo chức vụ nếu có ghi đè) × cơ sở)` khi người được bật tạm ứng (`staff.advanceOn !== false` và `advance.eligibleTypes.<mã>`), không thì 0. Cơ sở (`advance.basis`): `byWorkedDays` (mặc định) = Σ (`daily − cut`) của các ngày đi làm từ ngày 1 đến ngày `advance.untilDay` (15) của tháng, cộng lương ngày lễ (`holBase`) của ngày lễ có đi làm thật; không tính OT ngày lễ và ngày chỉ có đoạn OT; `fixedPctByLevel` = lương cơ bản của bậc.
- Nhân sự không nhập số: bấm xin tạm ứng của tháng (`POST /api/advance-approvals/request`), Admin duyệt/từ chối/huỷ duyệt (`src/modules/advance/advance-approvals.handlers.ts`). Chỉ khi Admin đã duyệt (`advanceApprovals.approvedSet(month)` → `person.advance = true` → `advanceApproved`) thì `net.advance` = số theo quy tắc và được trừ vào thực lĩnh; chưa xin, đang chờ, bị từ chối: 0. Duyệt hoặc huỷ duyệt làm kỳ `calculated|reviewed` thành `stale` (lý do `inputs`). Kỳ `approved|paid` khoá mọi thay đổi tạm ứng (`PERIOD_LOCKED`).
- `src/domain/advance/advance-cap.ts` tính số theo quy tắc tới ngày chạy (`figureFor`, `upTo: undefined`) cho màn yêu cầu; trước ngày `advance.untilDay` của tháng số chưa ổn định (`provisional`).

### 4.13 Công thức "Chi tiết" của phiếu Admin (`src/domain/payroll/slip-formulas.ts`)

`formulasOf({ snapshot, original, staffTerms, params, month, cells })` trả `{ <khoá ô>: chữ, 'block:<mã>': chữ, allowanceTotal, gross, taxable, afterInsurance, net }`; chạy lúc đọc phiếu, không ghi DB, không tính lại lương. Gọi ở `payslip()` (Admin; `params` = bộ tham số của LẦN TÍNH, `snapshot` = bản đã ghim nếu có, `original` = bản gốc cho dòng đếm) và `estimateOne()` (bộ tham số đã giải của tháng). Phiếu của nhân sự và bản in A4 không có `formulas`.

Quy tắc dựng:

- Tham số lấy qua đúng các bước nhìn tham số của bộ máy (`WorkSchedule.monthView`, `WorkSchedule.forPerson`, `PayOptions.levelView`): ngày công chuẩn của tháng, quyền lợi theo bậc.
- Mỗi mảnh công thức mang chữ và giá trị. Mọi số đi kèm tên hoặc đơn vị ngay sau nó (`6.000.000 đ`, `23 ngày công`, `28.846,15 đ/giờ`, `đ/ngày`, tên dòng như `lương ngày công`, `phụ cấp ca`); tỷ lệ (`30%`) và hệ số nhân (`× 1,5`) đứng một mình. Số kiểu vi-VN (dấu chấm hàng nghìn, dấu phẩy thập phân). Đơn giá ghi làm tròn; nếu tích với các số còn lại làm lệch hơn 0,25 đồng thì ghi thêm hai chữ số thập phân. Giờ lẻ ghi phân số `p/q` để cộng lại đúng từng đồng.
- Các mảnh cộng/trừ cùng đơn giá và cùng hệ số được gộp thành một mảnh có số lượng ròng (`netSum`); mảnh có số lượng ròng bằng 0 bị bỏ (mảnh triệt tiêu hết thì giữ mảnh đầu với số lượng 0). Mảnh âm gom trong ngoặc; nhóm cộng trừ nằm trong ngoặc khi đứng trong phép nhân/chia.
- Một công thức chỉ được giữ khi giá trị của nó bằng số tự tính của dòng (lệch không quá dung sai: 1 đồng cho từng dòng tiền, 2 đồng cho miễn thuế và bảo hiểm, 0,01 cho tổng điểm KPI); không khớp thì dòng đó không có công thức, không bao giờ chỉnh cho khớp. Một số dòng trả chữ giải thích điều kiện thay vì phép tính (chuyên cần mất: số ngày nghỉ/giờ vượt so với ngưỡng; KPI không đạt: điểm so mốc; bảo hiểm không đóng: ngày chuẩn − ngày có lương so với ngưỡng; thuế không phát sinh: thu nhập so với ngưỡng).
- Các dòng có công thức: dòng đếm (`workDays`, `unpaidDays`, `leaveDays`, `isatDays`, `holidayDays`: liệt kê ngày được đếm, ngày liền nhau từ ba ngày gộp thành khoảng; `ot15H`, `ot20H`, `ot30H`, `makeupHours`, `debtH`: giờ theo ngày), `workBase`, `leavePay`, `isatPay`, `holidayPay`, `settlePay`, `otPay` (mỗi nhóm giờ × lương giờ × hệ số: làm bù ×1, OT `ot.rate`, OT cuối tuần `ot.weekendRate`, giờ lễ `ot.holidayRate`, giờ đêm lễ), `attendance`, `travel`, `flexPay`, `breakPay`, `nightPay`, `lateCut`, khối phụ cấp, `kpiPct`, `kpiPay`, `exempt` (phần cao hơn lương giờ thường), `insurance`, `tax` (từng bậc lũy tiến hoặc thuế khấu trừ cố định), `advance`, và các dòng tổng: `allowanceTotal` (cộng các dòng phụ cấp), `gross` (cộng các dòng tiền, phụ cấp gộp thành "phụ cấp", trừ "đi muộn về sớm", cộng "khoản cộng thêm"), `taxable`, `afterInsurance`, `net` (tổng thu nhập − bảo hiểm − thuế − tạm ứng − khoản trừ khác).
- Lỗi khi dựng một dòng chỉ làm dòng đó không có công thức; hồ sơ thiếu lương cơ bản/ngày công chuẩn/giờ mỗi ngày thì không có công thức nào.

### 4.14 Kỳ lỗi thời (`staleOf`, `src/domain/period/period-stale.ts`)

Chỉ khi có lần chạy và kỳ `calculated|reviewed`. `params`: băm tham số hiện hành khác băm đã chụp VÀ có khoá thật sự đổi (khoá có trong bản chụp mà giá trị khác; hoặc khoá mới không có trong bản chụp nhưng khác `Params.DEFAULTS`). `inputs`: `digestOf(loadInputs(month, { asOf: run.switches.asOf }))` khác `run.inputsDigest`.

### 4.15 Kiểm lại bản chụp (`verify`, `src/domain/period/periods.ts`)

Mọi phiếu của lần chạy hiện hành; `loadInputs(month, { usernames, asOf: run.switches.asOf, params: run.params })`; ghi đè `holidays` bằng của lần chạy; mỗi phiếu tính lại `slipOf(month, stored.staffTerms, inputs, run.params)`. Khớp khi: cả hai lỗi cùng `errorCode`, hoặc cả hai không lỗi, bản chụp chuẩn hoá bằng nhau (sau `withoutPunchTimes`) và 5 số tiền bằng nhau. Người không còn trong đầu vào → lệch. `engineChanged = run.engineVersion !== ENGINE_VERSION`. Kiểm lại tính lại bản chụp bằng bộ máy hiện hành, nên kỳ đã trả từ trước khi một quy tắc tính đổi (ví dụ ngày lễ làm trước ngày 15 vào cơ sở tạm ứng) sẽ báo lệch ở những người bị quy tắc đó chạm; đó là cảnh báo, không đổi số tiền đã trả, và không mở lại kỳ đã trả để xoá cảnh báo.

### 4.16 Ước tính cả kỳ cho Admin (`estimates`, `estimateOne`, `estimateRow`)

`estimateRow` dùng chung: `slipOf` với bộ tham số đã giải của tháng → số sửa hiện tại (`slip_overrides`, kể cả khi chưa tính lương) → ghim (`repinned`) → `paidRow(..., force = !!pinned)` nếu có số sửa → hàng `{ ...(paid || slip), snapshot, cells, rev: null, flags: [], decidedBy/At/note: null, lines }`. Phiếu lỗi thành hàng `status 'error'` (không bao giờ 0 ₫). `estimatesOfMonth` tính toàn bộ một lần (cache 2.4), sắp theo username; `totals`, `attendanceKept` là của cả kỳ; `q` (không phân biệt hoa thường, theo `vi`, trên username hoặc tên) và `type` lọc sau. `estimateOne` nạp riêng một người; người không trong bảng → 404 `PAYSLIP_NOT_FOUND`; kèm `formulas` và `kpiSlip`. Không ghi DB.

### 4.17 Sandbox

`npm run sandbox` chạy bootstrap tạo một database PostgreSQL tạm từ `SANDBOX_PG_CONTROL_URL`, rồi mở máy chủ sandbox trên DB đó; chỉ nghe loopback. Đồng hồ giả (`Date.now` và `new Date()`) chạy theo đồng hồ sandbox. Route điều khiển `GET /__sandbox/state`, `GET /__sandbox/ops`, `POST /__sandbox/clock | user | reset` và các thao tác tải/sao lưu (`sandbox-ops.ts`); POST cần header `X-Sandbox-Control`. Không lùi đồng hồ được khi đã có dữ liệu chấm công. `POST /__sandbox/reset` (cần `confirm: true`) xoá dữ liệu chấm công, giải trình, lịch khai, `slip_overrides`, KPI, nhân sự, cài đặt rồi nạp lại nhân sự mẫu; đồng thời xoá trạng thái kỳ lương trong `payslips`, `payroll_runs`, `payroll_periods`, `ai_finding_actions`, `ai_review_runs`, `pay_entries`, `advance_requests`; nhật ký `audit_log` không bị xoá. Database tạm do bootstrap tạo sẽ được dọn khi server thoát hoặc nhận SIGINT/SIGTERM.

### 4.18 Tình trạng chuyên cần (`allowanceStatus`, `src/domain/period/periods.ts`)

`type.<mã>.attendance` falsy → `{ hasAttendance: false }`. Ngược lại: `daysUntilLoss = max(0, maxAbsent + (absentCompare === 'gt' ? 1 : 0) − m.absent)`; `hoursUntilLoss = max(0, attendance.overLimitHours − m.overHours)`; `hoursLossStrict = overLimitCompare === 'gt'`; kèm `absentDays, maxAbsent, absentCompare, overLimitHours (= m.overHours), overLimitThreshold, overLimitCompare, kept (= m.attendOk)`. Không phải số tiền. Ngưỡng giờ ở đây là `attendance.overLimitHours` toàn cục, không cộng `attendance.overLimitTolerance` và không đọc ghi đè `type.<mã>.overLimitHours` (khác với bộ máy, mục 9.2).

### 4.19 `list(year)` (`src/domain/period/periods.ts`)

`year` phải số nguyên ≥ 0 (400 `BAD_YEAR`). 12 tháng; `counts` của lần chạy hiện hành; `paydayExpected = '<tháng sau>-<pad(period.payDay của tháng)>'`, thiếu tham số thì `Params.DEFAULTS['period.payDay']`.

### 4.20 Khoản điền thêm (`src/domain/payroll/pay-entries.ts`)

- `limitsFor(month)`: `requireApproval = P['system.entries.requireApproval'] !== false`; `maxPerBatch`, `maxAmount`; `labelMax = min(P.labelMaxLength, 80)`; `reasonMin = max(P.control.reasonMinLength, 10)`; `reasonMax = min(P.control.reasonMaxLength, 300)`.
- `clean`: tháng; hướng `add|deduct`; số tiền là số nguyên an toàn ≥ 1 và ≤ `maxAmount`; nhãn 1…`labelMax` ký tự (đếm điểm mã, NFC, không `<`/`>`); `slipLine` tuỳ chọn cùng luật; lý do tuỳ chọn và lưu qua `padReason` (rỗng → "Không ghi lý do"; < 10 → nối " (không ghi thêm lý do)"); nhãn khoản trừ có từ phạt/fine/penalty → cảnh báo `LABEL_FORBIDDEN`; khoản trừ không được có cờ thuế/BH (cờ thừa kế bị bỏ khi đổi sang trừ); `taxMode ∈ none|full|cap|null`; `taxCap` chỉ khi `cap` (số nguyên ≥ 0); `insuranceBase` số nguyên 0…amount.
- `assertOpen(month)`: kỳ được quản lý và `approved|paid` thì cảnh báo `PERIOD_LOCKED` kèm `suggestMonth` = tháng mở kế tiếp.
- Tự làm về mình: lập/sửa/duyệt/huỷ/xác nhận khoản của chính mình → `selfDecision`; duyệt khoản do mình lập khi `requireApproval` → `selfDecision`; sửa khoản người khác lập → cảnh báo `EDIT_CREATOR_ONLY`.
- Sửa: giữ xác nhận cờ chỉ khi bộ cờ và số tiền không đổi. Mọi ghi dùng `WHERE id = ? AND rev = ? AND status ...`; không đổi đúng 1 dòng → 409 `REV_STALE`.
- Từ chối, huỷ khoản `approved` và xác nhận cờ: lý do / `basis` không bắt buộc. Xác nhận cờ: khoản `add` có cờ, chưa xác nhận.
- Bộ máy chỉ nhận khoản `approved` (`approvedByUser`,, qua `PayEntriesCalc.list`): khoản cộng vào `m.total`, khoản trừ trừ sau thuế; miễn thuế/nền BH chỉ khi cờ đã xác nhận.

### 4.22 Cơ chế cảnh báo (`src/platform/warnings.ts`)

- `warnIf(code, violated, opts)`: không vi phạm → `false`. Vi phạm → `quiet` thì chỉ trả `true`; không thì `warn(code, text, { severity?, count?, link?, details? })` với `text` = `"<message bỏ dấu cuối>. <consequence>"` hoặc `message`; trả `true`.
- `warn`: ngoài yêu cầu HTTP thì bỏ; trùng `(code, message)` thì bỏ; tối đa `WARN_MAX` (50), phần dư đếm và `take()` thêm `WARNINGS_TRUNCATED`.
- `selfDecision(isSelf, …)` = `warnIf('SELF_DECISION_FORBIDDEN', isSelf, { message "Bạn đang <việc> của chính mình; …" })`.
- `optionalReason(value, { max, … })`: cắt khoảng trắng; `> max` (mặc định 300) → lỗi 400; trả chuỗi (có thể `''`).
- Nhật ký: `audit.write` thêm `after.warnings` (≤ 20 mã) và `after.self = true` khi có `SELF_DECISION_FORBIDDEN`/`APPROVAL_SELF` và dòng nói về chính người làm (`src/platform/audit.ts`).
- Không đi qua `warnIf`: quyền, định dạng, không tồn tại, quá cỡ, chống ghi đè (`rev`, `PAYSLIP_ERROR`, `BAD_*`).

---

## 5. Realtime và nhật ký

### 5.1 SSE (`src/platform/events.ts`)

| Sự kiện | Phát ở | Người nhận / trường |
| --- | --- | --- |
| `period.changed` | `stepDone` sau mỗi bước lock-attendance, calculate, ai-review, approve, mark-paid, reopen (`src/modules/periods/periods.helpers.ts`) | tất cả; người có `payroll.view`: `{ month, status, rev }`; người khác: `{ month, stage }` với `stage` = `open` (open), `paid` (paid), `locked` (còn lại) (`STAGE_OF`, `src/platform/events.ts`) |
| `payslip.available` | sau mark-paid (`src/modules/**/*.controller.ts`) | các username có phiếu không lỗi của lần chạy hiện hành: `{ month }` |
| `estimate.changed` | khoản điền thêm `approved` sau lập/lập lô/duyệt/xác nhận cờ; huỷ khoản đã duyệt (`src/domain/pay-entries.ts, 69`); còn phát ở lịch, duyệt khai, ứng lương (`src/modules/**/*.controller.ts` `956`, `src/modules/advance/advance-approvals.handlers.ts`, `src/modules/advance/advance-requests.handlers.ts`) | đúng người đó: `{ month }` |

Không phát gì: duyệt/trả lại phiếu, sửa số phiếu, đổi công tắc Agents (dùng `announceSetting`).

### 5.2 Nhật ký (`audit_log`, `sensitivity: 'pay'`)

| action | entityKind / entityId | before / after |
| --- | --- | --- |
| `period.lock-attendance` | `period` / tháng | `{ status: 'open' }` / `{ status, acknowledged, checklist }`, reason |
| `period.calculate` | `period` / tháng | null / `{ status, runNo, slips, errors, paramsRev }` |
| `period.ai-review` | `period` / tháng | null / `{ status, findings, flagged }` |
| `period.approve` | `period` / tháng | `{ status: 'reviewed' }` / `{ status, excluded, autoApproved?, autoExcluded? }` |
| `period.mark-paid` | `period` / tháng | `{ status: 'approved' }` / `{ status, paidAt }` |
| `period.reopen` | `period` / tháng | `{ status }` / `{ status, to, reopenCount }`, reason |
| `payslip.approve`, `payslip.return` | `payslip` / `<tháng>:<username>` | null / `{ status, rev }`, reason = note |
| `slip.override` | `slip_override` / `<username>:<tháng>:<ô>` | `{ <ô>: cũ }` / `{ <ô>: mới }` — một dòng mỗi ô đổi |
| `entry.create`, `entry.update`, `entry.decide`, `entry.void`, `entry.confirmFlags` | `pay_entry` / id | các trường `AUDIT_FIELDS` (`src/domain/payroll/pay-entries.ts`) |

Mọi dòng có thể kèm `after.warnings`, `after.self` (4.22).

---

## 6. Phụ thuộc

### 6.1 Ai gọi module này

- `src/modules/periods/periods.helpers.ts` / `src/http/api-gate.ts`: mọi route mục 3; `warnings.run` bọc mỗi yêu cầu; `warnFrozen`/`guardPeriod` dùng `store.periods`.
- `scripts/ops/pg-backup.ts`: `require('../../lib/periods')` (kiểm bản sao lưu); `scripts/params/wired.ts`.
- `store.assertPeriodOpen` (cổng khoá kỳ của module này) được gọi từ: `src/http/api-gate.ts` (`guardPeriod` và nhiều route lịch, chấm công, OT, KPI), `src/domain/payroll/pay-entries.ts`, `src/domain/advance/advance-requests.ts`, `src/params/save.ts`, `src/domain/attendance/admin-presence.ts`, `src/domain/shared/catalog-change.ts`.
- Giao diện: danh sách ở mục 1.

### 6.2 Module này gọi

`src/platform/db.ts` (store), `src/platform/audit.ts`, `src/params/store.ts` (`resolve`), `(đã bỏ)` (`activeFindings`), `src/domain/attendance/index.ts` (`closeStaleIn`), `(đã bỏ)`, `src/ops/shared-cache.ts`, `src/domain/explanation/explanations.ts` (`heldByUser`), `src/domain/advance` (`advanceApprovals.approvedSet`), `src/platform/request-rules.ts` (`benefitOf`), `src/domain/leave-days.ts` (`leaveDates`), `src/domain/isat-rule.ts` (`isatRefusal`), `src/domain/attendance/admin-presence.ts`, `src/domain/payroll/policy.ts`, `src/platform/authz.ts` (`isSelfDecision`, `scopeOf`, `can`), `src/platform/events.ts`.

### 6.3 File dùng chung trình duyệt và máy chủ (UMD trong `public/`)

`payroll-engine.ts` (bộ máy: `computeMonth`, `repin`, `taxFrom`, `ENGINE_VERSION`, `columnsOfDay`), `payroll-day-parts.ts`, `payroll-params.ts` (`DEFAULTS`, `canonical`, `fillLate`, `derive`), `payroll-pins.ts`, `pay-tail-calc.ts`, `pay-options-calc.ts`, `pay-entries-calc.ts`, `pay-blocks-calc.ts`, `work-schedule.ts`, `payroll-calendar.ts` (`isValidMonth`, `isValidDate`, `splitMainWork`, `splitExtraWork`), `punch.ts` (`vnDate`), `kpi-score.ts`, `leave.ts`, `approval-view.ts`, `actual-hours.ts`.

### 6.4 Đổi X thì phải kiểm tra Y

- Đổi bất kỳ công thức nào trong `src/engine/payroll-engine.ts` (hoặc `approval-view.ts`, `actual-hours.ts`, `payroll-pins.ts`, `payroll-day-parts.ts`, `pay-tail-calc.ts`) → tăng `ENGINE_VERSION`, nếu không `verify` báo lệch mà `engineChanged = false`; chạy `period-*`, `payslip-*`, `verify-fixes`, `me-estimate`, các test `*zero-drift*`; bản chụp cũ vẫn phải đọc được (`slipBasisOf`, `linesOf`, `cellsOf` đọc các trường của `m`).
- Đổi cách bộ máy tính một khoản tiền (OT, làm bù, lễ, chuyên cần, miễn thuế, bảo hiểm, tạm ứng) → `src/domain/payroll/slip-formulas.ts` phải dựng lại đúng công thức của khoản đó, nếu không dòng đó mất công thức (công thức lệch số tự tính thì bị bỏ, mục 4.13); test `slip-detail-formulas`, `slip-formulas-*`.
- Thêm/bớt ô sửa phiếu → đồng bộ BA chỗ: `src/modules/periods/periods.helpers.ts` `SLIP_MONEY/SLIP_QTY`, `src/domain/payroll/slip-paid.ts SLIP_INCOME_KEYS/SLIP_DEDUCT_KEYS` (ô tiền) hoặc `src/engine/payroll-pins.ts KEYS` (ô số lượng),.
- Thêm trường mới vào đầu vào một người (`loadInputs`) → chỉ thêm khi có giá trị, nếu không `inputs_digest` của mọi kỳ đã tính đổi và mọi kỳ thành `stale`; `computeFor` phải chuyển trường đó cho bộ máy; `verify` phải nạp được trường đó với trạng thái của lần chạy.
- Đổi `payrollPeople` → danh sách kiểm, số phiếu khi tính, ước tính, `approvalWarnings`, `src/params/save.ts` (xem trước), `src/domain/advance/advance-cap.ts`.
- Đổi máy trạng thái (`store.periods.*`, `PERIOD_STATES`, `SCOPE_LOCKED_FROM`) → `precheck` trong `src/domain/period/periods.ts` (danh sách `from` lặp lại), `staleOf` (chỉ `calculated|reviewed`), `view.checklist`, `assertPeriodOpen` của mọi module ghi, `src/platform/events.ts STAGE_OF`, giao diện sandbox `PERIOD_TABLES`, test `period-lifecycle`, `period-reopen`, `period-lock-guards`,.
- Đổi `warnIf` → test `warnings`, `no-control-mode`; giao diện hiện `warnings[]` của phản hồi, không có công tắc chế độ.
- Đổi trigger `payslips_*` hoặc thứ tự trong `store.periods.approve` → `freezeOverrides` phải chạy trước khi lần chạy thành `final`.
- Đổi `overrideValuesOf` / `freezeOverrides` → số chi trả của kỳ đã duyệt (`view.totals`, `payslip`, `estimate` chính thức, `negativePaidNets`).
- Đổi `slip.staffVisibleFrom` hoặc `finalPayslip` → `estimate()` và (riêng) `payslip(self)` dùng hai luật khác nhau (mục 9.2).
- Đổi `src/platform/config.ts` `REASON_MIN/MAX` → `src/platform/db.ts` có hằng riêng `REASON_MIN/MAX` và CHECK 10–300 của nhiều bảng; phải đổi cùng nhau.
- Đổi `money.roundTo`/`money.roundMode` → `paidFigures` làm tròn bằng `Math.round` không theo tham số (mục 9.2).

---

## 7. Test hiện có

Tên test dưới đây bỏ tiền tố ngày của tên file (các file `test/api/*` và `test/unit/*` có tiền tố ngày trong tên thật).

Trực tiếp về kỳ, phiếu, số chi trả, ước tính:

- `test/api/warnings-cases.test.ts`, `warnings-no-crash.test.ts`, `warnings-inventory.test.ts`, `period-flow-warns.test.ts`
- `test/api/pay-entry.test.ts`, `pay-entries-backend.test.ts`, `pay-entries-period.test.ts`, `pay-entry-zero-drift.test.ts`, `review-fixes-pay-entries.test.ts`
- Helper: `test/helpers/period-flow.ts`, `period-api.ts`, `warning-cases.ts`, `pay-entry-api.ts`, `api-fixture.ts`, `explanation-flow.ts`

Có chạm module (qua tính lương / ước tính) nhưng không phải trọng tâm: `test/api/*(đã bỏ)`, `*(đã bỏ)`, `*(đã bỏ)`, `*(đã bỏ)`, `*(đã bỏ)`, `*(đã bỏ)`, `*(đã bỏ)`, `*-explanation-*.test.ts`, `approvals*.test.ts`, `audit-followup-backend.test.ts`, `backend-followup.test.ts`, `fixed-attendance.test.ts`, `mvp-fixes.test.ts`, `review-fixes.test.ts`, `save-applies-everywhere.test.ts`, `schedule-estimate-calendar.test.ts`, `server-logic-regression.test.ts`, `settings-engine-zero-drift.test.ts`; `test/unit/ai-review*.test.ts`, `phase2-options.test.ts`, `phase2-review.test.ts`, `schedule-defaults-zero-drift.test.ts`.

---

## 8. Mức độ hoàn thành

### 8.1 Đã có và chạy

| Mảng | Có gì |
| --- | --- |
| Vòng đời kỳ | Sáu trạng thái, khoá lạc quan `rev`, mở lại về ba bước, cảnh báo thay cho chặn, danh sách kiểm 12 mục, nhật ký mỗi bước, SSE cho màn khác. |
| Lần chạy và phiếu | Lần chạy bất biến (trigger), phiếu kèm bản chụp nén, phiếu lỗi giữ mã và chi tiết, duyệt/trả lại theo lô tới 200, tự duyệt/tự loại khi duyệt kỳ. |
| Tính tiền | OT ngày có lịch, OT cuối tuần ngoài lịch, làm lễ và giờ đêm lễ, làm bù trả đủ, phụ cấp ca/giờ nghỉ đêm, iSAT thứ Bảy, nghỉ lễ hưởng lương, chuyên cần và đi lại theo ngày đi làm, KPI 5 thành phần, phép dư quy tiền, miễn thuế chỉ phần cao hơn lương giờ thường, bảo hiểm theo ngày có lương, thuế lũy tiến và khấu trừ cố định, tạm ứng theo quy tắc khi Admin duyệt. |
| Số sửa | Ô tiền (18, trong đó `kpiAmt` ghim được) và ô số lượng (18; 16 trong số đó ghim được), số chi trả tính lúc đọc, đóng băng khi duyệt kỳ, bản chụp riêng cho nhân sự, khoá lạc quan `expectedRev`, nhật ký từng ô. |
| Ước tính | Ước tính cả kỳ và một người cho Admin (có áp số sửa và ghim), ước tính cho nhân sự (cả tháng và tới ngày chạy), phiếu chính thức theo `slip.staffVisibleFrom`. |
| Công thức "Chi tiết" | Công thức chữ cho các dòng tiền, dòng đếm và dòng tổng của phiếu Admin. |
| Kiểm soát | Kiểm lại bản chụp (`verify`), phát hiện kỳ lỗi thời, khoản điền thêm có duyệt và cờ thuế/bảo hiểm, cờ AI gắn vào phiếu và bỏ qua có lý do. |
| Sandbox | Máy chủ thử với DB trong RAM, đồng hồ giả, đặt lại cả dữ liệu kỳ lương. |

### 8.2 Chưa có hoặc chưa dùng được

- Phương án chưa dùng được (bộ máy từ chối với `PARAM_OPTION_UNAVAILABLE` hoặc lỗi giá trị): `tax.method.long` = `flat`/`none`, `tax.method.short` = `progressive`/`none`, `insurance.coverage.long` = false, `insurance.floorMode` = `raiseToRegionMin`, `insurance.base` = `insuranceAttr`, `tax.arise.mode` = `custom`, `tax.exempt.otMethod` khác `byRate` (`src/engine/pay-tail-calc.ts`).
- Ghim ô số lượng chỉ hỗ trợ `pay.method = 'A'`.
- Ô `leaveLeft` và `kpiBonus` lưu được nhưng không đổi số nào.
- `formulas` chỉ có cho Admin; dòng nào công thức không khớp số tự tính thì không có công thức (không có cách xem lý do).
- Ước tính của nhân sự không áp số sửa của Admin; phiếu chính thức chỉ theo `slip.staffVisibleFrom`, còn `GET .../payslips/:username` của nhân sự chỉ mở sau khi kỳ `paid`.
- Chi trả chỉ ghi ngày và tham chiếu; không có bước chuyển tiền hay xuất file ngân hàng. Bản in A4 do trình duyệt dựng, không có route tạo PDF.
- Mở lại kỳ `paid` không rút lại được tiền đã chi; phần chênh phải xử lý ngoài hệ thống.
- Lớp `Payroll` (`src/domain/payroll/payroll.ts`) chưa nối vào đường tính thật.

---

## 9. Điểm chưa nhất quán trong mã

Liệt kê để người sửa biết chỗ dễ vỡ; tài liệu này không đổi chúng.

### 9.1 Chú thích nói khác mã

1. `src/domain/period/periods.ts` — chú thích "`paid` không mở lại được". Mã: `src/platform/db.ts` dùng `warnIf`, mở lại được kỳ `paid` (chỉ cảnh báo `PERIOD_STATE`).
2. `src/domain/period/periods.ts` — chú thích "mặc định estimateOnly" và "bản chụp … số tự tính, không có số Admin sửa". Mã: mặc định `slip.staffVisibleFrom` là `'afterPaid'` (`src/engine/payroll-params.ts`); nhánh chính thức áp số sửa đóng băng và ô ghim qua `staffPaidSnapshot` (`src/domain/period/periods.ts`).
3. `src/modules/periods/periods.controller.ts` (chú thích "nhân sự luôn thấy số tự tính") — mã: nhân sự thấy SỐ CHI TRẢ (`src/domain/period/periods.ts`, `estimate` nhánh chính thức).
4. `src/platform/db.ts` — `slip_overrides` "không đổi lịch / số ước tính". Mã: `estimateRow` áp số sửa lên ước tính của Admin (`src/domain/period/periods.ts`).
5. `src/platform/db.ts` — cột `gross..net` "sau làm tròn của calcNet và số sửa". Mã: cột chỉ chứa số tự tính; trigger cấm đổi; số sửa áp lúc đọc.
6. `src/domain/period/period-allowance.ts` — `allowanceTotalOf` là "số tự tính, số Admin sửa không được áp". Mã: `estimate()` nhánh chính thức gọi nó trên `trace` đã qua `staffPaidSnapshot` (ô `attendance`, `travel`, `breakPay` đã mang số sửa) (`src/domain/period/periods.ts`).
7. `src/domain/payroll/slip-paid.ts` — "Cùng phép tính với view-phieu.js → effective" (chú thích nhắc file giao diện cũ đã xoá). Mã: `effective` không còn tính tổng/thuế/thực lĩnh, lấy số chi trả của máy chủ.
8. `src/platform/config.ts` — `config` chỉ nêu tên (ở chú thích, không có hằng số) khoá `system.slipOverride.reasonRequired`. Mã dùng khoá khác `control.reasonRequired.slipOverride` (kiểm lý do ở `src/modules/**/*.controller.ts`); `system.slipOverride.reasonRequired` (mặc định `false`, `src/engine/payroll-params.ts`) không được mã máy chủ đọc.
9. `src/domain/period/periods.ts` — chú thích viết cứng "quá 16 giờ"; ngưỡng thật do `attendance.openSessionMaxHours` (`src/domain/shifts.ts`) qua `punch.staleBefore` quyết (`src/domain/attendance/index.ts`).

### 9.2 Logic trùng hoặc hai nơi tính khác nhau

10. Ai được xem phiếu chính thức: `payslip(self)` chỉ cho khi kỳ `paid` (`src/domain/period/periods.ts`), còn `estimate()` theo `slip.staffVisibleFrom`. Với `afterApproval`, `/api/me/estimate` trả phiếu chính thức nhưng `GET /payslips/:username` của chính người đó trả 403.
11. Ước tính của Admin áp số sửa và ghim (`estimateRow`,); ước tính của nhân sự (`estimate` nhánh ước tính,) không áp. Cùng một người, cùng tháng chưa tính lương, hai màn ra hai số khi có số sửa.
12. Làm tròn: bộ máy dùng `roundDong` theo `money.roundTo`/`money.roundMode` (`src/engine/payroll-engine.ts`); `paidFigures` dùng `Math.round` cố định (`src/domain/payroll/slip-paid.ts`). Đổi `money.roundTo` thì số chi trả và số tự tính làm tròn khác nhau.
13. Tổng phụ cấp tính ở ba nơi: `allowanceTotalOf` (`src/domain/period/period-allowance.ts`), `thanhPhanOf.allowance` (`src/domain/payroll/payroll-service.ts`), và `effective` cộng chênh lệch ô sửa ở trình duyệt.
14. Hai cách gom tiền OT/làm bù/làm lễ: dòng phiếu `ot = trace.tienOt`, `khac = phuCapCa + gioNghiDem + lamBu + tienLamLe` (`src/domain/period/periods.ts`); ô sửa `otPay = otPay + holWorkPay + makeupPay` (`src/domain/payroll/slip-paid.ts`).
15. Hai nguồn "cờ AI" khi duyệt phiếu: `src/domain/period/periods.ts` dùng `activeFindings` (bỏ cờ đã bỏ qua); store dùng `flags_json` (gồm cả cờ đã bỏ qua) cho lô > 1 và cho việc bắt buộc note (`src/platform/db.ts`).
16. Duyệt kỳ từ `calculated` sinh hai cảnh báo cho cùng việc khi Agents bật: `AI_NOT_RUN` (`src/domain/period/periods.ts`) và `PERIOD_STATE` (`src/platform/db.ts`).
17. Ghi vào kỳ `approved|paid` qua `guardPeriod` sinh hai cảnh báo cho cùng việc: `PERIOD_LOCKED` (`src/platform/db.ts`) và `PERIOD_FROZEN` (`src/http/api-gate.ts`).
18. `verify()` tự lặp phân trang (`src/domain/period/periods.ts`) thay vì dùng `allSlips`, với `pageSize` 200 viết cứng.
19. Lý do mở lại được kiểm hai lần: `cleanText` (`src/domain/period/periods.ts`) và `softReason` (`src/platform/db.ts`).
20. `paidAt` kiểm hai luật: `src/domain/period/periods.ts` chỉ nhận `YYYY-MM-DD` có thật; `store.periods.markPaid` nhận cả chuỗi `Date.parse` được (`src/platform/db.ts`).
21. Danh sách trạng thái `from` của mỗi bước lặp ở cả `src/domain/period/periods.ts` (`precheck`) và `src/platform/db.ts` (`advancePeriod`, `createRun`).
22. Thang điểm KPI lưu là số nguyên điểm × đơn vị: `src/domain/payroll/payroll-service.ts` dùng `rules.toUnits(1)`; `src/domain/kpi/kpi-scoring.ts` chia `/ 100` cố định.
23. Hằng `REASON_MIN`/`REASON_MAX` khai hai lần: `src/platform/config.ts` và `src/platform/db.ts`.
24. `workDays` và `daysWorked` của dòng phiếu là cùng một số (`src/domain/period/periods.ts`).
25. `allowanceStatus` (`src/domain/period/periods.ts`) đọc ngưỡng giờ `attendance.overLimitHours` toàn cục, không cộng `attendance.overLimitTolerance`, không đọc `type.<mã>.overLimitHours`; bộ máy (`src/engine/payroll-engine.ts`) dùng ghi đè theo chức vụ cộng biên độ. Khi biên độ khác 0 hoặc có ghi đè theo chức vụ, "còn bao nhiêu giờ thì mất" hiện cho nhân sự lệch với kết quả giữ/mất thật.
26. Ngày iSAT và `holidayDays` có hai cách đếm: `cellsOf` đếm dòng `holiday` có `holBase > 0` cộng `pinAdjust.holidayDays` (`src/domain/payroll/slip-paid.ts`), còn `m.holiday` của bộ máy đếm theo dòng không phải `work` (`src/engine/payroll-engine.ts`).

### 9.3 Mã chết hoặc vô hiệu

27. Lớp `Payroll` (`src/domain/payroll/payroll.ts`) không được mã chạy thật dùng (chỉ `test/unit/domain-classes.test.ts`).
28. `store.periods.markReviewed` kiểm `current.status !== 'open' && currentRunId == null` (`src/platform/db.ts`); vế `'open'` vô nghĩa vì `advancePeriod` ngay sau chỉ nhận `calculated|reviewed`.
29. Ô `leaveLeft` và `kpiBonus` thuộc `SLIP_QTY` (`src/modules/periods/periods.helpers.ts` `173`) được lưu nhưng không có tác dụng (không thuộc `PayrollPins.KEYS` hay ô tiền) và không có cảnh báo.
30. `kpiAmt` nằm trong `SLIP_MONEY` (làm tròn như tiền) nhưng thực chất là ô ghim (`PayrollPins.KPI_KEYS`), không thuộc `SLIP_INCOME_KEYS`.
31. `ENTRIES_REQUIRE_APPROVAL`, `ENTRIES_MAX_PER_BATCH`, `ENTRIES_MAX_AMOUNT` của `src/platform/config.ts` không được `src/domain/payroll/pay-entries.ts` đọc (đọc `system.entries.*`); chỉ `scripts/params/key-map.ts` nhắc tới.
32. `store.payroll.listPayslips` nhận bộ lọc `type` trong SQL (`src/platform/db.ts`), nhưng `periods.payslips` không truyền mà tự lọc sau khi lấy cả tập.

### 9.4 Số nghiệp vụ / giới hạn viết cứng

33. `src/modules/**/*.controller.ts`: tiền sửa phiếu `≤ 1e11`, số lượng `|v| ≤ 1e4` (không lấy từ config/tham số).
34. `src/platform/db.ts`: duyệt tối đa 200 phiếu một lần (không theo config; tham số `system.approval.maxDecideItems` có nhưng store không đọc).
35. `src/platform/db.ts`: `clampPage` kẹp 200 (trùng `config.PAYSLIP_PAGE_MAX` nhưng viết riêng; tham số `system.page.payslips.*` không được `src/domain/period/periods.ts` đọc).
36. `src/platform/db.ts`: `reference` chi trả cắt 100 ký tự; `src/platform/db.ts`: `error_detail` cắt 300.
37. `src/modules/**/*.controller.ts`: chú thích ghi trọng số KPI cứng; trọng số thật đọc từ `kpi.weight.*`.

### 9.5 Hành vi dễ gây bất ngờ

38. `GET /api/periods/:month` ghi DB: `checklist()` gọi `closeStaleIn` (`src/domain/period/periods.ts`) đóng lượt Check-in quá hạn; việc ghi này cũng làm mất hiệu lực cache ước tính (`total_changes()` tăng).
39. Duyệt/trả lại phiếu (`src/modules/periods/periods.controller.ts`), sửa số phiếu, và tính lương không phát `estimate.changed`; duyệt/trả lại phiếu không phát `period.changed`.
40. Nhật ký `period.approve` luôn ghi `before { status: 'reviewed' }` (`src/domain/period/periods.ts`) kể cả khi duyệt từ `calculated`.
41. Nhật ký `period.mark-paid` không ghi `reference` (`src/domain/period/periods.ts`).
42. `paydayExpected` ghép `period.payDay` vào tháng sau không kiểm số ngày của tháng (`src/domain/period/periods.ts`): `payDay` 31 cho ra ngày không có thật ở tháng 30 ngày.
43. Chạy bộ máy cho cả bảng lương (`calculate`) và chạy AI (`aiReview`) nằm TRONG giao dịch ghi (`src/domain/period/periods.ts`, `385-410`): giữ giao dịch ghi (và các khoá hàng nó đã lấy) suốt thời gian tính.
44. Giữa tháng, `estimate()` của nhân sự tính bảo hiểm trên cả tháng theo lịch đã khai (mục 4.5): ngày chưa tới không phải ngày có lương nên bảo hiểm có thể hiện 0 cho tới khi đủ ngày có lương, rồi mới hiện đủ.

### 9.6 Giao diện tự tính tiền

46. Các dòng phiếu (`linesOf`) trả số thực chưa làm tròn từ `trace` (`src/domain/period/periods.ts`); giao diện tự làm tròn khi hiển thị.
