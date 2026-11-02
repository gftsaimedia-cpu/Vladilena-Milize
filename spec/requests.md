# Yêu cầu và duyệt — đặc tả theo mã hiện tại

Phạm vi: khoản tự khai trên Lịch ước tính cần duyệt (iSAT, Nghỉ được duyệt, OT, OT ngày lễ, Làm bù theo giờ, Nghỉ phép năm, Nghỉ sẽ làm bù), nghỉ không lương, sổ phép năm, tạm ứng (nhân viên xin, Admin duyệt), lịch sử ứng lương dạng cũ, OT khai ở Check-in/out, giải trình, KPI 5 thành phần, quy tắc duyệt, bảng duyệt và ranh giới giữa cảnh báo với chặn.

Tài liệu viết từ mã. Khi chú thích và mã nói khác nhau thì theo mã. Số dòng là vị trí ở thời điểm viết; luôn tìm theo tên hàm hoặc chuỗi đã nêu khi số dòng lệch.

Quy ước: `warnIf(code, …)` chỉ thêm cảnh báo vào `warnings[]` của phản hồi 2xx và chạy tiếp (`src/platform/warnings.ts`). Kiểm quyền, định dạng, không tồn tại, chống ghi đè (rev) và các kiểm ghi "luôn chặn" không đi qua `warnIf` (bảng ở mục 4.20).

---

## 1. Phạm vi và file

### Máy chủ

| File | Việc |
| --- | --- |
| `src/domain/approvals/approvals.ts` | Kho bảng `sheet_approvals`: tạo bảng, `declaredItems`, `reconcile`, `list`, `get`, `forSheet`, `decide` (duyệt theo lô, khoá lạc quan rev + fingerprint), bốn đợt tạo dòng duyệt cho lịch đã lưu chạy lúc mở DB. Gắn vào `store.approvals` (`src/platform/db.ts`). |
| `src/domain/approvals/index.ts` | Hàm nghiệp vụ dùng ở route: `sheetApprovals` (dòng duyệt hiệu lực gửi giao diện), `reconcileHolidayWork`, `reconcileMonthApprovals`, `reconcileStaffType`, `listApprovals` (bỏ tài khoản ngoài bảng lương), `tallyApprovals`, `approvalHttpError` (mã lỗi → HTTP). |
| `src/platform/request-rules.ts` | `rulesFor(tháng)` dựng bảy mô-đun quy tắc dùng chung (`punch`, `leave`, `calendar`, `approvalView`, `actualHours`, `kpi`, `workSchedule`) từ bộ tham số hiệu lực của tháng; nhớ theo request HTTP (AsyncLocalStorage). Kèm `typeParam`, `benefitOf`, `vnToday`, `nowIso`. |
| `src/engine/approval-view.ts` | Mô-đun dùng chung trình duyệt + máy chủ: `ITEMS`, nhận diện khoản (`itemOf`), dấu vân tay (`fingerprint`), trạng thái hiệu lực (`effectiveStatus`), lịch tính tiền đã xử lý khoản chưa duyệt (`payView`), `POLICY`, `COUNTS_ABSENT`, `ALLOWED_ACTIONS`. |
| `src/modules/sheet/sheet.helpers.ts` / `src/modules/attendance/attendance.controller.ts` (route) | `GET/PUT /holidays`, `GET /sheet`, `PUT /sheet`, `GET/PUT /kpi/scores` (,), `GET /approvals`, `GET /approvals/count`, `GET /alerts`, `PUT /approvals/decide`, `POST /punch` (, nhánh Check-out muộn), `GET/POST/PUT /ot` (,,), `checkInDay`, `cleanDays`, `leaveBalanceView`, `holidayOtConflicts`. |
| `src/domain/sheet-on-behalf.ts` | Admin khai lịch thay (`sheetOwner`) và duyệt ngay khoản được khai thay (`approveOnBehalf`). |
| `src/domain/timesheet/` (nối ở `timesheet/services.ts`) | Kiểm nghiệp vụ khi lưu lịch (`checkSheet`, `assertSheetRev`, `checkExtraTimes`): phép đủ số dư, cấm làm bù ngày lễ, quyền lợi, trần OT, iSAT, ca của ngày… |
| `src/domain/isat-rule.ts` | `isatRefusal`: iSAT chỉ đúng thứ `isat.weekday` và chỉ chức vụ có `benefit.isat`. |
| `src/domain/overtime/hour-limits.ts` | Hai trần giờ làm chặn cứng (giờ ròng một ngày `DAY_HOURS_CAP`, OT cộng giờ ca chính làm ngày lễ một tháng `MONTH_OT_CAP`) và giới hạn iSAT `isat.monthlyLimit`; ngày được xin tạm ứng `ADVANCE_REQUEST_DAYS` (`assertAdvanceWindowOpen`, `advanceWindow`). |
| `src/domain/leave/*` | Sổ phép lưu sẵn: `migrations/postgres/0001_baseline.sql` (bảng `leave_ledger`), `leave-events.ts` (các lần cộng phép có ngày), `leave-ledger-repository.ts` (đồng bộ sổ, ghi số dư), `leave-account-service.ts` (tính lại, hẹn giờ), `src/modules/leave/leave.controller.ts` (`/api/leave/ledger`, `/api/leave/refresh`). |
| `src/domain/leave-days.ts` | `leaveDates(staff)`: các ngày "Nghỉ phép năm" thực sự trừ phép (gồm ngày chờ duyệt, bỏ ngày bị từ chối và ngày lễ nằm trong lịch). |
| `src/engine/leave.ts` | Quy tắc phép dùng chung: `accrued`, `counted`, `ledger` (hết hạn, quy tiền), `settlementFor`. |
| `src/domain/advance/advance-approvals.ts` | Lớp `AdvanceApprovals`: yêu cầu tạm ứng theo tháng lưu ở `settings.advance_approvals_<YYYY-MM>`, bước chuyển trạng thái, rev. |
| `src/domain/advance/index.ts` | Đối tượng dùng chung `advanceApprovals` (đọc/ghi qua `store.getSetting/setSetting`). |
| `src/modules/advance/advance-approvals.handlers.ts` | Route `/api/advance-approvals[...]`: xem, xin, rút, duyệt, từ chối, huỷ duyệt, duyệt tất cả. |
| `src/domain/advance/advance-cap.ts` | Số tạm ứng theo quy tắc của một người / nhiều người (`figuresOf`) bằng chính bộ máy lương; `capOf` cho route cũ. |
| `src/domain/advance/advance-requests.ts` | Bảng cũ `advance_requests` (yêu cầu ứng lương có số tiền): đọc, huỷ; `create` và `decide` còn trong mã nhưng route trả 410. |
| `src/modules/advance/advance-requests.handlers.ts` | Route cũ `/api/advance-requests[...]`: GET lịch sử, POST và PUT decide → 410, POST cancel. |
| `src/domain/explanation/explanations.ts` | Lối vào của giải trình, chuyển tiếp sang `container.explanations`. |
| `src/domain/explanation/*` | `explanation.ts` (lớp `Explanation` kế thừa `Request`), `explanation-repository.ts`, `explanation-service.ts`, `absent-day.ts` (`AbsentDay.stateOf`: ngày vắng không phép giải trình được), `migrations/postgres/0001_baseline.sql` (bảng `explanations`), `late-checkout.ts` (phút Check-out muộn), `late-checkout-session.ts` (lượt Check-out muộn chờ duyệt), `src/modules/explanations/explanations.controller.ts` (`/api/explanations[...]`). |
| `src/domain/attendance/admin-presence.ts` | Lượt chấm công nguồn Admin: từ Admin khai thay lịch (`sync`) và từ giải trình ngày quên chấm đã duyệt (`syncExplanation`). |
| `src/domain/attendance/session-status.ts` | Nhãn hiển thị của một lượt chấm công (`SessionStatus.classify`). |
| `src/domain/shared/request.ts`, `domain-error.ts`, `repository.ts` | Lớp gốc yêu cầu chờ duyệt (rev, tự duyệt), lỗi có mã/HTTP, `updateWithRev`. |
| `src/domain/kpi/kpi-scoring.ts` | KPI: `kpiMaxOf`, `hasKpi`, `cleanKpi`, `cleanKpiAmt`, `kpiScoreItem`, `kpiPartsView`, `selfScoreOnly`, `kpiHttpError`. |
| `src/engine/kpi-score.ts` | Quy tắc KPI dùng chung: trọng số, `checkScore`, `evaluate`, `pay`. |
| `src/domain/ot.ts` | OT khai ở Check-in/out: `listOt`, `validateOtDeclaration`. |
| `src/platform/authz.ts` | `ROUTE_CAPS`, vai trò, `can`, `scopeOf`, `gate`, `isSelfDecision`, `DECIDE_ITEMS`. |
| `src/platform/warnings.ts` | `warnIf`, `selfDecision`, `optionalReason`. |
| `src/platform/events.ts` | SSE: `approvalsChanged`, `requestsDecided`, `advanceDecided`, `estimateChanged`, `punchChanged`, `punchCorrected`, `attendanceChanged`, `paramsChanged`. |
| `src/domain/payroll/payroll-service.ts`, `src/engine/payroll-engine.ts` | Người dùng kết quả duyệt: đưa dòng duyệt, cờ tạm ứng đã duyệt, ngày giữ lương do giải trình, số ngày phép dư quy tiền vào bộ máy. |

### Trình duyệt

Giao diện web phục vụ từ `public/`; khi có bản dựng, `src/platform/http.ts` phục vụ `web/dist`. Danh sách dưới đây là phần của `public/`.

| File | Việc |
| --- | --- |

---

## 2. Dữ liệu

### 2.1 Bảng

**`sheet_approvals`** (`src/domain/approvals/approvals.ts`) — một dòng cho mỗi (người, ngày) có khoản tự khai.

| Cột | Ý nghĩa |
| --- | --- |
| `username`, `date` | Khoá chính `(username, date)`; `date` = `YYYY-MM-DD`. Mỗi ngày tối đa một dòng (một khoản). |
| `item` | Một trong `ApprovalView.ITEMS`. Dòng lưu mục `holiday_work` được đọc ra là mục `ot` (`itemOfRow`). |
| `fingerprint` | Chuỗi mô tả phần được trả tiền lúc khai (mục 4.1). Đổi thì về chờ duyệt. |
| `status` | `pending` / `approved` / `rejected` (CHECK). |
| `rev` | Bắt đầu 1, +1 khi đổi mục/vân tay hoặc đổi kết quả duyệt. |
| `submitted_at` | ISO, lúc khai hoặc khai lại. |
| `decided_by`, `decided_at`, `note` | Người duyệt (`system` khi duyệt sẵn do đồng bộ hoặc đợt tạo dòng), lúc duyệt, lý do. |

Chỉ mục `idx_sheet_approvals_status_date (status, date)`.

**`timesheets`** (`src/platform/db.ts`): lịch khai `days_json`, `kpi_pct`, `kpi_amt` (mức KPI tự đề xuất qua `PUT /sheet`), `kpi_adm_pct`, `kpi_adm_amt` (mức KPI Admin duyệt, ghi qua `PUT /kpi/scores`), `rev` (khoá lạc quan của `PUT /sheet`, `store.setSheet` +1 mỗi lần lưu — `src/platform/db.ts`). Lịch không mang trạng thái duyệt. Ngày trong lịch (`cleanDays`, `src/modules/sheet/sheet.controller.ts` / `src/modules/kpi/kpi.controller.ts`) có `kind` ∈ `work, makeup (loại cũ, chỉ để ngày đã lưu gửi lại không đổi), leave, unpaid, willmakeup, approved, isat` (`DAY_KINDS`,).

**`advance_requests`** (dạng cũ, `src/platform/db.ts`): `id`, `username`, `month`, `amount` (số xin, nguyên > 0), `cap`, `note`, `status` (`pending|approved|rejected|cancelled`), `granted`, `rev`, `created_at`, `decided_by/at`, `decision_note`, `cancelled_by/at`. Chỉ mục duy nhất `(username, month) WHERE status='pending'`. Trigger `advance_requests_guard_update` cấm đổi người/tháng/số xin/created_at, cấm đổi dòng đã `rejected`/`cancelled`, và từ `approved` chỉ sang `approved`/`cancelled`.

**`explanations`** (`migrations/postgres/0001_baseline.sql`): `id`, `username`, `date`, `kind` (`late-checkout|admin|ai`), `session_id`, `prompt`, `rule_id`, `requested_by`, `requested_at`, `status` (`requested|answered|approved|rejected`), `answer`, `answered_at`, `decided_by`, `decided_at`, `decision_note`, `rev` (mặc định 0). Chỉ mục `(username,status)`, `(status,id)`, `(session_id)`.

**`leave_ledger`** (`migrations/postgres/0001_baseline.sql`): `id`, `staff_uuid`, `username`, `kind` (`start|month|year|seniority|birthday|expire`), `on_date`, `days` (REAL, `expire` âm), `created_at`, `updated_at`; UNIQUE `(staff_uuid, kind, on_date)`. Số dư lưu sẵn: `staff.leave_balance`, `staff.leave_balance_on`.

**`kpi_scores`** (`src/platform/db.ts`): mỗi (người, tháng) một dòng; cột `wework`, `user_score`, `peer`, `manager`, `self_score` là điểm × 100 (0..10000, null = chưa nhập); `created_by/at`, `updated_by/at`. **`kpi_score_log`** (`src/platform/db.ts`): chỉ thêm dòng; `field` (`wework|user|peer|manager|self|amt`), `old_value`, `new_value`, `by`, `at`, `reason`.

**`attendance_sessions.entry`** (OT khai ở Check-in/out): `extraKind:'ot'`, `extraIn`, `extraOut`, `otDeclaration {by, at, reason}`, `otNeedsReview`, `otReview {ok, by, at, note?}`, `otDeclarationHistory[]`, `otHistory[]`; Check-out muộn: `requestedOut`, `reason:'forgot-out'`; lượt Admin ghi nhận: `origin` = `ADMIN_ORIGIN`, `explanationId` khi sinh từ giải trình.

### 2.2 Khoá settings

| Khoá | Nội dung |
| --- | --- |
| `holidays` | Mảng ngày lễ `YYYY-MM-DD`. |
| `advance_approvals_<YYYY-MM>` | `{ rev, users: { <username>: { status, rev, requestedAt, requestedBy, decidedAt, decidedBy, reason } } }`. `status` null = đã rút (giữ dòng để rev người đó không về 0). Dòng dạng `{ approved: true, by, at }` đọc như `approved` (`normalize`, `advance-approvals.ts`). |
| `sheet_approvals_v1` … `_v4` | Dấu các đợt tạo dòng duyệt cho lịch đã lưu đã chạy: `{ at, cutoffMonth, approved, pending }`. |
| `roles.custom` | Vai trò tuỳ chỉnh; `approvals[]` cấp `request.decide.<khoản>`. |

