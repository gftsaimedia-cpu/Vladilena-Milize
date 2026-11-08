# Quy tắc nghiệp vụ đang áp dụng mà spec chưa nói (cần chủ dự án chốt)

| # | Tình huống | Trạng thái |
|---|---|---|
| 1 | Người 0 ngày công vẫn bị trừ bảo hiểm tính trên lương hợp đồng, thực lĩnh âm | **Đã chốt 07/11/2026**: bảo hiểm tỉ lệ theo ngày có lương (`payroll.service.ts`, test trong `test/v2/payroll.test.ts`). Cờ `NEGATIVE_NET` giữ cho trường hợp tạm ứng lớn hơn thu nhập |
| 2 | ~~Đổi ca mặc định áp cho cả ngày đã qua~~ | **Đã chốt (2026-11-08)**: có ô "Áp dụng từ ngày" (mặc định hôm nay); ngày trước đó giữ ca cũ, lịch sử ở `staff_shift_history`. Tháng đã chốt công thì từ chối |
| 3 | Số ngày công vượt công chuẩn (27 so với 26) | Chờ chủ dự án. Hiện trả đủ 27 ngày. Hướng: (a) giữ, (b) trần = công chuẩn, phần dư tính OT hoặc không tính |
