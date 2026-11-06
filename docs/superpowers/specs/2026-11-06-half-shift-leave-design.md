# Thiết kế: Nghỉ giữa ca (06/11/2026)

- **Trạng thái:** người dùng đã duyệt spec ngày 06/11/2026 (gồm các quyết định T1–T10). Plan: `docs/superpowers/plans/2026-11-06-half-shift-leave.md`. Chưa có code.
- **Nhánh:** `claude/half-shift-leave`, tách từ `main` bcd5166. Chỉ ở máy, chưa push.
- **Nguồn luật:** câu trả lời của người dùng trong chat ngày 06/11/2026 (mục 1). Đoạn chính sách phụ cấp GFT dán cùng ngày chỉ để tham khảo; luật đã chốt thắng khi hai bên khác nhau. Không dùng `spec/` (v1).
- **Cách đọc:** mục 1 là điều người dùng đã chốt. **Mục 2 là điều tôi tự quyết khi viết spec** vì người dùng chưa nói tới: xin đọc kỹ mục này nhất, hai điểm T1 và T7 là chỗ lệch với bản thiết kế đã duyệt trong chat.

## 1. Quyết định đã chốt (người dùng, chat 06/11/2026)

| # | Chủ đề | Quyết định |
|---|---|---|
| 1 | Nghĩa | Nhân viên chọn **làm nửa ca rồi về**. Ca 08–17: làm 08–12 hoặc làm 13–17. Nửa còn lại (4 giờ = 240 phút) là phần nợ. |
| 2 | Nợ riêng | Nợ của nghỉ giữa ca là một bộ đếm riêng, tách bạch với 480 phút mỗi ngày của nghỉ có làm bù. |
| 3 | Lương | Nửa ca đã làm trả theo giờ. Nửa nợ trả 0 cho tới khi bù. Mỗi phút bù trả theo đơn giá giờ ×1. |
| 4 | Bù là tuỳ chọn | Lúc nộp chưa xếp lịch bù. Hệ thống chỉ ghi "còn 4 giờ cần bù"; bù hay không là chuyện của nhân viên. (Nghỉ có làm bù thì khác: phải đăng ký khung bù ngay khi nộp.) |
| 5 | Bù bằng đơn nào | Dùng form **Làm thêm giờ** đang có. Không có đơn "đăng ký làm bù" riêng cho nghỉ giữa ca. |
| 6 | Bù và OT | Giờ làm thật trong các khung đã duyệt được xếp theo thứ tự ngày: còn nợ thì là **bù** (đơn giá ×1, không phụ cấp, không hệ số); hết nợ thì phần còn lại là **OT thật** (đủ quyền lợi, phụ cấp, hệ số). Ví dụ của người dùng: nợ 4 giờ, thứ 6 làm 3 giờ, thứ 2 làm 3 giờ thì thứ 6 là bù 3 giờ, thứ 2 là bù 1 giờ + OT 2 giờ. |
| 7 | Hạn bù | Chỉ bù trong **tháng** của ngày nghỉ giữa ca. Sang tháng khác thì phần nợ còn lại bỏ; giờ làm tháng sau là OT thật. |
| 8 | Chuyên cần | Mỗi lần nghỉ giữa ca tính **0,5 ngày nghỉ**, bù hay không đều tính. Ngưỡng mất chuyên cần giữ "từ 3 ngày" (`diligenceLostFromDays`, mặc định 3). |
| 9 | Phụ cấp | Tính theo **0,5 công** cho ngày nghỉ giữa ca (đi lại, đêm, chuyên cần). Phụ cấp linh hoạt tính theo giờ làm (4 giờ = một nửa). Giờ bù không có phụ cấp. |
| 10 | Cùng tháng với nghỉ có làm bù | Được cùng tháng. Khi tháng có nghỉ có làm bù (đang chặn OT), form Làm thêm giờ mở **chỉ để trả nợ nửa ca**. |
| 11 | Ai nộp được | Loại nhân sự có **cả** quyền lợi `ot` và `makeup` (hiện là `ctv`, `nv`). `tts` có `makeup` mà không có `ot` nên bị khoá, kèm lý do. Không thêm cờ quyền lợi mới. |
| 12 | Ngày được chọn | Ngày làm việc có ca, từ hôm nay tới hết tháng sau. Không phải Chủ nhật, ngày lễ, Thứ Bảy iSAT, ngày nghỉ tuần. Không giới hạn số lần mỗi tháng. |
| 13 | Xung đột | Đơn nghỉ, nghỉ có làm bù, iSAT, và một đơn nghỉ giữa ca khác trùng ngày thì từ chối (đơn đang chờ cũng chặn). Khung OT và khung bù có sẵn trong ngày **không** chặn. |
| 14 | Đổi ca | Ngày đã có đơn đổi ca vẫn nộp được, hai nửa tính theo ca đã đổi. Đơn đổi ca nộp sau, phủ lên ngày có nghỉ giữa ca, thì bỏ ngày đó khỏi đơn đổi ca kèm cảnh báo. |
| 15 | Ngày lễ | Ngày lễ thắng đơn chờ duyệt: Admin chỉ còn từ chối. |
| 16 | Duyệt, huỷ | Admin duyệt hoặc từ chối. Nhân viên chỉ huỷ khi đơn còn chờ. Duyệt thì nợ 240 phút bắt đầu tính. |
| 17 | Cách làm | "Cách A": loại đơn mới, bộ đếm nợ riêng (không dùng lại nghỉ có làm bù, không coi là ca ngắn). |