### 2.3 Bộ nhớ đệm

- `rulesFor(tháng)`: một bản cho mỗi tháng trong một request HTTP (`src/platform/request-rules.ts`); ngoài request dựng mới mỗi lần.
- `ApprovalView.create(params)`, `LeaveRules.create`, `KpiScore.create`: nhớ theo đối tượng tham số (WeakMap).
- `aiReview.aiReviewResultCached(month, false)`: kết quả soát AI dùng cho chặn duyệt.
- Không có cache cho `sheet_approvals`, `advance_approvals_*`, `explanations`: mỗi lần gọi đọc DB.

### 2.4 Trạng thái và bước chuyển

**Khoản tự khai (`sheet_approvals`)**

| Từ | Sang | Ai / khi nào |
| --- | --- | --- |
| (không có dòng) | `pending` | `reconcile` thấy khoản mới (PUT /sheet, đổi lễ, đổi loại). |
| (không có dòng) | `approved` (by `system`) | `reconcile` với `approveBefore` và tháng đứng trước tháng mốc `CUTOFF_MONTH` (`src/domain/approvals/approvals.ts`), hoặc đợt tạo dòng. Chỉ đường `reconcileMonthApprovals` truyền `approveBefore`. |
| bất kỳ | `pending` (rev+1, xoá người duyệt và lý do) | Mục hoặc dấu vân tay đổi. Trả về trong `reset` (trước là approved) hoặc `resubmitted` (trước là pending/rejected). |
| `pending` / `rejected` / `approved` | `approved` / `rejected` (rev+1) | `decide`. Cùng trạng thái đích → 409 `APPROVAL_NOOP`. Đổi từ approved/rejected = "đổi kết quả duyệt". |
| có dòng | (xoá) | Ngày không còn khoản. |

Trạng thái hiệu lực (khác trạng thái lưu): `approved` chỉ khi dòng tồn tại, `status='approved'` và `fingerprint` khớp ngày hiện tại; không có dòng hoặc vân tay lệch = `pending` (`effectiveStatus`, `approval-view.ts`).

**Tạm ứng (`advance_approvals_<tháng>`)** — `MOVES` (`advance-approvals.ts`)

| Bước | Từ | Sang | Lỗi khi sai trạng thái (409) |
| --- | --- | --- | --- |
| `request` | `null` | `pending` | `ADVANCE_ALREADY_REQUESTED` |
| `withdraw` | `pending` | `null` | `ADVANCE_NOT_PENDING` |
| `approve` | `pending` | `approved` | `ADVANCE_NOT_PENDING` |
| `reject` | `pending` | `rejected` | `ADVANCE_NOT_PENDING` |
| `cancel` | `approved` | `pending` | `ADVANCE_NOT_APPROVED` |

`rejected` không có bước ra: người bị từ chối không xin lại được trong tháng đó.

**Ứng lương dạng cũ (`advance_requests`)**: `pending → approved|rejected` (decide, route trả 410), `pending → cancelled` (chủ yêu cầu hoặc người duyệt), `approved → cancelled` (chỉ người duyệt). `rejected`, `cancelled` là cuối.

**Giải trình (`explanations`)**: `requested → answered` (nhân viên trả lời, `answerWith`); `answered|approved|rejected → approved|rejected` (`decide`, `DECIDABLE`); Check-out muộn: tạo thẳng `answered`; gửi lại (`resubmit`) từ `answered|rejected → answered` (xoá kết quả duyệt), từ `approved` → 409 `EXPLANATION_ALREADY_APPROVED`.

**OT Check-in/out**: suy ra từ `entry.otReview`: không có = `pending`, `ok:true` = `approved`, `ok:false` = `rejected` (`src/domain/ot.ts`). Đã có `otReview` thì `PUT /ot` trả 409; khai lại (`POST /ot`) xoá `otReview` (lưu vào `otHistory`).

**Kỳ lương**: `assertPeriodOpen(month, scope)` (`src/platform/db.ts`) khoá từ `attendance_locked` cho scope `attendance`/`params`, từ `approved` cho `kpi`/`slip` (`SCOPE_LOCKED_FROM`,); mọi tháng khoá như nhau.

---

## 3. API

Quyền ở cổng `ROUTE_CAPS` (`src/platform/authz.ts`), kiểm trước khi đọc thân. `request.decide.*` ở cổng = có quyền duyệt ít nhất một nhóm (`gate`, `authz.ts`). `A` = mọi người đã đăng nhập. "Khoá kỳ" = `guardPeriod` (`src/modules/periods/periods.helpers.ts` / `src/http/api-gate.ts`) → `store.assertPeriodOpen` (chỉ cảnh báo `PERIOD_LOCKED`, cộng `PERIOD_FROZEN` nếu kỳ đã duyệt/chi trả, `warnFrozen`).

### 3.1 Khoản tự khai và bảng duyệt

| Route | Quyền | Input | Output | Lỗi chính | Khoá kỳ / cảnh báo |
| --- | --- | --- | --- | --- | --- |
| `GET /api/sheet?month=&user=` | `self-or:attendance.read` | `month`, `user` (mặc định mình) | lịch đã chiếu + `rev`, `approvals: { ngày: { item, fingerprint, holiday?, status, rev, decidedBy, decidedAt, note } }`, `otherLeave`, `leaveBalance`, `kpiParts`, `kpiWeights`, `attendanceSessions`, `corrections`, `actualReport`, `cutRule`… Tài khoản ngoài bảng lương xem lịch của chính mình nhận lịch trống `payrollSubject:false`. | 400 tháng; 403 xem người khác | Không ghi (trừ `closeStale` đóng lượt mở quá hạn của người được xem). |
| `PUT /api/sheet` | `A`, `periodScope: attendance` | `{ month, days, kpiPct?, kpiAmt?, user?, expectedRev?, confirmDays?, preserveKpi? }`; `preserveKpi:true` chỉ cho lịch của chính mình, không kèm KPI fields, và giữ KPI đang lưu phía máy chủ | `{ ok, rev, approvals, reset[], resubmitted[], removed[], onBehalf?, autoApproved? }` | 400 định dạng (`cleanDays`); 403 khai thay không quyền; 409 `SHEET_STALE`; 400 `OT_MONTH_CAP`, `SHEET_MAKEUP_ON_HOLIDAY`, `SHEET_MAKEUP_DAY_REMOVED`, `EXTRA_WRONG_SIDE`, `DAY_HOURS_CAP`, iSAT sai thứ / sai quyền lợi (luôn chặn); các cảnh báo của `sheet-checks`/`limits` (mục 4.20) | Khoá kỳ scope `attendance`. |
| `PUT /api/sheet/bulk` | `request.decide.*` (cổng; phạm vi từng người kiểm trong handler), `periodScope: attendance`, `HEAVY_ROUTES` | `{ month, usernames[], days: { ngày: { kind:'work', preset } }, confirmDays?, expectedRevs?: { tên: rev } }` | `{ ok, month, results: [{ username, rev, autoApproved, reset[], resubmitted[], removed[], presence: { set[], removed[], skipped[] }, skipped: [{ date, kind }] }] }` | 400 `USERNAMES_REQUIRED`, `TOO_MANY` (> `system.staff.bulkMax`), danh sách sai / lặp, `BULK_DAY_INVALID`, `SHIFT_UNKNOWN`, `BULK_DAY_FUTURE`, `NOT_PAYROLL_SUBJECT`, `DAY_HOURS_CAP`, `OT_MONTH_CAP` (kèm `username`); 403 `FORBIDDEN_CAP`; 404 `STAFF_NOT_FOUND` `{ missing }`; 409 `SHEET_STALE` `{ username, rev }`. Một lỗi cứng của một người thì không ai được lưu. | Khoá kỳ scope `attendance`. Cảnh báo theo người (mở đầu bằng họ tên, `details.username`); chính người gọi trong danh sách ⇒ `SELF_DECISION_FORBIDDEN`. Chi tiết: spec/attendance.md mục 3.4b. |
| `GET /api/approvals?status=&month=&user=&limit=&offset=` | `request.decide.*` | `status` mặc định `pending` (`pending|approved|rejected|all`); `limit` 1..500 mặc định 200; `offset` ≥ 0 | `{ items[], counts{pending,approved,rejected}, sheets{ "user|YYYY-MM": lịch + approvals }, limits{ decideMax, noteMax } }`. Mỗi item: cột dòng duyệt + `name`, `locked?`, `declared{ kind,in,out,extraKind,extraIn,extraOut,punchNote?,makeupPlans?,makeupDate? }`. Chỉ trả khoản mà người xem có `request.decide.<khoản>` với người đó. | 400 tham số | Chỉ đọc. |
| `GET /api/approvals/count` | `request.decide.*` | — | `{ pending }` (đã lọc quyền) | — | — |
| `GET /api/alerts?month=` | `request.decide.*` | `month` | `{ missingPunches[{username,name,date,kind}], absentNoExplanation[{username,name,date}], pendingApprovals }` | 400 tháng | Có ghi: `closeStaleFor` đóng lượt mở quá 16 giờ (`src/modules/approvals/approvals.controller.ts`). `missingPunches` và `absentNoExplanation` (ngày trong lịch không có lượt nào, chưa có giải trình ở bất kỳ trạng thái nào) chỉ gồm người trong phạm vi `attendance.correct` của người xem. |
| `PUT /api/approvals/decide` | `request.decide.*`, `periodScope: attendance` | `{ action: 'approve'|'reject', note?, items: [{ username, date, rev, fingerprint }] }` (1..`system.approval.maxDecideItems` = 200) | `{ ok, decided, items: [{ username, date, status, rev }] }` | 400 thiếu/sai trường, trùng ngày, tài khoản ngoài bảng lương, note > `NOTE_MAX`; 403 `FORBIDDEN_CAP` (khoản ngoài nhóm/phạm vi); 409 `AI_BLOCKED` (chỉ khi approve và công tắc Agents bật); 404 `APPROVAL_NOT_FOUND`; 409 `APPROVAL_STALE`; 409 `APPROVAL_NOOP`; 400 `SHEET_ISAT_WEEKDAY` / `BENEFIT_NOT_ALLOWED` khi approve khoản `isat` sai thứ hoặc chức vụ không có `benefit.isat`; cảnh báo `APPROVAL_SELF` khi tự duyệt | Khoá kỳ theo tháng của từng ngày. Tất cả hoặc không gì. |

### 3.2 Ngày lễ

| Route | Quyền | Input | Output | Lỗi | Ghi chú |
| --- | --- | --- | --- | --- | --- |
| `GET /api/holidays` | `A` | — | `{ dates, names }` | — | — |
| `PUT /api/holidays` | `config.payroll`, `periodScope: attendance` | `{ dates[], names }` | `{ dates, names }` | 400 ngày sai; cảnh báo `HOLIDAY_LEAVE_CONFLICT`; cảnh báo `HOLIDAY_OT_CONFLICT` | Khoá kỳ chỉ cho các ngày thêm hoặc bỏ. Trong giao dịch: lưu, `configRev.bump()`, `reconcileHolidayWork`, nhật ký. |

### 3.3 Tạm ứng

Tất cả qua `src/modules/advance/advance-approvals.handlers.ts` `handle`. Khoá kỳ: tự kiểm `assertEditable` — kỳ `approved`/`paid` → **luôn** 409 `PERIOD_LOCKED` (details `{ month, status, scope:'slip' }`). `ROUTE_CAPS` để `periodScope` null.

| Route | Quyền | Input | Output | Lỗi chính |
| --- | --- | --- | --- | --- |
| `GET /api/advance-approvals?month=&username=` | `A`; xem người khác cần `request.decide.advance` hoặc `payroll.view` phạm vi all | `month`, `username?` | Một người: `{ month, scope:'self'|'person', rev, provisional, item }`. Tất cả: `{ month, scope:'all', rev, provisional, pending, items[] }` — chỉ người đã có yêu cầu (mọi trạng thái, không gồm người đã rút). `item = { username, name, eligible, reason?, amount, status, rev, requestedAt, decidedAt, decidedBy, note }` | 400 `BAD_MONTH`, `BAD_USERNAME`; 403 `FORBIDDEN_CAP` |
| `POST /api/advance-approvals/request` | `A` (chính mình) | `{ month, expectedRev? | rev? }` (rev của người) | `{ month, rev(tháng), item }` | 403 `ADVANCE_NOT_ELIGIBLE`; 409 `ADVANCE_ZERO` (số cuối cùng sau ngày `advance.untilDay` bằng 0); 409 `ADVANCE_ALREADY_REQUESTED`; 409 `ADVANCE_REQUEST_STALE`; 409 `PERIOD_LOCKED` |
| `POST /api/advance-approvals/withdraw` | `A` | `{ month, expectedRev? }` | như trên | 409 `ADVANCE_NOT_PENDING`, `ADVANCE_REQUEST_STALE`, `PERIOD_LOCKED` |
| `POST /api/advance-approvals/approve` | cổng `request.decide.*`; người: `request.decide.advance` phạm vi người đó | `{ month, username, expectedRev? }` | như trên | 404 `STAFF_NOT_FOUND`; 403 `FORBIDDEN_CAP`; 403 `ADVANCE_NOT_ELIGIBLE`; 409 `ADVANCE_NOT_PENDING`; `SELF_DECISION_FORBIDDEN` 403 (block) / cảnh báo; 409 `PERIOD_LOCKED` |
| `POST /api/advance-approvals/reject` | như approve | `{ month, username, expectedRev?, reason? }` (≤ `NOTE_MAX`) | như trên | như approve (không kiểm eligible) |
| `POST /api/advance-approvals/cancel` | như approve | `{ month, username, expectedRev?, reason? }` | như trên | 409 `ADVANCE_NOT_APPROVED`; còn lại như reject |
| `POST /api/advance-approvals/approve-all` | cổng `request.decide.*` | `{ month, expectedRev? }` (rev của **tháng**) | `{ month, rev, approved[], skipped[{username, code}] }` | 409 `ADVANCE_REQUESTS_STALE`; 409 `PERIOD_LOCKED` |

### 3.4 Ứng lương dạng cũ

`src/modules/advance/advance-requests.handlers.ts` (`handle`). Lỗi của `src/domain/advance/advance-requests.ts` mang `httpStatus` được bọc thành `HttpError`.

