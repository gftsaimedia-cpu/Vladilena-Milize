# Vòng đời kỳ lương (BE v2) — thiết kế

- Ngày: 2026-11-05
- Trạng thái: **chờ người dùng duyệt spec**. Ba phần thiết kế đã được duyệt trong chat ("Ổn").
- Loại: Architectural (module mới `periods`, đổi giao diện giữa attendance, requests, holidays, payroll).
- Nhánh: `claude/payroll-period-lifecycle`, nền `main` fd46e87 (chứa 620e434 và module audit-log).
- Phạm vi: chỉ BE (`src/`, `migrations/postgres/schema.sql`, `test/v2/`, `docs/`). Không sửa `web/`.

## 1. Mục tiêu

Kỳ lương đi qua các bước thật trên BE: **Chốt công → Đã tính → Phê duyệt kỳ → Đã trả lương**. Có hai bước lùi: **Mở lại công** và **Huỷ phê duyệt**. Mỗi bước khoá đúng phần dữ liệu của tháng. Ba nơi cùng đọc một trạng thái thật:

- thanh kỳ lương của Admin;
- app nhân viên (`/me`);
- kho cài đặt (`minMonth` của nhánh settings-store).

Xong khi:

- mọi bước chuyển và mọi chỗ chặn có test chạy trên PostgreSQL thật, và đều xanh;
- báo cáo cuối liệt kê các màn FE còn phải nối.

## 2. Hiện trạng (kiểm trong mã, `main` fd46e87)

| Màn FE / nút | Gọi tới | BE trước spec này |
|---|---|---|
| Thanh kỳ lương ở Chấm công và Bảng lương (`stores/period.ts`, `builders/api/period.ts`) | `GET /api/v2/system/periods` | Có. Thanh dựng từ 4 mốc `attendance_locked_at`, `calculated_at`, `approved_at`, `paid_at`. |
| Nút "Chốt công" (`components/shell/PeriodStrip.vue`) | `POST /system/periods/:month/lock` | Có, nhưng chỉ đổi nhãn. Nó không khoá chấm công, đơn hay ngày lễ: `timesheet_entries.is_locked` không có ai ghi, `lockTimesheets` không có ai gọi. Chốt lại tháng cũ thì ghi đè lên lần trước. |
| Bảng lương › Tính / Tính lại lương | `POST /payroll/:month/calculate` | Có. Không ghi `calculated`, không xem kỳ. Chặn tính lại khi có lần chạy `final`, nhưng không có mã nào ghi `final`. |
| Ngăn kéo phiếu › Duyệt / Từ chối | `POST /payroll/:month/:username/decision` | Có (phần `rejected` thuộc phiên payslip-print). Chặn khi lần chạy `final`, nhưng không có ai ghi trạng thái đó. |
| Bước "Chấm KPI" | — | Không có mốc. FE coi bước này xong khi đã tính. |
| Phê duyệt kỳ, Trả lương, Mở lại | FE không có nút | **Chưa có route.** |
| In tất cả, bản in A4 (`services/payslip.ts`) | `/api/periods/...` (route v1) | Không có trên v2 (phiên payslip-print). |
| App NV › Chấm công, Thu nhập | `/me/attendance`, `/me/income` | Có. `periodState = 'locked'` khi status ≠ `open`. "Chính thức" khi phiếu của chính người đó `approved`. |
| Kho cài đặt (nhánh settings-store) | `minMonth` từ kỳ `approved`/`paid` | Không có mã nào ghi hai trạng thái này. |

DB có sẵn:

- CHECK `payroll_periods.status`: `open, attendance_locked, calculated, reviewed, approved, paid`.
- Các cột `*_by/*_at`, `rev`, `current_run_id`, `reopen_count`.
- Trigger `payroll_runs_guard_update`: chỉ cho `draft → final|superseded` và `final → superseded`.
- Trigger `payslips_frozen_update`: phiếu của lần chạy `final`/`superseded` không sửa được.
- `AuditLog.append(trx, entry)` (module audit, `@Global`).

## 3. Luật đã chốt (người dùng, trong chat)