## 2. Điều tôi tự quyết khi viết spec

Mỗi điểm ghi lý do và cái giá nếu sai. Xin duyệt hoặc sửa.

| # | Quyết định | Lý do | Nếu sai |
|---|---|---|---|
| T1 | **Không thêm cột `repaid_minutes`** (bản thiết kế phần 2 có nêu cột này). Phần bù được tính lúc tính lương và lúc đọc nợ, từ khung OT đã duyệt + chấm công thật. | OT hiện đã được đo đúng lúc tính lương (`measureOvertime` trong `payroll.service.ts`) chứ không lưu vào dòng ngày. Xếp bù/OT theo thứ tự ngày cần dữ liệu nhiều ngày, còn dòng ngày chỉ được ghi lại cho từng ngày bị chạm; lưu sẽ phải ghi lại mọi ngày OT sau ngày nghỉ mỗi khi đơn hay chấm công đổi, dễ lệch. | Dòng ngày không hiện sẵn "đã bù bao nhiêu"; phiếu lương vẫn hiện (mục 10). Thêm cột sau cũng được. |
| T2 | **Dòng ngày nửa ca ghi khung nửa ca làm** vào `shift_start_time`/`shift_end_time` (08:00–12:00), kèm cột mới `half_shift` (`FIRST`/`SECOND`). | Mọi nơi đọc "ca của ngày" (màn Hôm nay, tổng quan, phiếu lương) tự thấy khung đúng, không phải sửa từng nơi. | Nơi nào cần ca đầy đủ của ngày phải suy ra từ ca mặc định. Hiện chưa thấy nơi nào cần. |
| T3 | **Ca không dài đúng 9 giờ (4 làm + 1 nghỉ + 4 làm) thì không nộp được** nghỉ giữa ca. Cả 6 ca trong catalog hiện đều 9 giờ. | Luật "làm 4 giờ nghỉ 1 giờ" (`time-window.ts`) chỉ chia được hai nửa 4 giờ khi ca dài 9 giờ. | Nhân sự có ca tuỳ chỉnh khác 9 giờ thấy loại này bị khoá cho ngày đó. |
| T4 | **Vắng cả ngày thì không nợ.** Dòng `ABSENT` của ngày có đơn nghỉ giữa ca đã duyệt: tính là vắng 1 ngày (cho chuyên cần), 0 đồng, không sinh nợ 240 phút. Dòng `PRESENT`/`PENDING` thì có nợ. | Nửa nợ chỉ có nghĩa khi nửa đã làm được trả. Vắng cả ngày mà vẫn bù ×1 thì rẻ hơn OT thật, vô lý. | Người vắng mà muốn "bù" thì giờ làm thêm của họ là OT thật. |
| T5 | **Hai trần OT (12 giờ/ngày; 40 giờ/tháng) tính mọi khung đã đăng ký, gồm cả khung dùng để trả nợ.** | Đơn chỉ là một loại; lúc đăng ký chưa biết khung nào sẽ thành bù hay OT. | Người nợ 4 giờ mà đã đăng ký 38 giờ OT thì chỉ đăng ký thêm được 2 giờ. |
| T6 | **Trong tháng có nghỉ có làm bù, OT được đăng ký tới đúng số nợ nửa ca còn lại** (mục 7.3). | Cách làm cho luật 10 chạy được mà không cần biết trước khung nào sẽ được chấm công. | Xem 7.3. |
| T7 | **Không thêm mã nhật ký mới.** Duyệt, từ chối, huỷ dùng lại `request.decide` / `request.cancel` như mọi loại đơn. | Hai mã này đã chứa mã đơn và loại đơn; thêm mã chỉ buộc FE sửa nhãn. | Bản thiết kế phần 1 có nói "mã nhật ký riêng"; bỏ ý đó. |
| T8 | **Ngày nghỉ giữa ca đã duyệt mà sau đó thành ngày lễ**: nợ của ngày đó bỏ (ngày lễ thắng). | Cùng luật với đơn nghỉ gặp ngày lễ (người dùng chốt 05/11). | Hiếm; nếu nợ vẫn giữ thì lương sai nhẹ. |
| T9 | **Loại `half-shift-leave` luôn có mặt trong `request-context.kinds`** của nhân viên, `enabled: false` kèm lý do khi thiếu quyền lợi (khác các loại khác, vốn bị bỏ khỏi danh sách). | Người dùng muốn `tts` "thấy loại này bị khoá và biết vì sao". | FE tự quyết có hiện loại bị khoá hay không. |
| T10 | **Có cả route Admin nộp thay** như mọi loại đơn hiện có. | Giữ đúng mẫu các loại khác; Admin không bị giới hạn khoảng ngày như nhân viên tự nộp. | Nếu không cần thì bỏ một route. |

## 3. Phạm vi

**Trong phạm vi (BE):**
- Loại đơn mới `HALF_SHIFT_LEAVE`: nộp (Admin và nhân viên), xem trước, duyệt, từ chối, huỷ.
- Dòng ngày công và phiếu lương theo nửa công.
- Nợ nửa ca và việc xếp giờ làm thêm thành bù hoặc OT.
- Cập nhật `request-context`, kỳ lương, tổng quan, hợp đồng API `docs/api/v2-contract.md`.
- Bản yêu cầu cho FE trong `docs/fe-yeu-cau/` (không làm màn hình).

