# Nghỉ giữa ca: Yêu cầu kết nối API v2 cho Frontend

Tài liệu đặc tả các thay đổi và màn hình Frontend (FE) cần tích hợp cho tính năng **Nghỉ giữa ca** (`half-shift-leave`) theo Hợp đồng API v2 (`docs/api/v2-contract.md`) và Bản thiết kế (`docs/superpowers/specs/2026-11-06-half-shift-leave-design.md`).

Backend đã hỗ trợ đầy đủ các endpoint, DTO và logic tính toán. Nhánh BE không sửa đổi thư mục `web/`. Tài liệu này bàn giao cho agent FE triển khai giao diện.

---

## 1. Tổng quan tính năng

- **Khái niệm**: Nhân viên làm nửa ca (4 giờ) và nghỉ nửa ca (4 giờ) trên ca làm việc chuẩn 9 giờ (8 giờ làm + 1 giờ nghỉ).
- **Nợ công**: Mỗi đơn nghỉ giữa ca được duyệt làm phát sinh khoản nợ **240 phút** trong tháng.
- **Bù nợ**: Nhân viên đăng ký làm thêm giờ (OT) có mặt thực tế trong tháng để trả nợ. Giờ bù trả theo lương cơ bản (hệ số ×1, không phụ cấp), tính vào thu nhập gộp (`grossIncome`).
- **Nửa công**: Ngày nghỉ giữa ca tính **0,5 công** (hưởng nửa lương ngày), dẫn đến tổng công tháng có thể lẻ (ví dụ `21,5` ngày công).

---

## 2. Form nộp đơn Nghỉ giữa ca (Nhân viên `/me` & Admin)

### 2.1. Nạp ngữ cảnh form (`GET /api/v2/me/request-context`)

Khi mở form nộp đơn của nhân viên, FE gọi `GET /api/v2/me/request-context`:

1. **Hiển thị nút / tab loại đơn**:
   - Kiểm tra `kinds`: tìm phần tử `{ kind: 'half-shift-leave', enabled: boolean, reason?: string }`.
   - Nếu `enabled === false`: khoá lựa chọn loại đơn và hiển thị tooltip / dòng chữ giải thích `reason` (ví dụ: `"Loại nhân sự này chưa dùng được nghỉ giữa ca"`, `"Không còn ngày đăng ký được"`).
   - Nếu `enabled === true`: cho phép chọn loại đơn "Nghỉ giữa ca".

2. **Lựa chọn ngày (`date`)**:
   - Chỉ cho phép nhân viên chọn các ngày nằm trong danh sách `choices['half-shift-leave'].dates`.
   - Các ngày này là ngày làm việc có ca 9 giờ hợp lệ, không bị đơn khác chiếm, và có dữ liệu trong `days[].halfShift !== null`.

3. **Lựa chọn nửa ca (`half`)**:
   - Khi người dùng chọn một ngày `date`, lấy object `halfShift` từ `days.find(d => d.date === date).halfShift`:
     ```json
     {
       "FIRST": {
         "work": { "start": "08:00", "end": "12:00" },
         "leave": { "start": "13:00", "end": "17:00" }
       },
       "SECOND": {
         "work": { "start": "13:00", "end": "17:00" },
         "leave": { "start": "08:00", "end": "12:00" }
       }
     }
     ```
   - Cho người dùng chọn một trong 2 nửa:
     - **Nửa ca đầu (`FIRST`)**: Làm buổi sáng (08:00–12:00), nghỉ buổi chiều (13:00–17:00).
     - **Nửa ca sau (`SECOND`)**: Nghỉ buổi sáng (08:00–12:00), làm buổi chiều (13:00–17:00).
   - Hiển thị rõ khung giờ làm việc và khung giờ nghỉ tương ứng để người dùng xác nhận.

4. **Lý do (`reason`)**:
   - Ô nhập văn bản bắt buộc (không được để trống).

### 2.2. Xem trước đơn (`POST /api/v2/me/requests/half-shift-leave/preview`)

Khi người dùng chọn xong ngày, nửa ca và lý do:
- **Request Body**:
  ```json
  {
    "date": "2026-11-12",
    "half": "FIRST",
    "reason": "Khám bệnh"
  }
  ```
- **Response 200**:
  - Hợp lệ:
    ```json
    {
      "ok": true,
      "title": "Nghỉ nửa ca 12/11: làm 08:00–12:00, nghỉ 13:00–17:00",
      "summary": {
        "date": "2026-11-12",
        "half": "FIRST",
        "work": { "start": "08:00", "end": "12:00" },
        "leave": { "start": "13:00", "end": "17:00" },
        "owedMinutes": 240
      },
      "warnings": []
    }
    ```
  - Bị lỗi: `{ "ok": false, "message": "<câu lỗi>", "code": "DAY_CONFLICT" | "PERIOD_LOCKED" }`. Hiển thị thông báo lỗi tương ứng.

### 2.3. Gửi nộp đơn thật

