# Thiết kế: nhân viên tạo và huỷ yêu cầu (05/11/2026)

- **Trạng thái:** chờ người dùng duyệt spec.
- **Nhánh:** `claude/staff-requests-e8fd71`, chỉ ở máy, chưa push.
- **Board:** J8–J10 (điện thoại), K3 (máy tính), J1/J3/J4/J5, K1/K2, chuông Admin (board C).
- **Tài liệu kèm:** [2026-11-05-staff-requests-fe-brief.md](2026-11-05-staff-requests-fe-brief.md). Đó là bản yêu cầu gửi thiết kế; spec này là bản kỹ thuật.
- **Nguồn luật:** câu trả lời của người dùng trong chat ngày 05/11/2026 và các luật đã chốt trước đó. Không dùng `spec/` (v1).

## 0. Quyết định đã chốt

### Luật (người dùng trả lời trong chat, 05/11/2026)

| # | Chủ đề | Quyết định |
|---|---|---|
| 1 | Menu | 6 loại: Đơn nghỉ, Nghỉ có làm bù, Làm thêm giờ, Đổi ca, Giải trình, Tạm ứng. **Chưa làm iSAT**, người dùng cho thiết kế sau. |
| 2 | Ngày quá khứ | Mọi loại trừ Giải trình chỉ chọn được **từ hôm nay**. |
| 3 | Ngày xa nhất | Tới **hết tháng sau**. Ví dụ hôm nay 05/11 thì chọn được tới 31/12. |
| 4 | Giờ OT và giờ bù | Chỉ **giờ tròn**. Ca cộng OT (hoặc giờ bù) tối đa **12 giờ một ngày**. Ca 08–17 thì chọn được 06–07 và 18–22, tổng tối đa 4 giờ. |
| 5 | Giải trình | Máy tự điền trường hợp, nhân viên không sửa. Thiếu giờ vào thì nhập giờ vào thực tế; thiếu giờ ra thì nhập giờ ra; quên chấm công thì nhập cả hai. Vào muộn, ra sớm, vào sớm, ra muộn chỉ cần lý do. Mọi trường hợp của một ngày gộp một đơn, **một lý do chung**. |
| 6 | Tạm ứng | Chỉ nộp **ngày 16 và 17**. Ngoài hai ngày đó không nộp được. |
| 7 | Huỷ đơn | Chỉ đơn **đang chờ duyệt**, **không hỏi lý do**. |
| 8 | Nhắc giải trình | Nhân viên thấy dòng nổi bật ở đầu màn Hôm nay, bấm vào mở form Giải trình cho ngày đó. Việc trong chuông ở lại, hiện "Đã nhắc lúc …", tới khi nhân viên gửi giải trình. |
| 9 | Khai thay giờ | **Bỏ nút**. Chuông chỉ còn "Nhắc giải trình". |

### Thiết kế (người dùng duyệt từng phần trong chat, 05/11/2026)

- **Cách làm:** chọn "Cách 1", tức server trả dữ liệu cho form và kiểm thử trước bằng route xem trước. FE chỉ hiện lựa chọn hợp lệ.
- **Phần 1** (BE cho form): duyệt.
  - Tạm ứng không có ô lý do.
  - Số tiền do server tính.
- **Phần 2** (giải trình và nhắc), **phần 3** (FE), **phần 4** (kiểm thử, lỗi, thứ tự): duyệt.

### Đã chốt từ trước (memory)

- Tạm ứng = 80% lương ngày công 01–15. Ô "Số tiền được ứng" chỉ để đọc. Admin chỉ duyệt hoặc từ chối.
- Ngăn trước, không báo lỗi sau: UI chỉ đưa lựa chọn hợp lệ; BE vẫn kiểm.
- Ô nhập bo 8px, không làm dạng viên thuốc.
- Danh sách chỉ hiện phần cốt lõi; chi tiết nằm trong màn chi tiết.
- Một file lược đồ `migrations/postgres/schema.sql`.

## 1. Phạm vi

**Trong phạm vi:**
- Nhân viên tạo 6 loại đơn từ app (điện thoại và máy tính).
- Nhân viên huỷ đơn đang chờ.
- Admin nhắc giải trình từ chuông.
- Nhân viên thấy lời nhắc và gửi giải trình.

**Ngoài phạm vi:** xem mục 8.

**Phụ thuộc trước khi viết code:**
- (a) Nhánh `claude/wire-staff-app-f5adca` đã merge vào `main`. **Chưa** (kiểm ngày 05/11: `git merge-base --is-ancestor claude/wire-staff-app-f5adca main` trả về không).
- (b) Các bản sửa sau review 179aeae, 2a16f3c, 6001bd5 đã có trong `main`. **Đã có** (qua 5b20d3a; nhánh này đã fast-forward tới đó).
- Khi (a) xong: merge `main` vào nhánh này rồi mới viết code.
- Spec và plan viết trước được.

## 2. BE: dữ liệu cho form

### 2.1. `GET /api/v2/me/request-context`

Một lần gọi trả đủ dữ liệu để FE chỉ hiện lựa chọn hợp lệ. Ví dụ hôm nay 05/11/2026, ca 08–17:

```json
{
  "today": "2026-11-05",
  "window": { "from": "2026-11-05", "to": "2026-12-31" },
  "kinds": [
    { "kind": "leave", "enabled": true },
    { "kind": "leave-with-makeup", "enabled": true },
    { "kind": "overtime", "enabled": true },
    { "kind": "shift-change", "enabled": true },
    { "kind": "explanation", "enabled": true },
    { "kind": "advance", "enabled": false, "reason": "Chỉ nộp ngày 16 và 17" }
  ],
  "months": [
    { "month": "2026-11", "closed": false, "otMinutes": 540, "otCapMinutes": 2400, "hasOvertime": true, "hasMakeupLeave": false },
    { "month": "2026-12", "closed": false, "otMinutes": 0, "otCapMinutes": 2400, "hasOvertime": false, "hasMakeupLeave": false }
  ],
  "leaveTypes": [{ "code": "ANNUAL", "label": "Phép năm" }],
  "annualLeaveLeft": 11,
  "shiftFrames": [{ "shiftType": "NORMAL", "start": "08:00", "end": "17:00" }],
  "days": [
    {
      "date": "2026-11-05",
      "workday": true,
      "shift": { "type": "NORMAL", "start": "08:00", "end": "17:00" },
      "holiday": null,
      "claim": null,
      "hours": [
        { "start": 6, "ends": [{ "end": 7, "minutes": 60 }] },
        { "start": 18, "ends": [{ "end": 19, "minutes": 60 }, { "end": 20, "minutes": 120 }, { "end": 21, "minutes": 180 }, { "end": 22, "minutes": 240 }] }
      ]
    }
  ],
  "explanationDays": [
    { "date": "2026-10-27", "cases": ["MISSING_CHECK_OUT"], "needs": { "checkIn": false, "checkOut": true }, "remindedAt": "2026-10-28T02:40:00.000Z" }
  ],
  "advance": null
}
```

Ví dụ trên rút gọn `leaveTypes`, `shiftFrames` và `days` còn một phần tử mỗi danh sách. Ý nghĩa từng trường:

**`window`:** từ hôm nay (giờ Việt Nam) tới ngày cuối tháng sau.

**`kinds`:**
- Chỉ có những loại nhân viên được dùng; loại không được dùng thì không có trong danh sách:
  - không có quyền lợi `ot` thì không có `overtime`;
  - không có `makeup` thì không có `leave-with-makeup`.
- `enabled: false` kèm `reason` là loại vẫn hiện nhưng bị khoá:
  - `advance`: ngoài ngày 16–17 thì "Chỉ nộp ngày 16 và 17". Tháng đã có đơn tạm ứng chờ duyệt hoặc đã duyệt thì "Tháng 11 đã có đơn tạm ứng". Số tiền tính ra bằng 0 thì "Chưa có ngày công 01–15/11";
  - `explanation`: không có ngày cần giải trình thì "Không có ngày cần giải trình";
  - `overtime`: mọi tháng trong `window` đều đã chốt, hoặc đã có Nghỉ có làm bù, hoặc đã đủ 40 giờ, thì "Không còn ngày đăng ký được";
  - `leave-with-makeup`: mọi tháng trong `window` đều đã chốt hoặc đã có OT thì khoá, lý do tương tự.

**`months`:** tháng này và tháng sau.
- `closed` là `true` khi kỳ lương của tháng có dòng trong `payroll_periods` và `status` khác `'open'`. Không có dòng thì là tháng chưa chốt.
- `otMinutes` là tổng phút OT của các đơn OT chờ duyệt và đã duyệt trong tháng, tính như route tạo đơn đang tính.
- `hasOvertime`, `hasMakeupLeave` dùng cho luật hai loại này loại trừ nhau trong một tháng.

**`leaveTypes`:** 6 hình thức nghỉ (`LEAVE_TYPES`). Bỏ `ANNUAL` khi nhân viên không có quyền lợi `leaveAccount`.

**`annualLeaveLeft`:** số ngày phép năm còn lại, tính bằng hàm dùng chung ở mục 2.7. `null` khi không có `leaveAccount`.

**`shiftFrames`:** 6 khung đổi ca (`SHIFT_FRAMES`).

**`days`:** mỗi ngày trong `window` một phần tử, khoảng 57 phần tử.
- `workday`: ngày nhân viên phải làm theo loại nhân sự, không phải ngày lễ.
- `shift`: ca thật của ngày đó, đã tính đơn đổi ca chờ duyệt hoặc đã duyệt. `null` khi không phải ngày làm.
- `holiday`: tên ngày lễ hoặc `null`.
- `claim`: ngày đang bị một đơn giữ trong `day_status`, dạng `{ "status": "LEAVE" | "LEAVE_WITH_MAKEUP" | "SHIFT_CHANGE" | "ISAT", "pending": true | false }`, hoặc `null`.
- `hours`: các khung giờ tròn còn đặt được cho **một** khung OT hoặc khung bù mới trong ngày đó:
  - `start`: giờ bắt đầu;
  - `ends`: mọi giờ kết thúc hợp lệ, kèm số phút làm việc (`workMinutes`, đã trừ giờ nghỉ);
  - một cặp (start, end) có mặt khi qua được cả `windowError` (khung 06–22, cách ca 60 phút, không chồng ca và các khung đã có) lẫn `dayCapError` (ca 8 giờ cộng các khung đã có cộng khung mới không quá 12 giờ);
  - ngày đang nghỉ (`claim` là LEAVE hoặc LEAVE_WITH_MAKEUP) có `hours: []`.
  - Ghi chú: phần 1 trình bày bản đơn giản `freeHours` + `hoursLeft`. Spec chi tiết hoá thành `ends` vì luật giờ nghỉ (1 giờ nghỉ mỗi 4 giờ làm) khiến FE không tự cộng giờ đồng hồ được. Ý tưởng không đổi.