| Route | Quyền | Hành vi |
| --- | --- | --- |
| `GET /api/advance-requests?month=&username=&status=` | `A` | Lịch sử. Một người: kèm `cap, granted, remaining, eligible, reason?` (`capOf`). Người xem tất cả: kèm `pending` (tháng), `pendingAll` (mọi tháng, lọc theo quyền duyệt). |
| `POST /api/advance-requests` | `A` | 410 `ADVANCE_REQUEST_RETIRED`. |
| `PUT /api/advance-requests/:id/decide` | `request.decide.*` | 410 `ADVANCE_REQUEST_RETIRED`. |
| `POST /api/advance-requests/:id/cancel` | `A` | `{ rev?, reason? }` → `{ request }`. 404 `ADVANCE_NOT_FOUND`, 409 `REV_STALE`, 403 `FORBIDDEN_CAP`, 409 `ADVANCE_NOT_CANCELLABLE`. Khoá kỳ: `store.assertPeriodOpen(month,'slip')` (`src/domain/advance/advance-requests.ts`; chỉ cảnh báo). |

### 3.5 Giải trình

`src/modules/explanations/explanations.controller.ts`. Không khoá kỳ ở mọi bước.

| Route | Quyền | Input | Output | Lỗi |
| --- | --- | --- | --- | --- |
| `GET /api/explanations?status=&user=` | `A`; người có `attendance.correct` phạm vi all xem mọi người | — | `{ items[view + name, requestedOut], waitingForYou, toRead }` | 400 user |
| `POST /api/explanations` (Admin yêu cầu) | `A`; `username` khác mình cần `attendance.correct` all | `{ username, date, prompt, source?:'ai', ruleId? }` | `{ item }` | 403 `FORBIDDEN_CAP`; 400 `BAD_KIND`/`BAD_DATE`/`EXPLANATION_TEXT_REQUIRED`/`EXPLANATION_TEXT_TOO_LONG`; 404 `NO_SUCH_USER` |
| `POST /api/explanations` (nhân viên tự giải trình ngày vắng) | `A`; `username` nếu có phải là chính mình | `{ date, text }` | `{ item }` (kind `admin`, `requestedBy` = người gửi, `status: answered`) | 400 `BAD_DATE`/`EXPLANATION_TEXT_REQUIRED`/`EXPLANATION_TEXT_TOO_LONG`/`EXPLANATION_DAY_FUTURE`/`EXPLANATION_DAY_OFF_SCHEDULE`; 403 `FORBIDDEN_CAP` (có `username` khác mình); 409 `EXPLANATION_DAY_PUNCHED`/`EXPLANATION_DAY_NOT_ABSENT`/`EXPLANATION_PERIOD_LOCKED`/`EXPLANATION_EXISTS` |
| `POST /api/explanations` (Check-out muộn) | `A` | `{ sessionId, text }` | `{ item }` | 404 `SESSION_NOT_FOUND`; 409 `EXPLANATION_ALREADY_APPROVED`; 400 text |
| `POST /api/explanations/:id/answer` | `A` | `{ text }` | `{ item }` | 404 `NOT_FOUND`; 403 `FORBIDDEN`; 409 `NOT_REQUESTED`; 409 `EXPLANATION_STALE` |
| `POST /api/explanations/:id/decide` | `attendance.correct` | `{ approve, note?, expectedRev? }` | `{ item, recorded }` (`recorded` = có ghi lượt Admin theo giờ ca) | 404; 409 `EXPLANATION_STALE`; 409 `NOT_ANSWERED`; cảnh báo `SELF_DECISION_FORBIDDEN`; 409 `SESSION_OVERLAP`, `SESSION_STALE` (Check-out muộn) |

`POST /api/punch` (Check-out): nếu `needsExplanation` → `lateCheckout.record` (409 `CHECKOUT_NEEDS_EXPLANATION` khi chưa có giải trình và không gửi kèm `explanation`) (`src/modules/attendance/attendance.controller.ts`). `POST /api/punch` (Check-in) gọi `checkInVerdict` và trả 409 `CHECKIN_NOT_ALLOWED` (ngày không qua cổng, mục 4.13) hoặc `CHECKIN_OUTSIDE_SHIFT` (ngoài khung ca không có khoản đã duyệt phủ giờ đó, attendance.md 3.2b).

### 3.6 Sổ phép

| Route | Quyền | Hành vi |
| --- | --- | --- |
| `GET /api/leave/ledger?user=` | `self-or:profile.read` | Tính lại và **ghi** sổ của người đó rồi trả `{ username, uuid, hasAccount, balance, on, summary, events[] }`. 400 `BAD_USER`, 404 `STAFF_NOT_FOUND`, 403 `FORBIDDEN_CAP`. |
| `POST /api/leave/refresh` | `profile.write` | `{ user? }`: một người → `{ checked:1, accounts, failed:0, balance }`; không có → `refreshAll()` `{ checked, accounts, failed }`. |

### 3.7 KPI

| Route | Quyền | Input | Output | Lỗi / cảnh báo |
| --- | --- | --- | --- | --- |
| `GET /api/kpi/scores?month=` | `kpi.score.write` | `month` | `{ month, method, weights, items[kpiScoreItem] }` (chỉ người `hasKpi`) | 400 |
| `PUT /api/kpi/scores` | `self-or:kpi.score.write`, `periodScope: kpi` | `{ month, user|username, scores{wework,user,peer,manager,self}, amt, reason }` | Đầy đủ: `{ ok, item, changed }`; tự đánh giá: `{ ok, changed, kpiParts }` | 403 `KPI_SELF_ONLY`; 400 user/không có KPI/điểm sai/amt sai/lý do > `NOTE_MAX`/không có gì để lưu; 404; `SELF_DECISION_FORBIDDEN`; khoá kỳ scope `kpi` (từ `approved`); `KPI_MONTH_FUTURE`, `KPI_OVER_CAP` qua `warnIf` |

### 3.8 OT ở Check-in/out

| Route | Quyền | Input | Hành vi |
| --- | --- | --- | --- |
| `GET /api/ot?status=` | `attendance.correct` | `pending` (mặc định) / `approved` / `rejected` | `{ ot: [...] }` mới nhất trước. |
| `POST /api/ot` | `attendance.correct`, `periodScope: attendance` | `{ sessionId, version, extraIn, extraOut, reason }` | Admin khai/điều chỉnh OT của lượt; đặt `otNeedsReview=true`, xoá `otReview`. Lý do bị cắt 300 ký tự; thiếu lý do: `REASON_REQUIRED` (quiet). |
| `PUT /api/ot` | `attendance.correct`, `periodScope: attendance` | `{ sessionId, version, action, note }` | Duyệt/từ chối OT của lượt; 404 không có OT, 409 lượt mở / đã xử lý; `SELF_DECISION_FORBIDDEN`; thiếu lý do từ chối `REASON_REQUIRED` (quiet). |

---

## 4. Cách tính / quy tắc

### 4.1 Nhận diện khoản và dấu vân tay (`itemOf`, `approval-view.ts`)

Đầu vào: một ngày khai `day` và ngữ cảnh `ctx = { date, holidays (mảng hoặc Set), staffType, schedule? }`.

1. `day` không phải object, hoặc có `src`, hoặc `attendanceConfirmed` → không phải khoản (thuộc luồng Check-in/out).
2. `kind` = `day.kind || 'work'`.
3. `isat` → `{ item:'isat', fingerprint:'isat' }`; `approved` → `'approved'`; `leave` → `'leave'`.
4. `willmakeup` → danh sách kế hoạch = `makeupPlans` nếu là mảng, ngược lại `[{ date: makeupDate, from:'', to:'' }]` nếu có `makeupDate`, ngược lại `[]`; mỗi kế hoạch thành `[date||'', from||'', to||'']`, sắp theo chuỗi nối `|`; vân tay `willmakeup|<JSON.stringify(mảng)>`.
5. Loại khác `work` (ví dụ `unpaid`, hay ngày loại cũ `makeup` mà bộ máy tính 0) → không phải khoản. `makeup_day` vẫn nằm trong `ITEMS` vì bộ tham số có khoá `request.type.makeup_day.*`, nhưng `itemOf` không bao giờ trả khoản này.
6. `work` có `in` và `out` và `isScheduledHoliday(ctx)` → `{ item:'ot', holiday:true }` (đi làm ngày lễ là OT: một loại khoản, từ–đến giờ), vân tay `holiday_work|<in>-<out>` + `|ot|<before>|<after>` khi loại làm thêm là `ot` và có ít nhất một đoạn. Làm bù trên ngày lễ không vào vân tay. Chức vụ không có quyền lợi `type.<mã>.benefit.ot` (TTS) → không có khoản.
7. Loại làm thêm hiệu lực = `extraKind || (extraOut ? 'makeup' : '')`. Chỉ `ot` / `makeup` mới xét tiếp.
8. Đoạn: `before = "<extraIn>-<in>"` khi có cả hai và khác nhau; `after = "<out>-<extraOut>"` tương tự. Không đoạn nào → không phải khoản.
9. `ot` → `{ item:'ot', fingerprint:'ot|<before>|<after>' }`; `makeup` → `{ item:'makeup_hours', fingerprint:'makeup_hours|<before>|<after>' }`.

`isScheduledHoliday(ctx)`: `ctx.date` đúng dạng, nằm trong `holidays`, chức vụ có quyền lợi OT, và là ngày làm việc trong lịch: `WorkSchedule.isWorkDay(ctx.schedule || scheduleOf({type: staffType}, tháng), date)`. Ngày lễ ngoài lịch của người (ví dụ thứ Bảy của loại không làm thứ Bảy) khai đi làm không có OT/làm bù thì không phải khoản nào.

Đổi ca, preset, giờ nghỉ không đổi vân tay; đổi loại, đoạn làm thêm, giờ vào/ra liền đoạn (hoặc giờ vào/ra của ngày lễ) thì đổi.

### 4.2 Lịch tính tiền với khoản chưa duyệt (`payView`, `approval-view.ts`)

Cho từng ngày theo thứ tự tăng dần:

1. `found = itemOf(day, dayCtx(ctx, date))`. Có → `status = effectiveStatus(day, row, ctx)`.
2. Không có và `ctx` không có danh sách lễ dùng được → thử `itemFromRow(day, row)`: tin dòng duyệt của máy chủ cho OT ngày lễ khi ngày là `work` có in/out, không `src`/`attendanceConfirmed`; vân tay dòng vắng hoặc khớp `holidayFingerprint(day)` thì theo `row.status`, lệch thì `pending`.
3. Không có khoản → giữ nguyên ngày.
4. `approved` → giữ nguyên ngày.
5. Còn lại: thêm `{ date, item, status }` vào `pendingItems`; hàng chính sách là `holiday_work` khi khoản là OT ngày lễ, ngược lại là mục của khoản; `action = policy[status][hàng]`; `counts = countsAbsent[hàng]`.
6. `applyAction`: `drop` → bỏ ngày khỏi lịch; `unpaid` → `{ kind:'unpaid' }` (thêm `absentExempt: true` khi `countsAbsent` = false); `strip` → bản sao bỏ `extraKind`, `extraIn`, `extraOut`. Giá trị khác → ném lỗi.

Bảng mặc định (registry `request.type.<khoản>.pendingRule` / `.rejectedRule` / `.countsAbsent`; giá trị cho phép ở `ALLOWED_ACTIONS`). Bị từ chối tính tiền y hệt chờ duyệt:

| Khoản | Chờ duyệt | Bị từ chối | Cho phép | countsAbsent | Hệ quả ở bộ máy khi chưa duyệt |
| --- | --- | --- | --- | --- | --- |
| `isat` | unpaid | unpaid | drop, unpaid | true | nghỉ không lương, tính ngày nghỉ |
| `approved` | unpaid | unpaid | drop, unpaid | true | như trên |
| `makeup_day` | drop | drop | drop | true | không phát sinh (`itemOf` không trả khoản này) |
| `ot` | strip | strip | strip | true | giữ ngày, bỏ OT |
| `makeup_hours` | strip | strip | strip | true | giữ ngày, bỏ giờ bù |
| `holiday_work` (hàng chính sách của OT ngày lễ, khoản mang mục `ot`) | drop | drop | drop | true | ngày lễ không đi làm (lương lễ nếu chức vụ có quyền lợi `paidHoliday`) |
| `leave` | unpaid | unpaid | drop, unpaid | true | nghỉ không lương |
| `willmakeup` | unpaid | unpaid | unpaid | true | nghỉ không lương, không phát sinh giờ cần bù |

Chuỗi tính lương một người (`computeMonth`, `payroll-engine.ts`): `payView(days, approvals, approvalPolicy(params), { holidays, staffType, schedule })` → `ActualHours.apply` → ghi đè mỗi ngày trong `explanationHold` thành `{ kind:'unpaid', punchIn?, punchOut?, held }` (`held` = `'rejected'` hoặc `'pending'`) → `calcMonth(..., { advance: advanceApproved === true, settleDays: leaveSettleDays })`.

### 4.3 Đồng bộ dòng duyệt (`reconcile`, `src/domain/approvals/approvals.ts`)

Input `declared = { ngày: { item, fingerprint } }` của đúng một tháng. Kiểm: tháng đúng dạng; mỗi ngày đúng dạng và thuộc tháng; item hợp lệ; fingerprint không rỗng (sai → Error thường). Trong giao dịch:

1. Xoá dòng của ngày không còn trong `declared` → `removed`.
2. Ngày mới → INSERT `pending` rev 1 (hoặc `approved` by `system` nếu `options.approveBefore` và `month < approveBefore`) → `added`.
3. Mục hoặc vân tay khác → UPDATE `pending`, rev+1, `submitted_at` mới, xoá `decided_by/at`, `note` → `reset` (trước approved) hoặc `resubmitted`.
4. Giống hệt → không đổi.

Trả `{ added, reset, resubmitted, removed }` đã sắp. Trạng thái không bao giờ đọc từ người dùng.

Nơi gọi:

| Nơi | Ngữ cảnh | approveBefore |
| --- | --- | --- |
| `PUT /sheet` (`src/modules/sheet/sheet.controller.ts`) | `declaredItems(clean, { holidays, staffType: u.type, schedule: sched })` | không |
| `reconcileMonthApprovals` (`src/domain/approvals/index.ts`) | `declaredItems(estimateSheet(...).days, { holidays, staffType, schedule })`, bỏ khoá ngày ngoài tháng/không thật | `CUTOFF_MONTH` |
| ← `reconcileHolidayWork(before, after)` | PUT /holidays: mọi nhân sự `payrollSubject`, các tháng có ngày lễ thêm/bỏ | |
| ← `reconcileStaffType(username, type)` | đổi loại nhân sự (`src/modules/sheet/sheet.controller.ts`): mọi tháng đã có lịch | |

