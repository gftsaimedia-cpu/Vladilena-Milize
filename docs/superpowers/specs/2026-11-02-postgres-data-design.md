# Thiết kế giai đoạn 1: PostgreSQL và cấu trúc dữ liệu

Trạng thái: **đã được chủ dự án duyệt; đang triển khai**. Phạm vi hiện trạng và vị trí từng cột nằm trong [`../../audits/2026-11-02-database-backend-inventory.md`](../../audits/2026-11-02-database-backend-inventory.md).

## Mục tiêu và quyết định đã có

1. Ứng dụng, môi trường phát triển và test chỉ dùng hệ quản trị **PostgreSQL**. Dev và test có database riêng; không cho test/sandbox dùng nhầm database ứng dụng.
2. Không có dữ liệu cũ cần chuyển; khởi tạo schema mới trên PostgreSQL mới. Không tự xoá hoặc ghi đè một database đã tồn tại.
3. Dữ liệu nghiệp vụ đang hoạt động được lưu dưới dạng bảng/cột có cấu trúc, kiểu và ràng buộc rõ ràng. Giữ JSON cho bản chụp và nhật ký lịch sử.
4. Hoàn thành nền DB và các adapter backend cần thiết trước. Sau đó rà, dọn backend và tên biến; frontend được rà và xử lý sau backend.
5. Cơ chế thuộc tính động của bậc trong `src/params/attributes.ts` đã bị bỏ về nghiệp vụ; không thiết kế schema mới để tiếp tục chức năng này. Gỡ trọn đường liên quan khi xử lý backend, không chỉ xoá một file.

Chủ dự án đã chọn các mục 1–3 và duyệt thiết kế này trong cuộc trao đổi ngày 2026-11-02.

## Các hướng đã cân nhắc

- **Được đề xuất:** PostgreSQL là hệ quản trị duy nhất; chuẩn hoá dữ liệu nghiệp vụ theo thực thể, giữ bản chụp và nhật ký bằng JSON. Truy vấn và ràng buộc nghiệp vụ rõ hơn, trong khi vẫn lưu được bằng chứng của lần tính lương. Chi phí là phải chuyển từng repository và kiểm tra sự tương đương của API/tiền lương.
- Giữ các khối dữ liệu nghiệp vụ và chỉ đổi `TEXT` sang `JSONB`: ít sửa nhưng các trường nghiệp vụ vẫn nằm trong tài liệu lớn, không giải quyết mục tiêu dữ liệu có cấu trúc; không chọn.
- Chuẩn hoá cả bản chụp và nhật ký lịch sử: truy vấn từng trường dễ hơn nhưng cần bảo toàn toàn bộ cấu trúc kết quả và chuỗi kiểm toán; chủ dự án đã chọn giữ JSON cho hai nhóm này.

## Ranh giới và nguồn dữ liệu