| # | Ngày | Luật | Ví dụ đã dùng khi hỏi |
|---|---|---|---|
| L1 | 04/11 | Còn giải trình chờ duyệt thì chưa chốt kỳ lương được. Ngày sai mà không có giải trình thì tính 0 đ, và kỳ vẫn chốt được. | — |
| L2 | 05/11 | "Chính thức" ở app NV = phiếu của chính người đó đã duyệt, kể cả khi kỳ chưa chốt. | 03/11 duyệt phiếu tháng 10 của Nam → Nam thấy "Chính thức". |
| L3 | 05/11 | Ngày trả lương do Admin đặt (1–28 tháng sau, mặc định 10), chỉ để hiển thị. | — |
| D1 | 05/11 | Bốn bước: Chốt công → Tính lương (BE tự ghi khi tính sau Chốt công) → Phê duyệt kỳ → Đã trả lương. KPI nhập trong phiếu trước khi Phê duyệt kỳ; KPI không có trạng thái riêng. Bỏ `reviewed`. | Tháng 10: chốt 01/11, tính 02/11, duyệt kỳ 05/11, trả 10/11. |
| D2 | 05/11 | Chốt công khoá tháng đó: không chấm công; không nộp đơn mới, **trừ giải trình**; Admin không chấm thay, không tính lại công; không thêm hay xoá ngày lễ. Admin vẫn duyệt được đơn đang chờ. Giải trình của tháng đó vẫn nộp được cho tới khi Phê duyệt kỳ. | Giải trình 28/10 đang chờ vẫn duyệt được. Bình nộp giải trình 29/10 vào ngày 03/11 vẫn được. |
| D3 | 05/11 | Chỉ Chốt công được sau khi hết tháng. | Nút của tháng 10 hiện từ 01/11; ngày 28/10 không có nút. |
| D4 | 05/11 | Tính lương trước Chốt công vẫn được, nhưng chỉ là nháp. Sau chốt công phải tính lại thì bước Tính lương mới xong. Duyệt phiếu và Phê duyệt kỳ chỉ làm trên lần tính sau Chốt công. | Tính nháp 25/10, chốt 01/11, tính lại. |
| D5 | 05/11 | Phê duyệt kỳ cần mọi phiếu đã được duyệt. Phê duyệt xong thì mọi phiếu bị khoá: không tính lại, không sửa KPI. | 18 phiếu đã duyệt, Châu bị từ chối, Dũng còn nháp → nút khoá, ghi "Còn 2 phiếu chưa duyệt". |
| D6 | 05/11 | Admin duyệt hay từ chối đơn của một tháng đã có lần tính sau Chốt công → BE tự tính lại phiếu người đó, phiếu về Nháp. Đổi bậc hay tham số thì không tự tính lại. | Phiếu Bình duyệt 02/11. Giải trình 29/10 duyệt 04/11 → phiếu Bình tính lại, về Nháp. |
| D7 | 05/11 | **Mọi** đơn còn chờ của tháng đều chặn Phê duyệt kỳ. Giải trình chưa nộp thì không chặn. Lời người dùng: "giải trình còn chờ duyệt thì mới chặn, còn không nộp giải trình thì thôi"; "còn chờ duyệt thì không cho duyệt kỳ". | Đơn nghỉ 30/10 của Dũng còn chờ vào 05/11 → nút khoá. |
| D8 | 05/11 | Một nút "Đã trả lương", không phải nhập gì. Nút chỉ hiện từ ngày trả lương. | Duyệt kỳ 05/11, ngày trả 10/11 → 09/11 chưa có nút. |
| D9 | 05/11 | Mở lại lùi từng bước một, bắt buộc ghi lý do. "Huỷ phê duyệt" đưa kỳ về Đã tính và giữ các phiếu đã duyệt. "Mở lại công" đưa kỳ về Đang chấm công. Kỳ đã trả lương không mở lại được. | 06/11 sai KPI Bình → Huỷ phê duyệt. Cần chấm công thay cho Châu → Mở lại công. |
| D10 | 05/11 | Cách dựng A: module `periods` mới, gồm máy trạng thái và `PeriodGate`. | — |

Thiết kế mục 4–6 được duyệt theo từng phần trong chat. Mỗi luật nêu trong spec này đều có trong bảng trên, hoặc được ghi là *Ruling* ở mục 11.