`declaredItems` chiếu ngày qua `projectDay`: bỏ `kind:'pending'`; ngày khác `work`/`makeup` chỉ giữ `kind`, `makeupPlans`, `makeupDate`; `work`/`makeup` giữ `kind, shift, in, out, extraKind, extraIn, extraOut, preset, breakMin`.

Bốn đợt tạo dòng cho lịch đã lưu (`migrate`, `migrateHolidayWork`, `migrateLeave`, `migrateWillMakeup`) chạy một lần lúc mở DB, đánh dấu ở `sheet_approvals_v1`…`_v4`: tạo dòng duyệt cho khoản có sẵn trong `timesheets.days_json`; tháng đứng trước tháng mốc được duyệt sẵn bởi `system`, còn lại chờ duyệt. Lỗi dữ liệu lịch làm dừng khởi động (`bootFail`).

### 4.4 Duyệt theo lô (`PUT /approvals/decide` → `store.approvals.decide`)

Thứ tự kiểm (`src/modules/approvals/approvals.controller.ts`, `src/domain/approvals/approvals.ts`):

1. `action` ∈ `approve|reject` (400). `note` là chuỗi, cắt khoảng trắng, ≤ `NOTE_MAX` (300, `src/domain/input.ts`) (400).
2. 1 ≤ số khoản ≤ `system.approval.maxDecideItems` (mặc định 200).
3. Mỗi khoản: `username` đúng `USERNAME_RE`, `date` hợp lệ, `rev` nguyên, `fingerprint` không rỗng; không trùng `(username, date)`; người tồn tại mà `payrollSubject` false → 400.
4. `guardPeriod(ngày…)` scope `attendance`.
5. Mỗi dòng đang lưu phải `can(me, 'request.decide.<item>', { username })`, không thì 403 cả lô.
6. `approve` → với khoản `isat`, `isatRefusal` kiểm lại thứ trong tuần và quyền lợi (400); rồi `assertNotAiBlocked(items)` (4.14).
7. Trong giao dịch, `decide`: dòng thiếu → 404 `APPROVAL_NOT_FOUND`; `rev` hoặc `fingerprint` lệch → 409 `APPROVAL_STALE`; đã ở trạng thái đích → 409 `APPROVAL_NOOP`; tự duyệt (`row.username === by`) → cảnh báo `APPROVAL_SELF`; lý do không bắt buộc. UPDATE có điều kiện `rev` và `fingerprint`; không đúng 1 dòng → `APPROVAL_STALE`.
9. Một dòng nhật ký `approval.decide` cho mỗi khoản; sau COMMIT phát `approvals.changed` cho từng tháng và `request.decided`.

Dấu vân tay Admin đã thấy là bắt buộc, vì khoản xoá rồi khai lại bắt đầu lại rev 1.

### 4.5 Dòng duyệt gửi giao diện (`sheetApprovals`, `src/domain/approvals/index.ts`)

Với mỗi ngày của lịch: `rulesFor(month).approvalView.itemOf` với `ctx = { holidays, staffType, schedule: scheduleOf(staff kèm staffType, month) }`; trả `{ item, fingerprint, holiday?, status (effectiveStatus), rev (0 nếu chưa có dòng), decidedBy/decidedAt/note (chỉ khi vân tay khớp) }`. Ngày không có khoản không có mục.

`listApprovals(filter)` bỏ dòng của tài khoản `payrollSubject` false (dòng vẫn còn trong DB). `GET /approvals` lọc thêm theo `canDecideRow`, đếm `counts` trên mọi trạng thái **trước** lọc trạng thái và phân trang, rồi sắp theo `username`, `date`.

### 4.6 Admin khai thay (`src/domain/sheet-on-behalf.ts`)

- `sheetOwner(caller, user)`: `user` vắng hoặc trùng người gọi → người gọi. Khác → cần `can(caller, 'request.decide.*', { username })` (403 trước cả khi kiểm tên), tên hợp lệ, người tồn tại (404), `payrollSubject` (400).
- `approveOnBehalf` (trong giao dịch PUT /sheet và PUT /sheet/bulk, sau reconcile; trả `{ decided, presence }`): các ngày `added + reset + resubmitted` có dòng `pending` và người khai có `request.decide.<item>` được `store.approvals.decide(..., 'approved', caller, 'Admin khai thay')`. Không qua `assertNotAiBlocked`. Đồng bộ lượt chấm công nguồn Admin (`container.adminPresence.sync`). Nhật ký `sheet.onBehalf` `{ changedDays, autoApproved }`. KPI tự đề xuất của người được khai giữ nguyên.
- Ca của ngày khai thay (`adminShiftOf`, `timesheet/timesheet-validator.ts`): Admin chọn được mọi ca trong danh mục (`preset`); không chọn thì ca có đúng giờ vào – ra đã khai (ưu tiên ca được gán); không ca nào khớp mà ngày đổi → `SHEET_ADMIN_SHIFT_REQUIRED` (cảnh báo). `checkSheet` không báo `SHEET_SHIFT_MISMATCH` cho khai thay. Lượt Admin dựng theo ca đó, nên ngày được trả phụ cấp ca (đêm theo bậc / Flex theo giờ), giờ nghỉ và giờ thiếu theo ca Admin chọn. Nhân sự tự khai và Check-in/out vẫn tính theo ca được gán.
- Ngày đi làm do Admin khai thay (đã qua giờ ra) thành một lượt chấm công nguồn Admin có hiệu lực như một lượt Check-in/out hợp lệ (trễ / về sớm vẫn bị trừ như lượt bấm thật); lượt bấm thật dùng được thắng lượt Admin.

### 4.7 Đổi ngày lễ (`PUT /holidays`, `src/modules/settings/settings.controller.ts`)

1. Kiểm ngày, khử trùng, sắp; khoá kỳ chỉ cho ngày thêm/bỏ.
2. Xung đột phép: với mỗi nhân sự `payrollSubject` có quyền lợi `leaveAccount`, so `leaveDates` trước/sau; tại mỗi ngày phép sau đổi, `got = ledger.total − ledger.expired`, thiếu hụt sau > thiếu hụt trước + 1e-6 → `HOLIDAY_LEAVE_CONFLICT` (cảnh báo).
3. Xung đột OT ngày lễ (`holidayOtConflicts`, `src/modules/settings/settings.controller.ts`) → `HOLIDAY_OT_CONFLICT`: ngày lễ thêm vào đang có đoạn làm thêm trong Lịch ước tính (`holiday-extra`) hoặc OT thực tế ở Check-in/out (`holiday-ot`); hoặc giờ đi làm lễ + OT của tháng vượt `MONTH_OT_CAP` (40) và tăng so với trước (`month-limit`).
4. Lưu `holidays`, tên, `configRev.bump()`, `reconcileHolidayWork(before, clean)`, nhật ký `holiday.set`. Sau COMMIT: `params.changed` kind `holidays`, `fromMonth` = tháng của ngày đổi sớm nhất.

Ngày lễ bị bỏ: dòng OT ngày lễ biến mất (hoặc thành khoản OT/làm bù giờ nếu ngày có đoạn). Ngày khai đi làm trùng ngày lễ: dòng OT ngày lễ chờ duyệt (duyệt sẵn nếu tháng đứng trước tháng mốc).

### 4.8 Phép năm

**Cộng phép** (`accrued` trong `src/engine/leave.ts`; tham số `leave.*`; `accrued` luôn đếm từ ngày vào làm, phần cắt theo năm nằm ở `counted`):

- Tháng tròn thứ k = ngày vào làm + k tháng (lùi về cuối tháng nếu tháng ngắn). `months` = số tháng tròn tới `upTo`.
- `total = leave.accrual.start (0) + months × leave.accrual.perMonth (1) + seniority + birthdays × leave.accrual.birthday (1) + leaveAdjust`.
- `years = floor(months ÷ 12)`; `seniority = floor(years ÷ leave.seniority.stepYears (5))` (mỗi bậc +1 ngày, số 1 viết trong mã); tròn một năm không cộng riêng; sinh nhật chỉ `nv`, ngày sinh trong năm (sinh nhật cuối tháng 2 của năm nhuận lùi về ngày cuối tháng 2 ở năm thường) nằm trong [ngày vào làm, upTo].

**Sổ và hết hạn** (`ledger`, `counted`, `firstYearOf` trong `src/engine/leave.ts`): mỗi năm dương lịch N là một quỹ phép riêng; dùng quỹ cũ trước. Khi `leave.expiry.month` ≥ 1:

- Năm đầu tiên được quản lý `first = max(năm vào làm, leave.expiry.fromYear)`. Phép cộng ở các năm trước `first` không tính vào quỹ nào: `counted(upTo) = accrued(upTo) − accrued(cuối năm first−1)` từng thành phần (ngày vào làm thật vẫn dùng để đếm tháng tròn, thâm niên, năm Nhân viên, sinh nhật); ngày phép dùng trước đầu năm `first` không tính. `leaveAdjust` là số mở đầu của quỹ `first` (dương hay âm), cộng đúng một lần vào `counted.total`.
- Với mỗi năm y từ `first` mà cuối năm y < `upTo`: hạn = ngày cuối tháng `expiry.month` năm y+1; `pool = counted(cuối năm y).total − expired` (đã gồm `leaveAdjust` ở năm `first`); nếu hạn < upTo: `days = max(0, pool − đã dùng tới hạn)` vào `settled`, cộng `expired`; ngược lại nếu còn > 0 → `expiring { days, on }`.
- `balance = counted.total − used − expired`: chỉ gồm các quỹ đang mở.
- `leave.expiry.month = 0`: không hết hạn, `counted = accrued` (đếm từ ngày vào làm).

**Quy tiền phép dư**: phép chưa dùng của một năm được quy tiền vào phiếu của tháng liền sau tháng hết hạn của năm đó. `settlementFor(month)` = tổng `settled` có tháng liền sau hạn bằng `month`. `payroll-service.loadInputs` chỉ đọc lịch nghỉ của mọi người khi `tháng = (leave.expiry.month mod 12) + 1` (`leaveSettlements`, `payroll-service.ts`), đưa vào `leaveSettleDays` của người có quyền lợi `leaveAccount` và ngày vào làm hợp lệ; bộ máy trả dòng quyết toán phép cho số ngày đó (`calcMonth`, `extra.settleDays`). Quỹ của năm nào chỉ quy tiền một lần ở tháng đó; phép cộng trước năm `first` không có tiền quy đổi.

**Ngày đã dùng** (`leaveDates`, `src/domain/leave-days.ts`): mọi ngày `kind:'leave'` ở mọi tháng, **gồm ngày chờ duyệt** (giữ chỗ), bỏ ngày có dòng `leave` bị `rejected` (với tháng đang lưu: chỉ khi ngày khai y nguyên cùng vân tay), bỏ ngày lễ nằm trong lịch làm việc.

**Kiểm khi lưu lịch** (`timesheet/timesheet-validator.ts`): không kiểm số dư phép, khai ngày phép vượt số dư vẫn lưu (chờ duyệt, số dư âm). Ngày `unpaid` mới vào T2–T6 trong lịch mà còn ≥ 1 ngày phép → `SHEET_UNPAID_WITH_LEAVE`. Chức vụ không `absenceDeclarable` không khai `leave` hoặc `unpaid` trong lịch → `BENEFIT_NOT_ALLOWED`. Bộ máy không xét số dư: phép vượt mà được duyệt vẫn có lương.

**Sổ lưu sẵn** (`LeaveAccountService.refresh`, `leave-account-service.ts`): chỉ người có `uuid`, `payrollSubject`, `startDate`, quyền lợi `leaveAccount` (không thì xoá số dư lưu). `upTo` = ngày nghỉ việc nếu đã qua, ngược lại ngày hiện tại. Sự kiện = `accrualEvents` (cùng quy tắc với `counted`: chỉ các lần cộng sau cuối năm `first − 1`, không gồm điều chỉnh tay) + `expire` (âm, mỗi quỹ đã hết hạn còn ngày). Số dư lưu = `ledger.balance`. `ledger.sync` thêm/sửa/xoá để sổ khớp; `saveBalance` chỉ ghi khi khác. Chạy lúc khởi động (`setImmediate`) và mỗi `config.LEAVE_REFRESH_MS` (3.600.000 ms), và mỗi lần `GET /leave/ledger`. Lỗi một người: ghi console một lần, bỏ qua.

### 4.9 Tạm ứng

**Số theo quy tắc** (`advance-cap.ts:figureFor`): chạy `service.computeFor(month, staff, inputs, params, { upTo: undefined })` (tới ngày hiện tại) và lấy `max(0, round(m.trace.tamUngToiDa))`.

- `tamUngToiDa` = công thức `formula.tamUng`: `nếu batTamUng thì roundDong(advance.rate × tienUng) ngược lại 0`.
- `batTamUng = staff.advanceOn !== false && advance.eligibleTypes.<loại> !== false` (`payroll-engine.ts`, `pay-options-calc.ts`).
- `tienUng = advance.basis === 'fixedPctByLevel' ? lương cơ bản của bậc : advanceBase`; `advanceBase` = Σ `advancePayOfDay` của các dòng ngày có ngày trong tháng ≤ `advance.untilDay` (`tienUngCong` `payroll-engine.ts`, cộng ở; bản builtin `tienUng`): ngày `work` = `daily − cut`; ngày lễ có đi làm thật (`hours > 0`) = `holBase`; mọi dòng khác 0, kể cả OT ngày lễ. Ngày đi làm là ngày còn lại sau khi áp chấm công thực tế.
- Mặc định: `advance.rate` 0.8, `advance.untilDay` 15, `advance.basis` 'byWorkedDays', `advance.eligibleTypes.{ctv,nv,tts}` true.

**Điều kiện** (theo thứ tự): không `payrollSubject` → không được ứng; `advanceOn === false`; chức vụ không được ứng; chưa có trong đầu vào tháng (chưa làm) → `eligible: true, amount 0`; lỗi hồ sơ `PAYROLL_BAD_TYPE|LEVEL|FORMULA` → `eligible: true, amount 0` kèm lý do.

**Chưa cuối cùng** (`provisional`): `vnToday() <= "<tháng>-<untilDay 2 chữ số>"` (đúng ngày `untilDay` vẫn chưa cuối cùng).

