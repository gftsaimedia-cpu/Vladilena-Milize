# Phiếu lương A4: dữ liệu BE v2 và sửa "Từ chối" — thiết kế

Ngày: 2026-11-05 · Nhánh `claude/payslip-print-1bf918` (nền `f9e5a32`) · Phân loại: Architectural

## 1. Bối cảnh

- Trang in A4 `/in/phieu-luong/:month[/:username]` (thiết kế 22/10, mẫu `a4-t10-chinh-thuc`, `a4-t11-tam-tinh`) vẫn gọi API v1 nên hỏng ở cả BE thật lẫn mock. Chưa nút nào mở trang này.
- Bấm "Từ chối" phiếu trả 500 trên PostgreSQL: `decidePayslip` ghi `payslips.status = 'rejected'`, nhưng CHECK của cột chỉ có `draft, pending, approved, error`.
- Phiếu v2 thiếu dữ liệu cho bản in:
  - không có loại, bậc, trạng thái nhân sự;
  - `inOutText` ghi cứng `08:00–17:00` / `22:00–06:00`;
  - OT theo ngày luôn 0, còn tổng OT tháng = giờ trên đơn × lương giờ × 2;
  - phép năm còn lại ghi cứng 22.

## 2. Quyết định của người dùng (chat, 2026-11-05)

| # | Câu hỏi | Trả lời |
|---|---------|---------|
| Q1 | Bấm vào dòng / bấm nút In ra gì | Bấm vào dòng mở ngăn kéo; bấm nút In ra bản A4 hai trang |
| Q2 | "In tất cả" ở Bảng lương | Có, in các phiếu đã duyệt |
| Q3 | Nút In in được trạng thái nào | Mọi trạng thái; ô Tình trạng ghi đúng trạng thái |
| Q4 | Lý do khi Từ chối | Có ô lý do, không bắt buộc |
| Q5 | Cột Vào – ra | Giờ chấm thật |
| Q6 | OT theo ngày | Làm luôn luật 04/11 ở phiên này |
| Q7 | Làm tròn giờ OT | Đúng theo phút, không làm tròn |
| Q8 | Ngày OT thiếu giờ chấm | Nhân viên giải trình; OT theo giờ ra ghi trong giải trình đã duyệt |
| Q9 | Phép năm còn lại | Tới hết tháng của phiếu |
| Q10 | Hướng làm | Hướng 1: BE tính sẵn mọi số vào phiếu; FE chỉ trình bày |
| Q11 | Phần FE | **Không sửa FE.** Yêu cầu FE soạn riêng trong một thư mục, đặt tên theo trang và chức năng, để giao cho agent thiết kế |

Luật OT ngày 04/11 (đã chốt từ trước): OT trả theo giờ làm thật, tối đa bằng khung trên đơn đã duyệt. Hệ số ×1,5 ngày thường, ×2 thứ Bảy và Chủ nhật (với mọi loại nhân sự), ×3 ngày lễ.

## 3. Phạm vi

**Trong phạm vi (BE + tài liệu):**
- Sửa CHECK; phiếu có lý do quyết định.
- Thêm loại, bậc, trạng thái nhân sự vào phiếu.
- Giờ vào/ra thật trên dòng ngày.
- OT theo luật 04/11 tính từng ngày, tổng tháng cộng từ các ngày.
- Phép năm còn lại.
- Cập nhật hợp đồng API.
- Năm file yêu cầu FE.

**Ngoài phạm vi (chỉ ghi lại, không sửa):**
- Sửa mã FE, mock FE, test UI mới: do agent FE làm theo §6.
- Lương ngày theo giải trình (ngày chưa giải trình 0 đ, được duyệt đủ ngày): thuộc việc ngày công chung.
- Dòng công Chủ nhật đang được tính là ngày làm; ngày nghỉ đã duyệt chưa vào bảng công: chờ quyết định chung.
- OT gắn với ca đêm (chưa có luật riêng); hệ số OT trong cài đặt (nếu phiên settings-store làm thì nối vào hằng số ở §4.4).
- Ngày trả lương; khi nào phiếu là "Chính thức"; sửa tay phiếu, khoản cộng/trừ thêm.