**`explanationDays`:** các ngày cần giải trình (mục 3.1), mới nhất trước, mỗi ngày gồm:
- `cases`: trường hợp máy tìm ra (mục 3.2);
- `needs`: ô giờ nào bắt buộc nhập;
- `remindedAt`: lúc Admin nhắc gần nhất, hoặc `null`.

**`advance`:** chỉ có giá trị khi `kinds.advance.enabled`, dạng `{ "month": "2026-11", "amount": 2215385, "workDays": 12, "from": "2026-11-01", "to": "2026-11-15" }`. Ngoài ra là `null`.

Route khai báo trong `MeController`; đường `me/request-context` không đụng `requests/:id`.

### 2.2. `POST /api/v2/me/requests/:kind/preview`

- **Body:** giống `POST /api/v2/me/requests/:kind`.
- **Cách làm:**
  - mỗi hàm `create*` trong `RequestsService` tách thành hai bước:
    - **lập đơn:** kiểm, tính, trả đơn chưa lưu kèm `summary` và `warnings`;
    - **lưu:** ghi đơn và các dòng `day_status`;
  - preview chạy bước lập đơn trong cùng khoá nhân viên rồi bỏ, không ghi gì;
  - create chạy cả hai bước.
- **Luôn trả 200:**
  - hợp lệ: `{ "ok": true, "title": "Phép năm 13–16/11", "summary": { … }, "warnings": [] }`;
  - không hợp lệ: `{ "ok": false, "message": "<câu lỗi của server>", "code": "DAY_CONFLICT" }`. `code` chỉ có khi là xung đột ngày.

**`summary` theo loại:**

| Loại | `summary` |
|---|---|
| leave | `{ dates, daysCount, annualLeaveLeftAfter }`. `annualLeaveLeftAfter` là `null` khi không phải phép năm. Thứ Bảy có iSAT đã duyệt bị bỏ khỏi đơn và nằm trong `warnings`. |
| leave-with-makeup | `{ dates, daysCount, makeupMinutesRequired, makeupMinutesPlanned }` |
| overtime | `{ minutes, monthMinutesAfter }` |
| shift-change | `{ dates, keptDates }`. `keptDates` là các ngày nghỉ giữ nguyên trong khoảng. |
| explanation | `{ cases, needs }` |
| advance | `{ month, amount, workDays }` |

Xếp chưa đủ giờ bù thì `ok: false`, câu lỗi dạng "Còn thiếu 8 giờ bù".

### 2.3. Luật chỉ áp cho route `/me`

`MeController` gọi service với chế độ nộp là nhân viên tự nộp (`filedBy: 'self'`). Route Admin dùng `'admin'` và giữ hành vi hiện tại, trừ những gì mục 2.4–2.5 áp cho cả hai.

Với `'self'`:
- **Ngày nằm trong `window`** cho Đơn nghỉ, Nghỉ có làm bù (cả ngày nghỉ lẫn ngày bù), Làm thêm giờ, Đổi ca. Câu lỗi: "Chỉ chọn ngày từ 05/11 đến 31/12".
- **Tháng đã chốt công thì từ chối.** Câu lỗi: "Tháng 10 đã chốt công". Riêng Giải trình, luật này áp cho cả route Admin (mục 3.3).
- **Giờ OT và giờ bù phải là giờ tròn** (`HH:00`). Câu lỗi: "Chỉ chọn giờ tròn".
- **Tạm ứng** chỉ nộp ngày 16 hoặc 17 (giờ Việt Nam), cho tháng hiện tại. Câu lỗi: "Chỉ nộp tạm ứng ngày 16 và 17".
- Không có ô tiêu đề: `title` client gửi bị bỏ qua.

### 2.4. Tiêu đề do server đặt (cả `/me` lẫn Admin)

`title` client gửi bị bỏ qua ở mọi route. Mẫu:

| Loại | Ví dụ |
|---|---|
| Đơn nghỉ | "Phép năm 13–16/11", "Nghỉ ốm 13/11" (dùng nhãn hình thức nghỉ) |
| Nghỉ có làm bù | "Nghỉ có làm bù 13–14/11" |
| Làm thêm giờ | "Làm thêm 10/11 18–20h" |
| Đổi ca | "Đổi ca Flex 06–15, 10–12/11" |
| Giải trình | "Giải trình 27/10" |
| Tạm ứng | "Tạm ứng lương tháng 11" |