## 4. Máy trạng thái

Có 5 trạng thái: `open` (Đang chấm công), `attendance_locked` (Đã chốt công), `calculated` (Đã tính), `approved` (Đã phê duyệt), `paid` (Đã trả lương). Tháng chưa có dòng trong `payroll_periods` thì coi là `open`.

| Hành động | Từ → tới | Hiện khi | Khoá khi (kèm lý do) | Ghi |
|---|---|---|---|---|
| `lock` Chốt công | `open` → `attendance_locked` | trạng thái `open` **và** hôm nay theo giờ VN đã sau ngày cuối tháng | — | `attendance_locked_by/at`, `rev+1`; nhật ký `period.lock` |
| *(tự)* tính cả kỳ | `attendance_locked` → `calculated` | — | — | chỉ khi gọi tính lương **không có** `employeeIds` và `rev` không đổi trong lúc tính; ghi `calculated_by/at`, `current_run_id`, `rev+1` |
| `unlock` Mở lại công | `attendance_locked` \| `calculated` → `open` | ở hai trạng thái đó | — | `reason` bắt buộc; xoá `attendance_locked_*` và `calculated_*`, `reopen_count+1`, `rev+1`; nhật ký `period.unlock` |
| `approve` Phê duyệt kỳ | `calculated` → `approved` | ở `calculated` | còn đơn `PENDING` đụng tháng đó · còn phiếu của lần chạy hiện tại khác `approved` · có người cần phiếu mà chưa có phiếu | lần chạy hiện tại `draft → final`; `approved_by/at`, `current_run_id`, `rev+1`; nhật ký `period.approve` |
| `unapprove` Huỷ phê duyệt | `approved` → `calculated` | ở `approved` | — | `reason` bắt buộc. Lần chạy `final → superseded`, rồi tạo lần chạy `draft` mới (`run_no+1`) chép mọi phiếu, **giữ nguyên `status`, `decided_*`, `note`**. Xoá `approved_*`, ghi `current_run_id`, `rev+1`; nhật ký `period.unapprove` |
| `pay` Đã trả lương | `approved` → `paid` | ở `approved` **và** hôm nay theo giờ VN ≥ ngày trả lương | — | `paid_by/at`, `rev+1`; nhật ký `period.pay` |

`paid` không có hành động nào nữa.

Tính lương theo trạng thái:

| Trạng thái | Tính cả kỳ | Tính một người | Duyệt / từ chối phiếu | Lưu KPI |
|---|---|---|---|---|
| `open` | nháp, trạng thái giữ nguyên | nháp | ✗ `PAYSLIP_NOT_DECIDABLE` | ✓ |
| `attendance_locked` | ✓ → `calculated` | nháp, vẫn `attendance_locked` | ✗ | ✓ |
| `calculated` | ✓ (mọi phiếu về Nháp, như hiện nay) | ✓ (người khác giữ trạng thái, như hiện nay) | ✓ | ✓ |
| `approved` / `paid` | ✗ `PAYROLL_FINALIZED` | ✗ | ✗ | ✗ `PAYROLL_FINALIZED` |

Ở `calculated` thì lần chạy hiện tại luôn là lần tính sau lần Chốt công gần nhất. Lý do:

- `unlock` đưa kỳ về `open`;
- chốt lại thì kỳ ở `attendance_locked`;
- chỉ một lần tính cả kỳ mới đưa kỳ sang `calculated` (D4).

**Ngày trả lương.** Hàm `paydayOf(month)` nằm trong `src/modules/periods/domain/payday.ts`. Trước khi kho cài đặt vào `main`, hàm trả ngày 10 của tháng sau. Ngày trả lương rơi vào Chủ nhật hay ngày lễ vẫn giữ nguyên (L3). Khi settings-store gộp vào, chỉ thay thân hàm này.

## 5. Cổng kỳ (`PeriodGate`) — Chốt công khoá gì

`PeriodGate.hold(trx, months[], use)` làm hai việc:

