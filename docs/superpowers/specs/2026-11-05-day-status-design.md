# Trạng thái ngày và xung đột giữa các đơn (BE v2) — thiết kế

Spec này sửa mục 3 trong review nhánh Đơn từ: đơn nghỉ trùm một Thứ Bảy iSAT đã duyệt vẫn đếm ngày đó. Thay vì vá riêng chỗ này, người dùng chốt một mô hình chung:
- mỗi người, mỗi ngày mang **một trạng thái chính**;
- trạng thái do đơn gán, và **đơn có trước được áp dụng trước**;
- trạng thái được **lưu trong một bảng riêng**, sau này dùng để hiện lịch của nhân viên.

Loại: Architectural. Spec thêm bảng `day_status`, đổi luật chặn khi nộp và khi duyệt, đổi thân lỗi và thân trả về của API tạo đơn.

**Nguồn**
- Luật do người dùng chốt trong chat ngày 2026-11-05 (mục 1).
- Code nền: nhánh `claude/requests-review-fixes-26c409` tại 89f1994, gồm spec 1 Đơn từ và các sửa review mục 1, 2, 4, 5.
- luong-app chỉ dùng để so: mỗi ngày một `kind` (work, makeup, holiday, leave, unpaid, isat). luong-app không có đơn đổi ca, cũng không có đơn đang chờ.

## 1. Luật đã chốt (người dùng, chat 2026-11-05)

| # | Luật | Lời người dùng |
|---|------|----------------|
| T1 | Mỗi ngày một trạng thái chính. Đơn có trước được áp dụng trước; đơn trùng ngày nộp sau bị chặn, trừ các ngoại lệ T3, T4 và T6. | "cái nào đã duyệt trước thì áp dụng trước … thứ 7 đã được nghỉ rồi thì chặn không cho iSat đi" |
| T2 | Đơn **đang chờ** cũng giữ ngày, nên đơn trùng nộp sau bị chặn ngay lúc nộp. | Chọn "(A) Đang chờ cũng chặn" |
| T3 | Đơn nghỉ, nghỉ có làm bù hoặc iSAT nộp trên ngày đã có đơn đổi ca (đang chờ hoặc đã duyệt) thì **được**, và thay cho ca đã đổi của ngày đó. | "Được, nghỉ thay ca" |
| T4 | Đơn đổi ca có khoảng ngày trùm ngày đang nghỉ (đang chờ hoặc đã duyệt) thì **được nhận**, và ngày nghỉ giữ nguyên là nghỉ. Nếu đơn nghỉ đó sau này bị từ chối hoặc bị huỷ, ngày đó về **ca thường**, không thành ca đã đổi. | "Bỏ qua ngày nghỉ" |
| T5 | Thứ Bảy đã có iSAT **đã duyệt**: không chọn được ngày đó, có cảnh báo. iSAT **đang chờ**: từ chối đơn mới, cảnh báo nhân viên huỷ đơn iSAT hoặc sửa lại kế hoạch. Áp dụng cho nghỉ, nghỉ có làm bù, khung bù, OT, đổi ca và giải trình. | "nếu isat được duyệt thì không cho chọn ngày đó, còn nếu chưa được duyệt thì yêu cầu hủy isat hoặc sửa lại kế hoạch" |
| T6 | Đơn theo khoảng ngày (nghỉ, nghỉ có làm bù, đổi ca) trùm một Thứ Bảy iSAT **đã duyệt**: nhận đơn, bỏ Thứ Bảy đó ra như Chủ nhật, và kèm một dòng cảnh báo. Nếu bỏ xong không còn ngày nào thì chặn. | "như trên nhé" (**cần xác nhận lại**, xem ghi chú) |
| T7 | Đơn iSAT nộp sau dùng cùng kiểu cảnh báo. Thứ Bảy là ngày lễ, đã nghỉ theo đơn đã duyệt, hoặc có khung OT/bù đã duyệt: không chọn được. Đơn nghỉ, OT hoặc nghỉ có làm bù trên Thứ Bảy đó còn đang chờ: báo huỷ đơn đó hoặc chọn Thứ Bảy khác. | "như trên nhé" (**cần xác nhận lại**) |
| T8 | Trạng thái ngày lưu trong bảng riêng và phải được test kỹ. Sau này bảng dùng để hiện lịch của nhân viên. | "thêm bảng đi bro, test kỹ vô là được, vì cái này có thể dùng để hiện lên lịch của nhân viên ấy" |