Khoảng ngày khác tháng ghi đủ: "Phép năm 30/11–02/12".

### 2.5. Tạm ứng

**Số tiền:**
- Bằng 80% × tổng (`daySalary` − `deductionAmount`) của các dòng ngày công 01–15 trong bảng lương ngày của tháng đó.
- Dòng ngày công là dòng có `shiftCode` NORMAL, FLEX hoặc NIGHT. Không tính ngày nghỉ, iSAT, không lương; giống v1.
- Cộng xong mới làm tròn tới đồng.
- Ví dụ: lương cơ bản 6.000.000 ₫, công chuẩn 26, đi làm 12 ngày 01–15, không trễ sớm.
  - Mỗi ngày 6.000.000 / 26 ≈ 230.769,23 ₫.
  - 12 ngày ≈ 2.769.230,77 ₫.
  - × 0,8 ≈ 2.215.384,6, làm tròn thành 2.215.385 ₫.

**Cách tính:** `PayrollService` có thêm `advanceQuote(employeeId, month)`:
- dựng phiếu lương tháng bằng `generateMonthlyPayslip` như lúc tính lương, nhưng không lưu;
- trả `{ amount, workDays, from, to }`.

`RequestsModule` import `PayrollModule`. Không tạo vòng phụ thuộc vì Payroll không phụ thuộc Requests.

**Áp cho cả `/me` lẫn Admin:**
- server tính số tiền lúc nộp; `amount` client gửi bị bỏ qua;
- mỗi tháng một đơn: tháng đã có đơn tạm ứng chờ duyệt hoặc đã duyệt thì từ chối;
- số tiền bằng 0 thì từ chối ("Chưa có ngày công 01–15/11").

**Không có ô lý do:**
- server ghi `reason` = tiêu đề ("Tạm ứng lương tháng 11"), vì cột `reason` bắt buộc;
- `reason` client gửi bị bỏ qua.

**Không đổi:** Admin vẫn nộp thay được mọi ngày (luật 16–17 chỉ áp cho `/me`). Luật trừ tạm ứng vào phiếu lương giữ nguyên.

### 2.6. Huỷ đơn

Giữ nguyên `PATCH /api/v2/me/requests/:id/cancel`:
- chỉ đơn PENDING, chỉ người nộp;
- trả lại các ngày đơn giữ.

FE không gửi lý do. Không đổi BE.

### 2.7. Số phép năm còn lại: một hàm dùng chung

- Công thức: `leave_balance` trừ số ngày của các đơn phép năm chờ duyệt và đã duyệt có ngày nghỉ từ `leave_balance_on` trở đi.
- Đây là công thức route tạo đơn nghỉ đang dùng để kiểm số dư.
- Tách thành một hàm, dùng cho:
  - `/me/profile`;
  - `annualLeaveLeft` ở mục 2.1;
  - `annualLeaveLeftAfter` ở mục 2.2;
  - bước kiểm khi tạo đơn.

## 3. BE: giải trình và nhắc giải trình

### 3.1. Ngày cần giải trình

Một ngày D của nhân viên là "cần giải trình" khi đủ mọi điều kiện:
1. D ≤ hôm nay và D ≥ `start_date` của nhân viên.
2. Tháng của D chưa chốt công (mục 2.1, `closed`).
3. D là ngày làm của người đó:
   - có ca;
   - không nghỉ (LEAVE, LEAVE_WITH_MAKEUP);
   - không iSAT;
   - không phải ngày lễ.
4. Máy tìm ra ít nhất một trường hợp (mục 3.2).
5. Chưa có đơn giải trình cho D ở trạng thái PENDING, APPROVED hoặc REJECTED. Đơn đã huỷ không tính; giống luật "một ngày một đơn" hiện có.

**Khoảng xét:** từ ngày 01 của tháng trước tới hôm nay, chỉ giữ ngày thuộc tháng chưa chốt (Ruling R1, mục 9).

### 3.2. Bảng trường hợp

Đọc giờ vào/ra thật từ dòng chấm công, không dùng trạng thái đã lưu (trạng thái có thể cũ). Ngưỡng lấy theo `daily-timesheet.ts` hiện tại.

| Máy thấy | Trường hợp (`EXPLANATION_CASES`) | Nhân viên nhập |
|---|---|---|
| Có giờ vào, vào muộn quá 15 phút | LATE_CHECK_IN, "Vào muộn" | lý do |
| Có giờ vào, vào sớm quá 15 phút | EARLY_CHECK_IN, "Vào sớm" | lý do |
| Có giờ ra, ra trước giờ hết ca | EARLY_CHECK_OUT, "Ra sớm" | lý do |
| Có giờ ra, ra sau giờ hết ca quá 30 phút, không có OT (`LATE_WITHOUT_OT`) | FORGOT_CHECK_OUT, "Quên check-out" | lý do |
| Có giờ ra, không có giờ vào | MISSING_CHECK_IN, "Thiếu giờ vào" | giờ vào thực tế + lý do |
| Có giờ vào, không có giờ ra, **ngày đã qua** | MISSING_CHECK_OUT, "Thiếu giờ ra" | giờ ra thực tế + lý do |
| Không có giờ nào, **ngày đã qua** | MISSING_CHECK_IN + MISSING_CHECK_OUT, "Quên chấm công" | giờ vào và giờ ra + lý do |

