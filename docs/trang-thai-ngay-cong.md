# Các trạng thái của một ngày công

Lấy từ code (`src/modules/attendance/domain/attendance-day.ts`, `src/modules/me/domain/me-views.ts`, `src/modules/overview/domain/cells.ts`). BE dựng một dòng ngày cho mỗi người mỗi ngày theo thứ tự ưu tiên ở bảng 1; FE chỉ hiện.

## 1. Trạng thái dòng ngày (BE), theo thứ tự xét

| # | Trạng thái | Khi nào | Tính lương | Tính vào |
|---|---|---|---|---|
| 1 | `OUTSIDE` | Ngày trước ngày vào làm hoặc sau ngày nghỉ việc | Không | Không đếm gì |
| 2 | `HOLIDAY` | Ngày lễ của công ty rơi vào ngày làm | 1 ngày nếu loại nhân sự có hưởng lễ, không thì 0 | Ngày có lương (nếu được trả) |
| 3 | `LEAVE_PAID` | Đơn nghỉ đã duyệt, hình thức hưởng lương và loại nhân sự có phép năm | 1 ngày | Ngày nghỉ; ngày có lương |
| 3 | `LEAVE_UNPAID` | Đơn nghỉ đã duyệt, nghỉ không lương (hoặc loại nhân sự không có phép) | 0 | Ngày nghỉ |
| 3 | `LEAVE_MAKEUP` | Đơn nghỉ có làm bù đã duyệt | 0 ngày; tiền trả theo phút làm bù | Ngày nghỉ bù |
| 3 | `ISAT` | Thứ Bảy iSAT đã duyệt | 1 ngày nếu loại nhân sự có iSAT, không thì 0 | Ngày có lương (nếu được trả) |
| 4 | `REST` | Ngoài tuần làm việc, không có khung OT/bù | Không | Không |
| 4 | `EXTRA` | Ngoài tuần làm việc nhưng có khung OT hoặc làm bù | Không (chỉ tiền OT/bù theo phút) | Không |
| 5 | `PENDING` | Ngày làm, chưa đánh giá: chưa đủ giờ vào + ra và chưa quá giờ hết ca 30 phút | Chưa tính | Chưa đếm |
| 5 | `ABSENT` | Ngày làm đã đánh giá, không có lần chấm nào và không có giải trình được duyệt | 0 | Ngày nghỉ (vắng) |
| 5 | `PRESENT` | Ngày làm có chấm công (hoặc giải trình được duyệt) | Xem bảng 2 | Ngày làm khi có lương |

## 2. Ngày `PRESENT` được bao nhiêu công

| Tình huống | Công | Ghi chú |
|---|---|---|
| Không có mã nào ảnh hưởng tiền | 1 ngày (nửa ca: 0,5) | |
| Có mã ảnh hưởng tiền, **chưa** có giải trình được duyệt | 0 | Ngày hiện "Cần xử lý / chờ giải trình"; có giải trình duyệt thì mới tính |
| Có mã ảnh hưởng tiền, giải trình **đã duyệt** | 1 ngày (nửa ca: 0,5) | Trừ phút theo khối 30 phút: `floor((phút + 15) / 30) × 30`, trần 480 phút, không trừ khi ≤ 15 phút |
| Ngày nửa ca (nghỉ giữa ca) | 0,5 | Phần nửa kia là nợ nghỉ giữa ca, trả bằng giờ làm thêm |

Mã giải trình: `LATE_CHECK_IN` (vào muộn quá 15 phút), `EARLY_CHECK_OUT` (ra sớm), `MISSING_CHECK_IN`, `MISSING_CHECK_OUT`; `EARLY_CHECK_IN` chỉ để biết. Mã chỉ "để biết" (so với khung OT/bù, không phải ca) không ảnh hưởng tiền.

## 3. Ô hiển thị

| Ô (Admin, lưới chấm công) | Nhãn | Từ trạng thái |
|---|---|---|
| `work` | Đi làm | `PRESENT` không trừ, `EXTRA`, ngày `PENDING` đã qua |
| `late` | Đi muộn | `PRESENT` có phút bị trừ |
| `leave` | Nghỉ có phép | `HOLIDAY`, `ISAT`, `LEAVE_*` |
| `absent` | Vắng | `ABSENT`; ngày chờ tính quá khứ không có lần chấm nào |
| `todo` | Cần xử lý | `PRESENT` có mã ảnh hưởng tiền chưa được duyệt giải trình, hoặc có đơn chờ duyệt |
| `off` | Không có ca | `REST`, ngày ngoài tuần làm |
| `fu` | Ca dự kiến | Ngày làm sắp tới |
| `nocheck` | Chưa Check-in | Hôm nay chưa chấm vào (chưa phải vắng) |

Màn nhân viên dùng cùng các loại (`work`, `late`, `leave`, `absent`, `todo`, `off`, `future`, `extra`, `outside`).

Ngoài loại ô còn có **nhãn ngày** (`tag`, `calendar/domain/day-tag.ts`) chung cho lịch Admin và nhân viên: loại ngày (làm, OT, làm bù, lễ, nghỉ có lương / không lương / có làm bù, iSAT, không có ca), ca của ngày, nhãn phụ (OT, bù, nửa ca, đổi ca) và kết quả chấm công (hợp lệ, cần giải trình, giải trình chờ duyệt / được duyệt / bị từ chối, quá hạn). FE chỉ hiển thị bằng `DayMarks` (dấu gọn trên ô), `DayTagLines` (chi tiết ngày) và `DayLegend` (chú giải).

## 4. Bảo hiểm theo ngày có lương (chốt 07/11/2026)

Mức đóng = lương hợp đồng × min(1, ngày có lương / công chuẩn). Ngày có lương: ngày làm tính công (nửa ca 0,5), `LEAVE_PAID`, `ISAT` và `HOLIDAY` được trả. Chưa có ngày nào thì chưa bị trừ; đủ công chuẩn thì đủ mức.