- Nhân viên tự nộp: `POST /api/v2/me/requests/half-shift-leave` (thân giống xem trước).
- Admin nộp thay: `POST /api/v2/requests/half-shift-leave` với body gửi kèm `employeeId` (uuid hoặc username).
- Phản hồi thành công: mã HTTP **201** với bản ghi đơn có `type = "HALF_SHIFT_LEAVE"`, `halfShiftDate`, `halfShiftHalf`, `halfStartTime`, `halfEndTime`.

---

## 3. Màn hình Chấm công nhân viên (`/me/today` & `/me/attendance`)

- Trong DTO trả về của `/api/v2/me/today` và `/api/v2/me/attendance`:
  - Mỗi ngày có thêm trường `halfShift: 'FIRST' | 'SECOND' | null`.
  - Khung giờ ca làm việc `shift` của ngày đã tự động thu hẹp về khung nửa ca làm việc (ví dụ `08:00–12:00` thay vì `08:00–17:00`).
  - **Giao diện FE**:
    - Khi `halfShift !== null`: hiển thị badge / tag nhãn **"Nửa ca"** (hoặc "Nửa đầu" / "Nửa sau").
    - Giờ làm việc hiển thị đúng khung nửa ca đã chụp.

---

## 4. Màn hình Bảng lương & In phiếu lương A4

### 4.1. Hiển thị ngày công lẻ

- Trong DTO phiếu lương `GET /api/v2/payroll/:month/:employeeId` và danh sách phiếu lương:
  - `totals.workDays` (tổng ngày công thực tế) nay có thể nhận giá trị lẻ (ví dụ: `21,5` hoặc `22,5`).
  - **FE**: Không ép kiểu số nguyên (`Math.round` hay `parseInt`), giữ nguyên số thập phân (1 chữ số lẻ) khi hiển thị tổng công.

### 4.2. Thêm khoản "Bù nghỉ giữa ca"

Trong `details` của phiếu lương có các trường mới:
- `halfShiftOwedMinutes`: Tổng phút nợ nghỉ giữa ca trong tháng (bội số của 240 phút).
- `halfShiftRepaidMinutes`: Tổng phút nợ đã được bù qua các khung làm thêm giờ có mặt thật.
- `halfShiftDroppedMinutes`: Số phút nợ còn lại bị xoá bỏ cuối tháng (nếu không bù hết).
- `halfShiftRepaidPay`: Số tiền công trả bù = `halfShiftRepaidMinutes × đơn giá giờ cơ bản` (hệ số ×1, không phụ cấp).

**Giao diện ngăn kéo Phiếu lương (Drawer) và Phiếu in A4**:
1. Thêm một dòng thu nhập: **"Bù nghỉ giữa ca"**:
   - Số giờ bù: `(halfShiftRepaidMinutes / 60)` giờ (hoặc hiển thị số phút nếu lẻ).
   - Số tiền: định dạng tiền VND từ `details.halfShiftRepaidPay`.
   - Khoản tiền này nằm trong tổng thu nhập gộp (`grossIncome`) và chịu thuế thu nhập cá nhân.
2. Nếu có nợ chưa bù hoặc đã bù:
   - Có thể hiển thị phụ chú nhỏ: "Đã bù X/Y giờ nợ nghỉ giữa ca (bỏ Z giờ cuối kỳ)".

### 4.3. Bảng chi tiết từng ngày (`dailyLines`)

Trong mảng `dailyLines[]`:
- `halfShift`: `'FIRST' | 'SECOND' | null` — đánh dấu dòng nửa ca.
- `repaidMinutes`: Số phút làm thêm trong ngày được tính vào trả nợ (không đưa vào giờ OT ×1,5 / ×2 / ×3).
- **FE**:
  - Dòng nửa ca có `shiftLabel` hiển thị kèm thời gian thực làm 4 giờ.
  - Cột OT: nếu ngày có `repaidMinutes > 0`, hiển thị phần giờ bù riêng bên cạnh giờ OT thật (nếu có).

---

## 5. Luật tương tác giữa Nghỉ giữa ca, Nghỉ có làm bù và OT (FE cần lưu ý)

1. **Trần OT tháng (40 giờ) & Trần ngày (12 giờ)**:
   - Các khung đăng ký để trả nợ nghỉ giữa ca vẫn tính vào trần 40 giờ/tháng và 12 giờ/ngày (ca ngày nghỉ giữa ca vẫn tính đủ 8 giờ ca chuẩn khi xét trần ngày).
2. **Tháng có đơn Nghỉ có làm bù (`leave-with-makeup`)**:
   - Nếu tháng còn nợ nghỉ giữa ca (`halfShiftDebt.remainingMinutes > 0`): nhân viên **vẫn được nộp OT** nhưng tổng giờ OT đăng ký không được vượt quá số nợ còn lại.
   - Nếu đăng ký vượt nợ, server sẽ từ chối: `"Tháng MM có đơn nghỉ có làm bù, chỉ đăng ký OT để trả nợ nghỉ giữa ca (còn N giờ)"`.
   - FE có thể đọc `halfShiftDebt.remainingMinutes` từ `request-context` để giới hạn các mốc giờ kết thúc của form OT.
