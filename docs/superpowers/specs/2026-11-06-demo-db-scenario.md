# Kịch bản DB demo đủ tính năng (bản nháp v2, 3 tháng, 06/11/2026)

Chưa có mã. Bản này chỉ nêu mục tiêu, cách tạo, người và ngày cụ thể, để bạn sửa trước khi viết script.

## 1. Mục tiêu và cách tạo

- Một DB `luong_demo` trong container riêng `luong-demo-pg`. `luong-db`, `luong-app` của bạn không bị đụng.
- Script mới `scripts/dev/seed-demo.ts` (`npm run seed:demo`), **viết mới, không dùng `ScenarioEnv`**. Nó dựng lại DB từ `schema.sql` rồi nạp dữ liệu.
- Nạp bằng chính các service của BE (không ghi SQL thẳng vào bảng nghiệp vụ), gọi trong một tiến trình Nest. Lý do: đơn từ chỉ nộp được cho ngày từ hôm nay đến hết tháng sau (`filingWindow`), kỳ lương chỉ chốt được khi tháng đã hết (`MonthNotEnded`), nên dữ liệu tháng 10 cần đồng hồ chạy lùi. Script có một hàm `at(thờiĐiểm, việc)` đặt `Date` của tiến trình tại thời điểm đó rồi chạy việc, và trả đồng hồ về lúc kết thúc. Chấm công thì gọi `recordPunch` với `punchedAt`, không cần đồng hồ.
- Mốc: **hôm nay = Thứ Sáu 06/11/2026**. Dữ liệu trải **3 tháng**: tháng 9 (01/09, Thứ Ba) và tháng 10 là hai kỳ đã đóng, tháng 11 đang chạy đến 06/11. Tháng 9 để **Đã trả** (ngày trả 10/10 đã qua), tháng 10 **Đã phê duyệt kỳ** (ngày trả 10/11 chưa tới), tháng 11 mở.
- Mật khẩu mọi tài khoản demo: `Demo@123456` (chỉ cho DB demo). Admin: `boss`.

## 2. Cài đặt nền

| Mục | Giá trị |
|---|---|
| Phòng ban | Phòng ban 1, Phòng ban 2 (có sẵn từ schema), Phòng ban 3 (để trống, thử xoá) |
| Vùng chấm công | tâm 10.8000, 106.7000, bán kính 500 m |
| Lịch lễ | 02/09 Quốc khánh (+ 01/09 nếu bạn muốn), 20/10 Ngày Phụ nữ Việt Nam (đã qua), 20/11 Ngày Nhà giáo (sắp tới) |
| Tuần làm | mặc định T2–T7; riêng `oanh` đặt T2–T6 (lịch sử tuần có 2 phiên bản) |
| Ngày trả lương | mặc định ngày 10 (nên chưa trả được tháng 10, xem mục 6) |
| Ca | Normal1 08–17, Flex1 06–15, Night1 22–07 |

## 3. Nhân sự (13 người + Admin)

