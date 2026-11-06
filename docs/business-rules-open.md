# Quy tắc nghiệp vụ đang áp dụng mà spec chưa nói (cần chủ dự án chốt)

Tìm ra khi chạy bộ kịch bản (`test/v2/scenarios/`). Code đang làm như cột "Hiện tại"; không có bug kỹ thuật, nhưng ảnh hưởng tiền lương nên không tự đổi.

| # | Tình huống | Hiện tại | Hướng có thể chọn |
|---|---|---|---|
| 1 | Người 0 ngày công vẫn bị trừ bảo hiểm tính trên lương hợp đồng, thực lĩnh âm (ví dụ −630.000 đ) | Giữ đúng phép tính; phiếu mang cờ `NEGATIVE_NET` để Admin thấy | (a) giữ + cờ (đang làm); (b) bảo hiểm tỉ lệ theo ngày có lương; (c) sàn thực lĩnh = 0 và ghi nợ sang kỳ sau |
| 2 | Đổi ca mặc định ở hồ sơ nhân sự (không có ngày hiệu lực) | Áp cho mọi lần tính lại, kể cả các ngày đã qua của tháng chưa chốt | Thêm "áp dụng từ ngày" cho đổi ca; ngày trước đó giữ ca cũ |
| 3 | Số ngày công vượt công chuẩn (tháng 10/2026 có 27 ngày T2–T7, chuẩn 26) | Lương trả đủ 27 ngày | (a) giữ (trả đủ); (b) trần = công chuẩn, phần dư tính OT hoặc không tính |

Khi sếp chốt, sửa ở `src/modules/payroll` (phiếu) hoặc `src/modules/employees` (ca) kèm test trong `test/v2/scenarios/`.
