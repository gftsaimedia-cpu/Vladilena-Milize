# Admin chỉnh giờ chấm công — Thiết kế backend

**Trạng thái:** Người dùng duyệt trong chat ngày 2026-11-02; sẵn sàng triển khai.

## Ý định

Sửa hộp **Sửa giờ Check-in/out** để Admin thao tác trên đúng lượt chấm đang chọn, có thể ghi nhận thay khi nhân viên chưa có lượt, và cho phép ghi ngày trong quá khứ, hiện tại hoặc tương lai. UI tham khảo duy nhất từ ZIP là hộp `DayDetailDialog.vue`; backend của ZIP không phải mẫu thiết kế.

## Hiện trạng liên quan

- UI hiện chọn `punchId` và yêu cầu lý do nhưng `saveTimeFix` bỏ cả hai, rồi gửi `PUT /sheet` để sửa bảng công theo ngày.
- Backend hiện tại chưa có API chỉnh trực tiếp phiên chấm thật. Punch gốc nằm riêng với phiên đã diễn giải; phiên có optimistic version; audit và phát sự kiện sau ghi là các cơ chế sẵn có.
- Cấu trúc backend đang dùng Nest controller/module, domain service, repository/data, audit/event. Thiết kế này tiếp tục theo cấu trúc đó.

## Mục tiêu

- Sửa đúng phiên được chọn, hoặc tạo lượt do Admin ghi nếu ngày chưa có lượt.
- Giữ lại punch gốc và lưu ai sửa, khi nào, lý do, giờ trước/sau.
- Chấp nhận cả ngày đã qua và tương lai. Bản ghi tương lai có hiệu lực ngay và ngày được tính là một ngày công hợp lệ, không phải vắng.
- Tôn trọng khóa kỳ: kỳ đang mở thì ghi được; kỳ đã chốt phải được Admin mở lại trước, sửa xong có thể chốt lại.
- Chỉ dùng UI tham khảo của đúng hộp chỉnh giờ; không kéo phạm vi sang UI OT, nghỉ phép hoặc các màn khác.

## Ngoài phạm vi

- Khai hoặc duyệt OT, làm bù, phép năm và các loại nghỉ.
- Tự động duyệt/từ chối giải trình đang chờ khi chỉnh giờ.
- Thay đổi lịch làm việc, ca được gán, hoặc ngày công sở hữu của phiên.
- Sửa hay xóa punch vật lý gốc.

## Các phương án đã cân nhắc

1. **Cập nhật bảng công theo ngày qua `PUT /sheet`:** ít thay đổi backend nhưng không nhắm đúng lượt chấm, không bảo toàn ý nghĩa của `punchId`, và không phải cách sửa session; loại bỏ.
2. **Hiệu chỉnh giờ hiệu lực của đúng session, giữ punch gốc và ghi audit:** khớp UI chọn session, hỗ trợ ngày không có session bằng bản ghi nguồn Admin, tận dụng version, transaction, audit và event hiện có; **chọn phương án này** theo yêu cầu người dùng.
3. **Tạo yêu cầu hiệu chỉnh để một Admin khác duyệt:** thêm vòng trạng thái và độ trễ, không phù hợp với yêu cầu Admin trực tiếp ghi đè; loại bỏ.

## Luồng đề xuất

### 1. Hiệu chỉnh session đã tồn tại

1. Admin mở một ngày và chọn chính xác session.
2. UI nạp session, giờ vào/ra hiệu lực, `version` và thông tin nguồn.
3. Admin nhập giờ vào, giờ ra và lý do bắt buộc. Ngày của từng giờ được hiển thị/nhập rõ để ca qua nửa đêm không bị hiểu nhầm.
4. UI gửi yêu cầu hiệu chỉnh cho `sessionId`, kèm giờ ISO có timezone, lý do và `expectedVersion`.
5. Domain service kiểm tra quyền, chủ session, quan hệ ngày công, thứ tự thời gian, phiên bản và trạng thái kỳ; repository cập nhật giờ hiệu lực trong transaction bằng CAS/version.
6. Cùng transaction, ghi audit với giá trị trước/sau, Admin, lý do và session. Punch gốc không đổi. Sau commit, phát sự kiện chấm công để bảng công/lương tải lại.

### 2. Ghi chấm công thay khi chưa có session

1. Admin có thể mở cùng hộp từ ô ngày trống và chọn **Ghi chấm công thay**.
2. Backend tạo session nguồn `admin` gắn với nhân viên và `workDate`; không tạo punch vật lý giả. Ghi thời gian, người ghi, lý do và audit.
3. Tạo thay chỉ hợp lệ khi ngày đó chưa có session nào. Nếu đã có session, UI yêu cầu Admin chọn session cần sửa; request tạo trùng trả `409 SESSION_EXISTS` để tránh ghi đúp do thao tác lặp hoặc cạnh tranh.
4. Bản ghi có hiệu lực ngay cả với ngày tương lai, không ở trạng thái kế hoạch/chờ ngày đó đến; ngày đó không còn bị phân loại là vắng chỉ vì không có punch nhân viên.
5. UI hiển thị nguồn **Admin chấm thay** để phân biệt với punch thật mà không làm thay đổi cách diễn đạt chính của hộp.