**Ngoài phạm vi:**
- Màn hình FE. Nối FE vào BE thật làm ở phiên nối riêng.
- Đổi luật mất chuyên cần, khung đêm của chính sách, điều kiện "đã nộp đơn nghỉ việc" (chưa quyết).
- Câu hỏi "từ khi nào ca mặc định mới áp dụng" (FP2 Q6, chưa quyết).
- Trả nợ bằng khung làm bù của nghỉ có làm bù (hai bộ đếm tách bạch, người dùng yêu cầu).
- Thuế phần OT được miễn (D3, chưa quyết): giữ nguyên hành vi hiện tại.

## 4. Luật nửa ca

### 4.1. Hai nửa của mỗi ca

Ca dài 9 giờ chia thành làm 4 giờ, nghỉ 1 giờ, làm 4 giờ. `half` là nửa nhân viên **làm**; nửa còn lại là nửa nghỉ (nợ).

| Ca | `FIRST` (làm / nghỉ) | `SECOND` (làm / nghỉ) |
|---|---|---|
| Normal1 08–17 | làm 08–12, nghỉ 13–17 | làm 13–17, nghỉ 08–12 |
| Normal2 10–19 | làm 10–14, nghỉ 15–19 | làm 15–19, nghỉ 10–14 |
| Flex1 06–15 | làm 06–10, nghỉ 11–15 | làm 11–15, nghỉ 06–10 |
| Flex2 13–22 | làm 13–17, nghỉ 18–22 | làm 18–22, nghỉ 13–17 |
| Night1 22–07 | làm 22–02, nghỉ 03–07 | làm 03–07, nghỉ 22–02 |
| Night2 21–06 | làm 21–01, nghỉ 02–06 | làm 02–06, nghỉ 21–01 |

Giờ qua nửa đêm theo quy ước cũ: giờ kết thúc nhỏ hơn hoặc bằng giờ bắt đầu là ngày hôm sau. Chỉ ca 08–17 là người dùng đã nêu; năm ca còn lại tôi suy ra bằng cùng luật, xin xem lại.

Hàm thuần `halvesOf(shift)` trả hai nửa, hoặc `null` khi ca không dài đúng 540 phút (T3). Đặt ở `src/common/half-shift.ts` để đơn từ, chấm công và lương cùng dùng.

### 4.2. Số liệu mẫu

Bình: lương cơ bản 6.000.000, công chuẩn 26. Một ngày công = 230.769; một giờ = 28.846,15. Tỉ lệ phụ cấp dưới đây là giả định (đi lại 15%, chuyên cần 25%, linh hoạt 20%, đêm 40%/60%); test sẽ lấy tỉ lệ thật từ `allowance-rates.ts` và nếu khác thì số tiền khác theo.

| Khoản | Công thức | Số tiền |
|---|---|---|
| Lương nửa ca (4 giờ) | 6.000.000 × 0,5 ÷ 26 | **115.385** |
| Phụ cấp đi lại | 900.000 × 0,5 ÷ 26 | **17.308** |
| Chuyên cần (khi chưa mất) | 1.500.000 × 0,5 ÷ 26 | **28.846** |
| Phụ cấp linh hoạt (ca Flex) | 1.200.000 × 4 ÷ (26 × 8) | **23.077** |
| Phụ cấp đêm 40% (ca Night) | 2.400.000 × 0,5 ÷ 26 | **46.154** (60%: **69.231**) |
| Bù 4 giờ (×1) | 6.000.000 × 4 ÷ (26 × 8) | **115.385** |
| Bù 3 giờ (×1) | 6.000.000 × 3 ÷ (26 × 8) | **86.538** |
| OT thật 2 giờ ngày thường (×1,5) | 6.000.000 × 2 × 1,5 ÷ (26 × 8) | **86.538** |

Ví dụ nợ (tháng 11/2026): nửa ca được duyệt thứ 5 (12/11), nợ 240 phút. Thứ 6 (13/11) làm 3 giờ, thứ 2 (16/11) làm 3 giờ, cả hai khung đã được duyệt và có mặt đủ.
- Thứ 6: 180 phút bù.
- Thứ 2: 60 phút bù + 120 phút OT thật.
- Tiền: bù 240 phút = 115.385; OT 2 giờ = 86.538.

Nếu chỉ có thứ 2 làm 3 giờ: 180 phút bù (86.538), còn 60 phút nợ bị bỏ cuối tháng.

## 5. Dữ liệu (chỉ sửa `migrations/postgres/schema.sql` và `src/database/schema.ts`)

Một file lược đồ, không file đánh số. DB dev/demo phải **tạo lại** (mục 13).

```
system_requests
  type CHECK             + 'HALF_SHIFT_LEAVE'
  half_shift_date  DATE           -- ngày nghỉ giữa ca
  half_shift_half  TEXT CHECK (half_shift_half IS NULL OR half_shift_half IN ('FIRST','SECOND'))
  half_start_time  TEXT           -- 'HH:mm' đầu nửa ca LÀM, chụp lúc nộp
  half_end_time    TEXT           -- 'HH:mm' cuối nửa ca LÀM

day_status
  status CHECK           + 'HALF_SHIFT'

timesheet_entries
  half_shift       TEXT CHECK (half_shift IS NULL OR half_shift IN ('FIRST','SECOND'))
  pay_units        cho phép 0, 0.5, 1   -- hiện chỉ 0|1; kiểu cột và CHECK hiện tại kiểm lại khi lập plan
```

