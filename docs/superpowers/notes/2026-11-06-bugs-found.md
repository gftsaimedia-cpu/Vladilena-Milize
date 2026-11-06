# Ghi chú khi làm bộ lọc nhân sự và thao tác nhiều người (06/11/2026)

Chưa phát hiện lỗi BE cũ nào ngoài phạm vi. Các điểm cần người khác xử lý:

1. **FE mock lệch hợp đồng mới** (`web/tests/attendance-contract.spec.ts:55`, vùng FE, không sửa ở nhánh này): `weekDto` thiếu `departmentId`, `departmentName`, `staffStatus` ở `week.rows[]` và `week.pending[]`. BE đã thêm ba trường và fixture `web/tests/fixtures/api/attendance-week.json` đã tạo lại. Test này đỏ cho tới khi mock FE có ba trường.
2. Playwright: máy thiếu trình duyệt lúc đầu, đã cài `chromium` rồi chạy lại `test:ui`: 661 qua, 1 đỏ (chính là mục 1).
3. `GET /api/v2/employees` khi có `staffStatus`/`departmentId` thì `q` tìm không dấu; khi không có thì giữ cách tìm cũ (có dấu, chữ thường). Hai cách khác nhau tồn tại song song.