### 3. Ca qua đêm và ngày công

- `workDate` giữ nguyên ngày sở hữu ca; giờ vào/ra là instant địa phương đã chuyển sang ISO theo timezone ứng dụng.
- Sửa giờ không chuyển session sang ngày công khác. Ví dụ lượt bắt đầu 21:55 ngày 04/10 có thể kết thúc 07:05 ngày 05/10 nhưng vẫn thuộc ngày công 04/10.
- Nếu không có session, `workDate` do Admin chọn là ngày công của bản ghi mới.

### 4. Giải trình và trạng thái kỳ

- Sửa giờ không tự quyết định giải trình. Nếu có giải trình liên quan đang chờ, trạng thái giữ nguyên để Admin duyệt/từ chối bằng luồng giải trình riêng.
- Mọi chỉnh sửa attendance bị từ chối khi kỳ đã `attendance_locked` trở lên. Admin cần mở lại kỳ về `open` theo quyền hiện có trước khi sửa; sau khi hoàn tất có thể chốt lại.
- Khóa kỳ là khóa cứng ở backend cho các route ghi attendance liên quan, không chỉ là cảnh báo. Phạm vi triển khai cụ thể phải tránh vô tình đổi behavior của các route ngoài nhóm này.

## Hợp đồng API đề xuất

- `PATCH /api/attendance/sessions/:sessionId/correction`
  - Body: `{ checkInAt, checkOutAt, reason, expectedVersion }`; cả hai giờ bắt buộc, kể cả khi session gốc thiếu Check-out.
  - Chỉnh đúng session đã chọn; không nhận username khác để tránh đổi đích ngầm.
- `POST /api/attendance/admin-sessions`
  - Body: `{ username, workDate, checkInAt, checkOutAt, reason }`.
  - Tạo bản ghi Admin khi không có session.
- Cả hai route yêu cầu Admin và capability `attendance.correct`; kiểm tra kỳ qua `guardPeriod` nhưng từ chối thật khi kỳ đã khóa.
- Thành công trả session hiệu lực, version mới, nguồn (`employee`/`admin`) và kết quả cảnh báo nghiệp vụ. Lỗi stale trả `409`; validation trả `400`; thiếu quyền `403`; kỳ đã khóa `409 PERIOD_LOCKED`.

## Dữ liệu, tính lương và an toàn ghi

- Dùng `attendance_sessions` làm dữ liệu hiệu lực cho tính công; không sửa/xóa hàng trong `punches`.
- Ghi audit append-only trong cùng transaction với cập nhật session hoặc tạo session Admin. Audit đủ để phục hồi giờ trước khi cần, không dựa vào ghi đè audit.
- Mọi sửa session dùng `expectedVersion`; lỗi tranh chấp trả `409` để UI tải lại, không ghi đè thay đổi mới hơn.
- Tính công/lương đọc giờ hiệu lực mới. Bản ghi Admin tạo cho ngày không session sẽ thay trạng thái vắng bằng một ngày có mặt hợp lệ; các quy tắc giờ vào trễ/ra sớm và các phép tính hiện có tiếp tục dùng giờ hiệu lực.
- “Một ngày công hợp lệ” nghĩa là ngày có mặt/được tính công thay vì vắng; không phải bảo đảm đủ một ngày lương nếu giờ vào/ra vẫn làm phát sinh thiếu giờ. Cách tính tiền theo giờ hiện có giữ nguyên.
- Reopen kỳ dùng lifecycle hiện có; các lần chạy lương cũ được xử lý theo chính sách reopen hiện hành, không tự chỉnh sửa phiếu lương trong endpoint attendance correction.

## Quyền và kiểm tra

- Dùng `attendance.correct` cho chỉnh sửa/ghi thay session, có kiểm tra phạm vi nhân viên nếu hệ thống phân quyền theo phạm vi.
- Bảo đảm session thuộc đúng nhân viên/ngày và Admin không thể dùng `sessionId` của người khác để sửa.
- Kiểm tra `checkOutAt > checkInAt`, timezone hợp lệ, version hiện hành, sự giao nhau/va chạm session theo quy tắc attendance hiện có, và kỳ còn mở.
- Mỗi thao tác ghi cần test API cho: session thật, session thiếu check-out, không session ngày quá khứ, không session ngày tương lai, ca qua nửa đêm, version stale, thiếu lý do/quyền, kỳ đã khóa và audit/punch gốc được bảo toàn.

## Quyết định giao cho builder

- Cách ánh xạ session Admin vào model `AttendanceSession` hiện có và cách đánh dấu nguồn trong `entry`.
- Tên provider/module/repository chính xác theo cấu trúc Nest hiện tại, ưu tiên tái dùng `AdminPresence` và repository/session primitives sẵn có.
- Format hiển thị datetime trong timezone ứng dụng.