1. Lấy khoá chia sẻ `pg_advisory_xact_lock_shared('period:<month>')` cho từng tháng, theo thứ tự tăng dần, trên giao dịch của người gọi.
2. Đọc trạng thái của từng tháng, rồi ném `PeriodLockedError(month, status)` nếu `use` không được phép ở trạng thái đó.

Các bước chuyển ở mục 4 lấy khoá độc quyền trên cùng khoá. Vì vậy Chốt công đợi các lần chấm công hay nộp đơn đang ghi dở xong mới chạy. Ngược lại, chấm công đợi Chốt công xong rồi mới thấy trạng thái mới.

| `use` | Ai gọi | `open` | `attendance_locked` / `calculated` | `approved` / `paid` |
|---|---|---|---|---|
| `punch` | `AttendanceService.recordPunch` (cả `/me/punches` lẫn `/attendance/punches`) theo tháng của `workDate` | ✓ | ✗ | ✗ |
| `recalculate` | `AttendanceService.recalculateTimesheet` | ✓ | ✗ | ✗ |
| `file` | `RequestsService.create*` trừ giải trình (cả `/me/requests/:kind` lẫn `/requests/*` Admin nộp thay) | ✓ | ✗ | ✗ |
| `explain` | `RequestsService.createExplanationRequest` | ✓ | ✓ | ✗ |
| `review` | `RequestsService.reviewRequest` | ✓ | ✓ (rồi tự tính lại, mục 6) | ✗ |
| `holiday` | `HolidaysService.add / quickAdd / remove` theo tháng của ngày lễ | ✓ | ✗ | ✗ |
| `kpi` | `PayrollService.setKpiScore` | ✓ | ✓ | ✗ `PAYROLL_FINALIZED` |

NV huỷ đơn còn chờ không qua cổng, vì đơn chờ không làm đổi lương. Lúc kỳ đã duyệt cũng không còn đơn chờ nào (D7).

**Tháng một đơn đụng tới** (`requestMonths(req)` trong domain của requests):

- tháng của `leaveStartDate…leaveEndDate`;
- ngày của các khung làm bù (`makeupSlots[].date`);
- `otDate`;
- `changeStartDate…changeEndDate`;
- `explanationDate`;
- `isat.saturday`;
- `advancePeriod`.

Đơn đụng nhiều tháng thì bị chặn nếu một trong các tháng đó bị chặn.

Lỗi: `PeriodLockedError` → HTTP 409 `PERIOD_LOCKED` `{ month, status }`. Đây chỉ là lưới an toàn: phía FE thì tháng đã chốt không được đưa vào ô chọn, và nút bị khoá.

Chấm công gán ngày công nào thì cổng xét tháng của ngày công đó. Người đang làm ca cuối tháng mà không chấm được giờ ra vì tháng đã chốt thì dùng giải trình (D2). Giải trình được duyệt thì tính đủ ngày, theo luật 04/11.

## 6. Tự tính lại khi duyệt đơn (D6)

Sau khi giao dịch duyệt hoặc từ chối của `reviewRequest` đã commit:

1. Lấy `requestMonths(req)`.
2. Với mỗi tháng có trạng thái `calculated`, gọi `PayrollService.calculatePeriodPayslips(month, [req.employeeId], reviewer)`, tức là tính lại một người.
   - Người đó có phiếu mới, ở trạng thái `draft` (Nháp). Người khác giữ phiếu và trạng thái nhờ cơ chế chép phiếu sẵn có.
   - Tháng `open` hoặc `attendance_locked` thì không làm gì; lần tính cả kỳ sau Chốt công sẽ lấy dữ liệu mới.
3. Tính lại bị lỗi:
   - quyết định duyệt đơn vẫn giữ;
   - phiếu cũ của người đó trong lần chạy nháp hiện tại về `draft`, xoá `decided_*`;
   - lỗi được trả về trong phản hồi.
   - Phê duyệt kỳ vẫn bị khoá, vì còn phiếu chưa duyệt.
4. Phản hồi `PATCH /requests/:id/review` có thêm `recalculated: Array<{ month, ok: boolean, error?: string }>`. Mảng rỗng khi không có tháng nào ở `calculated`.

Không tự tính lại khi:

- NV nộp đơn hoặc huỷ đơn;
- Admin đổi bậc, chức vụ, tham số hay hồ sơ (D6).