## 4. Thiết kế BE

### 4.1 Lỗi "Từ chối"

- `migrations/postgres/schema.sql`: CHECK của `payslips.status` thành `('draft','pending','approved','rejected','error')`. Sửa thẳng file, không thêm file đánh số.
- `PayslipRecord` (đọc qua `readPayslipRow`) có thêm:
  - `note: string | null`;
  - `decidedBy: string | null`;
  - `decidedAt: string | null`.
- Body `POST /api/v2/payroll/:month/:username/decision` giữ nguyên `{ decision: 'approve' | 'reject', note?: string }`. `note` trống hoặc toàn khoảng trắng thì lưu `null`.
- Test pg: từ chối kèm lý do. Trước khi sửa phải đỏ (vi phạm CHECK), sau khi sửa phải xanh và đọc lại đúng `status`, `note`, `decidedBy`.

### 4.2 Đầu phiếu

`EmployeePayslipDTO` (trong `details`) thêm:

| Trường | Kiểu | Nguồn |
|--------|------|-------|
| `employeeType` | `string \| null` | `staff.type` (`nv`, `ctv`, `tts`) |
| `level` | `number` | `staff.level` (mặc định 1) |
| `employmentStatus` | `'probation' \| 'official' \| null` | `staff.contract_status` |

`contractStatusText` giữ nguyên nghĩa: nhãn hợp đồng "HĐLĐ từ 3 tháng" / "Dưới 3 tháng".

### 4.3 Giờ vào/ra

- Mỗi dòng ngày (`DailyAttendanceLineProps`) thêm `checkIn` và `checkOut`, dạng `'HH:MM'` theo giờ Việt Nam (UTC+7), hoặc `null`.
- Nguồn: `timesheet_entries.actual_check_in/out`. Bên nào thiếu thì lấy `actual_check_in/out` của đơn `EXPLANATION` đã duyệt có `explanation_date` = ngày đó. Giờ giải trình chỉ lấp chỗ thiếu, không đè giờ chấm.
- `inOutText` của dòng có đi làm (ca Normal, Flex, Night) = `checkIn ?? '—'` + `–` + `checkOut ?? '—'`. Ví dụ `08:12–17:05`, `08:12–—`.
- Dòng nghỉ (`LEAVE`, `ISAT`, `UNPAID`) giữ chữ như cũ, ví dụ "Hưởng lương ngày".

### 4.4 OT theo luật 04/11

Đầu vào:
- các đơn `OVERTIME` đã duyệt trong tháng: `ot_date`, `ot_start_time`, `ot_end_time`;
- ngày lễ của tháng lấy từ `company_holidays`;
- khoảng có mặt của từng dòng công: `[vào, ra]` theo §4.3, kể cả giờ lấy từ giải trình. Dòng phải có đủ cả giờ vào lẫn giờ ra mới có khoảng có mặt.

Cách tính:
1. Khung OT của mỗi đơn là `[ot_date ot_start_time, ot_date ot_end_time]`, giờ Việt Nam.
2. Giờ OT của khung = tổng phần giao giữa khung và các khoảng có mặt, tính theo phút rồi chia 60, không làm tròn. Khoảng 1 giờ giữa ca và OT tự nhiên không được tính vì nằm ngoài khung.
3. Hệ số theo `ot_date`:
   - có trong `company_holidays` → 3;
   - thứ Bảy hoặc Chủ nhật → 2;
   - còn lại → 1,5.
   Ba số này để trong một hằng số duy nhất của domain, `OT_MULTIPLIERS`.