**Xin**: chỉ tạo được vào ngày 16 và 17 hằng tháng (giờ Việt Nam, theo `vnToday()`; `ADVANCE_REQUEST_DAYS` ở `src/domain/overtime/hour-limits.ts`), ngoài hai ngày đó 409 `ADVANCE_WINDOW_CLOSED`; `month` phải là tháng của hôm nay (yêu cầu tạo ngày 16 hoặc 17 của tháng M là tạm ứng của tháng M), khác thì 409 `ADVANCE_MONTH_NOT_CURRENT` (Admin cũng vậy; duyệt, từ chối, huỷ duyệt, rút không bị giới hạn theo ngày); `GET /api/advance-approvals` trả thêm `window: { days: [16, 17], open }`. Sau đó phải `eligible`; số = 0 và `provisional` false → 409 `ADVANCE_ZERO`. **Duyệt**: phải `eligible`. **Duyệt tất cả** (`src/modules/advance/advance-approvals.handlers.ts`): chỉ người đang `pending`; bỏ qua (`skipped`) khi không eligible, số đã chốt (không còn `provisional`) bằng 0, không có quyền với người đó, hoặc là chính người duyệt (bỏ qua). Không có ai được duyệt thì không ghi, rev tháng giữ nguyên.

**Rev**: rev của người kiểm ở xin/rút/duyệt/từ chối/huỷ (`ADVANCE_REQUEST_STALE`); rev của tháng kiểm ở duyệt tất cả (`ADVANCE_REQUESTS_STALE`). `expectedRev` vắng thì không kiểm. Mỗi lần ghi tăng rev tháng; mỗi bước tăng rev người.

**Vào phiếu**: `payroll-service.loadInputs` đặt `advance: true` cho người trong `approvedSet(month)`; bộ máy trừ `advance = approved ? F.tamUng : 0` (hàm `netFrame` bắt đầu ở `payroll-engine.ts`, dòng trừ tạm ứng ở). Số trừ là số tính lúc chạy lương (cả tháng, `upTo` null), không phải số hiển thị lúc duyệt. Duyệt/huỷ duyệt đổi `inputs_digest` nên lần tính cũ thành lỗi thời.

**Ứng lương dạng cũ**: `granted` không trừ vào phiếu (không nơi nào đưa `grantedByUser` vào bộ máy); chỉ dùng cho `capOf.remaining`.

### 4.10 OT và OT ngày lễ

Hai luồng khác nhau:

1. **OT trên Lịch ước tính** (khoản `ot`, 4.1): nguồn tiền. Kiểm khi lưu: tổng OT thô trong tháng cộng giờ ca chính làm ngày lễ > `MONTH_OT_CAP` (40) và tăng so với lịch đang lưu → 400 `OT_MONTH_CAP` (`overtime/hour-limits.ts`); quyền lợi `ot` → `BENEFIT_NOT_ALLOWED`; đoạn làm thêm rơi 22h–6h → `SHEET_EXTRA_NIGHT`; đoạn làm thêm ghi nhầm phía ca → 400 `EXTRA_WRONG_SIDE`; giờ ròng một ngày (giờ ca + OT + làm thêm + làm bù, trừ giờ nghỉ giữa ca) > `DAY_HOURS_CAP` (12) → 400 `DAY_HOURS_CAP` (`limits.checkDayHours`); cả hai là lỗi chặn. Bộ máy không cắt theo các trần.
2. **OT khai ở Check-in/out** (`POST/PUT /ot`): chỉ để theo dõi, không tự cộng tiền (`ot.ts`; nguồn đoạn làm thêm của giờ thực tế là Lịch ước tính — `attendance.extraSourceRule` = calendar — và `otReview` của lượt bị bỏ khi dựng ngày tính tiền). `validateOtDeclaration`: lượt phải `closed` (409), có `plannedShift` (400), không đang khai làm bù (409), giờ HH:MM, ít nhất một đoạn, có giờ có mặt hợp lệ; các kiểm `BENEFIT_NOT_ALLOWED`, `OT_NEEDS_CONFIRMED_SHIFT`, `OT_OUTSIDE_PRESENCE`, `OT_NIGHT` (đoạn OT chồng 22h–6h) là cảnh báo (`warnIf`); sau đó hai trần cứng `DAY_HOURS_CAP` (giờ ròng ngày, cộng OT của các lượt khác cùng ngày) và `OT_MONTH_CAP` (so với Lịch ước tính) chặn 400.

**Điều kiện để OT trên lịch ra tiền**: khoản đã `approved` (chưa duyệt / bị từ chối: `strip`, mục 4.2); chức vụ có `benefit.ot`; có chấm công: `ActualHours` chỉ giữ phần đoạn đã khai nằm trong khoảng có mặt liền với ca (`clipExtra`, `actual-hours.ts`), số giờ không vượt số giờ đã khai; ngày ngoài lịch làm việc của người chỉ trả đoạn làm thêm (`extraOnly`: không ngày công, không giờ thiếu, không lương ngày, không phụ cấp ca); khai OT ngoài lịch mà không có chấm công nào thì không tính tiền và không là vắng.

**Hệ số OT** (`calcDay`, `payroll-engine.ts`; lương giờ = lương cơ bản của bậc ÷ ngày công chuẩn ÷ `time.workHoursPerDay`; hệ số đọc theo chức vụ qua `entitlementOf`, giá trị trong ngoặc là mặc định registry). Giờ OT được tách theo ngày dân sự của từng phút (`splitExtraWork`, `payroll-calendar.ts`); OT không trừ giờ nghỉ:

| Phút OT rơi vào | Tiền | Ghi chú |
| --- | --- | --- |
| Ngày có lịch làm việc của người (kể cả thứ Bảy nằm trong lịch) | giờ × lương giờ × `ot.rate` (1.5) | Chỉ khi trước ngày đó không còn giờ cần bù (`ot.afterMakeup` = `block`,); `independent` thì không bao giờ giữ. Giờ bị giữ ghi vào `otHold` / `otHoldHours`. |
| Thứ Bảy hoặc Chủ nhật không nằm trong lịch của người (`WorkSchedule.isRestDay`) | giờ × lương giờ × `ot.weekendRate` (2) | Cùng điều kiện giữ như trên. Ngày hôm đó thuộc ngày lễ thì tính theo hàng ngày lễ. |
| Ngày lễ (`holidays`) | giờ × lương giờ × `ot.holidayRate` (3) | Không bị giữ bởi giờ cần bù. Giờ trong khung đêm cộng thêm giờ × lương giờ × `night.otAddRate` × `ot.holidayRate` (0.2 × 3). |

Chức vụ không có `benefit.ot` không có OT nào, kể cả ngày lễ (`extraSplit` bỏ ngày lễ cho họ).

**OT ngày lễ** (khoản `ot` mang vân tay `holiday_work|…`, khung giờ từ – đến của ngày lễ):

- Tiền trả cho phần khung đã duyệt ∩ giờ có mặt liền mạch (`holidayWindow` `actual-hours.ts`), phần nằm trong ngày lễ theo hệ số lễ; phút sang ngày thường kề bên tính như OT thường (hệ số theo bảng trên); không cần duyệt OT riêng và không bị chặn bởi giờ cần bù.
- Giờ ca chính rơi vào ngày lễ không còn trong lương ngày: dòng ngày trừ `(holMainH − holMainBreakH) × lương giờ` và trả `holWorkPay`; giờ nghỉ của ca rơi vào ngày lễ được trả như giờ làm (ngày lễ không có giờ nghỉ), nên phần nghỉ đêm có lương không trả lần hai (`calcDay`). Ca đêm sang ngày lễ được tách theo ngày dân sự: phần trước nửa đêm tính ngày thường, phần sau tính ngày lễ; phụ cấp ca chỉ cộng một lần.
- Lương ngày lễ (`holBase` = lương ngày) trả khi chức vụ có `benefit.paidHoliday`, trong thời gian làm việc, và ngày không bị đánh dấu vắng. Ngày lễ khai đi làm (có in/out) mà hết ca không có Check-in/out nào là vắng (`noshow`, `attendance.missingAllRule` = absent): mất lương lễ, tính như nghỉ không lương.
- Chức vụ không có `benefit.ot`: không có khoản OT ngày lễ, ngày lễ chỉ có lương lễ (nếu chức vụ có).
- Quy tắc kiểm khi lưu: OT ngày lễ được khai và được trả; làm bù vào ngày lễ bị chặn (mục 4.11); đoạn OT tràn sang ngày thường kề bên chỉ báo `SHEET_EXTRA_ON_HOLIDAY`.

### 4.11 Làm bù

- Không có loại ngày làm bù cả ngày. Ngày `kind: 'makeup'` mới hoặc đã đổi → 400 `SHEET_MAKEUP_DAY_REMOVED` ("Không còn loại ngày Làm bù cả ngày. Giờ làm bù khai ở ngày đi làm, trước hoặc sau ca."), cả khi Admin khai thay. Ngày `makeup` đã lưu gửi lại không đổi: không chặn, cảnh báo `SHEET_MAKEUP_DAY_LEGACY`; bộ máy tính ngày đó 0 đồng, không ngày công, không giờ làm bù. Vai trò tuỳ chỉnh: `makeup_day` không có trong `APPROVAL_ITEMS` (`src/domain/roles/roles.ts`); quyền `makeup_day` đã lưu bị bỏ qua khi đọc (`RETIRED_ITEMS`,).
- `makeup_hours`: đoạn trước/sau ca có `extraKind:'makeup'` trên ngày đi làm; chức vụ không có `benefit.makeupHours` → `BENEFIT_NOT_ALLOWED` (`checkRequestFlags`, `positions.ts`).
- `willmakeup`: ngày nghỉ, kế hoạch làm bù `makeupPlans[{date,from,to}]` (tối đa 31 dòng, ô sai dạng thành rỗng, chỉ để Admin xem khi duyệt, không chặn gì). Đã duyệt: 0 đồng, không ngày công, cộng một công (`time.workHoursPerDay` giờ) vào giờ cần bù của tháng.
- Làm bù vào ngày lễ (giờ làm bù, hay ngày dự kiến của `willmakeup`) → 400 `SHEET_MAKEUP_ON_HOLIDAY` (`timesheet/timesheet-validator.ts`); ngày đã lưu không đổi thì giữ.
- **Tiền**: giờ làm bù được trả đủ = giờ × lương giờ × 1, không cắt theo giờ cần bù (`makeupPay`, `payroll-engine.ts`); đoạn làm bù trừ giờ nghỉ rơi trong đoạn (OT không trừ). Ngày có lịch ca và giờ làm bù vẫn giữ phụ cấp ca cùng giờ nghỉ đêm có lương (Off Paid) của ca chính; giờ làm bù chỉ nhận lương giờ cơ bản, không có phụ cấp ca hay Off Paid riêng. Ngày chỉ có đoạn ngoài lịch (`extraOnly`) không có hai khoản này; ngày có OT được trả vẫn giữ phụ cấp ca và giờ nghỉ đêm có lương.
- **Sổ giờ bù tháng** (`calcMonth`,): `need` = giờ thiếu của ngày đi làm + một công cho mỗi ngày `willmakeup` đã duyệt; `made` = giờ làm bù đã duyệt và có chấm công; `debt = max(0, need − made)` (giờ còn thiếu); `makeupCredit = max(0, made − need)` (phần làm bù nhiều hơn giờ thiếu, đã trả trong `makeupPay`). Số dư luỹ kế theo ngày chỉ dùng để giữ OT ngày thường (4.10) và báo giờ còn thiếu.

### 4.12 Nghỉ phép, nghỉ không lương, nghỉ được duyệt, iSAT

Bộ máy với khoản **đã duyệt** (`calcDay`, `payroll-engine.ts`):

| Loại ngày | Lương | Ghi chú |
| --- | --- | --- |
| `leave` | lương ngày nếu chức vụ có `benefit.paidLeave`, ngược lại 0 | Có lương thì là ngày có lương cho bảo hiểm. |
| `unpaid` | 0 | |
| `approved` ("Nghỉ được duyệt") | 0 | Tính là ngày nghỉ khi xét chuyên cần theo `request.type.approved.countsAbsent`. Chức vụ không có `benefit.approvedLeave` → `BENEFIT_NOT_ALLOWED`. |
| `isat` | lương ngày khi chức vụ có `benefit.isat` **và** ngày đúng thứ `isat.weekday` (mặc định 6, thứ Bảy), ngược lại 0 | Không phụ cấp. Bộ đếm `r.isat` (`payroll-engine.ts`) và ngày có lương chỉ tính ngày iSAT được trả; riêng vắng xét chuyên cần đếm mọi dòng iSAT (bên dưới). |
| `willmakeup` | 0 | Cộng một công vào giờ cần bù (4.11). |
| `makeup` (loại cũ) | 0 | Không ngày công, không giờ làm bù. |

**iSAT**: chỉ vào thứ Bảy (`isat.weekday`) và chỉ chức vụ có `benefit.isat` (mặc định chỉ nhóm NV). Kiểm bằng `isatRefusal` (`isat-rule.ts`) ở ba nơi, luôn chặn, kể cả khi Admin khai thay: lưu lịch với ngày iSAT mới (`BENEFIT_NOT_ALLOWED` hoặc `SHEET_ISAT_WEEKDAY`), duyệt khoản iSAT, và danh sách kiểm kỳ đếm iSAT đã lưu vi phạm. `isat.monthlyLimit` (mặc định null) → cảnh báo `SHEET_ISAT_LIMIT`; bộ máy không cắt theo giới hạn này. Chưa duyệt hoặc bị từ chối: `unpaid`, vẫn tính ngày nghỉ.

**Ngày vắng xét chuyên cần / KPI** (`finishMonth`, `payroll-engine.ts`):

`absent = leave + unpaid + approvedCounted − unpaidExempt + noshow + isat + willmakeupCounted`

- `approvedCounted` = số ngày `approved` nếu `request.type.approved.countsAbsent`, ngược lại 0.
- `unpaidExempt` = số ngày nghỉ không lương do khoản chưa duyệt đổi thành khi `countsAbsent` của khoản đó là false.
- `isat` = số dòng iSAT trong tháng (mỗi dòng một ngày, đủ hạn mức hay không đều tính).
- `willmakeupCounted = min(số ngày willmakeup, ceil(debt ÷ time.workHoursPerDay))`: giờ bù đã đủ thì các ngày đó không tính; giờ thiếu còn lại (kể cả giờ thiếu của ngày đi làm trễ) xếp vào ngày `willmakeup` trước.
- `overHours` (giờ vượt ngưỡng) = `(unpaid + approvedCounted − unpaidExempt + noshow) × giờ mỗi công + debt + leave × giờ mỗi công` (`gioVuotNguong`,).