Ghi chú về T6 và T7: người dùng trả lời "như trên nhé" cho tin nhắn có hai đề xuất này. Tôi hiểu câu đó là đồng ý cả hai đề xuất. Khi duyệt spec, nhờ người dùng kiểm lại hai dòng T6 và T7.

## 2. Trạng thái

### 2.1 Trạng thái đơn (giữ như v2)

| Trạng thái | Giữ ngày? | Ghi chú |
|---|---|---|
| Chờ duyệt (`PENDING`) | Có (T2) | Ngày được giữ chỗ nhưng chưa thành trạng thái chính thức. |
| Đã duyệt (`APPROVED`) | Có | Lúc duyệt mới ghi lịch làm việc (`work_schedules`). |
| Từ chối (`REJECTED`) | Không | Trả ngày lại (mục 4.3). |
| Đã huỷ (`CANCELLED`) | Không | Chỉ huỷ được khi đơn còn chờ, như v2. Trả ngày lại (mục 4.3). |

### 2.2 Trạng thái ngày

Mỗi người, mỗi ngày có đúng một trạng thái chính.

| # | Trạng thái | Do đâu mà có | Lưu ở đâu |
|---|---|---|---|
| 1 | Ngày làm | Ngày làm việc của loại nhân sự, không phải ngày lễ, chưa đơn nào chiếm | Suy ra (không có dòng) |
| 2 | Đổi ca | Đơn đổi ca đang chờ hoặc đã duyệt | `day_status`, `SHIFT_CHANGE` |
| 3 | Nghỉ tuần | Chủ nhật; Thứ Bảy của tts | Suy ra |
| 4 | Nghỉ lễ | Ngày trong lịch lễ công ty rơi vào ngày làm việc của loại nhân sự | Suy ra |
| 5 | Nghỉ · loại | Đơn nghỉ đang chờ hoặc đã duyệt (6 loại nghỉ) | `day_status`, `LEAVE` |
| 6 | Nghỉ có làm bù | Ngày nghỉ của đơn nghỉ có làm bù đang chờ hoặc đã duyệt | `day_status`, `LEAVE_WITH_MAKEUP` |
| 7 | iSAT | Đơn iSAT đang chờ hoặc đã duyệt (chỉ Thứ Bảy, chỉ nhóm có iSAT) | `day_status`, `ISAT` |

Ngoài trạng thái chính, một ngày có thể **gắn thêm** khung OT, khung làm bù (kể cả khung bù của đơn nghỉ có làm bù) và đơn giải trình. Các thứ này không đổi trạng thái chính và vẫn chỉ nằm trong đơn, như spec 1 (R19). Kết quả chấm công (hợp lệ, cần giải trình, vắng) thuộc spec 2.

Ruling: chỉ lưu các ngày do đơn chiếm (trạng thái 2, 5, 6, 7). Ngày làm, nghỉ tuần và nghỉ lễ suy ra từ loại nhân sự và lịch lễ. — Lý do: nếu lưu cả ba loại này, bảng phải có một dòng cho mỗi người mỗi ngày, và phải viết lại khi Admin sửa lịch lễ hoặc đổi loại nhân sự. Lịch tháng gộp hai nguồn khi đọc. — Rủi ro nếu sai: API lịch sau này phải gộp hai nguồn thay vì đọc một bảng; muốn đổi thì chỉ cần thêm bước ghi, không phải đổi lược đồ.

### 2.3 Ma trận: ngày đang ở trạng thái X, nộp thêm đơn loại Y

Ký hiệu:
- **Mới**: khác v2 hiện nay.
- *như v2*: giữ nguyên.
- Không tính: ngày đó không được đếm vào đơn, như Chủ nhật.
- —: không áp dụng.
- C1…C9: câu cảnh báo ở mục 2.4.