4. Gắn OT vào dòng công có `work_date = ot_date`. Không có dòng đó thì gắn vào dòng đầu tiên có khoảng có mặt giao với khung. Không dòng nào giao thì OT = 0, không tạo dòng mới.
5. Dòng ngày:
   - `otHours` = tổng giờ OT của dòng;
   - `otPay = round(otHours × lương giờ × hệ số)`;
   - `dailyTotal` cộng thêm `otPay`.
6. Tổng tháng:
   - `ot15Hours`, `ot20Hours`, `ot30Hours` = tổng giờ theo hệ số;
   - `totalOtHours` = tổng giờ;
   - `otPayTotal` = tổng `otPay` các dòng, nên trang 1 cộng ra đúng trang 2.
   - Phần OT miễn thuế giữ công thức hiện có, tính trên giờ theo từng hệ số.
7. Cột `ot_hours` của đơn và của `timesheet_entries` không còn dùng để tính tiền.

Ví dụ (nv bậc 1, lương giờ 28.846, ca 08–17, đơn OT thứ Tư 07/10 18:00–20:00):

| Giờ ra | Giờ OT | Tiền |
|--------|--------|------|
| 19:20 (chấm) | 1,33 | 57.692 |
| 20:30 | 2 | 86.538 |
| thiếu; giải trình đã duyệt ghi 19:20 | 1,33 | 57.692 |
| thiếu; không có giải trình đã duyệt | 0 | 0 |

Cùng khung 18:00–20:00 ra lúc 20:30 vào thứ Bảy 10/10 → 2 × 28.846 × 2 = 115.385. Vào 02/09 (ngày lễ) → ×3.

### 4.5 Phép năm còn lại

- Loại nhân sự có phúc lợi `leaveAccount` (trong phiên bản chức vụ đang hiệu lực):
  `remainingAnnualLeaveDays = (staff.leave_balance ?? 0) − số ngày Phép năm đã duyệt`.
- Số ngày Phép năm đã duyệt = số dòng `day_status` có:
  - cùng nhân sự, `status = 'LEAVE'`;
  - đơn tương ứng là `LEAVE`, `leave_type = 'ANNUAL'`, `status = 'APPROVED'`;
  - `work_date` từ `leave_balance_on` (bỏ qua mốc này nếu `NULL`) tới ngày cuối của tháng phiếu.
- Loại không có `leaveAccount` → `null`.
- Ví dụ: số dư 12, mốc 01/10; đã duyệt 20–21/10 và 05/11; đang chờ 27/10. Phiếu tháng 10 → 10; phiếu tháng 11 → 9.

### 4.6 Phiếu đã lưu trước khi sửa

Ảnh chụp cũ thiếu trường mới; FE hiện "—". Bấm Tính lương lại thì ảnh chụp mới có đủ. Không đổi dữ liệu cũ.

## 5. Hợp đồng API

`docs/api/v2-contract.md`:
- thêm các trường của §4.1–§4.5;
- thêm mục `POST /api/v2/payroll/:month/:username/decision` (body, lỗi `400 INVALID_DECISION`, `404 PAYSLIP_NOT_FOUND`, `409 PAYROLL_FINALIZED`);
- ghi cách tính OT mới.

## 6. Yêu cầu FE: thư mục `docs/fe-yeu-cau/`

Mỗi file tên `<trang>--<chức-năng>.md`, chỉ ghi điều cần thiết: hành vi đã chốt, trường BE, chỗ mã phải đổi hoặc xoá, cách kiểm.