| Username | Người | Loại · bậc | Phòng | Ca | Vai trò trong kịch bản |
|---|---|---|---|---|---|
| `boss` | Admin | admin | — | — | duyệt, tính lương, chốt kỳ |
| `an` | Nguyễn Văn An | NV · 2 | PB1 | Normal1 | **chuẩn**: đi đủ cả tháng 10, 5 ngày đầu tháng 11, mốc so sánh |
| `binh` | Trần Thị Bình | NV · 1 | PB1 | Normal1 | **đi muộn**: 4 ngày tháng 10 vào trễ 20–40 phút (qua ân hạn 15 phút, mất chuyên cần) |
| `chi` | Lê Thu Chi | NV · 3 | PB2 | Flex1 | **quên check-out** và giải trình: duyệt, chờ, từ chối |
| `dung` | Phạm Văn Dũng | NV · 2 | PB2 | Night1 | **ca đêm**: phụ cấp 30%, vào 22:00 ra 07:00 hôm sau, 1 ngày vào sớm |
| `em` | Hoàng Thị Em | TTS · 1 | PB1 | Normal1 | **TTS**: không có Thứ Bảy công, đơn iSAT |
| `phuc` | Đặng Văn Phúc | NV · 1 | PB1 | Normal1 | **vắng không phép** 2 ngày tháng 10 (0đ, mất chuyên cần) |
| `giang` | Vũ Hương Giang | NV · 2 | PB2 | Normal1 | **nghỉ**: đủ 6 loại nghỉ, kèm 1 đơn bị chặn duyệt |
| `hanh` | Bùi Thị Hạnh | NV · 2 | PB1 | Normal1 | **nghỉ có làm bù**: 1 đã bù đủ, 1 bù thiếu (còn nợ), 1 chờ duyệt |
| `khoa` | Phan Minh Khoa | NV · 1 | PB2 | Normal1 | **thử việc** (`probation`) |
| `lan` | Đỗ Mai Lan | NV · 2 | PB1 | Normal1 | **tạm nghỉ** 02/11–28/11 (`on_leave`), có chấm công tới 30/10 |
| `minh` | Ngô Quốc Minh | NV · 1 | PB2 | Normal1 | **đã nghỉ việc** 15/10, tài khoản khoá; lương tháng 10 theo ngày làm đến 15/10 |
| `nam` | Trịnh Văn Nam | CTV · 1 | PB2 | Normal1 | **OT**: ngày thường, Chủ nhật, ngày lễ 20/10; duyệt và từ chối |
| `oanh` | Lý Kim Oanh | NV · 1 | chưa xếp phòng | Normal1 | **đổi ca**, chưa đặt mật khẩu (chưa kích hoạt), tuần T2–T6 |

## 4. Chấm công (các trường hợp bắt buộc có)

Thang ngày công mẫu của tháng 10: T2–T7 trừ 20/10 (lễ) = 26 ngày công chuẩn.

| Trường hợp | Ai · ngày | Kết quả BE dự kiến |
|---|---|---|
| Đủ giờ, vào đúng giờ | `an` cả tháng | PRESENT, công đủ |
| Vào trễ qua ân hạn | `binh` 05/10, 12/10, 19/10, 26/10 | `late_minutes` > 15, phạt phút, cờ chuyên cần |
| Vào trễ trong ân hạn (≤15 phút) | `binh` 08/10 vào 08:10 | không phạt |
| Ra sớm | `chi` 14/10 ra 16:00 | `early_minutes` |
| Quên check-out | `chi` 07/10, 21/10 | PENDING tới khi giải trình |
| Thiếu giờ vào | `chi` 28/10 | `MISSING_CHECK_IN` |
| Vắng không phép | `phuc` 13/10, 14/10 | ABSENT |
| Ca đêm qua nửa đêm | `dung` 06/10 vào 22:00, ra 07:00 ngày 07/10 | tính đúng ngày công, phụ cấp ca |
| Ngày lễ | 20/10 mọi người | HOLIDAY |
| Làm ngày lễ | `nam` 20/10 8h | OT hệ số lễ |
| Làm Chủ nhật | `nam` 18/10 | EXTRA, OT hệ số cuối tuần |
| Thứ Bảy đủ công | `an` 10/10 | PRESENT |
| TTS Thứ Bảy | `em` 10/10 | không có ca |
| Vào ngoài vùng | `khoa` 02/10 tại điểm cách 2 km | bị từ chối chấm (`OUT_OF_ZONE`) |
| Hôm nay (06/11) | `an`, `chi` đã vào; `binh` vào trễ; `phuc` chưa vào | đủ trạng thái "đang làm", "trễ", "chưa check-in" |
| Ngày chưa tới | 07/11 trở đi | lưới tuần hiện "sắp tới" |

Cuối tháng 10 và đầu tháng 11 chạy "Tính lại" một lần để dòng ngày khớp với đơn đã duyệt.

### 4b. Thêm cho tháng 9 và các mẫu lặp (để bảng lương có nhiều dạng số)

Tháng 9: T2–T7 trừ 02/09 (lễ) = 25 ngày công chuẩn. Nhân sự vào làm trước 01/09, trừ `khoa` (vào thử việc 15/09, nên tháng 9 chỉ trả nửa tháng) và `oanh` (vào 21/09).