| Ngày \ Đơn mới | Nghỉ | Nghỉ có làm bù | Khung bù | OT | Đổi ca | iSAT | Giải trình |
|---|---|---|---|---|---|---|---|
| Ngày làm | Được *như v2* | Được *như v2* | Được, ngoài ca *như v2* | Được, ngoài ca *như v2* | Được *như v2* | Được nếu là T7 và nhân sự có iSAT *như v2* | Được, chỉ ngày đã qua *như v2* |
| Ngày làm có khung OT/bù (đang chờ hoặc đã duyệt) | Chặn *như v2* | Chặn *như v2* | Được, không chạm khung đã có *như v2* | Được, không chạm khung đã có *như v2* | Chặn nếu ca mới chạm khung *như v2* | **Mới:** khung đã duyệt thì C8; khung đang chờ thì C9 | Được *như v2* |
| Đổi ca (chờ hoặc đã duyệt) | **Được, thay ca ngày đó** (T3) | **Được, thay ca ngày đó** (T3) | Được, theo ca mới *như v2* | Được, theo ca mới *như v2* | Chặn *như v2* | **Mới: được, thay ca ngày đó** (T3) | Được *như v2* |
| Nghỉ tuần | Không tính *như v2* | Không tính *như v2* | Được 06–22 *như v2* | Được ≤ 12 giờ *như v2* | Không tính *như v2* | — | *như v2* |
| Nghỉ lễ | Không tính *như v2* | Không tính *như v2* | Được 06–22 *như v2* | Được ≤ 12 giờ *như v2* | Không tính *như v2* | **Mới:** C5 | *như v2* |
| Nghỉ · loại (chờ hoặc đã duyệt) | Chặn *như v2* | Chặn *như v2* | Chặn *như v2* | Chặn *như v2* | **Mới: không tính ngày này, kèm C4** (T4) | **Mới:** đơn nghỉ đã duyệt thì C6; đang chờ thì C7 | *như v2* (không kiểm) |
| Nghỉ có làm bù (chờ hoặc đã duyệt) | Chặn *như v2* | Chặn *như v2* | Chặn *như v2* | Chặn *như v2* | **Mới: không tính ngày này, kèm C4** (T4) | **Mới:** C6 / C7 | *như v2* (không kiểm) |
| iSAT đã duyệt | **Mới: không tính ngày này, kèm C2** (T6) | **Mới: không tính ngày này, kèm C2** (T6) | Chặn, **câu mới C1** | Chặn, **câu mới C1** | **Mới: không tính ngày này, kèm C2** (T6) | Chặn *như v2* | **Mới:** C1 |
| iSAT đang chờ | **Mới:** C3 | **Mới:** C3 | **Mới:** C3 | **Mới:** C3 | **Mới:** C3 | Chặn *như v2* | **Mới:** C3 |

Hiện nay, khi duyệt iSAT, v2 ghi Thứ Bảy đó vào lịch là "nghỉ". Vì vậy OT, khung bù và đổi ca trên Thứ Bảy iSAT **đã duyệt** đã bị chặn với câu "đang nghỉ". Spec này giữ việc chặn, chỉ đổi câu báo, và chuyển nguồn kiểm sang `day_status`.

Quy tắc chung cho đơn theo khoảng ngày (nghỉ, nghỉ có làm bù, đổi ca):
1. Ngày được xét là các ngày làm việc trong khoảng, như v2: bỏ Chủ nhật, nghỉ tuần và ngày lễ.
2. Xét từng ngày theo thứ tự. Gặp ô "Chặn" hoặc C3 thì từ chối cả đơn, báo theo ngày đầu tiên bị chặn.
3. Các ô "không tính ngày này" bỏ ngày đó khỏi đơn và thêm cảnh báo.
4. Bỏ xong mà không còn ngày nào thì từ chối:
   - nếu mọi ngày bị bỏ vì iSAT đã duyệt thì báo C1 theo ngày đầu;
   - còn lại thì báo như v2: "Khoảng nghỉ không có ngày làm việc" hoặc "Khoảng đổi ca không có ngày làm việc".
5. Số ngày của đơn, gồm số ngày Phép năm trừ vào số dư và số giờ bù phải xếp (8 giờ × số ngày), chỉ đếm các ngày được tính.