- Một ngày có thể có nhiều trường hợp, ví dụ vào muộn 40 phút và thiếu giờ ra.
- **Hôm nay:** chỉ tính trường hợp đã chắc chắn:
  - vào muộn, vào sớm, ra sớm, ra muộn khi không có OT;
  - thiếu giờ vào khi đã có giờ ra.
- Hôm nay chưa ra hoặc chưa chấm thì **chưa** tính thiếu.
- Trường hợp LATE_CHECK_OUT (ra muộn 15–30 phút) hiện chưa được máy tìm. Ngưỡng thuộc spec Chấm công, không đổi ở đây.
- Hàm thuần `explanationCasesOf(timesheet, date, today)` đặt trong `src/modules/requests/domain/`. Hàm này cũng trả `needs: { checkIn, checkOut }`.

### 3.3. Tạo đơn giải trình (cả `/me` lẫn Admin)

- **Trường hợp:** server tự tính bằng `explanationCasesOf`. `cases` client gửi bị bỏ qua.
- **Ngày không cần giải trình** (mục 3.1) thì từ chối:
  - đã có đơn: "Ngày 27/10 đã có đơn giải trình";
  - không có trường hợp: "Ngày 27/10 không có gì cần giải trình";
  - tháng đã chốt: "Tháng 10 đã chốt công".
- **Giờ thực tế:**
  - `needs.checkIn` thì bắt buộc `actualCheckIn`, `needs.checkOut` thì bắt buộc `actualCheckOut`, dạng `HH:MM`;
  - không cần thì bỏ qua giá trị client gửi;
  - giờ ra phải sau giờ vào khi có cả hai.
- **Lý do:** một lý do bắt buộc.
- **Tiêu đề:** server đặt (mục 2.4).

### 3.4. Bảng `explanation_reminders`

Thêm vào `migrations/postgres/schema.sql`, viết cùng kiểu với `day_status`:

```sql
CREATE TABLE explanation_reminders (
  employee_id TEXT NOT NULL REFERENCES staff(uuid),
  work_date   DATE NOT NULL,
  reminded_by TEXT NOT NULL REFERENCES staff(uuid),
  reminded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (employee_id, work_date)
);
```

- Nhắc lại thì ghi đè (upsert) `reminded_by` và `reminded_at`.
- Không xoá dòng khi nhân viên gửi giải trình: lời nhắc chỉ hiện khi ngày còn "cần giải trình". Đơn bị huỷ thì ngày lại cần giải trình, lời nhắc hiện lại.
- Thêm kiểu bảng vào `src/database/schema.ts`.

### 3.5. Route Admin

Cả hai route có `@RequireCap('requests.review')`, khai báo trước `@Get(':id')`, và có dòng trong bảng của `test/v2/auth-access.test.ts`.

**`GET /api/v2/requests/explanations-due`**
- Trả mọi ngày cần giải trình của mọi nhân viên đang làm, mới nhất trước.
- Dạng: `{ items: [{ employeeId, name, date, cases, needs, remindedAt }] }`.

**`POST /api/v2/requests/explanations-due/remind`**
- Body `{ employeeId, date }`; `reminded_by` lấy từ phiên Admin.
- Trả `{ reminded: true, remindedAt }`.
- Ngày không còn cần giải trình thì 400 với câu lỗi "Ngày này đã được giải trình" (hoặc câu đúng theo mục 3.3).

### 3.6. Thêm vào màn của nhân viên

**`GET /api/v2/me/today`:**
- Thêm `reminders: [{ date, remindedAt }]`: những ngày được nhắc và còn cần giải trình, mới nhất trước.
- `alert` hiện có giữ nguyên.

**`GET /api/v2/me/attendance/:date`:** thêm hai trường.
- `explanation`: đơn giải trình của ngày đó (đơn mới nhất không bị huỷ), dạng `{ id, status, sentAt, cases, actualCheckIn, actualCheckOut }`, hoặc `null`.
- `due`: `{ cases, needs, remindedAt }` khi ngày cần giải trình, ngược lại `null`.

## 4. FE

### 4.1. Mở luồng bằng URL

- Trên `/nv/yeu-cau`, tham số `?tao=` gồm: `chon` (menu J8), `nghi`, `nghi-bu`, `ot`, `doi-ca`, `giai-trinh`, `tam-ung`.
- Giải trình thêm `&ngay=2026-10-27` để điền sẵn ngày.
- Đóng luồng thì bỏ tham số.
- URL dùng chung cho điện thoại và máy tính (ngưỡng 1136px).

### 4.2. Thành phần

**Vỏ theo màn hình:**
- Điện thoại: tấm trượt từ dưới lên (bottom sheet), giống J8–J9.
- Máy tính: ngăn kéo bên phải (K3), có nút ‹ quay lại menu. Lớp CSS dùng tiền tố `sd-`.

