# Trang in phiếu lương A4: nối API v2

Viết theo main `19bdf03` (sau đợt thiết kế lại bản in A4). Đường dẫn và số dòng dưới đây là của commit đó.

Trang `/in/phieu-luong/:month/:username` (một phiếu) và `/in/phieu-luong/:month` (in tất cả) hiện chỉ chạy trên dữ liệu giả: `getPayslipSheet` luôn trả tháng mẫu 10/2026 (`web/src/services/payslip.ts:50-59`), còn `getApprovedSheets` vẫn đi qua API v1 `/periods/...` nên hỏng trên cả hai (`:61-91`). Việc cần làm: trên BE thật, trang đọc API v2 và dựng cùng kiểu `A4Sheet` mà giao diện đang dùng; trên dữ liệu giả, giữ nguyên bản mẫu và thêm trạng thái. BE đã tính sẵn mọi số; FE chỉ trình bày, không tự tính luật lương.

Tài liệu này đứng một mình. Hợp đồng đầy đủ của BE: `docs/api/v2-contract.md`, mục "Payroll Module". Đặc tả bản in A4: `docs/superpowers/specs/2026-11-05-payslip-a4-redesign-design.md`.

## 1. Người dùng đã chốt (2026-11-05)

- Bấm vào dòng trong Bảng lương mở ngăn kéo; bấm nút In ra bản A4 hai trang.
- Nút In in được phiếu ở mọi trạng thái. Ô Tình trạng ghi đúng trạng thái của phiếu: Nháp / Đã duyệt / Bị từ chối (hiện ô này đang ghi nhãn hợp đồng, `A4Attendance.vue:27-29`).
- Cột Vào – ra ghi giờ chấm thật, không phải giờ ca.
- OT theo luật ngày 04/11, tính đúng theo phút (BE tính; xem hợp đồng API).
- Ngày phép năm còn lại tính tới hết tháng của phiếu.
- BE tính sẵn mọi số vào phiếu; FE chỉ trình bày.
- Branch BE này không sửa mã FE; tài liệu này giao cho agent FE.
- Phiếu là "Chính thức" khi chính phiếu đó có `status = 'approved'`, dù kỳ lương chưa chốt (không dùng `payroll_runs.status = 'final'`). Phiếu `draft`, `pending`, `error` là "Tạm tính". Phiếu không phải `approved` thì không phải "Chính thức". Ví dụ: ngày 03/11 Admin duyệt phiếu tháng 10 của Nam khi tháng 10 chưa chốt, thì Nam thấy "Chính thức".
- Phiếu nháp có dòng "bản nháp, chưa phải lương chính thức"; phiếu Chính thức không có dòng này.

### Chưa quyết (hỏi người dùng)

- Phiếu `rejected` (Bị từ chối) có tính là "Tạm tính" và có dòng "bản nháp, chưa phải lương chính thức" không? Người dùng chưa trả lời, nên chưa quyết; mock và test không dựa vào điều này. Ô Tình trạng của phiếu bị từ chối vẫn ghi "Bị từ chối" (đã chốt).

### Gợi ý thiết kế (agent thiết kế tự quyết)

- Bỏ tham số `?kb` và `?ten` (chỉ phục vụ dữ liệu giả cũ); giữ `?in=1` (tự mở hộp in).
- Đặt dòng "bản nháp…" ở dòng phụ dưới tiêu đề (`periodNote`).
- Theo luật chung của dự án: ô và nhãn mới góc 8px, chấm + chữ, không dạng viên thuốc.

## 2. Dữ liệu BE

Hai lời gọi (đã có trong `docs/api/v2-contract.md`):

- Một phiếu: `GET /api/v2/payroll/:month/:employeeId` trả `{ month, payslip }`. `:employeeId` nhận `username` hoặc `uuid`; đường dẫn trang dùng `username`. Chưa có phiếu thì `404` `PAYSLIP_NOT_FOUND`.
- In tất cả: `GET /api/v2/payroll/:month` trả `{ month, items }`. Giữ các phần tử `status === 'approved'`. Mỗi phần tử đã có `details` đầy đủ, không cần gọi thêm từng người.

Bản ghi phiếu: `username`, `status` (`draft` | `approved` | `rejected`), `net`, `details`. Trong `details` (rút gọn):

