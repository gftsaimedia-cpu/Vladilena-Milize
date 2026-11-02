# Thêm nhân viên và hiển thị trạng thái/phép năm

Base: `242f62ad8a5f49c6b6fc8217b6e4fe98ef9f3790`. Người dùng đã yêu cầu triển khai.

## Task 1 — API tạo tài khoản với credential sinh tự động

- Thêm `POST /api/staff`, có quyền `profile.write`; chỉ tạo nhân viên thường.
- Sinh username slug ASCII từ tên cộng hậu tố ngẫu nhiên, tránh username đã tồn tại; sinh mật khẩu ngẫu nhiên mạnh.
- Dùng chung kiểm tra hồ sơ/transaction/audit hiện tại, nhưng insert phải create-only để không ghi đè tài khoản khi username đụng nhau.
- Chỉ phản hồi tạo mới có `{ staff, created, credentials: { username, password } }`; sau khi lưu, làm mới sổ/số dư phép trong giao dịch và trả số phép còn lại. Không ghi mật khẩu vào log/audit hay các lần đọc hồ sơ.
- Giữ nguyên `PUT /staff/:u`, bảo toàn `contractStatus`, quyền, cập nhật rev và đặt lại mật khẩu hiện có.
- TDD: test tạo, login bằng mật khẩu nhận được, tên trùng vẫn có username khác, trạng thái thử việc lưu, số phép trả về, secret không xuất hiện trong GET/audit, người thiếu quyền bị từ chối.

## Task 2 — Form thêm/sửa nhân viên

- Gỡ nhập username/mật khẩu khỏi form thêm; gọi endpoint tạo mới, hiển thị credential đúng một lần sau thành công.
- Thêm trạng thái thử việc/chính thức; giữ `jobTitle` là trường chức danh riêng.
- Ngày bắt đầu/ngày sinh dùng chọn ngày; trước khi lưu hiển thị phép năm sẽ được tính sau khi tạo; sau tạo hiển thị số dư thực từ API.
- Ẩn khoản điều chỉnh khỏi biểu mẫu thêm/sửa; backend giữ nguyên khoản đã lưu nếu lần cập nhật không gửi trường đó.
- Kiểm tra bằng typecheck web và test phù hợp.

## Task 3 — Phiếu lương và xác minh

- Đưa `contractStatus` đã snapshot vào dữ liệu builder phiếu và hiển thị riêng trên bản in A4.
- Test mapping trạng thái và chạy test API tạo, test phiếu liên quan, typecheck, format check trong khả năng thời gian.
- Không kết nối DB thật, không sửa schema, không ép đổi mật khẩu lần đầu, không commit/push/merge.

## Tiến độ xác minh — 2026-11-02

- Đã áp dụng task-specific patch vào cây chính, giữ các thay đổi người dùng có sẵn; không merge/commit/push.
- Cây chính: `npm.cmd run typecheck` đạt; `npm.cmd run typecheck:web` đạt; `npm.cmd --prefix web run build` đạt.
- Cây chính: test API tạo nhân viên, validation hồ sơ, guard tự sửa và test builder/service/phiếu lương tập trung đạt **27/27**.
- Lead báo thêm 46 test/kiểm tra tập trung đạt. Unit-only broad run có 1325 test: 1308 pass, 16 todo, một lỗi do `spec/reference/api-routes.md` và `modules.md` chưa phản ánh route mới; đã sinh lại đúng hai file và `test/unit/spec-reference.test.ts` đạt 2/2. Toàn bộ `npm test` lần đầu hết bộ nhớ; lượt chạy giới hạn song song đã bị dừng trước khi hoàn tất, nên chưa xác nhận full suite.