**Phần ruột dùng chung**, đặt trong `web/src/views/staff-requests/`:
- `NewRequestBody.vue`: menu 6 loại và điều hướng;
- 6 form: `LeaveForm.vue`, `MakeupLeaveForm.vue`, `OvertimeForm.vue`, `ShiftChangeForm.vue`, `ExplanationForm.vue`, `AdvanceForm.vue`.

**Dịch vụ và builder:**
- `web/src/services/staff-requests.ts`:
  - gọi `request-context`, `preview`, create, cancel;
  - có nhánh `__MOCK__`.
- `web/src/builders/api/staff-requests.ts`: hàm thuần, có test `node:test`. Gồm:
  - danh sách ngày chọn được theo loại;
  - "Đến ngày" dừng trước ngày bị giữ kế tiếp;
  - giờ bắt đầu và giờ kết thúc;
  - lọc theo giới hạn 40 giờ;
  - dòng tóm tắt;
  - bộ đếm giờ bù.

### 4.3. Điểm vào

- Nút "Tạo yêu cầu" ở J4 (`RequestsView`) và ở cột Hôm nay của K1 (`TodayColumn`):
  - mở `?tao=chon`;
  - bỏ thông báo "Chưa có luồng tạo yêu cầu trong bản mockup".
- **Dòng nhắc** ở đầu J1 (`HomeView`) và cột Hôm nay của K1:
  - mỗi ngày một dòng, nội dung "Admin nhắc giải trình 27/10";
  - bấm vào thì mở `?tao=giai-trinh&ngay=2026-10-27`.
- **Nút "Giải trình"** trong chi tiết ngày (J3 `DayBody`, ngăn kéo K2) khi `due` khác `null`. Đã có `explanation` thì hiện trạng thái đơn thay cho nút.

### 4.4. Ô nhập

- **Ngày:** danh sách thả xuống (`select`), chỉ có ngày chọn được, nhãn dạng "T6 13/11". Ngày thuộc tháng đã chốt không bao giờ có trong danh sách.
  - Đơn nghỉ:
    - "Từ ngày" là ngày làm (`workday`) trong `window` không bị đơn nghỉ (LEAVE, LEAVE_WITH_MAKEUP) giữ;
    - "Đến ngày" từ "Từ ngày" trở đi, dừng trước ngày kế tiếp bị đơn nghỉ giữ.
  - Nghỉ có làm bù: như Đơn nghỉ, thêm hai điều kiện:
    - tháng chưa có OT, "Đến ngày" cùng tháng với "Từ ngày";
    - sau "Đến ngày" phải còn ít nhất một ngày trong tháng có `hours` khác rỗng.
  - Đổi ca: mọi ngày trong `window`. Ngày nghỉ trong khoảng giữ nguyên (dòng tóm tắt ghi rõ).
  - Làm thêm giờ: ngày có `hours` khác rỗng, thuộc tháng chưa có Nghỉ có làm bù và còn giờ dưới 40 giờ.
  - Ngày bù: sau ngày nghỉ cuối, cùng tháng, `hours` khác rỗng.
  - Giải trình: lấy từ `explanationDays`.
- **Giờ:**
  - "Từ" lấy từ `hours[].start`, "Đến" lấy từ `ends` của giờ bắt đầu đã chọn;
  - OT còn lọc thêm theo số phút còn lại của tháng;
  - khung bù đã chọn trong form bị loại khỏi lựa chọn của các dòng khác cùng ngày;
  - bộ đếm "Đã xếp x / 8 giờ" không cho xếp quá số giờ phải bù.
- **Giờ thực tế của Giải trình:** `input type=time`, chỉ hiện ô mà `needs` yêu cầu.
- **Trường hợp giải trình:** chữ, không sửa được.
- **6 khung đổi ca:** danh sách chọn một.
- **Tạm ứng:** chỉ hiện chữ "Số tiền được ứng: 2.215.385 ₫" và dòng phụ "80% lương ngày công 01–15/11 · 12 ngày". Không có ô lý do.
- **Các form còn lại:** một ô lý do chữ tự do.
- **Kiểu ô:** bo 8px, không làm dạng viên thuốc, không đổ bóng.

### 4.5. Xem trước và gửi

- **Xem trước:**
  - form đủ trường thì gọi `preview`, chờ 300ms sau lần sửa cuối (debounce);
  - `summary` vẽ dòng tóm tắt;
  - "Gửi yêu cầu" chỉ bật khi lần preview gần nhất trả `ok: true`.
- **Gửi thành công:**
  - đóng luồng, hiện thông báo nổi "Đã gửi yêu cầu";
  - tải lại danh sách: đơn mới ở đầu, trạng thái Chờ duyệt.
- **Server từ chối** (đua giữa hai thiết bị, mất mạng):
  - giữ form, hiện câu lỗi ngay dưới nút Gửi;
  - tải lại `request-context`.

### 4.6. Huỷ đơn