```json
{
  "fullName": "Lê Hoàng Nam",
  "employeeType": "nv",
  "level": 1,
  "employmentStatus": "official",
  "contractStatusText": "HĐLĐ từ 3 tháng",
  "month": "2026-10",
  "standardWorkdays": 26,
  "dayRate": 230769,
  "remainingAnnualLeaveDays": 10,
  "totalOtHours": 1.3333333333333333,
  "ot15Pay": 57692,
  "otPayTotal": 57692,
  "dailyLines": [
    {
      "date": "2026-10-07", "dayOfWeekText": "Thứ 4", "shiftCode": "NORMAL", "shiftLabel": "Normal",
      "inOutText": "08:00–19:20", "checkIn": "08:00", "checkOut": "19:20",
      "workHours": 8, "daySalary": 230769, "flexAllowancePay": 0, "nightAllowancePay": 0, "offPaidPay": 0,
      "otHours": 1.3333333333333333, "otPay": 57692,
      "deductionHours": 0, "deductionAmount": 0, "dailyTotal": 288461
    }
  ]
}
```

Ánh xạ sang `A4Sheet` (kiểu ở `web/src/mock/payslip-a4.ts:51-69`):

| Trường `A4Sheet` | Lấy từ v2 |
|------------------|-----------|
| `username` (thêm mới, xem mục 3) | `username` của bản ghi |
| `month`, `name` | `details.month`, `details.fullName` |
| `kind`, `level` | `employeeType` (`nv` → NV, `ctv` → CTV, `tts` → TTS; `null` → "—") và `level` |
| `status` (thêm mới) | `status` của bản ghi; `approved` → "Đã duyệt", `rejected` → "Bị từ chối", còn lại → "Nháp"; cũng quyết định có dòng "bản nháp…" hay không |
| `employmentStatus` (thêm mới) | `employmentStatus`: `probation` → "Thử việc", `official` → "Chính thức"; `null` thì không hiện. Đây là trạng thái nhân sự, khác với "Chính thức" của phiếu ở mục 1 |
| `contract` | `contractStatusText` (còn dùng ở dòng xám đầu trang 2, `a4-format.ts:35-36`) |
| `from`, `to` | ngày đầu và ngày cuối của `month` |
| `periodNote` | "bản nháp, chưa phải lương chính thức" cho phiếu `draft`, `pending`, `error`; rỗng cho phiếu `approved`; phiếu `rejected`: chưa quyết (mục 1) |
| `stdDays` | `standardWorkdays` |
| `dayRate` | `dayRate` (BE tính sẵn = `round(baseSalaryPolicy ÷ standardWorkdays)`) |
| `days[]` (mỗi `dailyLines[]`) | `date`; thứ trong ngày ← `dayOfWeekText` (BE ghi thứ thật: `Thứ 2` … `Thứ 7`, `Chủ nhật`; FE in nguyên chữ, không tự đổi `date` ra thứ); `label` ← `shiftLabel`; `in` ← `checkIn`; `out` ← `checkOut`; `hours` ← `workHours`; `ot` ← `otHours`; `adjust` ← `flexAllowancePay` + `nightAllowancePay` + `offPaidPay` + `otPay` − `deductionAmount`; `total` ← `dailyTotal`; `makeup`, `note` ← `null` (BE chưa có). `mark`: `NORMAL`, `FLEX`, `NIGHT` → `work`; `LEAVE`, `ISAT` → `paid`; `UNPAID` → `unpaid`. `absent` và `pending` chưa có nguồn trong BE v2 |
| `stats` | `workDays` ← `actualWorkDays`; `flex` ← `flexShiftCount`; `night` ← `nightShiftCount`; `paidLeave` ← `paidLeaveDays`; `isat` ← `isatDays`; `unpaid` ← `unpaidLeaveDays`; `otHours` ← `totalOtHours`; `lateHours` ← `lateEarlyHours`. `absent`, `pending`, `makeupHours`: chưa có nguồn, nên ẩn ba ô đó hoặc in "—" (agent thiết kế chọn) |
| `groups`, `totals`, `net` | bảng dưới |
| `leaveLeft` | `remainingAnnualLeaveDays`; có thể `null` |

`days[]` lấy nguyên `dailyLines` (BE đã sắp theo ngày); FE không lọc. Dùng `checkIn` / `checkOut` (dạng `HH:MM`) cho `in` / `out` để hàm `inOutText` của `a4-format.ts:12` tự ghép; không dùng chuỗi `inOutText` của BE.

Trang 2 (`groups`, `totals`):