Đơn iSAT, OT, khung bù và giải trình chỉ có một ngày, nên mọi ô không phải "Được" đều là từ chối đơn. Mỗi khung bù của đơn nghỉ có làm bù được xét như một đơn một ngày; chỉ một khung lỗi là từ chối cả đơn.

Một ngày có thể thuộc hai dòng cùng lúc, ví dụ vừa đổi ca vừa có khung OT. Khi đó ô "Chặn" thắng: đơn nghỉ trên ngày đổi ca đã có khung OT vẫn bị chặn.

### 2.4 Câu cảnh báo

Ví dụ dùng Thứ Bảy 14/11/2026 và Thứ Tư 11/11/2026. Câu thật ghi ngày theo dạng `dd/MM`.

| Mã | Khi nào | Loại | Câu |
|---|---|---|---|
| C1 | Đơn một ngày (OT, khung bù, giải trình) rơi vào iSAT đã duyệt; hoặc đơn theo khoảng chỉ còn ngày iSAT đã duyệt | Lỗi | "Thứ Bảy 14/11 đã có iSAT được duyệt, không chọn được ngày này." |
| C2 | Đơn theo khoảng bỏ một Thứ Bảy iSAT đã duyệt | Cảnh báo, đơn vẫn nhận | "Thứ Bảy 14/11 đã có iSAT được duyệt, không tính vào đơn." |
| C3 | Ngày rơi vào iSAT đang chờ | Lỗi | "Thứ Bảy 14/11 đang có đơn iSAT chờ duyệt. Huỷ đơn iSAT hoặc chọn ngày khác." |
| C4 | Đơn đổi ca bỏ một ngày đang nghỉ | Cảnh báo, đơn vẫn nhận | "Ngày 11/11 đang nghỉ, giữ nguyên ngày nghỉ, không đổi ca." |
| C5 | iSAT trên Thứ Bảy là ngày lễ | Lỗi | "Thứ Bảy 14/11 là ngày lễ, không chọn được cho iSAT." |
| C6 | iSAT trên Thứ Bảy đã nghỉ theo đơn đã duyệt | Lỗi | "Thứ Bảy 14/11 đã nghỉ theo đơn đã duyệt, không chọn được cho iSAT." |
| C7 | iSAT trên Thứ Bảy có đơn nghỉ hoặc nghỉ có làm bù đang chờ | Lỗi | "Thứ Bảy 14/11 đang có đơn nghỉ chờ duyệt. Huỷ đơn nghỉ hoặc chọn Thứ Bảy khác." |
| C8 | iSAT trên Thứ Bảy có khung OT/bù đã duyệt | Lỗi | "Thứ Bảy 14/11 đã có khung OT hoặc làm bù được duyệt, không chọn được cho iSAT." |
| C9 | iSAT trên Thứ Bảy có khung OT/bù đang chờ | Lỗi | "Thứ Bảy 14/11 đang có đơn OT chờ duyệt. Huỷ đơn đó hoặc chọn Thứ Bảy khác." Nếu khung thuộc đơn nghỉ có làm bù thì chữ "đơn OT" thành "đơn nghỉ có làm bù". |

Các lỗi còn lại giữ nguyên câu như v2.

## 3. Bảng `day_status`

Sửa `migrations/postgres/schema.sql` trực tiếp, không thêm file đánh số, như mọi thay đổi lược đồ khác. Thêm kiểu bảng vào `src/database/schema.ts`.

```sql
-- Trạng thái ngày do đơn chiếm (đang chờ hoặc đã duyệt). Mỗi người mỗi ngày tối đa một dòng.
-- Ngày làm, nghỉ tuần và nghỉ lễ không có dòng: suy ra từ loại nhân sự và lịch lễ.
CREATE TABLE day_status (
  employee_id     TEXT NOT NULL REFERENCES staff(uuid),
  work_date       DATE NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('LEAVE', 'LEAVE_WITH_MAKEUP', 'SHIFT_CHANGE', 'ISAT')),
  request_id      UUID NOT NULL REFERENCES system_requests(id),
  base_request_id UUID REFERENCES system_requests(id), -- đơn đổi ca bị đơn này thay đúng ngày này (T3)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (employee_id, work_date),
  CHECK (base_request_id IS NULL OR status <> 'SHIFT_CHANGE')
);
CREATE INDEX idx_day_status_request ON day_status(request_id);
CREATE INDEX idx_day_status_base_request ON day_status(base_request_id);
```

