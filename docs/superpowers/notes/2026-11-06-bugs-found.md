# Ghi chú khi làm bộ lọc nhân sự và thao tác nhiều người (06/11/2026)

Chưa phát hiện lỗi BE cũ nào ngoài phạm vi. Các điểm cần người khác xử lý:

1. **FE mock lệch hợp đồng mới** (`web/tests/attendance-contract.spec.ts:55`, vùng FE, không sửa ở nhánh này): `weekDto` thiếu `departmentId`, `departmentName`, `staffStatus` ở `week.rows[]` và `week.pending[]`. BE đã thêm ba trường và fixture `web/tests/fixtures/api/attendance-week.json` đã tạo lại. Test này đỏ cho tới khi mock FE có ba trường.
2. Playwright: máy thiếu trình duyệt lúc đầu, đã cài `chromium` rồi chạy lại `test:ui`: 661 qua, 1 đỏ (chính là mục 1).
3. `GET /api/v2/employees` khi có `staffStatus`/`departmentId` thì `q` tìm không dấu; khi không có thì giữ cách tìm cũ (có dấu, chữ thường). Hai cách khác nhau tồn tại song song.
4. **Chưa phải lỗi của nhánh này, đỏ do FE nửa ca vào main trước BE nửa ca** (`test/v2/fe-staff-requests-engine.test.ts`, 9 test "Máy luật của mock giữ đúng luật lựa chọn của server"): máy luật mock trả thêm khoá `half-shift-leave` mà server chưa có. Chờ BE nửa ca.
5. **Test chập chờn một lần**: `requests-review-many.pg.test.ts` › "approveMany puts a request of a locked month into failed with PERIOD_LOCKED" đỏ ở một lần chạy đầy đủ, rồi xanh 3/3 khi chạy riêng và xanh ở lần chạy đầy đủ kế tiếp. Chưa tìm ra nguyên nhân; theo dõi nếu lặp lại.