- Backend chỉ kết nối bằng driver PostgreSQL `pg`; bỏ PGlite và PGlite socket khỏi đường chạy, test, sandbox, script và dependency của dự án. Giao thức JSON của HTTP và các file JSON thuộc mã nguồn không bị cấm chỉ vì dữ liệu DB được chuẩn hoá.
- `DATABASE_URL` là cấu hình kết nối duy nhất của ứng dụng. Nếu còn cấu hình cũ có thể gây hiểu nhầm, ứng dụng báo lỗi rõ ràng thay vì âm thầm chọn DB khác. Các công cụ test/sandbox có cấu hình riêng, tạo kết nối PostgreSQL tới DB riêng và truyền URL của DB đó cho ứng dụng; không đổi thứ tự ưu tiên ngầm giữa nhiều driver.
- DB mới được tạo từ migration PostgreSQL có phiên bản. Khởi động trên DB không tương thích phải dừng với hướng dẫn cụ thể, không tự xoá bảng hay sửa lại DB cũ. Dữ liệu seed cần thiết cho ứng dụng mới được sinh từ một nguồn rõ ràng, không mang các dấu nâng cấp hay dữ liệu demo cũ không còn tác dụng.
- Các bảng cấu hình nghiệp vụ, danh mục và giá trị hiệu lực có **một nguồn có thẩm quyền cho mỗi khái niệm**. Không duy trì cả phiên bản tham số và bảng danh mục có thể cùng quyết định cùng một trường bằng quy tắc thắng ngầm. Nếu hai API cùng cho xem/sửa một trường trong cùng tháng, cả hai phải đọc và ghi cùng giá trị hiệu lực và cùng kiểm tra phiên bản; thay đổi được chấp nhận sau cùng quyết định giá trị, thay vì một bảng luôn thắng. Khắc phục sự khác nhau hiện tại giữa hai đường là thay đổi có chủ đích để đáp ứng yêu cầu đồng bộ. Thông tin hiệu lực theo tháng và bản chụp của lần tính phải được giữ.
- Đọc và ghi qua repository thuộc đúng miền nghiệp vụ. Những object JSON dùng cho API có thể được dựng từ dữ liệu quan hệ; không dùng một bảng key/value tổng quát hay một cột JSON mới để tái tạo lại mô hình tài liệu cũ.

## Cấu trúc dữ liệu đích theo nhóm

Tên bảng/cột chính xác, kiểu con và chỉ mục sẽ được chốt trong kế hoạch triển khai sau khi lập danh sách từng trường của các cấu trúc hiện hành. Thiết kế đích phải đáp ứng các ranh giới sau:

| Nhóm hiện tại | Thiết kế đích và nghĩa vụ giữ hành vi |
| --- | --- |
| `timesheets.days_json` | Bảng ngày khai theo người và ngày, các trường rõ kiểu cho loại ngày, giờ, ca, giờ thêm, nghỉ, giải trình; bảng con có thứ tự cho các kế hoạch làm bù. Giữ `rev` tháng, ghi/xoá ngày và chống ghi đè. Kiểm cả ca qua đêm và cấu trúc `makeupPlans`. |
| `attendance_sessions.entry_json` | Các trường phiên chấm công, giờ thực tế, trạng thái, nguồn và các trường đang được lọc/sắp xếp thành cột có kiểu; thông tin ca đã chụp là các trường/bản ghi có cấu trúc gắn với phiên. Không thay ca tại thời điểm bấm bằng ca hiện tại. |
| `punches.context_json`, `corrections.context_json` | Bối cảnh ca cần để xử lý nghiệp vụ được lưu có cấu trúc gắn với lượt bấm hoặc điều chỉnh. Nếu giữ bản chụp lịch sử bổ sung, bản đó không trở thành nguồn ghi thứ hai cho cùng trường đang hoạt động. |
| `punch_requests.operation`, `response_json` | Tách loại thao tác, session trong yêu cầu, session kết quả và dữ liệu `punchState` cần trả khi thử lại. Trong thời gian lưu request ID, phải trả lại `punchState` gốc ngay cả khi trạng thái hiện tại thay đổi; `serverNow`, `cutRule`, `shiftConfig` và `checkoutPreview` vẫn được tính mới khi trả lời như hiện tại. Giữ cơ chế dọn bản ghi cũ hơn 30 ngày, chạy lúc khởi động và lặp mỗi 24 giờ; sau khi đã dọn không cam kết phát lại request ID cũ. |
| `slip_overrides.values_json` | Lưu các ô sửa theo người/kỳ/loại ô với kiểu và ràng buộc tương ứng. Giữ `rev`, người sửa và lý do; nội dung đã đóng băng trên phiếu duyệt vẫn là bản chụp lịch sử. |
| `position_types.regular_dows`, `makeup_dows` | Lịch theo thứ là các dòng có kiểu và liên kết tới phiên bản chức vụ tương ứng. Không tiếp tục trường nghiệp vụ đã bỏ nếu điều tra xác nhận nó không thuộc quy tắc hiện hành. |
| `settings.value_json`: tạm ứng, vai trò, ngày lễ, vùng chấm công | Mỗi nhóm có bảng/cột và quan hệ phù hợp. Tạm ứng có một bản ghi theo người/tháng và phiên bản tháng phục vụ duyệt lô; quyền tuỳ chỉnh có vai trò và quyền rõ ràng; ngày lễ và cấu hình vùng không nằm chung một tài liệu. |
| `settings.value_json`: trạng thái kỹ thuật và bí mật | Chuyển sang cấu hình/kiểu lưu phù hợp với từng giá trị, không dùng JSON như kho nghiệp vụ chung. Không in hoặc đưa giá trị bí mật vào seed, nhật ký, báo cáo hay test. |
| `param_versions.value_json`, `ack_json` | Giá trị có hiệu lực theo tháng phải có kiểu và ràng buộc; xác nhận cảnh báo là dữ liệu có cấu trúc. Giá trị phức hợp cần các bảng con theo đúng miền/cấu trúc, gồm bảng bậc hoặc cây công thức khi còn sử dụng. Không dùng một bảng EAV hoặc tài liệu JSON tổng quát thay cho các thực thể nghiệp vụ. |
| `payroll_runs.params_json`, `switches_json`; `payslips.staff_terms_json`, `snapshot_gz`, `override_json` | Đây là bản chụp lịch sử của lần tính/phiếu: được giữ JSON hoặc JSON nén. Các chỉ số cần lọc/báo cáo có thể có cột chỉ đọc được sinh từ cùng lần chốt, không có đường cập nhật độc lập. |
| `audit_log.actor_roles`, `before_json`, `after_json` | Giữ nội dung lịch sử và cơ chế xác minh chuỗi kiểm toán. Mỗi thay đổi nghiệp vụ tiếp tục ghi nhật ký trong cùng giao dịch; không đưa dữ liệu nhạy cảm không cần thiết vào nhật ký. |
| `ai_review_runs.rules_json`, `summary_json`, `payslips.flags_json`, `attendance_days.entry_json` | Không có dữ liệu cũ cần nhập. Kiểm tra từng đường còn hoạt động và loại phần đã bỏ trong đợt backend; không tạo bảng chỉ để nuôi lại tính năng đã bị loại. Nếu có chức năng còn cần thiết, mô tả và kiểm thử trước khi thay. |

Tiền vẫn dùng đơn vị đồng nguyên và quy tắc làm tròn hiện có; ngày/giờ dùng kiểu PostgreSQL phù hợp nhưng API và quy tắc múi giờ Việt Nam phải giữ ý nghĩa hiện tại. Trường nghiệp vụ cần truy vấn không được chỉ tồn tại trong JSON bản chụp.

## Ghi đồng thời và an toàn dữ liệu

- Ghi các thay đổi liên quan, cập nhật phiên bản và nhật ký trong một giao dịch. Ràng buộc duy nhất, khoá ngoại và kiểm tra phiên bản phải phản ánh quy tắc thật.
- Với tạm ứng, hai người thao tác cùng tháng không được làm mất thay đổi của nhau. Bản ghi từng người và phiên bản tháng phải được cập nhật an toàn; duyệt một người, rút, duyệt lô và thao tác lặp phải có kết quả xác định. Test phải dùng ít nhất hai kết nối PostgreSQL độc lập, kiểm tra cả kết quả cuối và lỗi xung đột khi thích hợp. Quyền tuỳ chỉnh cũng phải có test cập nhật đồng thời để không mất hoặc cấp nhầm quyền. Test phát lại chấm công phải kiểm kết quả gốc, phần bổ sung được làm mới, request ID trùng nhưng thao tác khác và hành vi dọn theo thời hạn.
- Sandbox không kế thừa và sử dụng URL ứng dụng thật. Chỉ được khởi động khi có DB sandbox riêng và điều kiện nhận diện an toàn; không tự xoá hay reset một DB chưa xác nhận là sandbox. Các test không được xoá/sửa database không do chúng tạo hoặc được cấp riêng cho test.
- Bản sao lưu/khôi phục và công cụ seed được chuyển sang PostgreSQL; thao tác khôi phục vẫn yêu cầu đích phù hợp và xác minh. Không triển khai hay thao tác xoá dữ liệu trên DB đang vận hành trong quá trình xây dựng.