- `work_units` đang bằng `pay_units` trong `attendance-days.repository.ts`: giữ quan hệ này.
- `makeup_slots` và `makeup_minutes` không đổi: nợ nửa ca không dùng chúng (luật 2).
- Khung nửa ca được **chụp** lúc nộp (như iSAT chụp ca). Dòng ngày dựng từ khung chụp này.

Kiểu TS: `RequestType` thêm `'HALF_SHIFT_LEAVE'`; trạng thái giữ ngày thêm `'HALF_SHIFT'`; loại đơn nộp thêm `'HALF_SHIFT_LEAVE'`; `AttendanceDay.payUnits: 0 | 0.5 | 1` và `halfShift: 'FIRST' | 'SECOND' | null`.

## 6. API

### 6.1. Route

| Route | Ai | Ghi chú |
|---|---|---|
| `POST /api/v2/requests/half-shift-leave` | Admin nộp thay (`requests.review`) | Thân có `employeeId` (T10). |
| `POST /api/v2/me/requests/half-shift-leave` | Nhân viên | Áp luật tự nộp (`filedBy: 'self'`). |
| `POST /api/v2/me/requests/half-shift-leave/preview` | Nhân viên | Cùng cổng kỳ, cùng khoá, không ghi. |
| `PATCH /api/v2/requests/:id/review`, `PATCH /api/v2/requests/:id/cancel` | như cũ | Không đổi route. |

Tên route `me` đặt theo cách các loại khác đang đặt (bảng CREATE trong `me.controller.ts`); kiểm lại khi lập plan.

Thân nộp:

```json
{ "date": "2026-11-12", "half": "FIRST", "reason": "Việc gia đình" }
```

- `half`: nửa nhân viên **làm**. Ngoài `FIRST` và `SECOND` thì từ chối.
- `reason`: bắt buộc, như đơn nghỉ.
- Tiêu đề do server đặt, `title` client gửi không đọc: `Nghỉ giữa ca 12/11, làm 08–12h` (thêm kiểu `'half-shift-leave'` vào hàm đặt tiêu đề).

Đơn trả về (`SystemRequestDTO`) thêm: `halfShiftDate`, `halfShift` (`FIRST`/`SECOND`/null), `halfShiftWork` (`{ "start": "08:00", "end": "12:00" }` hoặc null), `halfShiftLeave` (nửa nghỉ, `{ "start": "13:00", "end": "17:00" }` hoặc null). `owedMinutes` bằng **240** với loại này (hiện là 480 × số ngày với nghỉ có làm bù, null với loại khác). `dates` là `[halfShiftDate]`.

Xem trước, `summary`: `{ "date": "2026-11-12", "half": "FIRST", "work": {...}, "leave": {...}, "owedMinutes": 240 }`. Lỗi trả như các loại khác (`PERIOD_LOCKED`, `DAY_CONFLICT`, `NOT_EMPLOYED`).

### 6.2. `GET /api/v2/me/request-context` thêm

- `kinds`: phần tử `{ "kind": "half-shift-leave", "enabled": true }` luôn có (T9). Khoá khi:
  - thiếu `ot` hoặc `makeup`: lý do "Loại nhân sự này chưa dùng được nghỉ giữa ca";
  - mọi tháng trong khoảng đã chốt hoặc không còn ngày chọn được: "Không còn ngày đăng ký được".
- `days[]`: thêm `halfShift`: `null` khi ngày không chọn được (không phải ngày làm, có đơn giữ ngày, ca không 9 giờ, tháng đã chốt); ngược lại `{ "FIRST": { "work": {...}, "leave": {...} }, "SECOND": { ... } }`. Trạng thái giữ ngày hiện ra có thêm giá trị `HALF_SHIFT`.
- `choices`: thêm `"half-shift-leave": { "dates": ["2026-11-12", ...] }` (ngày có `halfShift` khác null).
- `months[]`: thêm `halfShiftDebt: { owedMinutes, registeredMinutes, remainingMinutes }`:
  - `owedMinutes` = 240 × số đơn nghỉ giữa ca đã duyệt của tháng (trừ ngày lễ, T8);
  - `registeredMinutes` = phút làm của khung OT (chờ + đã duyệt) được xếp vào trả nợ (mục 8);
  - `remainingMinutes` = `owedMinutes` − `registeredMinutes`.
- `months[].hasOvertime` đổi nghĩa: **có OT thật** (khung đăng ký ngoài phần xếp vào trả nợ). Với tháng không có nợ nửa ca, nghĩa không đổi.
- `rules`: thêm `halfShiftOwedMinutes: 240`.
- Với tháng có nghỉ có làm bù và còn nợ (T6): loại `overtime` mở; chỉ nhận khung có số phút làm thực không vượt `remainingMinutes`, server kiểm lại khi nộp.

### 6.3. Lỗi

Mã lỗi và mã HTTP theo đúng quy ước các loại đơn đang dùng (lỗi nghiệp vụ lúc nộp, xung đột ngày lúc nộp, xung đột lúc duyệt, `PERIOD_LOCKED`); không đặt mã mới. Câu lỗi mới:
- "Loại nhân sự này không dùng được nghỉ giữa ca" (thiếu `ot` hoặc `makeup`).
- "Ngày dd/mm không phải ngày làm việc".
- "Ca của ngày dd/mm không chia được thành hai nửa 4 giờ".
- "Nửa ca không hợp lệ: …".
- Xung đột ngày: "Ngày dd/mm đã có đơn nghỉ giữa ca" và các câu trong ma trận 7.2.
- Duyệt: "Ngày dd/mm đã thành ngày lễ, đơn nghỉ giữa ca không duyệt được. Chỉ có thể từ chối đơn này."