- Nút "Huỷ đơn" trong chi tiết đơn (J5 và ngăn kéo yêu cầu K), chỉ khi đơn PENDING.
- Bấm thì hiện xác nhận ngay tại chỗ: "Huỷ đơn này?" với hai nút "Huỷ đơn" và "Không".
- Huỷ xong:
  - hiện thông báo nổi "Đã huỷ đơn";
  - đơn chuyển "Đã huỷ";
  - tải lại danh sách.

### 4.7. Chuông Admin

- Bỏ động từ `declare` và nút "Khai thay giờ vào/ra" trong `InboxDetail.vue` và `services/admin-main.ts`.
- Nhóm "Chấm công" lấy từ `GET /requests/explanations-due`.
- "Nhắc giải trình" gọi route nhắc. Sau đó:
  - việc ở lại, có dòng "Đã nhắc: 09:40 28/10";
  - nút đổi thành "Nhắc lại".
- Việc rời nhóm khi ngày không còn trong `explanations-due`, tức nhân viên đã gửi giải trình.

### 4.8. Mock (`__MOCK__`)

**`web/src/mock/staff-phone.ts`:**
- dựng `request-context` từ dữ liệu mock (hôm nay 28/10/2026);
- preview rút gọn: chỉ các luật FE cần để bật Gửi;
- tạo và huỷ đơn trong bộ nhớ.

**"Hôm nay" giả lập:** cho phép đặt hôm nay khác (chỉ trong mock, dùng cho test) để thử form Tạm ứng vào ngày 16. Ví dụ tham số `?homnay=2026-11-16`, chỉ đọc khi `__MOCK__`.

**`web/src/mock/inbox.ts`:**
- "Nhắc" ghi lại giờ nhắc thay vì xoá việc;
- bỏ `declare`.

### 4.9. File FE bị sửa

Các file sau trùng với nhánh staff-app, nên FE chỉ viết sau khi (a) xong:
- `RequestsView`, `TodayColumn`, `HomeView`, `DayBody`, `RequestBody`, `useDesktopDetail`;
- `InboxDetail`, `admin-main.ts`, `mock/inbox.ts`, `mock/staff-phone.ts`.

## 5. Kiểm thử

### 5.1. BE: test đơn vị, viết test trước (TDD)

Dùng `test/v2/helpers/requests-fakes.ts`. Các test cần có:

**`request-context`:**
- `kinds` theo quyền lợi:
  - tts không có `overtime`;
  - không có `leaveAccount` thì không có ANNUAL và `annualLeaveLeft` là `null`;
- `advance` khoá ngoài 16–17;
- `explanation` khoá khi không có ngày cần giải trình;
- `months.closed`, `otMinutes`, `hasOvertime`, `hasMakeupLeave`.

**`hours`:**
- ca 08–17 cho `start` 6 và 18–21; `ends` của 18 là 19–22;
- Chủ nhật không có ca thì có 06–22 nhưng tổng không quá 12 giờ làm;
- ngày đã có OT 18–20 thì chỉ còn trước ca;
- ngày nghỉ có `hours: []`.

**Xem trước:**
- preview và create cho cùng một kết quả;
- preview không ghi gì;
- preview trả `ok: false` với đúng câu lỗi của create.

**Luật `/me`:**
- ngày ngoài `window` bị từ chối;
- tháng đã chốt bị từ chối;
- giờ không tròn bị từ chối;
- route Admin không bị các luật này chặn.

**Tiêu đề:** đúng mẫu ở mục 2.4 cho cả 6 loại; `title` client gửi bị bỏ qua.

**Tạm ứng:**
- chỉ ngày 16–17 với `/me`;
- mỗi tháng một đơn;
- số tiền đúng công thức, `amount` client gửi bị bỏ qua;
- số tiền 0 bị từ chối;
- `reason` = tiêu đề.

**`explanationCasesOf`:** đủ 7 dòng của bảng 3.2, nhiều trường hợp cùng ngày, và luật hôm nay.

**Tạo giải trình:**
- `cases` client gửi bị bỏ qua;
- thiếu giờ bắt buộc thì bị từ chối;
- ngày không cần giải trình thì bị từ chối.

**Nhắc:**
- nhắc rồi nhắc lại thì ghi đè;
- ngày đã giải trình thì không nhắc được;
- `reminders` biến mất khi đã gửi giải trình và hiện lại khi đơn bị huỷ.

**Số phép năm:** cùng một hàm cho cả bốn nơi (mục 2.7).

**Quyền:** hai route Admin mới có dòng trong bảng `auth-access`.

### 5.2. BE: test với PostgreSQL thật

- SQL ghi đè (upsert) của `explanation_reminders`.
- Truy vấn `explanations-due`, có ngày thuộc tháng đã chốt bị loại.

### 5.3. FE

**Test `node:test` cho builder** (`test/v2/fe-staff-requests.test.ts`):
- danh sách ngày;
- "Đến ngày" dừng trước ngày bị giữ;
- giờ, lọc 40 giờ;
- tóm tắt;
- bộ đếm giờ bù.