| Dòng trang 2 | Số lượng | Theo quy chế | Thực tế |
|--------------|----------|--------------|---------|
| Lương cơ bản | `actualWorkDays`/`standardWorkdays` ngày | `baseSalaryPolicy` | `baseSalaryActual` |
| Nghỉ có lương | `paidLeaveDays` ngày | | `paidLeavePay` |
| Quyết toán phép dư | | | `leaveSettlementPay` |
| iSAT | `isatDays` ngày | | `isatPay` |
| Nghỉ lễ | `holidayPaidDays` ngày | | `holidayPay` |
| OT ngày thường (×1,5) / cuối tuần (×2) / ngày lễ (×3) | `ot15Hours` / `ot20Hours` / `ot30Hours` giờ | | `ot15Pay` / `ot20Pay` / `ot30Pay` (ba số cộng lại bằng `otPayTotal`) |
| Chuyên cần, Đi lại, Linh hoạt, Off Paid, Thưởng ca đêm | Đi lại: `actualWorkDays` ngày; Linh hoạt: `flexShiftCount` ca; Off Paid và Thưởng ca đêm: `nightShiftCount` ca | `attendanceAllowancePolicy`, `travelAllowancePolicy`, `flexAllowancePolicy`, `offPaidNightPolicy`, `nightAllowancePolicy` | `attendanceAllowanceActual`, `travelAllowanceActual`, `flexAllowanceActual`, `offPaidNightActual`, `nightAllowanceActual` |
| Tổng phụ cấp | | | `totalAllowanceActual` |
| Lương KPI | `kpiTotalScorePct` % | `kpiAppliedAmount` | `kpiActualPay` |
| Đi muộn, về sớm | `lateEarlyHours` giờ | | `lateEarlyDeductionAmount` (đã là số âm) |
| Tổng thu nhập | | | `grossIncome` |
| Các khoản miễn thuế | | | `taxExemptIncome` |
| Thu nhập chịu thuế | | | `taxableIncome` |
| Bảo hiểm bắt buộc | | | `insuranceDeduction` (chia ra `insuranceBreakdown.bhxh`, `.bhyt`, `.bhtn` nếu cần) |
| Thu nhập sau bảo hiểm | | | `incomeAfterInsurance` |
| Thuế TNCN | | | `personalIncomeTax` |
| Tạm ứng | | | `advanceDeduction` |
| Thực nhận | | | `netIncome` (vào `net`) |

- Lưới KPI (`A4KpiPart`): `kpiScores.wework` (40%), `.user` (24%), `.peer` (18%), `.manager` (12%), `.self` (6%); `null` in "—". Chỉ hiện nhóm KPI khi `kpiApplicable` là `true`.
- Số lượng và tiền ở các dòng đều là số BE đã tính; FE chỉ ghép ô. Hàm `actualText` vẫn in "BE tính" khi một ô `null`.
- Không có nguồn trong BE v2 nên bỏ khỏi bản in thật: các dòng "Chờ giải trình", "Không tính lương" và "Làm bù cho ngày nghỉ" của nhóm đầu và nhóm OT, cột Làm bù và Ghi chú của trang 1.

Phiếu tính trước khi BE thêm trường mới (ảnh chụp cũ) thiếu `employeeType`, `level`, `employmentStatus`, `checkIn`, `checkOut`, `ot15Pay`, `ot20Pay`, `ot30Pay`, `dayRate`: hiện "—" ở các ô tương ứng, không báo lỗi. Các trường cũ vẫn mang nghĩa cũ trong ảnh chụp đó: `dayOfWeekText` là `Thứ 2 - Thứ 6` / `Thứ 7`; `remainingAnnualLeaveDays` luôn là 22; `otPayTotal` là số giờ trên đơn × lương giờ × 2; `inOutText` là chuỗi cố định `08:00–17:00` / `22:00–06:00`. Bấm "Tính lương" lại thì phiếu có đủ trường và đúng nghĩa mới.

## 3. Mã cần đổi / xoá