| Trường hợp | Ai · ngày | Mục đích |
|---|---|---|
| Tháng đầy đủ không lỗi | `an`, `dung` | lương chuẩn, ca đêm cả tháng |
| Trễ nhiều lần rải 3 tháng | `binh` 3 ngày tháng 9, 4 ngày tháng 10, 2 ngày tháng 11 | chuyên cần mỗi tháng một mức |
| Vắng không phép liền 3 ngày | `phuc` 14–16/09 | 0đ mỗi ngày, mất chuyên cần |
| Vào giữa tháng | `khoa` 15/09, `oanh` 21/09 | lương theo ngày đi làm |
| Nghỉ việc giữa tháng | `minh` ra 15/10 | tháng cuối còn lương, tài khoản khoá |
| Nghỉ dài | `lan` BHXH 3 tuần tháng 9, rồi tạm nghỉ từ 02/11 | lương không gồm ngày nghỉ BHXH |
| OT nhiều dạng | `nam` ngày thường, CN, lễ 02/09, lễ 20/10, đêm | đủ hệ số, phần miễn thuế (câu hỏi 3) |
| Ngày lễ trúng Chủ nhật | chọn một năm nếu cần | câu hỏi 4 |
| Thứ Bảy | `an` đi, `em` (TTS) không | công chuẩn khác nhau theo người |
| Tạm ứng mỗi tháng | `an`, `chi` tháng 9 và 10 | khấu trừ khi tính lương, bằng 80% lương ngày 01–15 |
| Tăng lương giữa chừng | `chi` đổi mức lương từ 01/10 | kỳ tháng 9 và 10 có mức khác nhau (phiên bản từ tháng) |
| Đổi phòng ban | `giang` PB2→PB1 ngày 01/10 | lọc phòng ban theo hiện tại |

## 5. Đơn từ (mỗi loại có đủ 4 trạng thái)

Nộp ở thời điểm quá khứ bằng `at(...)`, trong cửa sổ hợp lệ lúc đó. Admin duyệt hoặc từ chối bằng `boss`.

| Loại | Chờ | Duyệt | Từ chối | Huỷ | Ghi chú đặc biệt |
|---|---|---|---|---|---|
| Nghỉ (6 loại) | `giang` Phép năm 12–13/11 | `giang` 6 loại rải tháng 10 (Phép năm, Việc riêng có lương, Việc riêng không lương, BHXH, Phúc lợi, Không lương) | `phuc` Phép năm 13/10 (vì đã vắng) | `an` nghỉ 25–26/11 | 1 đơn **bị chặn duyệt**: `giang` nghỉ trùng ngày lễ 20/10 |
| Nghỉ có làm bù | `hanh` 09–10/11 | `hanh` 06/10 (bù đủ), `hanh` 20/10 (bù thiếu) | `hanh` 27/10 | — | khung bù 06–22 giờ tròn |
| Làm thêm giờ | `nam` 14/11 18–21h | `nam` 15/10 18–21h, 18/10 CN, 20/10 lễ | `nam` 22/10 | `nam` 28/10 | giờ tròn, tối đa theo mốc ngày |
| Đổi ca | `oanh` 12–13/11 sang Flex1 | `oanh` 19–21/10 sang Night1 | `oanh` 27/10 | — | phủ lên lịch ca của ngày |
| Tạm ứng | không (xem ghi chú) | `an`, `chi` nộp 16–17/10 | `binh` | `an` | số tiền cố định 80% lương ngày 01–15, tháng 11 chưa tới 16–17 nên không có đơn chờ |
| Giải trình | `chi` 21/10 | `chi` 07/10 | `chi` 28/10 | `binh` | trường hợp: vào trễ, ra sớm, quên check-out, thiếu giờ vào, vào sớm, ra muộn |
| iSAT | `an` Thứ Bảy 14/11 | `an` Thứ Bảy 17/10 | — | — | chỉ nhóm Nhân viên |

Ngày giải trình chờ của hôm nay: `binh` (vào trễ 04/11), `phuc` (không check-out 05/11) vào danh sách "cần giải trình"; `binh` đã được **nhắc** một lần.

