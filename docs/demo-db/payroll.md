# Lương — tình huống, lỗi, câu hỏi

Mảng `payroll` của DB demo (spec [2026-11-05-demo-db-e2e-design.md](../superpowers/specs/2026-11-05-demo-db-e2e-design.md) mục 6).

**File của mảng:**
- Người: `scripts/demo/people/payroll.ts` (11 người `lg-`). Kế hoạch từng người nằm trong `payrollPlan()`: ngày chấm công, đơn, KPI, phiếu được duyệt. Seed và test cùng đọc kế hoạch này.
- Seed: `scripts/demo/areas/payroll.ts`. Seed làm theo thứ tự:
  1. đơn nghỉ và OT: Admin nộp thay rồi duyệt;
  2. chấm công các ngày đã qua: Admin chấm qua `POST /attendance/punches`;
  3. giải trình, tạm ứng;
  4. nghỉ việc: `PUT /employees`;
  5. điểm KPI;
  6. tính lương m2, m1, m0;
  7. duyệt phiếu.
- Test: `web/tests/api/demo-payroll-{api,board,print,staff}.spec.ts`. Chạy bằng `npm run demo -- test payroll`.

**Cách đọc:**
- m2, m1, m0 là tháng trước nữa, tháng trước và tháng này (giờ VN). Tháng chính của mảng là m1.
- Số tiền trong test được tính từ kế hoạch và từ bậc lương trong `schema.sql`, không viết cứng.
- Ví dụ dưới đây lấy ngày 05/11/2026, nên m1 là tháng 10/2026: 27 ngày từ thứ Hai tới thứ Bảy, 22 ngày từ thứ Hai tới thứ Sáu.

**Nhánh đang chạy:** `claude/demo-db`, đã nhập hai lần main:
- main 7794025 (payslip-print) ở e951458;
- main aaa14d9 (đơn từ nhân viên, nhật ký, 5 trạng thái nhân sự) ở 0bc17d9.

Lỗi nào đã được sửa nhờ các lần nhập này: xem mục "Đã sửa".

## Người

| Username | Loại · bậc | Tình huống |
|---|---|---|
| `lg-an` | nv 1, HĐ từ 3 tháng | Đi đủ 3 tháng. Đủ 5 điểm KPI m1 (80/90/70/100/60, mức 6.000.000). Phiếu m2 và m1 đã duyệt. |
| `lg-binh` | nv 2, HĐ dưới 3 tháng, không BH | Trong m1 có bốn ngày đặc biệt: 1 ngày trễ 40 phút có giải trình đã duyệt; 1 ngày trễ 40 phút không giải trình; 1 ngày vắng; 1 ngày thiếu giờ ra có giải trình đã duyệt. Thuế 10%. Phiếu m1 dùng để thử Từ chối trong ngăn kéo. |
| `lg-chi` | nv 3, 1 người phụ thuộc, 12 ngày phép | Trong m1: 2 ngày Phép năm và 1 ngày nghỉ không lương, đều đã duyệt; OT ngày thường 18–20; tạm ứng đã duyệt. |
| `lg-dung` | nv 4, ở iDorm | KPI 100 cả 5 phần, mức = kpi_max, nên có thuế lũy tiến. Phiếu m1 đã duyệt. |
| `lg-em` | ctv 2 | KPI m1 thiếu 3 điểm (chấm cam). Test nhập điểm trong ngăn kéo. |
| `lg-giang` | ctv 4 | OT thứ Bảy 18–20. Đủ điểm KPI nhưng chưa nhập mức đề xuất. |
| `lg-hoa` | tts 1 | Không BH, không KPI. Test tính lại một người. |
| `lg-khanh` | tts 6, HĐ dưới 3 tháng, có cờ BH | Phiếu m1 đã duyệt. |
| `lg-lan` | nv 1 | Vào làm ngày 15 của m1. |
| `lg-minh` | nv 2 | Nghỉ việc ngày 16 của m1. Test Từ chối qua API. |
| `lg-nam` | nv 1, ca Flex 06–15 | Test Duyệt trong ngăn kéo. |

## Tình huống