## 7. Nộp đơn

### 7.1. Thứ tự kiểm tra (trong `fileRequest`, như các loại khác)

1. **Cổng kỳ** `PERIOD_LOCKED` trên ngày client gửi, trước mọi luật khác.
2. Đọc dữ liệu vào: `date` hợp lệ, `half` hợp lệ, `reason` không rỗng.
3. Tự nộp: `date` trong khoảng hôm nay tới hết tháng sau. Admin nộp thay không bị giới hạn này.
4. Tìm nhân sự; kiểm đang làm việc (`NOT_EMPLOYED`); có cấu hình loại nhân sự.
5. Quyền lợi: cả `benefits.ot` và `benefits.makeup`, nếu không "Loại nhân sự này không dùng được nghỉ giữa ca".
6. Trong khoá nhân sự (`requests_<uuid>`): ngày làm việc, có ca, và `halvesOf(ca)` khác null (T3).
7. `planClaims` theo ma trận 7.2.
8. Tạo đơn, chụp khung nửa ca, giữ ngày bằng dòng `day_status` trạng thái `HALF_SHIFT`.

Không giới hạn số lần trong tháng. Khung OT và khung bù đã có trong ngày không chặn.

### 7.2. Ma trận ngày (thêm vào `day-status.ts`)

| Dòng `day_status` đang giữ ngày | Nộp **nghỉ giữa ca** | Nộp loại khác lên ngày có dòng `HALF_SHIFT` |
|---|---|---|
| không có | nhận | — |
| `LEAVE` / `LEAVE_WITH_MAKEUP` | chặn "Ngày dd/mm đã có đơn nghỉ" | nghỉ, nghỉ có làm bù: chặn "Ngày dd/mm đã có đơn nghỉ giữa ca" |
| `SHIFT_CHANGE` | nhận, **thay** dòng đổi ca đúng ngày đó (cơ chế `base_request_id` như nghỉ/iSAT thay đổi ca) | đổi ca: **bỏ ngày đó** khỏi đơn kèm cảnh báo "Ngày dd/mm đã có đơn nghỉ giữa ca, giữ nguyên, không đổi ca." |
| `ISAT` | chặn (chờ duyệt: "huỷ đơn iSAT hoặc chọn ngày khác"; đã duyệt: "không chọn được ngày này") | iSAT: chặn "Thứ Bảy dd/mm đã có đơn nghỉ giữa ca" |
| `HALF_SHIFT` | chặn "Ngày dd/mm đã có đơn nghỉ giữa ca" | OT, khung bù, giải trình: nhận (không đổi) |

Ngày lễ không phải ngày làm việc nên bước 6 đã từ chối trước khi tới ma trận.

Khi nửa ca thay dòng đổi ca:
- `EmployeeDays.shiftChangeOn` đọc cả dòng `HALF_SHIFT` có `baseRequestId`, để ca đã đổi vẫn áp cho ngày đó;
- duyệt đơn đổi ca (đánh dấu lịch làm việc) ghi lịch cả cho ngày có dòng `HALF_SHIFT` mang `baseRequestId` là đơn đó;
- trả ngày (khi từ chối/huỷ nửa ca) trả lại dòng đổi ca và ghi lại lịch nếu đơn gốc đã duyệt: cơ chế chung đã có cho nghỉ/iSAT.

### 7.3. Tháng có nghỉ có làm bù (luật 10, T6)

Hai luật loại trừ hiện có đổi nghĩa từ "có đơn OT" thành "có **OT thật**":
- Nộp nghỉ có làm bù: báo lỗi chỉ khi tháng có OT thật.
- Nộp OT trong tháng có nghỉ có làm bù: nhận khi sau khi thêm khung này **không còn OT thật** trong tháng.

"OT thật" = phần khung đăng ký (đơn OT chờ + đã duyệt) không bị nợ nửa ca nuốt, xếp bằng cùng hàm với lúc tính lương (mục 8) nhưng trên phút **đăng ký** (`workMinutes(start, end)`) thay vì phút có mặt:
- nợ = các đơn nghỉ giữa ca **đã duyệt** của tháng (đơn chờ chưa tính), mỗi đơn 240 phút từ ngày của đơn;
- xét khung theo ngày rồi giờ bắt đầu; khung trước ngày nghỉ giữa ca không trả được nợ của ngày đó.

Hệ quả:
- Người nợ 240 phút đăng ký khung làm 4 giờ thì tháng không có OT thật, nên vẫn nộp được nghỉ có làm bù; đăng ký thêm khung nữa thì có OT thật và nghỉ có làm bù bị chặn bằng câu lỗi cũ ("Tháng 11 đã có đơn OT, không nộp đơn nghỉ có làm bù được").
- Trong tháng có nghỉ có làm bù mà không còn nợ, OT bị chặn như cũ ("Tháng 11 đã có đơn nghỉ có làm bù, không đăng ký OT được"). Còn nợ thì câu lỗi khi vượt là "Tháng 11 có đơn nghỉ có làm bù, chỉ đăng ký OT để trả nợ nghỉ giữa ca (còn N giờ)".

Đơn nghỉ giữa ca đã duyệt không rút lại được (chỉ huỷ khi chờ), nên khung đã nhận không thể bỗng thành OT thật vì nợ biến mất, trừ khi ngày đó thành ngày lễ về sau (T8).

