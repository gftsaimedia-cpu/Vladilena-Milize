# Cập nhật trực tiếp bằng SSE — Thiết kế

## Mục tiêu

Nhân sự và admin nhìn thấy thay đổi đã lưu mà không phải tự tải lại trang hoặc rời màn hình rồi quay lại. Việc này giải quyết tình trạng danh sách yêu cầu, giải trình và lịch ca bị cũ sau khi người khác thao tác.

## Hiện trạng

- Backend đã có `GET /api/events` được xác thực và phát một số sự kiện sau khi giao dịch DB commit. Sự kiện chỉ báo màn hình cần nạp lại; server không phát lại lịch sử. Khi kết nối lại với `Last-Event-ID`, server báo `resync`.
- Ứng dụng Vue chưa có nơi nhận SSE dùng chung, nên các màn hình đang mở không phản ứng với sự kiện.
- Một số thay đổi chưa phát sự kiện phù hợp, gồm sửa hồ sơ nhân sự và cập nhật ca/lịch làm theo lô.
- Cấu hình Docker hiện có một tiến trình/container ứng dụng. Các kết nối SSE và số thứ tự sự kiện nằm trong bộ nhớ.

## Phạm vi

- Mở một kết nối SSE dùng chung cho mỗi tab đã đăng nhập; đóng khi đăng xuất hoặc phiên bị thu hồi.
- Khi nhận sự kiện liên quan, chỉ nạp lại dữ liệu của phần màn hình bị ảnh hưởng qua API GET hiện có; không gửi toàn bộ bản ghi DB qua SSE.
- Phủ các thay đổi dùng chung ở nhân sự, chấm công/ca làm, yêu cầu/giải trình, cài đặt, lương/kỳ lương và thông báo.
- Chỉ phát sự kiện sau khi giao dịch ghi dữ liệu commit thành công. Payload tối thiểu và được lọc theo quyền.
- Khôi phục sau mất kết nối hoặc `resync` bằng cách đồng bộ dữ liệu đang hiển thị từ server.
- Giữ POST/PUT/PATCH làm đường ghi từ trình duyệt lên server và giữ DB làm nguồn dữ liệu chuẩn.

## Ngoài phạm vi

- Thay toàn bộ API HTTP bằng SSE hoặc truyền đầy đủ hồ sơ/trạng thái qua SSE.
- Bảo đảm nhận sự kiện khi trình duyệt ngoại tuyến; khi kết nối lại, giao diện sẽ đọc dữ liệu mới.
- Hỗ trợ nhiều bản app chạy đồng thời trong giai đoạn này. Nếu triển khai nhiều tiến trình, cần thêm pub/sub dùng chung trước khi dựa vào sự kiện liên tiến trình.
- Thay đổi luật nghiệp vụ hoặc cách tính lương.

## Các hướng đã cân nhắc

1. **SSE báo thay đổi + nạp lại dữ liệu liên quan qua HTTP (đã chọn).** Tận dụng sự kiện backend hiện có, giữ payload nhỏ và để API GET đang kiểm tra quyền tiếp tục là nguồn dữ liệu chuẩn. Cần bổ sung một nơi nhận sự kiện chung ở frontend và ánh xạ sự kiện tới đúng bộ nạp dữ liệu.
2. **Truyền nguyên bản ghi/trạng thái qua SSE.** Có thể giảm số lần GET, nhưng lặp lại logic phân quyền và định dạng dữ liệu, đồng thời tăng rủi ro riêng tư và lệch dữ liệu.
3. **Chỉ bật cho yêu cầu/giải trình/ca làm.** Ít việc ban đầu nhưng các màn khác vẫn gặp vấn đề cũ và tạo hai kiểu tích hợp. Có thể triển khai theo từng đợt nhưng dùng chung thiết kế đã chọn.

## Cách hoạt động

1. Một dịch vụ frontend dùng chung tạo `EventSource` cho `/api/events` sau khi đăng nhập và chuyển sự kiện có kiểu đến các màn hình/store đang dùng.
2. Mỗi màn hình/store ánh xạ loại sự kiện và thông tin phạm vi (nhân sự, tháng, ngày hoặc nhóm cài đặt) tới bộ nạp dữ liệu hiện có. Sự kiện không liên quan không làm tải lại cả trang.
3. Sau thao tác ghi tại chỗ, màn hiện tại vẫn có thể cập nhật từ phản hồi API như hiện nay. SSE giúp các tab và người dùng khác đang mở dữ liệu liên quan cũng được cập nhật.
4. Khi nhận `resync`, nối lại sau mất mạng hoặc phát hiện phiên hết hạn, nạp lại dữ liệu đang hiển thị và chỉ mở lại luồng khi còn đăng nhập.
5. Bổ sung sự kiện sau commit cho các thay đổi dùng chung còn thiếu, tối thiểu là tạo/sửa hồ sơ nhân sự và gán ca/sửa lịch theo lô. Chỉ tái sử dụng sự kiện hiện có khi đúng ngữ nghĩa và bộ lọc quyền; nếu cần thì thêm sự kiện mới với phạm vi hẹp.

## Ràng buộc và phần để người triển khai quyết định

- Giữ nguyên kiểm tra quyền, danh sách trường cho phép, heartbeat, retry, giới hạn kết nối và backpressure hiện có.
- Luồng dùng cùng origin và cookie phiên hiện tại.
- Dùng một lớp đăng ký sự kiện tập trung; không mở một kết nối cho từng component.
- Dựa trên cấu hình một tiến trình hiện có. Nếu sau này mở rộng nhiều tiến trình, cần broker/pub-sub để chuyển sự kiện giữa chúng.
- Người triển khai chọn cách gộp sự kiện dồn dập và ranh giới nạp lại nhỏ nhất để dữ liệu nhất quán mà không gọi GET thừa.

## Tiêu chí hoàn thành

- Khi mở hai phiên đăng nhập, quyết định yêu cầu/giải trình được cập nhật ở màn nhân sự và admin liên quan mà không tải lại trang thủ công.
- Thay đổi gán ca/lịch và hồ sơ nhân sự cập nhật ở các roster/lịch/profile đang mở khác mà không tải lại trang thủ công.
- Chấm công, cài đặt và lương/kỳ lương được cập nhật ở các màn liên quan khi đã có sự kiện phù hợp; người không đủ quyền không nhận chi tiết riêng tư.
- Thao tác ghi vẫn dùng API hiện có; màn hình nạp dữ liệu chuẩn qua GET, không coi payload sự kiện là bản ghi đầy đủ.
- Sau khi mô phỏng mất luồng rồi kết nối lại, dữ liệu các màn đang mở được đồng bộ.
- Không tạo nhiều kết nối SSE cho cùng một tab; cập nhật do sự kiện không tải lại toàn bộ trang.