Loại assert theo spec mục 3: (a) luật đã chốt, (b) bất biến, (c) thao tác không hợp lệ thì không được hiện ra.

| # | Tình huống | Người (username) | Test | Loại assert |
|---|---|---|---|---|
| 1 | Mỗi người có đúng một phiếu mỗi tháng. GET một phiếu trả đúng dòng của danh sách. | mọi `lg-` | api › every lg- person has one payslip per month… | b |
| 2 | Phiếu tự cộng đúng: tổng = các khoản − trừ giờ; tổng phụ cấp = cộng các dòng phụ cấp; BH = BHXH + BHYT + BHTN; thực nhận = tổng − BH − thuế − tạm ứng. | mọi `lg-`, 3 tháng | api › each payslip adds up… | b |
| 3 | Tiền ngày công = lương bậc × ngày công ÷ công chuẩn (nv/ctv 26, tts 22). Ngày công = số ngày đã chấm. Có người vào giữa tháng và người nghỉ giữa tháng. | mọi `lg-` (trừ `lg-binh` m1, xem #26), `lg-lan`, `lg-minh` | api › base pay = level base salary… | a |
| 4 | Ngày vắng (không vào, không ra) trả 0 đ. | `lg-binh` | api › an absent day… | a |
| 5 | Ngày thiếu giờ ra, có giải trình đã duyệt, trả đủ một ngày lương. | `lg-binh` | api › a day with a missing check-out and an approved explanation… | a |
| 6 | KPI = điểm theo trọng số 40/24/18/12/6 × mức đề xuất (≤ kpi_max). Cột thiếu điểm tính 0, có cờ kèm tên cột. Chưa nhập mức đề xuất thì KPI = 0, có cờ. | nv, ctv; `lg-em`, `lg-giang` | api › KPI pay = weighted score… | a |
| 7 | tts không có KPI: lương KPI 0, không cờ KPI. Nhập mức đề xuất bị trả 400 KPI_NOT_APPLICABLE. | `lg-hoa`, `lg-khanh` | api › tts has no KPI… | a, c |
| 8 | Nhập KPI sai bị trả 400/404: mức vượt kpi_max, điểm 101, tháng sai, người không có. | `lg-em` | api › KPI input checks… | c |
| 9 | BH 10,5% lương bậc (8 / 1,5 / 1) khi HĐ từ 3 tháng, hoặc HĐ dưới 3 tháng có cờ BH. Còn lại 0. | `lg-an`… `lg-khanh`; `lg-binh`, `lg-hoa` = 0 | api › insurance is 10.5%… | a |
| 10 | Thuế TNCN: HĐ từ 3 tháng tính lũy tiến (trừ 15,5tr và 6,2tr mỗi người phụ thuộc). HĐ dưới 3 tháng khấu trừ 10% khi tổng ≥ 5tr. Dưới 5tr: 0. | `lg-dung`, `lg-chi`, `lg-binh`, `lg-khanh`, `lg-hoa` | api › income tax… | a |
| 11 | Đi lại = lương × 15% × ngày ÷ 26. Ở iDorm thì 0. | `lg-an`, `lg-lan`, `lg-nam`, `lg-dung` | api › travel allowance… | a |
| 12 | Phụ cấp Flex (nv) = 20% × lương giờ × 8 cho mỗi ca Flex. | `lg-nam` | api › flex allowance… | a |
| 13 | OT thứ Bảy ×2 lương giờ trên số giờ đã duyệt. | `lg-giang` | api › Saturday OT pays ×2… | a |
| 14 | OT ngày thường ×1,5. | `lg-chi` | api › weekday OT pays ×1.5… | a |
| 15 | Số phép còn lại trên phiếu không lớn hơn số ngày phép của người đó (12). | `lg-chi` | api › remaining annual leave… | b |
| 16 | Tạm ứng = 80% lương ngày công 01–15, do server tính. Phiếu trừ đúng số của đơn đã duyệt, ở đúng tháng của đơn. | `lg-chi` | api › the advance is 80% of the day pay… | a, b |
| 17 | Tính lại một người hai lần cho cùng một phiếu. Phiếu của người khác giữ trạng thái. | `lg-hoa` | api › recalculating one person twice… | b |
| 18 | Tính lại cả kỳ tháng này hai lần cho cùng số với lần seed. | mọi `lg-`, m0 | api › recalculating the whole current month… | b |
| 19 | Tính cả kỳ không ai lỗi. | — | api › a full calculation reports no error… | b · **BUG-1** |
| 20 | Phiếu đã duyệt hiện "chính thức" ở app nhân viên, giống hệt phiếu của Admin. | `lg-an` m1 và m2, `lg-khanh` | api › staff income: an approved payslip… | a, b |
| 21 | Tạm tính không trừ BH và thuế. Thực nhận = tổng − tạm ứng. Tổng = phiếu Nháp của Admin. | `lg-binh`, `lg-chi`, `lg-an` m0 | api › staff income: an estimate… | a, b |
| 22 | Nhân viên gọi route lương của Admin thì bị trả 403. | `lg-an` | api › staff cannot use the Admin payroll routes | c |
| 23 | Yêu cầu sai bị trả 400/404, không có 500. | — | api › bad payroll requests… | b |
| 24 | Admin từ chối phiếu kèm lý do. Đọc lại được trạng thái, lý do và người quyết. | `lg-minh` | api › Admin rejects a draft payslip with a note… | b |
| 25 | Phép năm đã duyệt trả một ngày lương mỗi ngày. | `lg-chi` | api › approved annual leave… | a · **BUG-2** |
| 26 | Trễ > 15 phút không giải trình thì ngày đó 0 đ. | `lg-binh` | api › a check-in over 15 minutes late… | a · **BUG-3** |
| 27 | Trễ có giải trình đã duyệt bị trừ theo khối 30 phút: trễ 40 phút trừ 30 phút. | `lg-binh` | api › an explained late check-in… | a · **BUG-4** |
| 28 | Nghỉ từ 3 ngày thì mất chuyên cần. | `lg-chi` | api › the attendance allowance is lost… | a · **BUG-5** |
| 29 | Bảng lương m1, m2, m0: mỗi ô bằng API; chấm cam khi thiếu điểm KPI; dòng tổng bằng tổng API; ô "Phiếu đã duyệt" đúng; không lỗi console. | mọi phiếu | board › the payroll table shows every payslip… | b |
| 30 | Ô "Trừ giờ" chỉ có một dấu trừ. | `lg-binh` | board › the late-cut cell… | b · **BUG-7** |
| 31 | Ngăn kéo hiện số bằng API. Phiếu đã duyệt không có nút Duyệt hay Từ chối; phiếu Nháp có cả hai. | `lg-an`, `lg-giang` | board › the payslip drawer shows the API amounts… | b, c |
| 32 | Ngăn kéo ghi đúng loại · bậc. | `lg-an`, `lg-em` | board › …position type and level… | b · **BUG-6** |
| 33 | Phiếu tts không có ô nhập điểm KPI. | `lg-hoa` | board › a tts payslip offers no KPI score inputs | c · **BUG-8** |
| 34 | Nhập điểm KPI còn thiếu trong ngăn kéo: điểm được lưu; KPI tính lại theo trọng số; ngăn kéo và bảng cùng số; chấm cam vẫn còn vì còn thiếu điểm. | `lg-em` | board › typing a missing KPI score… | a, b |
| 35 | Duyệt phiếu trong ngăn kéo: nút biến mất; dòng thành "Đã duyệt"; app nhân viên hiện "chính thức", bằng phiếu vừa duyệt. | `lg-nam` | board › Admin approves a draft payslip… | b, c |
| 36 | Từ chối kèm lý do: nút biến mất; dòng thành "Từ chối"; BE lưu lý do. | `lg-binh` | board › Admin rejects a draft payslip… | b, c |
| 37 | Ngăn kéo của phiếu bị từ chối hiện lý do. | `lg-binh` | board › the drawer of a rejected payslip… | b · **BUG-9** |
| 38 | Nút "In tất cả" tắt khi tháng chưa có phiếu đã duyệt. | m0, m1 | board › "In tất cả" is off… | c |
| 39 | Bấm "Tính lại lương" ở tháng này không báo lỗi. | m0 | board › "Tính lại lương"… | b · **BUG-1** |
| 40 | `/admin/kpi` và `/admin/kpi/lich-su` mở Bảng lương và giữ tháng. | — | board › /admin/kpi and /admin/kpi/lich-su… | b |
| 41 | `/admin/cai-dat/kpi` mở được mà không có request lỗi. | — | board › the KPI rules settings page… | b · **BUG-12** |
| 42 | In một phiếu: đúng người, Thực nhận bằng ngăn kéo. | `lg-an` | print › printing one approved payslip… | b · **BUG-10** |
| 43 | In cả kỳ: in đủ phiếu đã duyệt, không in phiếu chưa duyệt. | m1 | print › printing the month… | b · **BUG-11** |
| 44 | Điện thoại, tháng này: "Tạm tính" bằng /me/income; không có dòng BH hay thuế; không có chữ "chưa trừ"; các khoản cộng ra Thực nhận; nút "Tháng sau" tắt. | `lg-an` | staff › phone: the current month is an estimate… | a, b, c |
| 45 | Điện thoại, tháng đã duyệt: "Chính thức" bằng phiếu Admin; có dòng BH và thuế; các khoản cộng ra Thực nhận. | `lg-an`, `lg-khanh` | staff › phone: an approved month is official… | a, b |
| 46 | Phiếu chính thức không ghi "dự kiến". | `lg-an` | staff › phone: an official payslip is not labelled "dự kiến" | a · **BUG-14** |
| 47 | Nút chuyển tháng dừng ở tháng vào làm và ở tháng này. | `lg-lan` | staff › phone: the month switch stops… | c |
| 48 | Các khoản cộng ra Thực nhận khi tháng có OT và tạm ứng. | `lg-chi` | staff › phone: the income lines add up… | b · **BUG-13** |
| 49 | Máy tính (từ 1136px): cột Thu nhập của tháng này bằng /me/income; cột này không có nút chuyển tháng. | `lg-khanh` | staff › desktop (from 1136px)… | b |

## Ghi SQL thẳng (không có route)

- Không có. Mọi dữ liệu đi qua API như Admin.
- Tạm ứng: seed chỉ gửi nhân sự và kỳ. Từ main aaa14d9, server tự tính số tiền.
- Test #16 chỉ assert phần luật đã chốt: 80% của lương ngày, tính trên các ngày công 01–15. lg-chi không đi trễ hay về sớm trong 01–15. Luật chưa chốt "lương" có gồm phụ cấp hay không, nên test không kiểm phần đó.

## Đã sửa

- **Ở main 7794025** (nhập vào nhánh ở e951458). Ba việc dưới đây đã đúng. Chúng chưa được ghi thành BUG lúc nhập, nên số BUG được dùng lại cho lỗi khác. Các test của chúng nay là test thường (#14, #15, #24, #36).
  - Từ chối phiếu không còn trả 500.
  - OT ngày thường tính ×1,5.
  - Phép còn lại lấy từ hồ sơ, không còn cố định 22.
- **Ở main aaa14d9** (nhập vào nhánh ở 0bc17d9):
  - Không sửa BUG-payroll nào. Đã chạy lại với `test.fail` tắt: cả 15 test lỗi vẫn hỏng đúng chỗ ghi dưới đây.
  - Có một đổi hợp đồng API: tạm ứng do server tính. Seed và test #16 đã sửa theo.

## Lỗi

Mỗi lỗi có một test giữ nguyên, đánh dấu `test.fail(true, 'BUG-payroll-<n>: …')`. Mọi test lỗi đã được chạy thử với `test.fail` tắt, lần cuối trên main aaa14d9. Tất cả đều hỏng đúng ở chỗ ghi dưới đây.

### BUG-payroll-1: Tài khoản admin nằm trong danh sách tính lương
- Tái hiện: `POST /api/v2/payroll/<tháng>/calculate {}` trả `errors: [{ employeeId: <uuid admin>, message: "Thiếu cấu hình chức vụ hoặc bậc lương cho ql…" }]`. Bảng lương báo "Đã tính 12 phiếu, 1 người lỗi".
- Đúng phải là: không ai lỗi (bất biến). Tài khoản quản trị không có hợp đồng, nên không phải người được tính lương.
- File nghi ngờ:
  - `src/modules/payroll/payroll.repository.ts` `listEligibleEmployees`: lấy mọi `staff` có `locked_at` null.
  - `src/main.ts` tạo admin với loại `ql`, bậc 0.
- Test: `demo-payroll-api.spec.ts` › "a full calculation reports no error for anyone"; `demo-payroll-board.spec.ts` › "\"Tính lại lương\" on the current month…".

### BUG-payroll-2: Phép năm đã duyệt trả 0 đ
- Tái hiện: `lg-chi` có 2 ngày Phép năm đã duyệt trong tháng 10. Phiếu ghi `paidLeaveDays` 0 và `paidLeavePay` 0.
- Đúng phải là: 2 × 7.000.000 ÷ 26 = 538.462 (luật 04/11: phép có lương trả một ngày lương cho nv/ctv).
- File nghi ngờ: `src/modules/payroll/payroll.service.ts`. Phiếu chỉ đọc `timesheet_entries`, còn duyệt đơn chỉ ghi `work_schedules` ON_LEAVE. Thuộc spec 2 attendance-core (trạng thái ngày).
- Test: `demo-payroll-api.spec.ts` › "approved annual leave pays one day rate per day (lg-chi, 2 days)".

### BUG-payroll-3: Trễ hơn 15 phút không giải trình vẫn trả gần đủ ngày
- Tái hiện: `lg-binh` vào 08:40 ngày 14/10 và không nộp giải trình. Dòng ngày đó trả 229.167, tức 250.000 trừ 40 phút. Ngày công vẫn là 26.
- Đúng phải là: ngày đó trả 0 đ (luật 04/11: ngày không hợp lệ, không giải trình thì 0 đ). Ngày công phải là 25.
- File nghi ngờ:
  - `src/modules/payroll/payroll.service.ts`;
  - `src/modules/attendance/domain/daily-timesheet.ts`.
  - Cả hai thuộc attendance-core.
- Test: `demo-payroll-api.spec.ts` › "a check-in over 15 minutes late with no explanation pays 0 for that day (lg-binh)".

### BUG-payroll-4: Trễ có giải trình bị trừ theo phút thực
- Tái hiện: `lg-binh` vào 08:40 ngày 12/10, có giải trình đã duyệt. Dòng ngày đó bị trừ 20.833, tức 40 phút.
- Đúng phải là: trừ theo khối 30 phút, nên 40 phút tính là 30 phút: 0,5 × 31.250 = 15.625 (luật 04/11).
- File nghi ngờ: như BUG-payroll-3.
- Test: `demo-payroll-api.spec.ts` › "an explained late check-in is cut in 30-minute blocks…".

### BUG-payroll-5: Nghỉ 3 ngày vẫn được chuyên cần
- Tái hiện: `lg-chi` nghỉ 2 ngày Phép năm và 1 ngày không lương trong tháng 10. Chuyên cần vẫn trả 1.615.385.
- Đúng phải là: nghỉ từ 3 ngày thì mất chuyên cần, đếm mọi loại nghỉ trừ iSAT, kể cả ngày vắng (luật 04/11). Chuyên cần phải là 0.
- File nghi ngờ: `src/modules/payroll/domain/employee-payslip.ts`. Điều kiện hiện là `absenceDays <= 4`, và chỉ đếm ngày nghỉ có trong bảng chấm công.
- Test: `demo-payroll-api.spec.ts` › "the attendance allowance is lost at 3 days off…".

### BUG-payroll-6: Ngăn kéo phiếu ghi "NV · Bậc 0" cho mọi người
- Tái hiện: mở phiếu `lg-an` (nv bậc 1) hoặc `lg-em` (ctv bậc 2). Ô "Loại · bậc" đều ghi "NV · Bậc 0".
- Đúng phải là: "NV · Bậc 1" và "CTV · Bậc 2", cùng số với hồ sơ (bất biến).
- File nghi ngờ: `web/src/builders/api/payroll.ts` `payslipFromRecord`, chỗ viết cứng `kind: 'NV'`, `level: 0`. Phiếu của BE chỉ có `positionLevelText`, nên có thể BE cũng cần trả loại và bậc.
- Test: `demo-payroll-board.spec.ts` › "the payslip drawer shows the position type and level…".

### BUG-payroll-7: Ô "Trừ giờ" có hai dấu trừ
- Tái hiện: bảng lương tháng 10, dòng `lg-binh`, ô Trừ giờ hiện "−-41.563".
- Đúng phải là: "−41.563".
- File nghi ngờ:
  - BE trả `lateEarlyDeductionAmount` là số âm;
  - `web/src/views/admin/payroll/parts/PayTable.vue` `cut()` thêm dấu "−" nữa;
  - `web/src/builders/api/payroll.ts` `lineOf` chuyển số âm đó qua nguyên vẹn.
  - Dòng tổng cuối bảng cũng bị như vậy.
- Test: `demo-payroll-board.spec.ts` › "the late-cut cell shows one minus sign (lg-binh)".

### BUG-payroll-8: Ngăn kéo vẫn cho nhập điểm KPI cho tts
- Tái hiện: mở phiếu `lg-hoa` (tts). Ngăn kéo có đủ 5 ô "Điểm … của Lương Mai Hoa, phần trăm".
- Đúng phải là: không có ô nào, vì tts không có KPI (plan payroll-v2-rules, quyết định 5). Thao tác không hợp lệ thì không hiện ra.
- File nghi ngờ: `web/src/views/admin/payroll/payslip/SlipSummary.vue` và `SlipKpi.vue`. Hai file luôn hiện nhóm KPI, không xét `kpiApplicable`.
- Test: `demo-payroll-board.spec.ts` › "a tts payslip offers no KPI score inputs (lg-hoa)".

### BUG-payroll-9: Ngăn kéo không hiện lý do từ chối
- Tái hiện: từ chối phiếu `lg-binh` với lý do "Thiếu giải trình ngày trễ". BE lưu và trả `note`, nhưng dòng trạng thái chỉ ghi "Đã từ chối phiếu lương của Lương Thị Bình.".
- Đúng phải là: có thêm dòng "Lý do: Thiếu giải trình ngày trễ", cùng chữ BE lưu (bất biến).
- File nghi ngờ: `web/src/builders/api/payroll.ts` `payslipFromRecord`. Hàm không chép `note` của phiếu vào `decisionNote`.
- Test: `demo-payroll-board.spec.ts` › "the drawer of a rejected payslip shows the reason…".

### BUG-payroll-10: Trang in một phiếu hiện dữ liệu mẫu
- Tái hiện: `/in/phieu-luong/2026-10/lg-an` hiện "NV thử nghiệm", "NV · Bậc 1" và các ngày của bản mock.
- Đúng phải là: phiếu đã duyệt của Lương Văn An, Thực nhận 13.001.076 ₫ như ngăn kéo.
- File nghi ngờ: `web/src/services/payslip.ts` `getPayslipSheet`, hàm chỉ đọc mock. Main đã có yêu cầu FE: `docs/fe-yeu-cau/in-phieu-luong-a4--noi-api-v2.md`.
- Test: `demo-payroll-print.spec.ts` › "printing one approved payslip…".

### BUG-payroll-11: Trang in cả kỳ báo "Không tải được phiếu lương."
- Tái hiện: `/in/phieu-luong/2026-10` gọi `GET /api/v2/periods/2026-10/payslips?status=approved…`, route của v1. BE v2 trả 404.
- Đúng phải là: in đủ phiếu đã duyệt của tháng, gồm `lg-an`, `lg-dung`, `lg-khanh` và `lg-nam` sau khi duyệt.
- File nghi ngờ: `web/src/services/payslip.ts` `getApprovedSheets`.
- Test: `demo-payroll-print.spec.ts` › "printing the month shows every approved payslip and nothing else".

### BUG-payroll-12: Trang Quy tắc KPI trống
- Tái hiện: mở `/admin/cai-dat/kpi`. Trang gọi `GET /api/v2/settings/params?group=8` và `GET /api/v2/settings/first-run`, cả hai bị trả 404. Trang chỉ còn thanh mục cài đặt.
- Đúng phải là: không có request lỗi (bất biến).
- File nghi ngờ:
  - `web/src/services/admin-config.ts` `getKpiRules` và `getSettingsBadges` gọi route chưa có ở BE v2;
  - `/settings/first-run` bị gọi ở mọi trang Cài đặt.
  - Có thể trùng với mảng settings-store.
- Test: `demo-payroll-board.spec.ts` › "the KPI rules settings page…".

### BUG-payroll-13: App nhân viên: các khoản không cộng ra Thực nhận
- Tái hiện: `lg-chi` xem tháng 10 trên điện thoại. Cộng các dòng Lương ngày công, Nghỉ phép, Phụ cấp và Lương KPI được 15.010.154, nhưng Thực nhận ghi 12.957.268.
- Đúng phải là: các dòng cộng lại bằng Thực nhận (bất biến). App thiếu dòng OT, dòng trừ giờ và dòng tạm ứng.
- File nghi ngờ: `web/src/builders/api/staff-phone.ts` `incomeViewOf`.
- Test: `demo-payroll-staff.spec.ts` › "phone: the income lines add up to Thực nhận when the month has OT and an advance (lg-chi m1)".

### BUG-payroll-14: Phiếu chính thức vẫn ghi "Thực nhận dự kiến"
- Tái hiện: `lg-an` xem tháng 10, phiếu đã duyệt. Trạng thái ghi "Chính thức", nhưng thẻ vẫn ghi "Thực nhận dự kiến". Nhãn trợ năng của thẻ luôn là "Thực nhận tháng 10", tháng nào cũng vậy.
- Đúng phải là: phiếu chính thức là phiếu đã duyệt (luật 05/11), nên không ghi "dự kiến". Nhãn phải theo tháng đang xem.
- File nghi ngờ: `web/src/views/staff-phone/components/NetCard.vue`, chữ và `aria-label` viết cứng.
- Test: `demo-payroll-staff.spec.ts` › "phone: an official payslip is not labelled \"dự kiến\" (lg-an m1)".

## Câu hỏi luật

### Q1: Tháng không có ngày nào trong thời gian làm việc có phiếu lương và trừ BH không?
- Tình huống: một người vào làm hoặc nghỉ việc ở tháng khác. Trong tháng đang tính, họ không có ngày nào thuộc thời gian làm việc.
- Hiện tại v2:
  - Vẫn tạo phiếu cho mọi tài khoản chưa khoá, ngày công 0.
  - Vẫn trừ BH đầy đủ, nên Thực nhận âm.
  - Luật đã chốt "≥ 14 ngày không lương thì không đóng BH" chưa có ở v2.
  - Spec 2 còn để ngỏ việc ngày trước ngày vào làm hay sau ngày nghỉ việc có tính là ngày không lương không.
- Ví dụ có số:
  - `lg-lan` vào làm 15/10/2026. Phiếu tháng 9: 0 ngày công, BH 630.000, Thực nhận −630.000.
  - `lg-minh` nghỉ việc 16/10/2026. Phiếu tháng 11: 0 ngày công, BH 682.500, Thực nhận −682.500.
- Hỏi: tháng không có ngày nào trong thời gian làm việc thì xử lý thế nào?
  - (a) Không tạo phiếu.
  - (b) Có phiếu 0 đ, không trừ BH.
  - (c) Giữ như hiện tại.

### Q2: Tiền ngày công của tháng lấy theo công thức tháng hay theo cộng từng ngày?
- Tình huống: phiếu A4 liệt kê từng ngày, mỗi ngày có tiền đã làm tròn. Dòng tổng của tháng lại tính một lần cho cả tháng.
- Hiện tại v2:
  - `baseSalaryActual` = 6.000.000 × 27 ÷ 26 = 6.230.769.
  - Mỗi dòng ngày có `daySalary` 230.769. Cộng 27 dòng được 6.230.763, lệch 6 đ.
- Hỏi: phiếu dùng số tháng 6.230.769 (bản in có thể lệch vài đồng so với cộng các dòng), hay dùng tổng các dòng 6.230.763?

### Q3: Chuyên cần tính đủ mức hay nhân theo ngày công?
- Tình huống: tháng 10/2026 có 27 ngày từ thứ Hai tới thứ Bảy, nhiều hơn công chuẩn 26.
- Hiện tại v2: chuyên cần = 1.500.000 × 27 ÷ 26 = 1.557.692 cho `lg-an` (nv bậc 1) đi đủ tháng, cao hơn mức quy chế 1.500.000. Đi lại theo luật đã chốt (× ngày ÷ 26) nên cũng là 934.615. Chuyên cần thì chưa có luật cách tính.
- Hỏi: chuyên cần trả bằng mức quy chế (1.500.000) khi không mất, hay nhân ngày công ÷ 26 như hiện tại?

### Q4: Tạm tính của nhân viên có trừ tạm ứng không?
- Tình huống: luật 05/11 nói tạm tính không trừ BH và thuế, nhưng chưa nói về tạm ứng. Trong ghi chú, đây là cách đọc chưa được xác nhận.
- Hiện tại v2: tạm tính có trừ tạm ứng đã duyệt. Ví dụ `lg-chi` tháng 10 (phiếu Nháp): Thực nhận tạm tính = tổng thu nhập − 2.153.848 tiền tạm ứng.
- Hỏi: giữ việc trừ tạm ứng trong tạm tính?

### Q5: Có duyệt được phiếu còn thiếu điểm KPI, và phiếu bị từ chối đi tiếp thế nào?
- Tình huống 1: `lg-em` còn thiếu 3 điểm KPI, có chấm cam. Ngăn kéo vẫn hiện nút "Duyệt phiếu".
- Tình huống 2: sau khi Từ chối, ngăn kéo không còn nút nào. Muốn đưa phiếu về Nháp, Admin phải sửa điểm KPI của người đó (FE tự tính lại một người) hoặc bấm "Tính lại lương" cả kỳ. Tính lại cả kỳ thì mọi phiếu đã duyệt về Nháp.
- Ghi chú: memory ghi việc "duyệt phiếu thiếu điểm" là còn mở.
- Hỏi:
  - (a) Có ẩn nút Duyệt khi còn thiếu điểm không?
  - (b) Phiếu bị từ chối có cần nút "Tính lại phiếu này" trong ngăn kéo không?

## Chưa phủ

- **Ca đêm:** phụ cấp đêm, Off Paid và phần miễn thuế ca đêm. Mảng không có người ca Night. Luật đêm sẽ đổi theo spec 2 (attendance-core).
- **Ngày lễ:** tiền lễ và OT ngày lễ ×3. Lịch lễ là dữ liệu chung của cả công ty, do mảng requests thêm và xoá. Seed của mảng này chỉ đọc lịch lễ để bỏ ngày lễ khỏi ngày chấm công.
- **iSAT, nghỉ có làm bù, quyết toán phép dư:** thuộc mảng requests và spec 2. Phiếu chưa có dữ liệu thật cho các khoản này.
- **Chờ giải trình:** ngày còn chờ giải trình phải trả 0 đ và có cờ. Seed không tạo giải trình chờ duyệt cho người `lg-`.
- **BH:** luật ≥ 14 ngày không lương (xem Q1) và trần đóng BH (20 × lương cơ sở) chưa có ở v2. Bậc lương demo đều dưới trần.
- **Vòng đời kỳ lương** (Chốt công, Phê duyệt kỳ, Đã trả, mở lại): nhánh này chưa có code, chỉ có spec của phiên payroll-period. Dải bước của Bảng lương luôn ghi "Đang chấm công".
- **Tham số theo tháng** (settings-store): không test việc đổi bậc hay tham số giữa các tháng.
- **Nhân viên tự nộp tạm ứng** (chỉ ngày 16–17, mỗi tháng một đơn): thuộc mảng requests. Seed ở đây là Admin nộp thay.
- **Giao diện chưa test:**
  - nút Xuất CSV;
  - nút "Phiếu trước / Phiếu sau" trong ngăn kéo;
  - liên kết "Xem từng ngày ›";
  - lịch sử sửa điểm KPI;
  - nút In trong ngăn kéo (gọi `window.print`).