## 8. Nợ và xếp bù/OT

Hàm thuần `allocateHalfShiftDebt(events, pieces)` ở `src/common/half-shift.ts`:

```ts
interface DebtEvent { date: string; minutes: number }                 // 240 mỗi đơn nghỉ giữa ca đã duyệt
interface WorkPiece { date: string; start: string; minutes: number }  // một khung OT (đã đo hoặc đã đăng ký)
interface PieceSplit { repaid: number; ot: number }                   // phút, repaid + ot = minutes
function allocateHalfShiftDebt(events: DebtEvent[], pieces: WorkPiece[]): PieceSplit[]  // cùng thứ tự `pieces`
```

- `pieces` xét theo (ngày, giờ bắt đầu) tăng dần. Mọi `date` cùng một tháng; người gọi tách theo tháng.
- Với mỗi piece, nợ khả dụng = tổng `minutes` của các `events` có `date` ≤ ngày của piece, trừ phần đã trả. `repaid = min(khả dụng, minutes)`, `ot = minutes − repaid`.
- Khung cùng ngày với đơn nghỉ giữa ca (nằm sau ca, cách ca ≥ 1 giờ) tính được.
- Nợ không dùng hết cuối tháng thì bỏ.

Nguồn dữ liệu:
- **Lúc tính lương:** `events` = đơn nghỉ giữa ca đã duyệt có `half_shift_date` trong tháng, bỏ ngày lễ (T8), bỏ ngày mà dòng ngày là `ABSENT` (T4). `pieces` = các phần `OtShare` của `measureOvertime` (phút có mặt thật trong khung OT đã duyệt). `OtShare` hiện chưa có giờ bắt đầu: thêm trường `start` ('HH:mm' của khung) để xếp thứ tự.
- **Lúc đăng ký và dựng form:** `events` = đơn đã duyệt (chưa biết ai sẽ vắng), `pieces` = khung OT chờ + đã duyệt, phút = `workMinutes`.

## 9. Dòng ngày công (`attendance-day.ts`)

Nguồn mới `DayFacts.halfShift: { half, start, end, requestId } | null`, đọc từ đơn nghỉ giữa ca **đã duyệt** của ngày (trong `attendance-days.repository.ts`, thêm một hàm tải cạnh phần tải khung OT).

`buildDay`: các bước đầu (ngoài thời gian làm, ngày lễ, lịch nghỉ đã duyệt, ngoài tuần làm) **giữ nguyên** và thắng; `halfShift` chỉ có tác dụng ở nhánh ngày làm:
- `row.shift` = loại ca và phụ cấp lấy từ ca của ngày (đã tính đổi ca), nhưng **giờ** là khung nửa ca làm (T2). `row.halfShift` = `FIRST`/`SECOND`.
- Dò trường hợp (`detectCases`) so với khung nửa ca đó: vào trễ quá ân hạn, ra sớm, ra muộn quá 15 phút, quên ra (quá 30 phút). Ví dụ đăng ký làm 08–12 mà ở lại tới 15:00 là ra muộn 180 phút cần giải trình, không phải OT.
- Ngày được xét (`evaluated`) từ 30 phút sau cuối khung nửa ca, nên ngày làm 08–12 xét lúc 12:30.
- `workHours` = số giờ có mặt **trong khung nửa ca** (giao của khoảng vào–ra với khung). Giờ ở khung OT sau ca không tính vào đây (khung OT được đo riêng lúc tính lương).
- `PRESENT`: `payUnits = 0,5` thay cho 1 khi không có trường hợp ảnh hưởng tiền, hoặc khi giải trình đã duyệt; `countsAsWorkday = payUnits > 0` (hiện là `payUnits === 1`); `countsAsDayOff = true` (nửa nghỉ), trọng số 0,5 ở phiếu lương.
- `ABSENT`: như hiện nay (`payUnits` 0, `countsAsDayOff` true); `halfShift` vẫn ghi để biết ngày có đơn; trọng số 1 (T4).
- Cột `half_shift` và `pay_units` mới được ghi vào `timesheet_entries` ở các chỗ upsert của `attendance-days.repository.ts`, và đọc lại ở chỗ ánh xạ dòng ngày (hiện kiểu 0|1, kiểm lại khi lập plan).

Các nơi đang đếm công theo số dòng phải đếm theo trọng số (0,5 cho dòng `PRESENT` có `halfShift`, 1 cho dòng khác), nên có thể ra số lẻ (12,5 công). Nơi đã thấy khi khảo sát (xác nhận khi lập plan): `me/domain/me-views.ts` (~141), `overview/overview.service.ts` (~224), `attendance/domain/daily-timesheet.ts` (`payUnits` kiểu `0 | 0.5 | 1`, thêm `halfShift`), `attendance.repository.ts` (đọc thêm `half_shift`). `/me/today` và `/me/attendance` tự hiện khung nửa ca vì `shift` của dòng ngày đã là khung đó; thêm cờ `halfShift` vào hai DTO (`me.controller.ts`) để FE biết đây là nửa ca.

## 10. Phiếu lương

Dòng phiếu (`DailyAttendanceLineProps`) thêm `halfShift` và `repaidMinutes`. Trọng số `w` của dòng = 0,5 nếu `kind === 'PRESENT'` và `halfShift` khác null, ngược lại 1. Trong `EmployeePayslip`:

| Khoản | Đổi |
|---|---|
| Ngày công thực, lương cơ bản, đi lại, chuyên cần | cộng `w` thay cho 1 mỗi dòng `countsAsWorkday`; số ngày nghỉ cộng `w` mỗi dòng `countsAsDayOff` |
| Số ca Flex/Night và phụ cấp đêm | cộng `w` |
| Phụ cấp linh hoạt | không đổi công thức: dựa vào `workHours` của dòng (4 giờ → một nửa) |
| Tiền nghỉ giữa đêm | **bằng 0** với dòng nửa ca (không có giờ nghỉ trong nửa ca làm) |
| Miễn thuế phần đêm | trần `8 × tỉ lệ đêm × w` thay cho `8 × tỉ lệ đêm` |
| OT | sau `measureOvertime`, xếp bằng `allocateHalfShiftDebt`: phần `ot` vào ba nhóm hệ số như cũ; phần `repaid` thành khoản mới |

Khoản mới `halfShiftRepaidPay` = tiền giờ ×1 của `repaidMinutes / 60` giờ, làm tròn một lần (D1: mọi khoản làm tròn đúng một lần, qua `moneyOf`). Cộng vào thu nhập tính thuế; chịu thuế như lương thường; không phụ cấp, không hệ số, không tính vào tổng giờ OT. Không đưa vào `makeupMinutes`/`makeupPay` của nghỉ có làm bù và không vào `makeupShortfallDays`.

DTO phiếu thêm: `halfShiftOwedMinutes` (nợ của tháng), `halfShiftRepaidMinutes`, `halfShiftDroppedMinutes` (nợ − bù, bị bỏ cuối tháng), `halfShiftRepaidPay`. Dòng ngày thêm `halfShift`, `repaidMinutes`.

`advance-quote.ts` đã cộng `payUnits` của các dòng có `payUnits > 0`, nên dòng 0,5 chảy vào tiền tạm ứng không cần sửa; có test (mục 12).

Phiếu in và màn lương cần FE thêm một dòng "Bù nghỉ giữa ca" và hiện công lẻ: ghi vào `docs/fe-yeu-cau/`.

## 11. Duyệt, từ chối, huỷ, kỳ lương

- **Duyệt** (`decide`): cổng kỳ → khoá nhân sự → kiểm lại (`recheck`, thêm `HALF_SHIFT_LEAVE` vào phạm vi kiểm; đơn một ngày, `planClaims` cùng loại với `ownRequestId`) → kiểm ngày lễ (như bước bỏ ngày lễ của đơn nghỉ: ngày thành lễ thì ném lỗi xung đột kiểu duyệt, Admin chỉ còn từ chối) → duyệt. Không ghi lịch làm việc vì ngày vẫn là ngày làm; thông tin nửa ca nằm ở đơn và `day_status`. Dựng lại dòng ngày đúng ngày của đơn.
- **Từ chối / huỷ:** trả ngày (thêm `HALF_SHIFT_LEAVE` vào danh sách loại đơn giữ ngày), kể cả trả về đơn đổi ca nếu có. Huỷ chỉ khi còn chờ (luật chung).
- **Nhật ký:** `request.decide`, `request.cancel` (T7).
- **Kỳ lương:** `RequestDates` (`periods/domain/request-months.ts`) thêm `halfShiftDate`, nên tháng của đơn được tính đúng; SQL chặn chốt kỳ trong `periods.repository.ts` thêm `half_shift_date` vào điều kiện "đơn chờ chạm tháng"; `payroll.repository.ts` đọc đơn đã duyệt có `half_shift_date` trong tháng. Duyệt/huỷ đơn của tháng đã tính thì phiếu về nháp rồi tính lại, như các loại khác.
- **Ngày đơn chạm tới** (`requestDates(req)`, để dựng lại dòng ngày) thêm `HALF_SHIFT_LEAVE` → `[halfShiftDate]`.
- **Tổng quan Admin** (`overview/domain/cells.ts`): nhóm của loại đơn mới là `leave`, nhãn "Nghỉ giữa ca".

## 12. Kiểm thử

Viết test đỏ trước (TDD). Xác minh bằng `npm test` (PG trong container dùng một lần) và `npm --prefix web run test:ui -- --workers=2`; không typecheck, không prettier.