Ngoài ma trận trên, mỗi tháng có thêm: tháng 9 mỗi loại đơn ≥ 2 đơn đã duyệt và 1 bị từ chối; `giang` nộp 2 đơn nghỉ trùng nhau (chặn đơn thứ hai); `an` nộp OT cho ngày đã có đơn OT (chặn); `hanh` bù vào khung đã quá hạn (chặn); đơn nộp ngay ngày hôm nay và ngày cuối tháng sau (hai đầu cửa sổ nộp).

## 6. Kỳ lương

| Tháng | Trạng thái cuối | Việc kèm theo |
|---|---|---|
| Tháng 9 | **Đã trả** | cùng quy trình như tháng 10, thêm bước "đã trả" ngày 10/10; nhật ký có `period.pay` |
| Tháng 10 | **Đã phê duyệt kỳ** (chưa trả vì ngày trả lương mặc định là 10/11, hôm nay 06/11) | chốt công → mở lại công có lý do → chốt lại → tính toàn kỳ → nhập KPI (đủ 5 phần cho `an`, thiếu phần cho `binh`, không có cho `nam` là CTV) → duyệt từng phiếu (duyệt, từ chối kèm lý do, một phiếu **tính lại sau khi duyệt về Nháp rồi duyệt lại**) → phê duyệt kỳ |
| Tháng 11 | Đang mở | chưa chốt, phiếu chưa tính; lưới và Tổng quan hiện số đang chạy |

Cố ý để tháng 10 chưa trả: để thử và thấy lỗi "chưa tới ngày trả lương". Nếu bạn muốn có sẵn một kỳ **Đã trả**, đổi ngày trả lương tháng 10 thành 5 (cài đặt có phiên bản từ tháng) và gọi "đã trả" một lần.

## 7. Phần còn lại tự có

- Nhật ký (audit): mọi thao tác trên đều ghi; kiểm `verify` sạch. Có đủ `staff.create/update/delete`, `password.reset`, `department.*`, `param.set`, `payroll.calculate/decide`, `kpi.score`, `period.*`.
- Vai trò: Admin duyệt; nhân viên chỉ thấy phần của mình (đăng nhập thử bằng `an`).
- Bản in phiếu lương: phiếu đã duyệt, đã từ chối và nháp đều có.

## 8. Không có trong kịch bản (và lý do)

- Nửa ca: BE chưa làm.
- Phạm vi quản lý theo bậc (§6 của tài liệu yêu cầu): bạn đã bỏ.
- Tạm ứng chờ duyệt cho tháng 11: chỉ nộp được ngày 16–17, hôm nay mới 06/11.

## 9. Kiểm chứng sau khi nạp

- Một test `seed-demo.pg.test.ts` chạy script trên DB tạm, rồi đếm từng dòng của bảng ở mục 4–6 (mỗi trường hợp ≥ 1 dòng) và gọi `audit/verify`.
- Sau khi nạp lên `luong_demo`, đăng nhập `boss` và `an` bằng API thật, đọc: lưới tuần, chuông, tab Yêu cầu, bảng lương tháng 10, phiếu của `an`. Báo số thật đã thấy.

## 10. Luật lấy theo code (không hỏi lại)

- Công chuẩn: `standardWorkdays` của tuần làm từng người (mặc định 26; `oanh` T2–T6 có số khác). Lương ngày = lương × công / công chuẩn.
- OT: phần miễn thuế = (hệ số − 1) × giờ × đơn giá giờ cho từng loại ngày; ngày lễ thắng cuối tuần. Ca đêm: min(30% lương giờ, phụ cấp đêm).
- Người vào giữa tháng, nghỉ BHXH, tăng lương: kịch bản chỉ dựng dữ liệu, số tiền do chính BE tính; test đọc số BE trả, không tự đặt đáp án.
- Còn lại là quyết định tôi tự lấy: tháng 9 Đã trả, tháng 10 Đã phê duyệt kỳ, tháng 11 mở; ngày demo neo 06/11/2026 (không thêm công tắc đóng băng).