Ruling: "đang chờ" hay "đã duyệt" không chép vào bảng mà đọc qua `JOIN system_requests` theo `request_id`. — Lý do: trạng thái đơn chỉ có một nguồn, nên bảng không thể nói "đã duyệt" khi đơn còn chờ; lúc duyệt cũng không phải ghi thêm. — Rủi ro nếu sai: mọi lần đọc lịch đều cần JOIN. Với chỉ mục theo khoá chính và `request_id` thì chi phí này nhỏ.

Loại nghỉ và giờ ca mới cũng đọc từ đơn qua `request_id`, không chép vào bảng.

### 3.1 Bất biến (test phải kiểm)

- **I1.** Mỗi `(employee_id, work_date)` có tối đa một dòng. Khoá chính bảo đảm điều này.
- **I2.** Mỗi dòng trỏ tới một đơn `PENDING` hoặc `APPROVED` của chính nhân viên đó, và `status` đúng bằng loại của đơn.
- **I3.** `base_request_id`, nếu có, trỏ tới một đơn đổi ca `PENDING` hoặc `APPROVED` của cùng nhân viên mà khoảng ngày chứa `work_date`.
- **I4.** Mọi ngày có dòng của một đơn nghỉ, nghỉ có làm bù, iSAT hoặc đổi ca đã duyệt đều đã được ghi vào `work_schedules`, đúng loại.
- **I5.** Không có ngày nào vừa có dòng `LEAVE`, `LEAVE_WITH_MAKEUP` hoặc `ISAT`, vừa có khung OT hoặc bù của một đơn đang chờ hay đã duyệt.

Test PG có một hàm SQL kiểm I1–I5 cho một nhân viên, gọi sau mỗi kịch bản.

## 4. Vòng đời: ghi bảng ở đâu

Mọi lần ghi `day_status` của một nhân viên chạy dưới khoá nhân viên `requests_<uuid>` và trên giao dịch của khoá đó. Đơn, bảng và lịch vì vậy được ghi cùng nhau, hoặc không ghi gì cả.

Thứ tự khoá:
- Nộp đơn chỉ lấy khoá nhân viên.
- Duyệt, từ chối và huỷ lấy khoá `request_<id>` trước, đọc đơn, rồi lấy thêm khoá nhân viên **trên cùng giao dịch** bằng `TransactionCoordinator.acquireAdvisoryLock(trx, …)`. Cách này không mở thêm kết nối.
- Không luồng nào lấy khoá đơn sau khoá nhân viên, nên không thể khoá chéo.

### 4.1 Nộp đơn

1. Đọc các dòng `day_status` của nhân viên trong khoảng cần xét (rộng thêm một ngày mỗi phía, như `loadDays`), kèm trạng thái đơn qua JOIN.
2. Hàm thuần `planClaims` (mục 5) xét ma trận 2.3 và trả về một trong hai:
   - các ngày đơn được chiếm (có ghi rõ ngày nào thay một dòng đổi ca) cùng các cảnh báo;
   - hoặc `DayConflictError`.
3. Kiểm các luật cũ của spec 1 trên các ngày được chiếm: khung OT/bù, ca mới, giới hạn 12 giờ, 40 giờ OT, số dư Phép năm, số giờ bù.
4. Lưu đơn.
5. Ghi bảng:
   - ngày còn trống thì thêm dòng;
   - ngày đang là dòng đổi ca bị đơn nghỉ, nghỉ có làm bù hoặc iSAT thay thì cập nhật dòng đó: `status` và `request_id` của đơn mới, `base_request_id` là đơn đổi ca cũ.
6. Đơn iSAT không đủ điều kiện thì domain tự từ chối ngay lúc nộp, như v2. Đơn đó không qua `planClaims` và không ghi dòng.

`createIsatRequest` chuyển vào dưới khoá nhân viên, như các loại đơn khác. Hàm dùng `resolveStaff` và `loadDays` để có loại nhân sự và lịch lễ.

### 4.2 Duyệt (`APPROVE`)