- `web/src/mock/payslip-a4.ts:51-69` (`A4Sheet`): thêm `username`, `status`, `employmentStatus`; đổi `leaveLeft` thành `number | null`. Mock `buildSheet` (`:138`) và `payslipSheet(month)` (`:251`) cho trạng thái: cần các biến thể Đã duyệt, Nháp, Bị từ chối để xem và kiểm (cách chọn biến thể, ví dụ theo `username` mẫu, do agent thiết kế quyết định) và một phiếu có `leaveLeft: null`. Cập nhật `web/tests/payslip-a4-data.spec.ts` nếu hợp đồng mock đổi.
- `web/src/services/payslip.ts:50-59` `getPayslipSheet`: hiện luôn dùng mock. Thêm nhánh `__MOCK__ ? mock : api.get('/payroll/…')` như `src/services/admin-payroll.ts:27-42`, rồi dựng `A4Sheet` bằng một hàm thuần mới (ví dụ `web/src/builders/api/payslip-a4.ts`, theo mẫu `builders/api/payroll.ts`). Lỗi `404` thì để trang hiện "Không tải được phiếu lương".
- `web/src/views/print/parts/A4Attendance.vue:27-29`: ô "Tình trạng" đang in `sheet.contract`; đổi sang `sheet.status`. Dòng 25 `Loại · bậc` thêm `employmentStatus` (chỗ đặt do agent thiết kế). Nhãn hợp đồng vẫn còn ở `A4Summary.vue:19` qua `staffLine`.
- `web/src/views/print/parts/a4-format.ts:31-32` `periodLine`: luôn nối `periodNote` bằng " · "; khi `periodNote` rỗng (phiếu Chính thức) phải bỏ đoạn đó, nếu không còn "· ·".
- `web/src/views/print/parts/A4Summary.vue:75` `{{ sheet.leaveLeft }} ngày`: khi `leaveLeft` là `null` in "—", không in "null ngày" (BE trả `null` cho loại nhân sự không có tài khoản phép, ví dụ `tts`).
- `web/src/views/print/PayslipPrint.vue`: dòng 17–18 (`?kb`, `?ten`) và chú thích dòng 6: xoá; dòng 28 bỏ `scenario`, `shownName` khỏi khoá nạp lại. Dòng 52 `:key="s.username"`: kiểu `A4Sheet` hiện không có `username`, thêm trường (như trên).
- `web/src/design-index/payslip.ts:13-18`: hai mục A4 trỏ tới `demo_a_broken` (không có thật), mục tháng 11 sẽ báo lỗi. Sửa trỏ tới phiếu mẫu có thật: một phiếu đã duyệt (Chính thức), một phiếu nháp (Tạm tính). Bản mock chỉ có tháng 10/2026, nên hai mục dùng cùng tháng 10; đổi tiêu đề cho đúng.
- `web/src/router/routes/payslip.ts:3-4`: sửa chú thích bỏ `?kb`, `?ten`.
- Mã v1 chết còn ở `web/src/services/payslip.ts`, xoá hết: `slipRev` (`:8`), `loadSlip` (`:16-31`), `getPayslip` (`:33`), `getSlipOverride` (`:38`), `saveSlipOverride` (`:42`), `approvedRows` (`:61`), `getPrintBatch` (`:71`), `decide` (`:93`), `approvePayslip` (`:104`), `returnPayslip` (`:115`), và các import `buildDrawer`, `api` khi không còn dùng. Xoá cả `web/src/builders/payslip/drawer.ts` (152 dòng; chỉ `loadSlip` gọi nó). `getApprovedSheets` (`:83-91`) giữ tên nhưng viết lại theo v2 (xem file `bang-luong--in-tat-ca.md`). Lưu ý: `getPayslip` cùng tên ở `src/services/admin-payroll.ts:33` là mã khác và còn dùng, không xoá.
- Đã xoá sẵn ở 19bdf03, không cần làm: `builders/payslip/sheet.ts`, `views/print/slipFormat.ts`.

## 4. Cách kiểm

Thấy được (trên BE thật và trên dữ liệu giả):

- Phiếu đã duyệt: ô Tình trạng "Đã duyệt", dòng phụ không có "bản nháp…". Phiếu nháp: "Nháp" và có dòng "bản nháp, chưa phải lương chính thức". Phiếu bị từ chối: ô Tình trạng "Bị từ chối"; dòng "bản nháp…" chưa quyết nên chưa kiểm.
- Cột Vào – ra khớp giờ chấm; ngày thiếu giờ ra hiện đúng đầu còn lại (`a4-format.ts:12`).
- Ngày có OT: cột OT có giờ, "Cộng / trừ" gồm tiền OT, "Thành tiền" bằng `dailyTotal`.
- Phiếu `tts`: "Ngày phép năm còn lại" ghi "—", không có chữ "null".
- Phiếu cũ thiếu trường mới: các ô tương ứng "—", trang vẫn in được.
- `?in=1` mở hộp in sau khi phiếu dựng xong; không có `?in=1` thì không mở. Vẫn đúng hai tờ A4, không tràn, chữ không nhỏ hơn 12px (test có sẵn ở `web/tests/payslip-a4.spec.ts:131`).

Test nên có (chạy `PW_PORT=<cổng> npm --prefix web run test:ui`):

- Kiểm hàm dựng `A4Sheet` từ bản ghi v2, không cần trình duyệt, cùng kiểu `web/tests/payslip-a4-data.spec.ts`: bản ghi nhỏ có hai dòng ngày (một ngày OT, một ngày nghỉ phép) cho đúng `adjust`, `mark`, `in`/`out`; `employeeType: null`; `remainingAnnualLeaveDays: null`; `status` `approved` / `draft` cho `status` và `periodNote`; `rejected` chỉ kiểm `status`.
- Giao diện: ô Tình trạng và dòng "bản nháp…" theo trạng thái (thêm vào `payslip-a4.spec.ts`; test `:29` "header follows P1" cần sửa vì ô Tình trạng đổi); `leaveLeft: null` không chứa chữ "null"; `?ten=` không còn ảnh hưởng.
- Giữ xanh: các test hiện có của `payslip-a4.spec.ts`, kể cả `:60` (tháng khác tháng mẫu báo lỗi tải) nếu mock vẫn chỉ có tháng 10.