## 7. Kiến trúc mã

```
src/modules/periods/                 (mới; chỉ phụ thuộc database và AuditLog toàn cục)
  domain/period-state.ts             máy trạng thái thuần: bước chuyển, nút hiện/khoá + lý do
  domain/payday.ts                   paydayOf(month)
  periods.errors.ts                  PeriodLockedError, PeriodStateError, PeriodBlockedError, …
  periods.repository.ts              dòng payroll_periods, khoá advisory, đếm điều kiện duyệt kỳ, final/chép lần chạy
  period-gate.ts                     PeriodGate.hold(trx, months, use) — export cho module khác
  periods.service.ts                 lock, unlock, approve, unapprove, pay, view(month), markCalculated(...)
  periods.controller.ts              /api/v2/system/periods[/:month[/lock|unlock|approve|unapprove|pay]]
  periods.module.ts, index.ts
```

Phụ thuộc giữa các module, không có vòng:

- `payroll` → `periods`;
- `attendance` → `periods`;
- `holidays` → `periods`;
- `requests` → `attendance`, `holidays`, `periods`, `payroll`;
- `me` → `periods` (thay cho `SystemService.getPeriod`).

`SystemService` và `SystemController` bỏ phần kỳ: `listPeriods`, `getPeriod`, `lockPeriod` cùng các route của chúng.

Chỉ thêm vài dòng móc nối vào các file mà phiên khác đang sửa, để gộp nhánh ít xung đột:

| File | Móc nối |
|---|---|
| `payroll.repository.ts` | `savePayrollRunAndSlips`: lấy khoá độc quyền của tháng, xem trạng thái (`approved`/`paid` → `PayrollFinalizedError`), rồi gọi `markCalculated` khi tính cả kỳ. `decidePayslip`: chỉ cho khi kỳ ở `calculated`. Thêm `resetDecision(month, username)`. |
| `payroll.service.ts` | `setKpiScore` qua cổng `kpi`. |
| `requests.service.ts` | `create*` qua cổng `file` hoặc `explain`. `reviewRequest` qua cổng `review`, rồi tự tính lại sau commit. |
| `attendance.service.ts` | `recordPunch`, `recalculateTimesheet` qua cổng. |
| `holidays.service.ts` | `add`, `quickAdd`, `remove` qua cổng. |
| `me.controller.ts` | đọc trạng thái kỳ từ `periods`; map `PeriodLockedError` → 409. |

## 8. API

Mọi route mang đúng một dấu quyền. Ngày giờ trả theo ISO.

### 8.1 `GET /api/v2/system/periods` — `config.read`

Như cũ: `{ periods: PayrollPeriodRow[] }`. Bỏ `reviewed_*`. Mốc thời gian bị xoá khi lùi bước, nên `builders/api/period.ts` hiện đúng mà không phải sửa.

### 8.2 `GET /api/v2/system/periods/:month` — `config.read` (mới)

```json
{
  "month": "2026-10",
  "status": "calculated",
  "steps": {
    "lockedAt": "2026-11-01T02:00:00.000Z", "lockedBy": "admin",
    "calculatedAt": "2026-11-02T03:00:00.000Z", "calculatedBy": "admin",
    "approvedAt": null, "approvedBy": null,
    "paidAt": null, "paidBy": null
  },
  "payday": "2026-11-10",
  "actions": {
    "unlock": { "enabled": true },
    "approve": {
      "enabled": false,
      "reason": "Còn 2 phiếu chưa duyệt · 1 đơn chờ duyệt",
      "blockers": { "pendingRequests": 1, "unapprovedSlips": 2, "missingSlips": [] }
    }
  }
}
```

- `actions` chỉ có các nút được hiện ở trạng thái đó (mục 4). Ví dụ `lock` không có trước ngày hết tháng, `pay` không có trước ngày trả lương.
- `actions` tính theo trạng thái, không theo quyền người gọi. FE vẫn ẩn nút theo `caps`, như cách đang làm với Chốt công.
- `missingSlips: [{ username, name }]`.
- Thứ tự lý do trong `reason`: phiếu chưa có, phiếu chưa duyệt, đơn chờ duyệt.