**Test Playwright ở chế độ mock**, cả điện thoại và máy tính:
- menu ẩn hoặc khoá đúng loại;
- gửi Đơn nghỉ: thông báo nổi "Đã gửi yêu cầu", đơn Chờ duyệt ở đầu danh sách;
- OT chỉ có giờ hợp lệ;
- Nghỉ có làm bù: Gửi chỉ bật khi xếp đủ giờ;
- Giải trình mở từ dòng nhắc, có ngày điền sẵn và đúng ô giờ;
- Tạm ứng ngày 16 (dùng "hôm nay" giả lập) chỉ hiện số tiền;
- huỷ đơn chờ duyệt;
- chuông: nhắc thì việc ở lại với "Đã nhắc …", không còn nút "Khai thay".

## 6. Lỗi

| Tình huống | Cách xử lý |
|---|---|
| Lựa chọn không hợp lệ | FE không đưa ra để chọn (mục 4.4). |
| Preview không hợp lệ | 200, `ok: false`; Gửi tắt, câu lỗi hiện dưới form. |
| Create không hợp lệ | 400 `BAD_REQUEST`; xung đột ngày là 409 `DAY_CONFLICT`. FE giữ form, hiện câu lỗi, tải lại `request-context`. |
| Mất mạng | Giữ form, hiện "Không gửi được, thử lại". |
| Huỷ đơn không còn chờ (Admin vừa duyệt) | 400; FE hiện câu lỗi và tải lại đơn. |

## 7. Thứ tự làm

**BE:**
1. Domain: `explanationCasesOf`, `hours` của ngày, tiêu đề.
2. Tách mỗi `create*` thành lập đơn + lưu.
3. `request-context`, `preview`, luật `/me`, hàm số phép năm dùng chung.
4. Tạm ứng: `advanceQuote` và luật nộp.
5. Giải trình: tạo đơn theo luật mới; bảng `explanation_reminders`; route Admin.
6. `/me/today.reminders`, `/me/attendance/:date` (`explanation`, `due`).

**FE** (sau khi merge `main` có staff-app):
1. Dịch vụ và builder.
2. Luồng tạo đơn với 6 form.
3. Điểm vào.
4. Huỷ đơn.
5. Chuông.
6. Mock.

**Cuối cùng:** cập nhật `docs/api/v2-contract.md` mục 3.4 và phần `/me`.

**Xác minh:**
- BE: container `luong-test-pg-staff-requests` ở cổng 55465, rồi `PG_TEST_URL=postgres://postgres@127.0.0.1:55465/postgres npm test`.
- FE: `PW_PORT=4255 npm --prefix web run test:ui`.

## 8. Ngoài phạm vi

- Form iSAT (người dùng cho thiết kế sau).
- Khai thay giờ vào/ra: đã bỏ.
- Ngưỡng phát hiện chấm công, gồm ra muộn 15–30 phút; ảnh hưởng của giải trình lên tiền lương (spec Chấm công).
- Đính kèm file, thông báo đẩy, email.
- Màn `/admin/yeu-cau`.
- Cờ "được tạm ứng" của hợp đồng (`advance_on`, `canAdvance`): xem câu hỏi Q1, mục 9.

## 9. Ruling và câu hỏi còn mở

**Ruling** (tự quyết theo spec, người dùng xem lại khi duyệt):

- **R1. Khoảng xét ngày cần giải trình** là từ ngày 01 của tháng trước tới hôm nay.
  - Lý do: chốt công theo tháng; xét toàn bộ lịch sử thì nặng và có thể lôi ra ngày rất cũ của tháng chưa ai chốt.
  - Rủi ro nếu sai: tháng cũ hơn chưa chốt mà vẫn còn ngày thiếu giờ thì không hiện trong chuông.
- **R2. Tạm ứng không có ô lý do**, nên server ghi `reason` bằng tiêu đề.
  - Lý do: cột `reason` bắt buộc.
  - Rủi ro nếu sai: Admin thấy lý do trùng tiêu đề; vô hại.
- **R3. Tạm ứng tính bằng 0 đồng thì khoá** với dòng "Chưa có ngày công 01–15/11".
  - Lý do: đơn 0 ₫ vô nghĩa; theo luật "ngăn trước".
  - Rủi ro nếu sai: nhân viên không có ngày công không gửi được đơn để Admin xem.
- **R4. Số tiền tạm ứng làm tròn tới đồng.**
  - Lý do: giống phiếu lương.
  - Rủi ro nếu sai: lệch tối đa 1 ₫.
- **R5. Lỗi có sẵn, chưa sửa ở đây:** `SystemService.lockPeriod` ghi `status = 'LOCKED'`, giá trị không có trong CHECK của `payroll_periods`. Spec coi tháng đã chốt là `status <> 'open'`, nên đúng với mọi giá trị. Lỗi này báo thành việc riêng.

**Câu hỏi còn mở** (chưa trả lời thì coi là chưa quyết; spec không làm):

- **Q1.** Nhân viên có hợp đồng "Được tạm ứng: Không" (`advance_on = 0`) có bị chặn nộp tạm ứng không?
  - Hiện tại: v2 và v1 đều lưu cờ này nhưng route tạo đơn không kiểm.
  - Ví dụ: tts A có cờ Không; ngày 16/11 A vẫn thấy và gửi được đơn tạm ứng.