1. Kiểm lại: chạy `planClaims` cho đơn trên trạng thái hiện tại, coi các dòng của chính đơn này là trống.
   - Nếu có xung đột, từ chối việc duyệt và không ghi gì. Lỗi 409, mã `DAY_CONFLICT`. Câu báo là câu của ô bị chặn (2.4, hoặc câu cũ của spec 1), thêm câu " Chỉ có thể từ chối đơn này."
   - Theo luật nộp, trường hợp này chỉ xảy ra khi dữ liệu đã sai. Việc kiểm là để phòng.
2. Ghi lịch theo **các ngày có dòng của đơn**, thay cho việc tính lại `workingDaysBetween` như hiện nay:
   - nghỉ và nghỉ có làm bù: `withLeave`;
   - đổi ca: `withShiftChange`, chỉ trên các ngày còn là dòng của đơn đổi ca. Ngày đã bị đơn khác thay thì không ghi;
   - iSAT: `withIsat`.
3. OT, giải trình và tạm ứng ghi như v2.
4. Bảng `day_status` không đổi khi duyệt, vì trạng thái "đã duyệt" đọc qua JOIN.

### 4.3 Từ chối (`REJECT`) và huỷ (`PATCH /:id/cancel`)

Với mỗi dòng có `request_id` là đơn này:
- Có `base_request_id`, và đơn đổi ca gốc vẫn `PENDING` hoặc `APPROVED`: **trả ngày cho đơn đổi ca**. Dòng thành `SHIFT_CHANGE`, `request_id` = đơn gốc, `base_request_id` = NULL. Nếu đơn gốc đã duyệt thì ghi lịch ngày đó bằng `withShiftChange` (T3 đảo ngược).
- Còn lại: xoá dòng. Ngày về trạng thái suy ra. Đây là trường hợp của T4: ngày đó về ca thường.

Với mỗi dòng có `base_request_id` là đơn này (đơn đổi ca bị huỷ hoặc bị từ chối): đặt `base_request_id` = NULL.

`cancelRequest` hiện chạy ngoài khoá. Hàm chuyển vào dưới khoá `request_<id>` rồi khoá nhân viên, giống bước duyệt.

### 4.4 Ví dụ (Nam, nhóm nv, làm Thứ Hai đến Thứ Bảy, tháng 11/2026)

| # | Diễn biến | Bảng sau đó |
|---|---|---|
| V1 | iSAT 14/11 đã duyệt. Nam xin Phép năm 12–16/11. | Đơn tính 3 ngày (12, 13, 16), cảnh báo C2. Dòng `LEAVE` ở 12, 13, 16; 14 vẫn `ISAT`. |
| V2 | iSAT 14/11 đang chờ. Nam xin Phép năm 12–16/11. | Từ chối với C3. Bảng không đổi. |
| V3 | Đổi ca Night 10–12/11 (chờ). Nam xin Phép năm 11/11. Sau đó đơn phép bị từ chối. | Sau khi nộp phép: 11 là `LEAVE`, base = đơn đổi ca. Sau khi từ chối: 11 trở lại `SHIFT_CHANGE`. |
| V4 | Phép năm 11/11 (chờ). Nam xin đổi ca Night 10–13/11. Sau đó đơn phép bị từ chối. | Đổi ca chiếm 10, 12, 13, cảnh báo C4. Sau khi từ chối phép, 11 không còn dòng: ca thường. |
| V5 | Đổi ca Night 9–14/11 đã duyệt. Nam đăng ký iSAT 14/11, rồi được duyệt. | 14 thành `ISAT`, base = đơn đổi ca. Duyệt iSAT ghi `withIsat` lên lịch 14. |
| V6 | Khung OT 14/11 đang chờ. Nam đăng ký iSAT 14/11. | Từ chối với C9. |

## 5. Code