Giữ phụ cấp chuyên cần (`giuChuyenCan`,, chỉ loại có phụ cấp đi lại / chuyên cần / KPI): giữ khi `absent` so với `type.<mã>.maxAbsent` (mặc định NV = 3) **và** `overHours` so với ngưỡng giờ **không** thuộc phép so sánh ngược của `attendance.absentCompare` / `attendance.overLimitCompare` (mặc định đều `gte`, tức giữ khi `absent < maxAbsent` và `overHours < ngưỡng`). Ngưỡng giờ = `type.<mã>.overLimitHours` nếu khác null, không thì `attendance.overLimitHours` (24), cộng `attendance.overLimitTolerance` (0). Phụ cấp đi lại tính theo tỉ lệ ngày đi làm thực tế (`tyLeNgayDiLam` = ngày đi làm ÷ ngày công chuẩn), không tính ngày nghỉ hay ngày làm bù.

**Bảo hiểm theo ngày có lương** (`baoHiemOf`,): ngày có lương = ngày đi làm + phép năm có lương + nghỉ lễ hưởng lương + iSAT được trả (`isPaidDay`,; nghỉ không lương, nghỉ được duyệt, vắng, chờ xử lý, ngày chỉ có giờ làm thêm không tính). Ngày không lương = ngày công chuẩn của người trừ ngày có lương (không âm). Từ `tax.insurance.skipDays` (14) ngày trở lên (so theo `tax.insurance.skipCompare`, mặc định `gte`) thì tháng đó không đóng bảo hiểm. Tính tới ngày tính: giữa tháng khi chưa đủ ngày có lương thì số ngày không lương còn lớn nên chưa trừ.

### 4.13 Chặn Check-in (`checkInDay`, `src/modules/**/*.controller.ts`; cổng giờ bấm: attendance.md 3.2b)

`POST /punch` (Check-in) trả 409 `CHECKIN_NOT_ALLOWED` khi ngày công của lượt (ca đêm thuộc ngày bắt đầu ca):

1. Dòng duyệt của ngày đó (mỗi ngày một dòng) là `approved` mục `ot` hoặc `makeup_hours` (kể cả OT ngày lễ; khoản Admin khai thay được duyệt ngay) → cho phép. Nhánh này và nhánh nghỉ cả ngày ở bước 2 loại trừ nhau vì một ngày chỉ có một khoản.
2. Ngày đã khai nghỉ cả ngày thì đóng: `isat`, `leave`, `unpaid` (chờ duyệt hay đã duyệt, trừ khoản `rejected`); `approved` và `willmakeup` chỉ khi đã duyệt. Câu báo ghép từ chữ "bạn", loại nghỉ (nghỉ iSAT | nghỉ phép năm | nghỉ không lương | nghỉ được duyệt | nghỉ, sẽ làm bù) và cụm "không Check-in được" (`OFF_DAY_TEXT`, `src/modules/attendance/attendance.controller.ts`).
3. Còn lại: cho phép khi ngày không phải ngày lễ và là ngày làm việc trong lịch được gán (lịch theo loại nhân sự); ngược lại báo không có lịch hay giờ OT/làm bù được duyệt.

Nhân viên chỉ Check-in được trên ngày có lịch hoặc ngày có OT / làm bù theo giờ đã duyệt. Ngày tự khai "Đi làm" không mở Check-in, khai mà không chấm công thì sau khi ca kết thúc là vắng (4.10, `attendance.missingAllRule`). Nhân viên vẫn tạo yêu cầu (nghỉ, OT, làm bù, OT ngày lễ, nghỉ sẽ làm bù) qua `PUT /sheet`; không có ngày tuỳ chọn trong lịch: ngày ngoài lịch (`SHEET_OFF_SCHEDULE`) chỉ nên khai nghỉ không lương, các khoản làm thêm gửi bằng yêu cầu.

### 4.15 Giải trình

- Check-out muộn: `lateCheckoutMin` = phút từ `allowedUntil` tới giờ bấm; `allowedUntil = plannedShift.endIso + phút làm thêm sau ca (lớn hơn của lượt và của ngày khai trong lịch)`. Không có ca theo lịch → 0. Muộn > `config.CHECKOUT_GRACE_MIN` (30) → phải giải trình (`late-checkout.ts`).
- `record`: chưa có giải trình và không gửi kèm → 409 `CHECKOUT_NEEDS_EXPLANATION`. Lượt lưu thành `kind:'pending', reason:'forgot-out', requestedOut` (bỏ `presOut`), thêm dòng `punches` bằng chứng; nếu giải trình đã duyệt thì `sync` áp giờ ngay.
- `sync` (trong giao dịch duyệt giải trình): `approved` và lượt chưa có `presOut` → dựng lại lượt như Check-out tại `requestedOut` (chồng lượt → 409 `SESSION_OVERLAP`); không `approved` mà `presOut === requestedOut` → về "Quên Check-out". Lượt `src:'admin'` hoặc không có `requestedOut` → không đổi.
- **Giữ lương**: `heldByUser(month)` = mọi giải trình `status != 'approved'` (gồm `requested`, `answered`, `rejected`) trong tháng; một ngày nhiều giải trình lấy trạng thái bị từ chối trước, rồi đã trả lời, rồi chờ trả lời. `payroll-service` bỏ các ngày đã có lượt Admin ghi nhận khi giải trình chưa có kết quả duyệt (giờ Admin ghi thắng); giải trình bị từ chối giữ ngày dù có lượt Admin. Các ngày còn lại thành `explanationHold` (và `explanationRejected`) → bộ máy đổi ngày đó thành `{ kind:'unpaid', punchIn, punchOut, held }` kể cả có Check-in/out: không tính công, đếm như nghỉ không lương. Dòng ngày giữ lại mang giờ bấm thật và nhãn `held`: "Bị từ chối" hoặc "Chờ xử lý".
- **Giải trình ngày được duyệt** (`AdminPresence.syncExplanation`, `admin-presence.ts`): ngày thiếu giờ vào hoặc ra (quên chấm) → ghi MỘT lượt Admin có giờ vào = giờ bắt đầu ca, giờ ra = giờ kết thúc ca (ca Admin chọn cho ngày nếu có, không thì ca được gán), mang `explanationId`: ngày tính một công với giờ ca như Admin ghi nhận. Không ghi được (ngoài lịch, chưa gán ca, ngày lễ không khai giờ, ngày đã khai nghỉ, chồng giờ) → cảnh báo `EXPLANATION_NOT_RECORDED`. Ngày chỉ trễ / về sớm (đã có đủ giờ vào ra): duyệt chỉ hết giữ lương, `ActualHours` vẫn cắt giờ theo bậc làm tròn hiện hành. Không duyệt (hoặc đổi từ duyệt sang từ chối): xoá lượt mang `explanationId`, ngày không tính công. Ghi hoặc xoá lượt đòi kỳ còn mở chấm công.
- Nhãn lượt chấm công (`SessionStatus.classify`, `session-status.ts`): `Đã Check-in` (lượt mở hợp lệ), `Đã Check-out` (lượt đóng hợp lệ), `Chờ xử lý` (giờ vào/ra chưa hợp lệ chưa có kết quả, hoặc giải trình đang chờ), `Được phê duyệt`, `Bị từ chối` (kết quả mới nhất của giải trình / yêu cầu điều chỉnh), `Đã chấm công` (lượt do Admin ghi). Lý do giờ: vào trễ khi phút trễ > `attendance.graceMin`; về sớm khi có bất kỳ phút nào trước giờ kết thúc ca; Check-out muộn khi > `CHECKOUT_GRACE_MIN` phút. Bấm Check-out sớm hiện hộp xác nhận ("Vẫn Check-out" / "Tiếp tục làm") ở giao diện nhân viên; Check-out xong lượt có lý do về sớm là `Chờ xử lý` cho tới khi có giải trình được duyệt.
- Văn bản: bắt buộc (trừ ghi chú duyệt), ≤ `TEXT_MAX` 500 ký tự; `ruleId` cắt 80 ký tự; danh sách tối đa 500, mặc định 200.

### 4.16 KPI

- Điểm: số 0..100, tối đa 2 chữ số thập phân (`checkScore`), lưu × 100. `null` = xoá điểm.
- `evaluate(parts, { pass: type.<loại>.kpiPass (75) })`: thiếu điểm → `incomplete`; `wework × 100 < kpi.weworkMin (75) × 100` → `wework`; `units = Σ điểm×100×trọng số`; `units < pass × 10000` → `below-pass`; ngược lại `ok`. Trọng số `kpi.weight.{wework 40, user 24, peer 18, manager 12, self 6}`. Tiền = `amt × units ÷ 1.000.000 × hệ số` (bộ máy, mức KPI kẹp ở trần bậc).
- `PUT /kpi/scores`: người không có `kpi.score.write` phạm vi all chỉ được gửi đúng `scores: { self }` của chính mình, không `amt` (403 `KPI_SELF_ONLY`). Tự đánh giá của chính mình không qua kiểm tự duyệt; còn lại `selfDecision`. `amt` > trần → `KPI_OVER_CAP` (cảnh báo: lưu nhưng chỉ trả tới trần). Tháng tương lai → `KPI_MONTH_FUTURE`. Mọi giá trị kiểm xong mới ghi; mỗi giá trị đổi một dòng `kpi_score_log`; `amt` ghi `timesheets.kpi_adm_amt`.
- `kpiPartsView`: chỉ lộ đủ 5 điểm khi `complete`; người được chấm luôn thấy điểm `self` của mình (khi tháng tính theo 5 thành phần); không phải admin và tháng `legacy` → `{ complete:false }`.
- `PUT /sheet` nhận `kpiPct` (kẹp 0..100) và `kpiAmt` (`cleanKpiAmt`) của chính người khai; khai thay giữ số đang lưu.

### 4.17 Tự duyệt việc của chính mình

`isSelfDecision(me, u)` = `me.payrollSubject && u === me.username` (`authz.ts`). Tài khoản Admin không thuộc bảng lương không bao giờ "tự".

| Việc | Mã | Hành vi |
| --- | --- | --- |
| Duyệt khoản tự khai | `APPROVAL_SELF` (so `row.username === by`, không xét `payrollSubject`) | cảnh báo |
| Duyệt / từ chối / huỷ tạm ứng một người | `SELF_DECISION_FORBIDDEN` | cảnh báo |
| Duyệt tất cả tạm ứng | bỏ qua người đó (`skipped`) | bỏ qua |
| Duyệt giải trình | `SELF_DECISION_FORBIDDEN` | cảnh báo |
| Duyệt OT Check-in/out | `SELF_DECISION_FORBIDDEN` | cảnh báo |
| Nhập KPI (trừ tự đánh giá) | `SELF_DECISION_FORBIDDEN` | cảnh báo |

### 4.18 Quyền duyệt theo vai trò

`request.decide.<item>` cho từng loại; `request.decide.*` cấp mọi loại (`authz.ts`). Mặc định: `admin`, `cb`, `manager` có `request.decide.*`; `hr` chỉ `request.decide.leave`. Phạm vi vai trò: `admin`, `cb`, `hr` là `all`; `manager` là `team`, hiện chỉ là chính mình (`can`, `authz.ts`). Vai trò tuỳ chỉnh chỉ nhận `request.decide.<item>` với item ∈ `ApprovalView.ITEMS` (`authz.ts, 121-127`). Tạm ứng cần `request.decide.advance`; giải trình và OT Check-in/out cần `attendance.correct`; KPI cần `kpi.score.write`.

### 4.19 Khoá kỳ theo việc

| Việc | Cổng | Hành vi |
| --- | --- | --- |
| Lưu lịch, duyệt khoản, đổi lễ, OT Check-in/out | `attendance` (từ `attendance_locked`) | lưu + cảnh báo |
| KPI | `kpi` (từ `approved`) | lưu + cảnh báo |
| Tạm ứng (xin, rút, duyệt, từ chối, huỷ) | tự kiểm `approved`/`paid` | **409** |
| Huỷ ứng lương dạng cũ | `slip` (từ `approved`) | lưu + cảnh báo |
| Giải trình | không | — |
| Khoá chấm công khi còn khoản chờ duyệt | mục `PENDING_APPROVALS` mức `block` của danh sách kiểm kỳ (`src/domain/period/periods.ts`); mục `EXPLANATION_PENDING` mức `warn` đếm ngày giữ lương do giải trình chưa có kết quả duyệt; mục `ABSENT_NO_EXPLANATION` mức `warn` đếm ngày trong lịch không có lượt nào và chưa có giải trình | thành cảnh báo (`soften`); vẫn khoá được |

### 4.20 Cảnh báo và chặn ở lịch ước tính và duyệt

**Luôn chặn**

| Mã / điều kiện | Nơi |
| --- | --- |
| Quyền (`FORBIDDEN_CAP`), định dạng, không tồn tại, tài khoản ngoài bảng lương | route, `cleanDays` |
| `SHEET_STALE` (rev lịch lệch) | `assertSheetRev` |
| `APPROVAL_STALE`, `APPROVAL_NOT_FOUND`, `APPROVAL_NOOP` | `decide` |
| `OT_MONTH_CAP` (tháng > `MONTH_OT_CAP`, chỉ khi tổng tăng), `DAY_HOURS_CAP` (ngày vừa đổi > `DAY_HOURS_CAP`) | `overtime/hour-limits.ts` |
| `SHEET_MAKEUP_ON_HOLIDAY`, `SHEET_MAKEUP_DAY_REMOVED` | `checkSheet` |
| `EXTRA_WRONG_SIDE`, giờ làm thêm thiếu hoặc trùng giờ ca | `checkExtraTimes` |
| iSAT sai thứ (`SHEET_ISAT_WEEKDAY`) hoặc sai quyền lợi (`BENEFIT_NOT_ALLOWED`) khi lưu ngày iSAT mới và khi duyệt | `isatRefusal` |
| `CHECKIN_NOT_ALLOWED`, `CHECKIN_OUTSIDE_SHIFT`, `CHECKOUT_NEEDS_EXPLANATION` | `POST /punch` |
| `PERIOD_LOCKED` của tạm ứng | `src/modules/advance/advance-approvals.handlers.ts` |
| Tạm ứng: `ADVANCE_NOT_ELIGIBLE`, `ADVANCE_ZERO`, các 409 sai trạng thái / sai rev | `src/modules/advance/advance-approvals.handlers.ts` |

**`warnIf`: lưu và cảnh báo**