### 8.3 Hành động — trả về cùng dạng 8.2

| Route | Quyền | Body |
|---|---|---|
| `POST /system/periods/:month/lock` | `attendance.lock` | — |
| `POST /system/periods/:month/unlock` | `attendance.lock` | `{ reason }` |
| `POST /system/periods/:month/approve` | `payroll.approve` | — |
| `POST /system/periods/:month/unapprove` | `payroll.approve` | `{ reason }` |
| `POST /system/periods/:month/pay` | `payroll.approve` | — |

### 8.4 Mã lỗi

Đây là lưới an toàn: dùng UI bình thường thì không gặp các lỗi này.

| HTTP | `code` | Khi |
|---|---|---|
| 400 | `INVALID_MONTH` | tháng sai dạng `YYYY-MM` |
| 400 | `REASON_REQUIRED` | `unlock`/`unapprove` thiếu lý do, hoặc lý do toàn khoảng trắng |
| 409 | `PERIOD_STATE` | hành động không hợp lệ ở trạng thái hiện tại; kèm `status` |
| 409 | `MONTH_NOT_ENDED` | `lock` trước khi hết tháng |
| 409 | `BEFORE_PAYDAY` | `pay` trước ngày trả lương; kèm `payday` |
| 409 | `PERIOD_BLOCKED` | `approve` còn vướng; kèm `blockers` |
| 409 | `PERIOD_LOCKED` | chấm công, nộp đơn, duyệt đơn, ngày lễ chạm tháng bị chặn; kèm `month`, `status` |
| 409 | `PAYSLIP_NOT_DECIDABLE` | duyệt hay từ chối phiếu khi kỳ không ở `calculated` |
| 409 | `PAYROLL_FINALIZED` | tính lương hay lưu KPI khi kỳ `approved`/`paid` (mã có sẵn) |

### 8.5 Thay đổi ở route có sẵn

- `PATCH /api/v2/requests/:id/review`: thêm `recalculated` (mục 6).
- `/me/attendance`: `periodState` như cũ (`locked` khi trạng thái ≠ `open`), đọc qua `periods`.

## 9. DB (`migrations/postgres/schema.sql`, sửa thẳng, không đánh số)

- CHECK `payroll_periods.status` còn `('open','attendance_locked','calculated','approved','paid')`.
- Bỏ cột `reviewed_by`, `reviewed_at`.
- `src/database/schema.ts` cập nhật theo.
- `paid_ref` giữ nguyên, không dùng (D8 không nhập mã chứng từ).

## 10. Nhật ký

Mỗi bước chuyển gọi `AuditLog.append(trx, …)` trong cùng giao dịch:

| `action` | Ghi |
|---|---|
| `period.lock` | `entityKind: 'period'`, `entityId: month`, `month`, `before: { status }`, `after: { status }` |
| `period.unlock` | như trên, kèm `reason` |
| `period.approve` | như trên |
| `period.unapprove` | như trên, kèm `reason` |
| `period.pay` | như trên |

Mọi dòng: `sensitivity: 'normal'`. Tính lương tự động không ghi `period.*`.

## 11. Ruling (tự quyết khi thiết kế, người dùng chưa hỏi riêng)