| File | Nội dung chính |
|------|----------------|
| `in-phieu-luong-a4--noi-api-v2.md` | Trang in đọc `GET /payroll/:month/:id` (một phiếu) và `GET /payroll/:month` lọc `approved` (in tất cả). Ánh xạ trường v2 vào từng ô A4. Nhãn ca dùng `shiftLabel` của BE. Ô Tình trạng: Nháp / Đã duyệt / Bị từ chối; phiếu nháp có dòng "bản nháp, chưa phải lương chính thức". Mock cần phiếu dạng v2. Bỏ `?kb`/`?ten`. Xoá phần v1 chết: trong `services/payslip.ts` là `loadSlip`, `getPayslip`, `getSlipOverride`, `saveSlipOverride`, `getPrintBatch`, `approvedRows`, `decide`, `approvePayslip`, `returnPayslip`; xoá cả `builders/payslip/drawer.ts`. Sửa hai mục A4 ở `/thiet-ke`. |
| `phieu-luong-ngan-keo--nut-in.md` | Nút In mở tab mới `/in/phieu-luong/:month/:id?in=1`, in được mọi trạng thái. Bỏ CSS in ngăn kéo. Sửa test `print calls the browser dialog…`. |
| `phieu-luong-ngan-keo--tu-choi-ly-do.md` | Bấm Từ chối thì hiện ô "Lý do từ chối (không bắt buộc)", nút "Xác nhận từ chối" và "Huỷ". Gửi `note`. Dòng trạng thái hiện lý do nếu có. |
| `phieu-luong-ngan-keo--loai-bac-trang-thai.md` | `payslipFromRecord` đang ghi cứng `kind: 'NV'`, `level: 0`; đổi sang `employeeType`, `level`, `employmentStatus`. Phép còn lại `null` → "—". |
| `bang-luong--in-tat-ca.md` | Nút "In tất cả" mở `/in/phieu-luong/:month?in=1`, chỉ in phiếu đã duyệt. Nút bị khoá khi số phiếu đã duyệt = 0. |

## 7. Kiểm thử và xác minh

- TDD cho mọi thay đổi BE, viết test đỏ trước.
- Test thường (không DB), gồm `test/v2/payroll*.test.ts` và file mới nếu cần:
  - OT: một khung, nhiều khung, OT buổi sáng, ×1,5 / ×2 / ×3;
  - thiếu giờ ra: có giải trình đã duyệt / không có;
  - không có dòng công; tổng tháng = tổng các dòng; `dailyTotal` có `otPay`;
  - `checkIn` / `checkOut` / `inOutText`;
  - phép còn lại, có và không có `leaveAccount`;
  - `employeeType` / `level` / `employmentStatus`;
  - `readPayslipRow` trả `note` / `decidedBy` / `decidedAt`.
- Test pg (`test/v2/payroll-repository.pg.test.ts`):
  - từ chối kèm lý do: đỏ rồi xanh;
  - đọc `company_holidays`;
  - đọc `day_status` của Phép năm đã duyệt;
  - đọc giờ trong giải trình;
  - giờ chấm `TIMESTAMPTZ` ra giờ Việt Nam.
- Xác minh cuối:
  - `docker run -d --rm --name luong-test-pg-payslip-print -p 127.0.0.1:55463:5432 -e POSTGRES_HOST_AUTH_METHOD=trust postgres:16`
  - `PG_TEST_URL=postgres://postgres@127.0.0.1:55463/postgres npm test`
  - `PW_PORT=4253 npm --prefix web run test:ui` (FE không đổi; kiểm không hỏng)
  - Xoá container khi xong. Không chạy typecheck, không chạy prettier.

## 8. Rủi ro và lưu ý

- Mô-đun chấm công dựng giờ ca bằng `new Date('…T08:00:00.000Z')`, tức coi giờ ca là UTC. Phiên này đọc giờ chấm như thời điểm thật rồi đổi sang giờ Việt Nam. Nếu dữ liệu chấm đang lệch 7 giờ thì cột Vào–ra sẽ lộ ra; khi đó báo lại, không sửa mô-đun chấm công ở đây.
- Phiên settings-store đã được báo: phiên này nhận phần tách OT ×1,5/×2/×3 trong `payroll.service.ts`. Hai phiên có thể cùng sửa file này; người gộp nhánh cần để ý.
- `main` đã tiến tới `71cdfcc` sau khi nhánh này tách; phiên điều phối lo phần gộp.