| File | Việc |
|---|---|
| `migrations/postgres/schema.sql`, `src/database/schema.ts` | Bảng và kiểu `day_status` (mục 3). |
| `src/modules/requests/domain/day-status.ts` (mới, thuần) | Kiểu `DayClaim` (ngày, trạng thái, đơn, trạng thái đơn, base). Hàm `planClaims({ kind, dates, claims, windows, holidays, ownRequestId? })` mã hoá ma trận 2.3, quy tắc khoảng ngày và các câu 2.4. Lớp `DayConflictError` mang `date`, `requestId`, `requestType`, `requestStatus`. Không đụng DB. |
| `src/modules/requests/day-status.repository.ts` (mới) | `listBetween(employeeId, from, to)` trả `DayClaim` (JOIN đơn để lấy trạng thái); `listByRequest(requestId)`; `claim(rows)`; `release(requestId)` (xoá hoặc trả ngày cho đơn đổi ca như 4.3); `clearBase(requestId)`; `withTransaction(trx)`. |
| `src/modules/requests/domain/employee-days.ts` | Nhận thêm `claims`. `isOnLeave` đọc từ `claims` (`LEAVE` / `LEAVE_WITH_MAKEUP`) thay cho lịch `ON_LEAVE` và danh sách đơn; thêm `claimOn(date)`. `shiftOf` giữ nguyên. |
| `src/modules/requests/requests.service.ts` | Các hàm `create*` theo 4.1. `createIsatRequest` vào dưới khoá. `reviewRequest` theo 4.2 và 4.3. `cancelRequest` theo 4.3. `markLeaveDays` và `markShiftChangeDays` đọc ngày từ `day_status`. Các hàm `create*` trả `SystemRequestDTO & { warnings: string[] }`. |
| `src/modules/requests/requests.controller.ts`, `src/modules/me/me.controller.ts` | Tạo đơn trả `{ created: true, request, warnings }`. `DayConflictError` lúc nộp thành lỗi 400; lúc duyệt thành lỗi 409. Cả hai mang `code: 'DAY_CONFLICT'` và `date`, `requestId`, `requestType`, `requestStatus` trong `details`. |
| `src/modules/requests/requests.module.ts` | Đăng ký `DayStatusRepository`. |
| FE admin (`web/src/services/admin-main.ts`) | Hàm `decide` coi mọi lỗi 400 là "đã có người xử lý". Lỗi duyệt dùng 409 nên không bị coi như vậy. Plan sẽ kiểm màn Yêu cầu hiện đúng câu của lỗi 409; nếu chưa hiện thì sửa để hiện. |
| `docs/api/v2-contract.md` §3.4 | Ghi `warnings`, lỗi `DAY_CONFLICT`, ma trận 2.3, và việc duyệt, từ chối, huỷ tác động lên `day_status`. |

Lương không đổi: ngày iSAT vẫn trả một ngày, và đơn nghỉ không còn ghi lịch nghỉ lên Thứ Bảy iSAT. Chấm công không đổi.

## 6. Ngoài phạm vi

- **API lịch cho nhân viên** (đọc `day_status` và gộp với ngày làm, nghỉ tuần, nghỉ lễ) và **form FE của nhân viên**. Form hiện chưa gửi đơn qua API v2 (vẫn dùng `PUT /sheet`), nên chưa có chỗ làm mờ ngày trên bộ chọn ngày. Phần này là việc tiếp theo; spec này để sẵn bảng, mã lỗi và `warnings` cho việc đó.
- **Sửa lịch lễ sau khi đơn đã nộp:** bảng không tự đổi. Đây vẫn là câu hỏi luật đang mở.
- **Khung OT/bù nộp theo ca của đơn đổi ca đang chờ, rồi đơn đổi ca bị từ chối:** câu hỏi luật đang mở.
- **Giải trình** trên ngày nghỉ, nghỉ tuần và nghỉ lễ: giữ như v2.
- **Huỷ đơn đã duyệt:** v2 chưa có.
- **Dữ liệu cũ:** không có bước dựng lại bảng cho các đơn đã có.
  - Ruling: không làm script dựng lại. — Lý do: DB dev được tạo lại từ `schema.sql` và chỉ có dữ liệu giả. — Rủi ro nếu sai: DB nào còn giữ đơn cũ sẽ thiếu dòng cho các đơn đó; lúc ấy cần một script phát lại đơn theo `created_at`.
- **Chấm công (punch) và tính lương** vẫn dùng kiểu khoá lồng; đã ghi ở bàn giao.

## 7. Test