| # | Quyết định | Lý do | Rủi ro nếu sai |
|---|---|---|---|
| R1 | "Hết tháng" nghĩa là `businessDateText()` (giờ VN) lớn hơn ngày cuối tháng. | D3 nói "từ 01/11". | Đổi một hàm. |
| R2 | Người cần có phiếu = `staff.locked_at IS NULL`, cùng tập mà tính cả kỳ đang dùng. | Thống nhất với Tính lương hiện tại. | Người nghỉ việc đã bị khoá trước khi tính sẽ không cần phiếu. |
| R3 | "Tính cả kỳ" là lời gọi tính lương không có `employeeIds`. Tính một người ở `attendance_locked` không đổi bước. | D4: phiếu duyệt được phải từ một lần tính sau Chốt công. Lần tính một người có thể chép phiếu của lần tính trước khi chốt. | Admin phải bấm "Tính lương" cả kỳ một lần sau chốt. |
| R4 | Lần tính chỉ đưa kỳ sang `calculated` khi `rev` của kỳ không đổi từ lúc bắt đầu tới lúc lưu. Nếu `rev` đã đổi, lần tính vẫn lưu dưới dạng nháp. | Trong lúc tính, có thể đã có người Mở lại công rồi chốt lại. | Có thể phải tính lại một lần. |
| R5 | Huỷ phê duyệt chép phiếu sang lần chạy nháp mới, giữ trạng thái và người duyệt. | D9 "giữ các phiếu đã duyệt". Trigger cấm `final → draft`. | — |
| R6 | Tự tính lại chạy **sau** commit của quyết định duyệt đơn, không chạy trong cùng giao dịch. Lỗi thì phiếu cũ về Nháp. | Tính lương có khoá và giao dịch riêng. Nếu gộp chung thì phải giữ khoá đơn suốt lúc tính. | Tiến trình chết giữa hai bước thì phiếu cũ vẫn ở trạng thái đã duyệt, và Phê duyệt kỳ không biết phiếu đó đã cũ. Admin phải tự tính lại người đó; nút "Tính lại" một người có sẵn trong ngăn kéo (lưu KPI). |
| R7 | Lưu KPI bị chặn ở `approved`/`paid`. | D5 "không sửa KPI được nữa". | — |
| R8 | `actions` tính theo trạng thái, không theo quyền. | Chỉ có hai vai trò; FE đã đọc `caps`. | Có thêm vai trò thì phải lọc theo quyền. |
| R9 | Bỏ `reviewed` và cột của nó; giữ `paid_ref`. | D1; dọn `paid_ref` không đem lại gì. | — |
| R10 | Nhật ký `sensitivity 'normal'`. | Các bước của kỳ không chứa số tiền. | — |
| R11 | Duyệt đơn ở tháng `approved`/`paid` bị chặn (409 `PERIOD_LOCKED`). | Lưới an toàn: theo D7 thì lúc này không còn đơn chờ. | — |

## 12. Test (TDD; dùng `test/v2/helpers/pg-temp-db.ts`)

Test đơn vị, không cần DB:

- `period-state`: mọi bước chuyển, được và bị từ chối; nút hiện hay khoá theo ngày (trước/sau hết tháng, trước/sau ngày trả lương); thứ tự lý do;
- `requestMonths` cho từng loại đơn, kể cả đơn vắt qua hai tháng;
- `paydayOf`.

Test PostgreSQL thật:

1. `lock` trước hết tháng bị chặn. Sau hết tháng thì ghi `attendance_locked`, có nhật ký. `lock` lần hai trả `PERIOD_STATE`.
2. Tính cả kỳ ở `attendance_locked` thì sang `calculated`. Tính một người không sang. Tính ở `open` vẫn giữ `open`.
3. Duyệt phiếu ở `open` hoặc `attendance_locked` trả `PAYSLIP_NOT_DECIDABLE`. Ở `calculated` thì được.
4. `approve`:
   - bị chặn với đủ ba loại vướng, đếm đúng;
   - hết vướng thì `approved`, lần chạy thành `final`;
   - trigger chặn sửa phiếu;
   - tính lương và lưu KPI trả `PAYROLL_FINALIZED`.
5. `unapprove`:
   - thiếu lý do bị chặn;
   - có lý do thì kỳ về `calculated`;
   - lần chạy mới là nháp, phiếu giữ trạng thái `approved` và người duyệt;
   - lần chạy `final` cũ thành `superseded`;
   - nhật ký có lý do.
6. `unlock` từ `calculated` thì kỳ về `open`, mốc chốt và mốc tính bị xoá, `reopen_count = 1`.
7. `pay`: trước ngày trả lương bị chặn; từ ngày trả lương thì `paid`; sau đó mọi hành động trả `PERIOD_STATE`.
8. Cổng kỳ:
   - chấm công: NV và Admin;
   - tính lại công;
   - từng loại đơn ở tháng đã chốt bị chặn, riêng giải trình được;
   - giải trình ở `approved` bị chặn;
   - ngày lễ;
   - duyệt đơn ở `calculated` được.