## Thứ tự thực hiện

1. Lập kế hoạch chi tiết dựa trên danh sách trường thực tế, các điểm đọc/ghi, API và test; có đường chứng minh mỗi nhóm được chuyển đủ. Chuẩn bị PostgreSQL test riêng và điều kiện chạy kiểm thử an toàn.
2. Dựng schema PostgreSQL mới, seed cần thiết và lớp kết nối duy nhất; sửa test/dev/sandbox/backup để không phụ thuộc PGlite. Không để app khởi động vào schema cũ một cách mơ hồ.
3. Chuyển theo từng nhóm dữ liệu và adapter backend. Mỗi nhóm phải có kiểm thử đọc/ghi, ràng buộc, rollback và tương thích phản hồi API; đặc biệt kiểm tra đồng thời ở tạm ứng/chấm công và tính lương.
4. Rà backend theo đồ thị chức năng và hợp đồng thực tế: gỡ toàn bộ cơ chế thuộc tính đã bỏ, rà metadata AI/Agent đã bỏ, xác minh từng ứng viên mã thừa, xử lý tên biến và trạng thái ngoài class theo trách nhiệm. Có bảng theo dõi từng file backend, phân biệt mã chạy, công cụ, test, kiểu sinh và mã không còn chức năng; với phần bị bỏ phải lần qua nơi gọi, route, dữ liệu và test, không kết luận chỉ theo import hoặc tên file. Danh sách biến là bằng chứng để rà, không tự động chuyển mọi biến cục bộ vào class.
5. Sau khi backend ổn định, rà và điều chỉnh frontend theo API/schema mới, gồm dữ liệu giả và cập nhật lại màn. Đây là giai đoạn sau, không thực hiện trước khi nền DB/backend có kiểm chứng.

## Điều kiện nghiệm thu

- Mã chạy, script vận hành, dev, sandbox và test không dùng PGlite; mỗi môi trường kết nối đúng database PostgreSQL riêng của mình.
- DB mới khởi tạo được từ đầu; dữ liệu nghiệp vụ đang hoạt động không cần đọc/ghi qua các cột JSON tổng quát. Bản chụp và nhật ký lịch sử vẫn đáp ứng quyết định đã chọn.
- Ràng buộc và test chứng minh không mất cập nhật đồng thời; có test hồi quy hai yêu cầu tạm ứng khác người trong cùng tháng và kiểm tra chống dùng nhầm DB sandbox/test.
- Các luồng nghiệp vụ hiện còn dùng có kết quả và hợp đồng API tương đương, bao gồm dữ liệu chấm công, ca qua đêm, lương, quyền, tham số, nhật ký và bản in/đối chiếu; ngoại lệ là những sai lệch giữa các đường đọc/ghi cùng dữ liệu đã được nêu trong thiết kế phải hội tụ về một giá trị. Có test sửa qua từng API và đọc lại qua cả hai, kể cả xung đột phiên bản. Không tự ý thay đổi quy tắc lương.
- Test liên quan và suite bắt buộc chạy trên PostgreSQL thật; báo rõ các kiểm tra không chạy được. Kiểm thử phải tách biệt dữ liệu và không nhắm vào database vận hành.
- Chưa coi việc triển khai toàn bộ chương trình hoàn tất cho đến khi rà backend rồi frontend theo đúng thứ tự và kiểm tra hai phía cùng nhau.