`SHEET_SUNDAY` (ngày Chủ nhật), `SHEET_OFF_SCHEDULE` (ngày ngoài lịch không phải nghỉ không lương), `SHEET_DAYS_OVERLAP` (chồng giờ sang ngày kề), `SHEET_SHIFT_MISMATCH` (nhân sự khai giờ khác ca được gán, trừ ngày lễ), `SHEET_ADMIN_SHIFT_REQUIRED`, `SHEET_EXTRA_NIGHT`, `SHEET_ISAT_LIMIT`, `SHEET_UNPAID_WITH_LEAVE`, `BENEFIT_NOT_ALLOWED` (OT, OT ngày lễ, làm bù theo giờ, nghỉ được duyệt, khai nghỉ), `HOLIDAY_LEAVE_CONFLICT`, `HOLIDAY_OT_CONFLICT`, `APPROVAL_SELF`, `SELF_DECISION_FORBIDDEN`, `KPI_MONTH_FUTURE`, `KPI_OVER_CAP`, `PERIOD_LOCKED` (kỳ khoá, trừ tạm ứng), các mã `OT_*` ở `POST /ot`. Lý do từ chối và lý do của các thao tác Admin không bắt buộc, không có cảnh báo thay.

**Chỉ cảnh báo, không có điều kiện chặn**: `SHEET_MAKEUP_DAY_LEGACY`, `SHEET_EXTRA_ON_HOLIDAY`, `PERIOD_FROZEN`, `EXPLANATION_NOT_RECORDED`.

Hệ quả tiền của các cảnh báo (đối chiếu bộ máy): ngày ngoài lịch hay Chủ nhật: ca chính 0 đồng, chỉ đoạn OT đã duyệt có chấm công được trả; trần OT không do bộ máy cắt; phép vượt số dư mà được duyệt vẫn có lương; chức vụ thiếu quyền lợi OT thì OT 0 đồng dù được duyệt.

---

## 5. Realtime và nhật ký

### 5.1 Sự kiện SSE (`src/platform/events.ts`, phát sau COMMIT)

| Tên | Payload | Người nhận | Phát ở |
| --- | --- | --- | --- |
| `approvals.changed` | `{ month, pending }` (`pending` = mọi dòng `sheet_approvals` đang chờ) | có `request.decide.*` phạm vi all | PUT /sheet và PUT /sheet/bulk (khi có thay đổi dòng duyệt), PUT /approvals/decide (mỗi tháng), mọi bước tạm ứng, huỷ ứng lương cũ, mọi thao tác giải trình |
| `request.decided` | khoản tự khai: `{ month, date, decision }` (`approved`/`rejected`/`mixed`, ngày sớm nhất, một tin mỗi người) | chính người đó | PUT /approvals/decide, PUT /sheet và PUT /sheet/bulk khai thay có duyệt ngay |
| `request.decided` | tạm ứng: `{ month, decision, kind:'advance' }` (`approved`/`rejected`/`cancelled`, hoặc trạng thái dòng cũ) | chính người đó | duyệt/từ chối/huỷ tạm ứng; huỷ ứng lương cũ đã duyệt |
| `estimate.changed` | `{ month }` | chính người đó | PUT /sheet khai thay, PUT /sheet/bulk (mỗi người một tin); duyệt hoặc từ chối tạm ứng; huỷ ứng lương cũ đã duyệt; PUT /kpi/scores có đổi |
| `punch.changed` | `{ month, date }` | chính người đó | mọi thao tác giải trình; thao tác chấm công |
| `punch.corrected` | `{ month, date }` | chính người đó | PUT /ot |
| `attendance.changed` | `{ kind, month }` | `attendance.correct` all | POST /ot và PUT /ot (`kind:'ot'`); giải trình gắn lượt (`kind:'explanation'`) |
| `params.changed` | `{ configRev, fromMonth, kind:'holidays', by, groups }` | theo `publish` của params | PUT /holidays khi có ngày đổi |

Xin / rút tạm ứng chỉ phát `approvals.changed` (không `estimate.changed`).

### 5.2 Hành động nhật ký (`audit.write`)

| Action | entityKind / entityId | Ghi ở |
| --- | --- | --- |
| `approval.decide` | `sheet_approval` / `<user>:<date>`; after `{ status, rev }`, reason | PUT /approvals/decide (mỗi khoản) |
| `sheet.onBehalf` | `timesheet` / `<user>:<month>`; after `{ changedDays, autoApproved }` | PUT /sheet khai thay; PUT /sheet/bulk (mỗi người một dòng) |
| `sheet.onBehalfBulk` | `timesheet` / `<month>`; after `{ people, days, shifts }` | PUT /sheet/bulk (một dòng cho cả lô) |
| `holiday.set` | `setting` / `holidays`; before/after `{ dates, names? }` | PUT /holidays |
| `kpi.score` | `kpi` / `<user>:<month>`; after `{ changed }`; sensitivity `pay` | PUT /kpi/scores (khi có đổi) |
| `ot.declare` | `attendance_session` / id | POST /ot |
| `ot.decide` | `attendance_session` / id; after `{ status }` | PUT /ot |
| `advance.request`, `advance.withdraw`, `advance.approve`, `advance.reject`, `advance.cancel` | `advance_request` / `<month>/<user>`; before/after `{ status, rev }`; sensitivity `pay`; duyệt tất cả: reason "Duyệt tất cả" | tạm ứng |
| `advance.create`, `advance.decide`, `advance.cancel` | `advance_request` / `<id>`; các trường `username, month, amount, cap, status, granted` | ứng lương dạng cũ (create/decide chỉ còn trong mã) |
| `explanation.request`, `explanation.late-checkout`, `explanation.self`, `explanation.answer`, `explanation.decide` | `explanation` / id; trường `username, date, kind, status, decisionNote` | giải trình |
| `checkout.late.apply`, `checkout.late.revert` | `attendance_session` / id; before/after `{ presOut }`, `explanationId` | `LateCheckout.sync` |

Không có nhật ký: lưu lịch thường (PUT /sheet không khai thay), đồng bộ `reconcile`, làm mới sổ phép, các đợt tạo dòng duyệt (chỉ dấu ở settings).

---

## 6. Phụ thuộc

### 6.1 Ai gọi module này

- `src/modules/staff/staff.controller.ts`: route mục 3; `GET /team` gọi `sheetApprovals`; đổi loại nhân sự gọi `reconcileStaffType`; `checkInDay` gọi `sheetApprovals`.
- `src/domain/payroll/payroll-service.ts` → `store.approvals.forSheet`, `explanations.heldByUser`, `AdminPresence.declaredDates`, `advanceApprovals.approvedSet`, `leaveDates`, `LeaveRules.settlementFor`.
- `src/domain/period/periods.ts` → `store.approvals.list({status:'pending'})` cho `PENDING_APPROVALS`; `explanations.heldByUser` cho `EXPLANATION_PENDING`; `periods.estimate` cho `GET /me/estimate`.
- `src/platform/events.ts` → `store.approvals.list` (đếm chờ).
- `src/platform/authz.ts` → `ApprovalView.ITEMS` (`DECIDE_ITEMS`).
- `src/domain/leave-days.ts` → `store.approvals.list`, `declaredItems` (ngày phép bị từ chối).
- `src/domain/timesheet/` (nối ở `timesheet/services.ts`) → `leaveDates`, `rulesFor().leave`, `isatRefusal`.
- `POST /punch` → `explanations.needsExplanation`, `container.lateCheckout`, `checkInVerdict`.

### 6.2 Module này gọi

`src/platform/db.ts` (store, transaction, settings, periods, sessions, staff), `src/platform/warnings.ts`, `src/platform/authz.ts`, `src/platform/audit.ts`, `src/platform/events.ts`, `src/platform/request-rules.ts` → `src/params/store.ts`, `src/domain/schedule.ts` / `src/engine/work-schedule.ts`, `src/domain/sheet.ts` (`estimateSheet` → `payroll-service.estimateDays`), `src/domain/payroll/payroll-service.ts` + `src/engine/payroll-engine.ts` (số tạm ứng), `src/engine/pay-options-calc.ts`, `(đã bỏ)`, `src/domain/attendance*.js`, `src/domain/container.ts`.

### 6.3 Mô-đun dùng chung trình duyệt + máy chủ

`src/engine/approval-view.ts`, `src/engine/leave.ts`, `src/engine/kpi-score.ts`, `src/engine/work-schedule.ts`, `src/engine/actual-hours.ts`, `src/engine/payroll-params.ts` (DEFAULTS), `src/engine/payroll-engine.ts`, `src/engine/pay-options-calc.ts`, `src/engine/payroll-calendar.ts`, `src/engine/punch.ts`. Trình duyệt dùng bản trần (`create(DEFAULTS)`), máy chủ dùng `rulesFor(tháng)` (trừ `src/domain/approvals/approvals.ts` dùng bản trần, xem mục 8).

### 6.4 Đổi X thì phải kiểm tra Y

- Đổi `itemOf` / `holidayFingerprint` / `segmentsOf` (approval-view.ts) → mọi dòng `sheet_approvals` đã lưu có vân tay cũ thành `pending` ở lần lưu sau và trạng thái hiệu lực thành `pending` ngay (tiền mất cho tới khi duyệt lại); kiểm `effectiveStatus`, `reconcile`, `declaredItems`, các đợt tạo dòng, `itemFromRow`, `rejectedLeaveDates`, giao diện test approval-view*.
- Đổi `ITEMS` → `authz.DECIDE_ITEMS` (vai trò tuỳ chỉnh), `ALLOWED_ACTIONS`, `FALLBACK`, khoá registry `request.type.<khoản>.*`, `reconcile` (từ chối item lạ), `A.ITEM_LABEL` và `ITEM_LABEL` của logic.js, `approvalPolicy` của bộ máy, `APPROVAL_ITEMS` của `src/domain/roles/roles.ts`.
- Đổi `POLICY` / `pendingRule` / `countsAbsent` → `payView`, `approvalPolicy` (`payroll-engine.ts`), `calcMonth` (`absentExempt`, `unpaidExempt`), golden fixtures.
- Đổi chiếu ngày (`projectDay`, `estimateDays`, `ESTIMATE_FIELDS`, `DAY_FIELDS`) → vân tay tính ở reconcile và ở `sheetApprovals` phải cùng đầu vào; nếu lệch, khoản hiện "chờ duyệt" mãi.
- Đổi `reconcile` → PUT /sheet, `approveOnBehalf` (dùng `added/reset/resubmitted`), `reconcileMonthApprovals` (đổi lễ, đổi loại), `approvals.changed`.
- Đổi `decide` / mã lỗi → `APPROVAL_HTTP_STATUS` (`src/domain/approvals/index.ts`) (đọc `APPROVAL_STALE`, `items`), `approveOnBehalf`.
- Đổi danh sách lễ hoặc cách đọc lễ → `reconcileHolidayWork`, `isScheduledHoliday`, `leaveDates` (bỏ ngày lễ), `HOLIDAY_*_CONFLICT`, `holidayOtConflicts`, `checkInDay`, bộ máy (`holBase`, `holWork`, `splitMainWork`, `splitExtraWork`).
- Đổi `WorkSchedule` / `type.*.dows` → nhận diện OT ngày lễ, `leaveDates`, `SHEET_UNPAID_WITH_LEAVE`, `isRestDay` (hệ số OT cuối tuần), `checkInDay`; nhớ gọi `reconcileMonthApprovals` cho các tháng bị ảnh hưởng.
- Đổi `leaveDates` → số dư ở các nơi (mục 8), `HOLIDAY_LEAVE_CONFLICT`, sổ lưu sẵn, quy tiền phép hết hạn (`leaveSettlements`).
- Đổi `src/engine/leave.ts` `accrued` → phải đổi cùng `leave-events.ts` `accrualEvents` (cùng quy tắc, viết lại), test đối chiếu tổng.
- Đổi công thức `tamUng`, `tienUng`, `advance.*` → `advance-cap.figureFor` (đọc `m.trace.tamUngToiDa`), `netFrame` (`payroll-engine.ts`, dòng trừ tạm ứng), cả hai bản `tienUng` ( và), số hiện ở màn nhân viên/Admin, `ADVANCE_ZERO`, `provisional`.
- Đổi lưu trữ tạm ứng (`advance_approvals_<tháng>`) → `approvedSet` (bộ máy và AI soát), `inputs_digest`, `normalize` (dòng dạng cũ).
- Đổi `heldByUser` / trạng thái giải trình → `explanationHold` trong bộ máy, `AdminPresence.declaredDates` / `syncExplanation`, `LateCheckout.sync`, `inputs_digest`, `EXPLANATION_PENDING`.
- Đổi hệ số OT (`ot.rate`, `ot.weekendRate`, `ot.holidayRate`, `night.otAddRate`) hay `ot.afterMakeup` → `calcDay`, `mienThueOf` (mức miễn thuế theo nhóm OT), bảng ở mục 4.10, phiếu.
- Đổi `NOTE_MAX` / độ dài lý do → `src/domain/input.ts`, `src/domain/approvals/approvals.ts` NOTE_MAX, `config.REASON_MAX`, `slice(0,300)` ở /ot, `maxlength` giao diện, `limits.noteMax`.
- Đổi `warnIf` → mọi hàng cảnh báo ở mục 3–4; `PERIOD_LOCKED` của tạm ứng luôn là lỗi 409.
- Đổi `ROUTE_CAPS` / vai trò → `canDecideRow`, `sheetOwner` (khai thay dùng `request.decide.*`), `viewsAll` (tạm ứng), `isAdmin` (giải trình dùng `attendance.correct`), test permissions-matrix.
- Đổi `KpiScore` / `kpi.*` → `kpiScoreItem`, `kpiPartsView`, bộ máy (tiền KPI), `kpiOf` ở payroll-service.

---

## 7. Test hiện có

Tên file có tiền tố ngày được viết bằng `*-` thay cho tiền tố.