9. Tự tính lại:
   - duyệt giải trình ở `calculated` thì phiếu người đó về Nháp với số mới, phiếu người khác giữ `approved`;
   - ở `attendance_locked` thì không có lần chạy mới;
   - tính lại lỗi thì phiếu cũ về Nháp, phản hồi có `error`.
10. Đồng thời: một giao dịch giữ cổng `punch` của tháng 10 thì `lock` tháng 10 phải đợi giao dịch đó xong.
11. Route HTTP: quyền, mã lỗi, dạng phản hồi 8.2 (test có Nest, theo mẫu `system-lock.test.ts`).
12. `/me/attendance`: `periodState` đúng sau `lock` và sau `unlock`.

Xác minh:

- `npm test` với `PG_TEST_URL` trỏ tới một container `postgres:16` dùng một lần, trên cổng chưa ai dùng (không dùng 55442, 55465, 55466);
- không chạy typecheck, không chạy prettier.

## 13. Ngoài phạm vi

- FE (`web/`). Xem mục 14.
- Phần ruột của duyệt từng phiếu (`decidePayslip`, `'rejected'`): phiên payslip-print. Spec này chỉ thêm điều kiện "kỳ ở `calculated`".
- Kho cài đặt: thay `paydayOf` và `minMonth` khi nhánh settings-store vào `main`.
- Chấm công lõi: cách gán ngày công, ca đêm.
- Chặn sửa bậc, chức vụ, hồ sơ nhân sự cho tháng đã chốt. Theo D6, các thay đổi này cũng không tự tính lại.
- Duyệt đơn hàng loạt, trả lương từng người, mã chứng từ.

## 14. Màn FE còn phải nối (phiên FE làm)

| Màn | Việc |
|---|---|
| Thanh kỳ lương (`PeriodStrip.vue`, `stores/period.ts`) | Đọc `GET /system/periods/:month`. Hiện các nút theo `actions`: Chốt công, Mở lại công (hộp lý do), Phê duyệt kỳ (khoá kèm `reason`), Huỷ phê duyệt (hộp lý do), Đã trả lương. Bỏ điều kiện `canLock` tự suy từ các bước. |
| Bảng lương (`PayrollView.vue`) | Ẩn "Tính / Tính lại lương" ở `approved`/`paid`. Sau khi tính, đọc lại kỳ. |
| Ngăn kéo phiếu (`PayslipDrawer.vue`) | Duyệt / Từ chối chỉ hiện khi kỳ `calculated`. Ô KPI chỉ đọc ở `approved`/`paid`. |
| Chuông / duyệt đơn | Hiện `recalculated`, ví dụ "Đã tính lại phiếu tháng 10 của Bình". Có lỗi thì báo lỗi. |
| App NV và màn NV trên máy tính: nộp đơn | Ô chọn ngày bỏ các tháng đã chốt (giải trình vẫn được tới khi Phê duyệt kỳ). Nút chấm công khoá khi tháng của ngày công đã chốt. |
| Cài đặt › Lịch | Khoá thêm/xoá ngày lễ của tháng đã chốt. |
| Cài đặt › Nhật ký (`audit-labels.ts`) | Nhãn cho `period.unlock`, `period.approve`, `period.unapprove`, `period.pay`. |
| In tất cả / bản in A4 (`services/payslip.ts`) | Vẫn gọi route v1 `/api/periods/...` (phiên payslip-print). |
| Tổng quan | `periodState` lấy từ thanh kỳ; tự đúng khi thanh kỳ đúng. |

## 15. Ảnh hưởng tới các phiên khác

- **payslip-print** (`src/modules/payroll/*`, `schema.sql`): móc nối ở `savePayrollRunAndSlips`, `decidePayslip`, `setKpiScore`. Gộp nhánh nào sau thì nhánh đó sửa xung đột.
- **staff-requests** (`requests.service.ts`, `schema.sql`): cổng ở `create*`/`reviewRequest`, và tự tính lại.
- **settings-store**: `minMonth` có dữ liệu thật để đọc; thay `paydayOf`; `schema.sql` đổi CHECK `payroll_periods`.
- **staff-app** (`me.controller.ts`): đổi nguồn đọc kỳ, không đổi hợp đồng.