Lệnh xác minh:
- `npm test` ở gốc repo, với `PG_TEST_URL` trỏ tới một container `postgres:16` dùng một lần (127.0.0.1:55432).
- `npm run test:ui` trong `web/`, nếu có sửa FE.

### 7.1 Hàm thuần `planClaims` — `test/v2/day-status-plan.test.ts`

- Mỗi ô của ma trận 2.3 không phải "—" có ít nhất một test. Các ô có phân biệt chờ/duyệt có test cho cả hai.
- Câu báo so đúng từng chữ với 2.4.
- Đơn theo khoảng:
  - bỏ đúng ngày và giữ thứ tự ngày;
  - bỏ xong không còn ngày thì báo C1 hoặc câu cũ;
  - nhiều ngày lỗi thì báo ngày lỗi đầu tiên;
  - một ngày C3 lẫn với ngày C2 thì lỗi C3 thắng.
- `ownRequestId`: các dòng của chính đơn được coi là trống (dùng khi duyệt).

### 7.2 Dịch vụ với fake — `test/v2/requests-day-status.test.ts`

- Các ví dụ V1–V6: kiểm bảng, lịch, `warnings` và số ngày của đơn.
- Số dư Phép năm không trừ ngày iSAT đã bỏ.
- Số giờ bù của đơn nghỉ có làm bù tính theo ngày được tính.
- Huỷ đơn đổi ca đã bị thay vài ngày: các dòng nghỉ trên những ngày đó còn nguyên, `base_request_id` thành NULL.
- Duyệt đổi ca sau khi một ngày đã bị nghỉ thay: lịch ngày đó không bị ghi đổi ca.
- Từ chối đơn nghỉ đã thay một ngày của đơn đổi ca **đã duyệt**: ngày đó trở lại `SHIFT_CHANGE`, và lịch ghi `withShiftChange`.
- Kiểm lại lúc duyệt: dựng sẵn một dữ liệu xung đột trong fake. Việc duyệt bị từ chối với `DAY_CONFLICT` và không ghi gì.
- Mọi thao tác ghi bảng đi qua giao dịch của khoá (nhật ký `calls` như `requests-review.test.ts`).
- Cập nhật các test cũ có câu báo đổi: OT, khung bù và đổi ca trên Thứ Bảy iSAT đã duyệt nay báo C1 hoặc C2 thay cho "đang nghỉ".

### 7.3 PostgreSQL — `test/v2/day-status.pg.test.ts`

- Khoá chính chặn dòng thứ hai trên cùng ngày. CHECK chặn `base_request_id` trên dòng `SHIFT_CHANGE`.
- Các ví dụ V1–V6 chạy trên DB thật. Sau mỗi kịch bản, hàm SQL kiểm I1–I5.
- Đồng thời:
  - nộp iSAT 14/11 và Phép năm 12–16/11 cùng lúc cho một người: đúng một đơn vào bảng, và bảng thoả I1–I5;
  - từ chối một đơn và nộp một đơn khác của cùng người cùng lúc: bảng không lệch.
- Nguyên khối:
  - lưu đơn lỗi sau khi đã ghi bảng (trigger như `requests-review.pg.test.ts`) thì không còn dòng nào;
  - trả ngày cho đơn đổi ca đã duyệt ghi cả bảng lẫn lịch trong cùng giao dịch.
- Pool 2 kết nối vẫn chạy được duyệt (khoá đơn rồi khoá nhân viên trên cùng giao dịch) song song với nộp đơn.

### 7.4 HTTP

- `POST /api/v2/requests/leave` trùm iSAT đã duyệt trả `warnings` là `[C2]`.
- Đơn rơi vào iSAT đang chờ trả 400, `code: 'DAY_CONFLICT'`, kèm `details`.
- Duyệt bị kiểm lại chặn thì trả 409, `code: 'DAY_CONFLICT'`.
- `POST /api/v2/me/requests/leave` trả cùng dạng như trên.

## 8. Nhánh và thứ tự

1. Spec và plan nằm trên nhánh `claude/requests-review-fixes-26c409`, cùng các sửa review mục 1, 2, 4, 5. Chưa merge, chưa push.
2. Plan viết sau khi người dùng duyệt spec.
3. Merge nhánh cần người dùng đồng ý.