| Test | Nội dung |
|---|---|
| `half-shift-halves.test.ts` (thuần) | Hai nửa của 6 ca; ca khác 9 giờ → `null`. |
| `half-shift-debt.test.ts` (thuần) | `allocateHalfShiftDebt`: thứ 6 4 giờ; thứ 6 3 + thứ 2 3 (60 bù + 120 OT); bỏ thứ 6; khung trước ngày nợ không trả; khung cùng ngày sau ca trả; hai đơn nợ 480; nợ dư không chuyển tháng. |
| `half-shift-day-status.test.ts` | Ma trận mục 7.2 đủ các ô (kể cả đổi ca thay và trả lại). |
| `half-shift-filing.pg.test.ts` | Thứ tự kiểm (`PERIOD_LOCKED` trước); ngoài khoảng ngày; `NOT_EMPLOYED`; `tts` bị khoá; Chủ nhật, ngày lễ, ngày nghỉ tuần, iSAT; ca không 9 giờ; trùng nghỉ/nghỉ có làm bù/iSAT/nửa ca; ngày đã đổi ca → nửa ca theo ca mới; đổi ca nộp sau bỏ ngày kèm cảnh báo; khung OT/bù có sẵn không chặn; xem trước; huỷ khi chờ; không huỷ khi đã duyệt. |
| `half-shift-review.pg.test.ts` | Duyệt: ngày lễ thêm sau → chỉ từ chối; từ chối/huỷ trả ngày; duyệt tháng đã tính thì phiếu về nháp; nhật ký `request.decide`. |
| `half-shift-day-row.test.ts` + `.pg.test.ts` | Dòng ngày 0,5 công; chấm công so với khung nửa ca: vào trễ, ra sớm, ở lại tới 15:00 → cần giải trình, không OT; `ABSENT`; ngày lễ thắng; `evaluated` 30 phút sau khung; `half_shift` và `pay_units` 0,5 ghi/đọc lại. |
| `half-shift-payroll.test.ts` | Số liệu mục 4.2 (với tỉ lệ thật trong `allowance-rates.ts`); tiền nghỉ giữa đêm 0; chuyên cần: 5 lần nghỉ giữa ca (2,5 ngày) giữ, 6 lần (3 ngày) mất; không vào `makeupShortfallDays`; tạm ứng nhận 0,5. |
| `half-shift-payroll.pg.test.ts` | Cả tháng từ DB: nợ + bù + OT ba ngày; vắng không nợ (T4); ngày lễ bỏ nợ (T8); tính lại sau khi đổi chấm công. |
| `half-shift-context.pg.test.ts` | `request-context`: `kinds` (`tts` khoá), `days[].halfShift`, `choices`, `halfShiftDebt`, `hasOvertime` = OT thật. |
| `half-shift-lwm-month.pg.test.ts` | Mục 7.3: tháng có nghỉ có làm bù, OT chỉ tới đúng nợ; nộp nghỉ có làm bù khi OT đã đăng ký vừa nợ; vượt nợ thì chặn. |
| `half-shift-limits.pg.test.ts` | Hai trần 12 giờ/ngày, 40 giờ/tháng tính cả khung trả nợ (T5). |
| `api-contract-doc.test.ts` (có sẵn) | Phải xanh sau khi cập nhật `docs/api/v2-contract.md`. |

`web test:ui` chỉ để chắc FE mock không vỡ, vì FE không đổi.

## 13. Thứ tự làm và đưa vào main

Tất cả trên nhánh `claude/half-shift-leave`, **đưa vào main một lần cuối**: đưa riêng lát 1 sẽ cho Admin duyệt đơn mà lương chưa đổi.

1. **Lát 1 — đơn:** schema; `HALF_SHIFT_LEAVE`; nộp, xem trước, duyệt, từ chối, huỷ; `request-context`; ma trận ngày; kỳ lương và tổng quan.
2. **Lát 2 — ngày công và lương:** `half_shift`, `pay_units` 0,5; `buildDay`; trọng số ở phiếu lương, tổng công của `/me` và tổng quan.
3. **Lát 3 — nợ:** `allocateHalfShiftDebt`; xếp bù/OT ở phiếu lương; luật tháng có nghỉ có làm bù; trần OT.
4. **Lát 4 — chốt:** cập nhật `docs/api/v2-contract.md`; `docs/fe-yeu-cau/` cho FE; chạy cả hai bộ test; review cả nhánh bằng một reviewer độc lập.

Cách đưa vào main:
- Trước khi fast-forward phải gộp `main` mới nhất vào nhánh và chạy lại cả hai bộ test.
- Phiên `main-ff` fast-forward vào main khi người dùng đồng ý riêng cho tính năng này. Push lên `lena-main` cũng chờ người dùng nói riêng.
- `schema.sql` đổi nên DB dev/demo phải **tạo lại** (cùng lúc với thay đổi `timesheet_entries.makeup_credit_minutes` đang chờ).
- **Chủ phần làm:** chọn khi có kế hoạch. Cần một chủ duy nhất cho cả bốn lát, vì chúng đụng chung `attendance-day.ts`, `employee-payslip.ts`, `schema.sql`. Chấm công và Đơn từ đều đã đưa việc của mình vào main nên không còn xung đột đang chờ. Phiên BE mới (FE-new) sắp sửa `employees/**`: cần dặn nó không đụng vùng lương/chấm công (`payroll.service.ts`, domain `attendance-day`) trong lúc làm tính năng này.

## 14. Rủi ro đã biết

- **Ca mặc định đổi sau khi duyệt** (FP2 Q6): dòng ngày dựng từ khung nửa ca đã chụp, còn ca của ngày có thể khác ca mới. Cùng loại với câu hỏi chưa quyết về "từ khi nào ca mặc định mới áp dụng".
- **Số liệu mẫu chỉ kiểm bằng tính tay** và bằng test viết ở lát 3; chưa so được với `luong-app` (`C:\Users\52.AI UD\Documents\luong-app`) vì app đó không có nghỉ giữa ca.
- **Một số chi tiết file/dòng** (mục 5, 6.1, 9) lấy từ lần khảo sát code trước và cần xác nhận lại khi lập plan.
- **Chưa chạy FE trên BE thật:** mọi thay đổi FE chỉ có trong bản yêu cầu `docs/fe-yeu-cau/`.
- **Màn lương và phiếu in** cần FE thêm dòng "Bù nghỉ giữa ca" và hiện công lẻ (12,5 công).
- **`/me/income` (thu nhập tạm tính)** dùng chung `payslipOf`, nên nhận nửa công và bù/OT theo phần mới; có test ở lát 3.