Khoản tự khai, bảng duyệt, quy tắc duyệt:
`test/api/approvals.test.ts`, `test/api/approvals-holiday-work.test.ts`, `test/api/approvals-leave.test.ts`, `test/api/approvals-limits.test.ts`, `test/api/v1a-s6-approvals-per-item.test.ts`, `test/api/approval-rules-settings.test.ts`, `test/api/alerts.test.ts`, `test/api/*(đã bỏ)`, `test/api/*(đã bỏ)`, `test/api/*(đã bỏ)`, `test/api/*(đã bỏ)`, `test/api/makeup-day-removed.test.ts`, `test/api/*(đã bỏ)`, `test/api/sheet-rev.test.ts`, `test/api/sheet-shift-lock.test.ts`, `test/api/*(đã bỏ)`, `test/api/holiday-ot-guard.test.ts`, `test/api/holiday-names.test.ts`, `test/api/schedule-isat-holiday-makeup.test.ts`, `test/api/staff-checkin-gate.test.ts`, `test/api/warnings-cases.test.ts`, `test/api/period-lock-guards.test.ts`, `test/api/events.test.ts`, `test/api/audit-log.test.ts`, `test/api/roles-custom.test.ts`, `test/api/permissions-matrix.test.ts`, `test/api/review-fixes.test.ts`, `test/api/verify-fixes.test.ts`, `test/api/backend-followup.test.ts`, `test/api/save-applies-everywhere.test.ts`, `test/api/contract-web.test.ts`.
`test/unit/approval-view.test.ts`, `test/unit/approval-view-holiday-ot.test.ts`, `test/unit/approval-view-leave.test.ts`, `test/unit/approval-rules-counts-absent.test.ts`, `test/unit/*(đã bỏ)`, `test/unit/*(đã bỏ)`, `test/unit/*(đã bỏ)`, `test/unit/shared-rules-params.test.ts`, `test/unit/schedule-isat-holiday-makeup.test.ts`, `test/unit/isat-calendar.test.ts`, `test/unit/isat-saturday-entitled.test.ts`, `test/unit/checkin-blocked-on-off-day.test.ts`, `test/unit/warnings.test.ts`.

Tiền OT, làm bù, ngày lễ, bảo hiểm theo ngày có lương:
`test/unit/ot-weekend-rate.test.ts`, `test/unit/ot-day-allowance.test.ts`, `test/unit/ot-no-break.test.ts`, `test/unit/ot-unscheduled-day-paid.test.ts`, `test/unit/makeup-paid-in-full.test.ts`, `test/unit/makeup-surplus-removed.test.ts`, `test/unit/makeup-into-holiday.test.ts`, `test/unit/attendance-makeup-days.test.ts`, `test/unit/legacy-makeup-day-engine.test.ts`, `test/unit/holiday-ot-after-night-shift.test.ts`, `test/unit/holiday-ot-approved-window.test.ts`, `test/unit/holiday-break-paid-once.test.ts`, `test/unit/payroll-holiday.test.ts`, `test/unit/insurance-paid-days.test.ts`, `test/unit/tax-exempt-premium-only.test.ts`.

Phép năm: `test/api/*(đã bỏ)`, `test/api/*(đã bỏ)`, `test/api/leave-ledger-per-year.test.ts`, `test/api/sheet-leave-over-balance.test.ts`, `test/api/domain-catalog-routes.test.ts`, `test/api/schedule-estimate-calendar.test.ts`, `test/unit/leave-rules.test.ts`, `test/unit/*(đã bỏ)`, `test/unit/leave-year-settlement.test.ts`, `test/unit/leave-events-per-year.test.ts`, `(đã bỏ)`, `test/unit/domain-classes.test.ts`.

Tạm ứng: `test/api/*(đã bỏ)`, `test/api/*(đã bỏ)`, `test/unit/advance-approved-month.test.ts`, `test/unit/advance-base-holiday.test.ts`, `test/api/advance-holiday-base.test.ts`.

Giải trình: `test/api/*(đã bỏ)`, `test/api/*(đã bỏ)`, `test/api/*(đã bỏ)`, `test/api/*(đã bỏ)`, `test/api/*(đã bỏ)`, `test/api/explanation-no-punch-pay.test.ts`, `test/api/*(đã bỏ)`, `test/api/*(đã bỏ)`, `test/api/*(đã bỏ)`, `test/api/explanation-attendance-event.test.ts`, `test/api/attendance-session-status.test.ts`, `test/api/checkin.test.ts`, `test/api/fixed-attendance.test.ts`, `test/unit/*(đã bỏ)`, `test/unit/*(đã bỏ)`.

KPI: `test/api/kpi-scores-api.test.ts`, `test/api/kpi-scores-store.test.ts`, `test/api/*(đã bỏ)`, `test/unit/kpi-score.test.ts`, `test/unit/kpi-max-drift.test.ts`.

OT Check-in/out: `test/api/holiday-ot-guard.test.ts`, `test/api/attendance-sessions.test.ts`, `test/api/warnings-cases.test.ts`, `test/api/audit-followup-backend.test.ts`, `test/api/*(đã bỏ)`.

---

## 8. Điểm chưa nhất quán và giới hạn hiện tại

Chỉ ghi nhận hành vi của mã, không phải mô tả mong muốn.

### 8.1 Hai nơi tính cùng một thứ khác nhau

1. **Nhận diện khoản dùng hai bộ tham số.** `src/domain/approvals/approvals.ts, :107` (`declaredItems`, dùng cho `reconcile` và các đợt tạo dòng) gọi bản trần `view` = `require('../src/engine/approval-view')` (= `create(DEFAULTS)`), trong khi `src/domain/approvals/index.ts` (`sheetApprovals`) và bộ máy dùng `rulesFor(tháng).approvalView`. Nếu lịch làm việc theo tham số tháng khác mặc định, khoản OT ngày lễ lưu ở DB và khoản hiện trên màn có thể khác nhau.
2. **Tháng mốc duyệt sẵn chỉ áp một nửa.** `reconcileMonthApprovals` truyền `approveBefore: CUTOFF_MONTH` (`src/domain/approvals/index.ts`), còn `PUT /sheet` gọi `reconcile` không có `approveBefore` (`src/modules/sheet/sheet.controller.ts`): khoản mới của tháng đứng trước mốc lưu qua PUT /sheet thì chờ duyệt, tạo qua đổi lễ / đổi loại thì duyệt sẵn. Mốc viết cứng trong mã (`src/domain/approvals/approvals.ts`).
3. **Số dư phép tính ở nhiều nơi.** `src/modules/sheet/sheet.controller.ts` / `src/modules/leave/leave.controller.ts` `leaveBalanceView` (tới ngày hiện tại, không xét ngày nghỉ việc, cờ `sheetFlagsOf().hasLeaveAccount`); `src/domain/sheet.ts` `leaveSummary` (`rulesFor()` tháng hiện tại); `LeaveAccountService.refresh` (`leave-account-service.ts`, tính tới ngày nghỉ việc, cần `uuid`); `src/modules/sheet/sheet.controller.ts` / `src/modules/leave/leave.controller.ts` (`HOLIDAY_LEAVE_CONFLICT`). Người đã nghỉ việc có thể thấy hai số dư khác nhau giữa `GET /sheet` và `GET /leave/ledger`.
4. **Quy tắc cộng phép viết hai lần.** `src/domain/leave/leave-events.ts` chép lại `src/engine/leave.ts` `accrued` (`NV_TYPE`, cách đếm tháng tròn, năm, thâm niên, sinh nhật); chỉ test đối chiếu tổng giữ hai bản khớp.
5. **Chiếu ngày khai viết hai lần.** `src/domain/approvals/approvals.ts` `projectDay` khác `src/domain/payroll/payroll-service.ts` `estimateDays`: `projectDay` giữ cả `makeupPlans` lẫn `makeupDate` cho mọi loại khác work/makeup; `estimateDays` chỉ cho `willmakeup` và chỉ một trong hai, thêm `punchNote`, điền `extraKind:'makeup'` khi thiếu.
6. **POLICY dựng hai lần.** `approval-view.ts` (kiểm thiếu khoá, ném `PARAM_MISSING`) và `payroll-engine.ts` `approvalPolicy` (quét regex, không kiểm thiếu khoá hay `ALLOWED_ACTIONS`). Bộ máy luôn truyền bản thứ hai vào `payView`.
7. **Nền tạm ứng viết hai lần.** `payroll-engine.ts` `tienUngCong` và builtin `tienUng` cùng một quy tắc.
8. **Đếm "chờ duyệt" khác nhau.** `approvals.changed` gửi `pending = store.approvals.list({status:'pending'}).length` (`src/platform/events.ts`): gồm tài khoản ngoài bảng lương và không lọc theo quyền người xem; `GET /approvals/count` và `GET /alerts` lọc cả hai (`src/modules/approvals/approvals.controller.ts, :1083`). Danh sách kiểm kỳ `PENDING_APPROVALS` (`src/domain/period/periods.ts`) lại đếm theo danh sách người của kỳ.
10. **Thứ tự danh sách duyệt.** `store.approvals.list` xếp theo `date, username` (`ORDER BY` ở `src/domain/approvals/approvals.ts`, hàm `list` bắt đầu), `GET /approvals` xếp lại theo `username, date` rồi mới phân trang.

### 8.2 Mã lỗi, khoá kỳ, tự duyệt không đồng bộ

11. **`APPROVAL_NOTE_TOO_LONG` không tới được** từ route: `src/modules/**/*.controller.ts` đã trả 400 không mã khi note > `NOTE_MAX` trước khi gọi `decide`.
12. **Hai mã cho tự duyệt.** Khoản tự khai dùng `APPROVAL_SELF` và so `row.username === by` không xét `payrollSubject` (`src/domain/approvals/approvals.ts`); mọi nơi khác dùng `SELF_DECISION_FORBIDDEN` qua `isSelfDecision` (cần `payrollSubject`).
13. **Duyệt tất cả tạm ứng bỏ qua chính mình** (`src/modules/advance/advance-approvals.handlers.ts`), trong khi duyệt từng người chỉ cảnh báo (`decideOne`,).
14. **Khoá kỳ của tạm ứng luôn là lỗi.** `src/modules/advance/advance-approvals.handlers.ts` luôn 409; ứng lương dạng cũ dùng `store.assertPeriodOpen(...,'slip')` (chỉ cảnh báo).
15. **Giải trình không khoá kỳ** (`src/modules/explanations/explanations.controller.ts`, `ROUTE_CAPS` không có `periodScope`) dù kết quả duyệt đổi `explanationHold`, tức đổi tiền của kỳ; không có cả cảnh báo `PERIOD_FROZEN`. Ghi / xoá lượt Admin từ giải trình ngày thì đòi kỳ còn mở chấm công.
16. **Quy tắc duyệt giải trình khác khoản tự khai**: từ chối không cần lý do, không có lỗi "đã ở trạng thái này", không kiểm fingerprint (`explanation.ts`, `request.ts`).
17. **`PUT /ot` bỏ qua kết quả `updateSession`** (`src/modules/attendance/attendance.controller.ts`), còn `POST /ot` kiểm và trả 409.
18. **`approveOnBehalf` không qua chặn AI** (`sheet-on-behalf.ts`), còn `PUT /approvals/decide` thì có.

### 8.3 Số viết cứng, tham số không được đọc

19. **Độ dài lý do có nhiều nguồn**: `src/domain/input.ts` `NOTE_MAX = 300`; `src/domain/approvals/approvals.ts` `DEFAULTS['control.reasonMaxLength']` (mặc định, không theo tháng); `config.REASON_MAX` 300; `src/modules/**/*.controller.ts` `:1395` cắt im lặng `slice(0, 300)` thay vì báo lỗi;  `maxlength="300"`; giải trình `TEXT_MAX = 500` (`explanation-service.ts`).
21. **Tham số có trong registry nhưng không nơi nào đọc**: `approval.batch`, `approval.pendingAtLock`, `control.reasonRequired.reject`, `control.reasonRequired.changeDecision`, `kpi.scoreMax`, `kpi.scoreDecimals` (chỉ có ở `src/engine/payroll-params.ts`). Thang điểm 0..100 và 2 chữ số thập phân viết cứng ở `src/engine/kpi-score.ts` (`checkScore`, `toUnits`) và `src/domain/kpi/kpi-scoring.ts` (`cleanKpi`).
22. **Số nghiệp vụ trong mã/config**: +1 ngày mỗi bậc thâm niên (`src/engine/leave.ts`, `leave-events.ts`); `MONTH_OT_CAP` 40 và `DAY_HOURS_CAP` 12 chặn cứng (`overtime/hour-limits.ts`); T2–T6 viết cứng `dow >= 1 && dow <= 5` (`timesheet/timesheet-validator.ts`); `config.CHECKOUT_GRACE_MIN` 30.

### 8.4 Mã chết, trùng, quyền

24. **Mã chết**: `src/domain/advance/advance-requests.ts` `create` và `decide` không còn nơi gọi trong `lib/` hay `src/modules/**/*.controller.ts` (route trả 410); `store.setKpiApproval` (`src/platform/db.ts`) không có nơi gọi trong `lib/`/`src/modules/**/*.controller.ts`.
25. **Một tên nhật ký cho hai hệ**: `advance.cancel` dùng cho ứng lương dạng cũ (`entityId = id`) và tạm ứng (`entityId = <month>/<user>`).
26. **Vai trò tuỳ chỉnh không duyệt được tạm ứng**: `DECIDE_ITEMS = ApprovalView.ITEMS` (`authz.ts`) không có `advance`; `request.decide.advance` chỉ có qua `request.decide.*`. Vai trò `manager` có `request.decide.*` nhưng phạm vi `team` = chỉ chính mình (`authz.ts`), nên chỉ duyệt được khoản của mình (tự duyệt).
28. **Hai luồng OT**: OT Check-in/out có duyệt riêng (`PUT /ot`, `otReview`) nhưng không vào tiền (`ot.ts`); tiền OT chỉ từ khoản `ot` trên lịch. Hai hàng duyệt cùng tên "OT".
29. **Ghi khi đọc**: `GET /alerts` đóng lượt quá hạn (`src/modules/approvals/approvals.controller.ts` / `src/modules/sheet/sheet.controller.ts` / `src/modules/leave/leave.controller.ts`); `GET /sheet` đóng lượt mở quá hạn của người được xem; `GET /leave/ledger` ghi sổ và số dư (`src/modules/leave/leave.controller.ts`).
30. **Tạm ứng bị từ chối không xin lại được** trong cùng tháng (`advance-approvals.ts`: `request` chỉ từ `null`; không có bước ra khỏi `rejected`).
31. **Dòng duyệt của người ra khỏi bảng lương** vẫn nằm trong DB; `listApprovals` ẩn chúng nhưng `approvals.changed` vẫn đếm (mục 8.1 điểm 8).
32. **Phạm vi `team` chưa có bảng phân công**: vai trò `manager` chỉ thấy và duyệt dữ liệu của chính mình (`can`, `authz.ts`).
33. **Khoản OT khai ở Check-in/out không ra tiền**: chỉ theo dõi; muốn trả OT phải có khoản `ot` đã duyệt trên Lịch ước tính cùng chấm công liền ca (mục 4.10).
