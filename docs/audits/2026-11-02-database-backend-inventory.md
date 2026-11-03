# Kiểm kê dữ liệu và backend — 2026-11-02

Phạm vi kiểm kê ban đầu: mã tại commit `242f62a`, đối chiếu migration, repository, nơi gọi và test. Bảng hiện trạng dưới đây mô tả phiên bản đó. Trong worktree triển khai, cấu hình sandbox và schema đã có rào chắn; nhóm duyệt tạm ứng đã được chuyển sang bảng quan hệ. Đây chưa phải kết quả rà soát thủ công toàn bộ backend. Không đọc hay kết nối cơ sở dữ liệu vận hành.

Quyết định của chủ dự án: chỉ dùng **PostgreSQL** cho ứng dụng; phát triển và kiểm thử có database PostgreSQL riêng. Chuẩn hoá dữ liệu nghiệp vụ đang dùng; giữ JSON cho bản chụp và nhật ký lịch sử. Không có dữ liệu cũ cần chuyển; có thể bắt đầu với DB PostgreSQL mới. Thiết kế tổng thể đã được duyệt; các nhóm còn lại vẫn cần triển khai và kiểm chứng.

## Cách chọn DB và những nguồn dữ liệu trùng ý nghĩa

- `src/platform/db.ts:31–55` chọn một kết nối cho mỗi tiến trình theo thứ tự `DATABASE_URL`, `PG_TEST_URL`, `DB_PATH`. `src/data/postgres-database.ts:27–41` vẫn triển khai cả `pg.Pool` và PGlite. PGlite còn được dùng cho một số test và công cụ, gồm diễn tập backup của sandbox; việc thống nhất sang PostgreSQL ảnh hưởng cả các đường này, không chỉ `.env`.
- **Rủi ro ở bản gốc trước khi sửa:** `scripts/dev/sandbox-server.ts` chỉ ghi đè `DB_PATH`, trong khi `DATABASE_URL` được ưu tiên. `resetSyntheticData()` chạy ngay khi khởi động và thực hiện nhiều lệnh xoá; nếu URL được kế thừa và tài khoản DB đủ quyền, nó có thể xoá dữ liệu ở DB đó. Đã mô phỏng chọn cấu hình và lệnh xoá bằng đối tượng giả, không kết nối DB thật. Worktree hiện khởi động sandbox qua bootstrap tạo DB PostgreSQL tạm và kiểm tra URL/tên trước khi nạp store; bản gốc chỉ nhận thay đổi sau khi tích hợp nhánh.
- Cùng trong một DB, dữ liệu chức vụ, bậc, ca có thể đến từ các bảng danh mục **và** `param_versions`; sau đó `src/params/store.ts:82–88` ghép các nguồn theo tháng hiệu lực, cùng tháng thì danh mục thắng. `src/domain/position/position-catalog.ts:331–357` chuyển các cột danh mục thành khoá tham số. Đây là nhiều nguồn có thể cùng quyết định một giá trị nghiệp vụ, dù chỉ là một DB vật lý.
- `src/engine/payroll-params.ts` chứa mặc định trong mã; `src/params/store.ts:37–47` có chế độ chỉ dùng mặc định hoặc đọc thêm phiên bản DB. Bản tính lương cũ còn có bản chụp tham số riêng. Cần phân biệt giá trị mặc định, giá trị đang hiệu lực và lịch sử đã chốt khi chuyển đổi.

## Danh sách các nhóm JSON cần quyết định

Theo schema và mã ghi tại commit kiểm kê, xác định được **24 cột** chứa JSON, JSON nén hoặc chuỗi được tạo bằng `JSON.stringify`. Đa số cột JSON khai báo kiểu `TEXT`; `snapshot_gz` là JSON nén trong `BYTEA`. Số này là kiểm kê cấu trúc ban đầu, không nói lên số bản ghi thực tế. Các dòng dưới đây giữ mô tả hiện trạng ban đầu để theo dõi việc chuyển đổi.

| Nhóm | Cột hiện tại | Vai trò và điểm cần giữ khi chuyển |
| --- | --- | --- |
| Lịch khai theo người/tháng | `timesheets.days_json` | Đang lưu toàn bộ các ngày và dữ liệu khai trong một ô; `src/platform/db.ts:1262–1274` đọc/ghi cả khối. Có thể tách thành dòng theo người/ngày và bảng con cho khoản lặp. Phải giữ đầy đủ cấu trúc từng loại ngày, `rev` và hành vi chống ghi đè đồng thời. |
| Phiên chấm công | `attendance_sessions.entry_json` | Chứa các trường như giờ vào/ra, nguồn, ca được chụp; repository còn dùng giá trị bên trong để lọc/sắp xếp (`src/data/attendance.repository.ts:77–104`). Cần khảo sát toàn bộ hình dạng entry cũ trước khi tách cột có kiểu. |
| Bối cảnh chấm công và điều chỉnh | `punches.context_json`, `corrections.context_json` | Lưu bối cảnh của từng lượt bấm/điều chỉnh, gồm thông tin ca đã ghi nhận. Nếu tách phải giữ bối cảnh tại thời điểm phát sinh, không thay bằng tham chiếu tới ca hiện tại có thể đã đổi. |
| Chống gửi lặp check-in/out | `punch_requests.operation`, `punch_requests.response_json` | `operation` là chuỗi JSON chứa thao tác và session được yêu cầu; `response_json` giữ phần `punchState` để trả lại khi gửi cùng request ID (`src/modules/attendance/attendance.controller.ts:70–81,155–161`). `serverNow`, cấu hình ca/quy tắc và xem trước checkout được tính mới. Bản ghi quá 30 ngày được dọn định kỳ. |
| Số sửa trên phiếu lương | `slip_overrides.values_json` | Chứa các ô được sửa theo người/tháng; khi duyệt kỳ, giá trị được đóng băng vào phiếu (`src/platform/db.ts:877–884`). Có thể cân nhắc bảng các ô sửa có kiểu và ràng buộc, giữ lý do, phiên bản và bản chụp đã duyệt. |
| Lịch làm việc theo chức vụ | `position_types.regular_dows`, `position_types.makeup_dows` | Hai mảng thứ trong tuần lưu dưới dạng JSON. `regular_dows` được đọc và sửa; tìm thấy `makeup_dows` được khởi tạo nhưng chưa thấy đường nghiệp vụ hiện tại đọc trực tiếp (`src/domain/position/position-catalog.ts:93,231–232,345`). Chưa biết DB thực tế có dữ liệu cũ hay không. Có thể xem xét bảng con theo thứ. |
| Cài đặt chung và quyền | `settings.value_json` | Một bảng key/value chứa nhiều kiểu dữ liệu khác nhau; ví dụ định nghĩa vai trò tuỳ chỉnh (`src/platform/authz.ts:103–110`) và một số cấu hình kỹ thuật. Giá trị có thể nhạy cảm. Cần phân nhóm theo từng khoá, không in giá trị hay chuyển đồng loạt theo một cấu trúc. |
| Phiên bản tham số | `param_versions.value_json`, `param_versions.ack_json` | Giá trị có thể là số, chữ, boolean, mảng hoặc đối tượng; `ack_json` lưu xác nhận cảnh báo. Cần giữ tháng hiệu lực, thứ tự phiên bản, lý do và xác nhận; không thể giả định mọi giá trị đều là số. |
| Đầu vào đã chụp của lần tính | `payroll_runs.params_json`, `payroll_runs.switches_json` | Bản chụp bộ tham số và công tắc/ngày lễ của lần tính, dùng để đối chiếu hoặc tính lại (`src/domain/period/periods.ts:924–949`). Chuyển sang bảng có cấu trúc cần giữ đúng giá trị và khả năng đọc kỳ cũ. |
| Bản chụp phiếu lương | `payslips.staff_terms_json`, `payslips.snapshot_gz`, `payslips.override_json` | Điều khoản nhân sự, kết quả chi tiết nén và số sửa đã đóng băng. Đây là dữ liệu lịch sử phục vụ xem/in/đối chiếu phiếu; thay đổi định dạng phải đối chiếu đầy đủ số tiền và chi tiết ngày. |
| Nhật ký kiểm toán | `audit_log.actor_roles`, `audit_log.before_json`, `audit_log.after_json` | Vai trò và nội dung trước/sau được đưa vào chuỗi băm (`src/platform/db.ts:344–361`). Thay nội dung hay cách tuần tự hoá các dòng cũ có thể làm hỏng kiểm tra toàn vẹn; cần phương án bảo toàn và xác minh chuỗi. |
| Dữ liệu AI cũ và cờ phiếu | `ai_review_runs.rules_json`, `ai_review_runs.summary_json`, `payslips.flags_json` | Hai cột đầu thuộc lịch sử AI. `flags_json` vẫn được đọc trong đường lọc/duyệt phiếu (`src/data/payroll.repository.ts:142–148`, `src/platform/db.ts:1031–1047`). Cần tách quyết định gỡ chức năng khỏi việc xử lý dữ liệu lịch sử. |
| Chấm công kiểu cũ | `attendance_days.entry_json` | Không tìm thấy đường đọc/ghi nghiệp vụ trực tiếp trong `src` hiện tại; bảng vẫn có trong migration, test, dữ liệu demo, sandbox và công cụ sao lưu tổng quát. Chưa có căn cứ để khẳng định DB thật rỗng hoặc xoá bảng an toàn. |

Theo lựa chọn của chủ dự án, chuẩn hoá dữ liệu nghiệp vụ đang hoạt động và giữ JSON cho bản chụp/nhật ký từ hệ thống mới. Không cần nhập dữ liệu cũ; không cần kết nối hay xoá DB đang tồn tại để xây schema mới.

### Chi tiết `settings.value_json`

Đây không chỉ là cài đặt hiển thị: cùng một cột đang chứa các nhóm có cấu trúc và vòng đời rất khác nhau:

| Khoá hoặc họ khoá | Nội dung | Điểm cần giữ |
| --- | --- | --- |
| `advance_approvals_<tháng>` | Trạng thái tạm ứng của **mọi người trong tháng**, lồng dưới `users`, cùng `rev` tháng và từng người. | Lưu riêng theo người/tháng có thể loại việc ghi lại cả tập người, nhưng phải giữ trạng thái đã rút, hai loại `rev`, nhật ký và cách tính số trừ vào lương. |
| `roles.custom` | Danh sách vai trò tuỳ chỉnh, năng lực và phiên bản. | Nếu tách bảng vai trò/năng lực, giữ quyền hiện tại, trạng thái ngưng dùng và quy tắc không cấp quyền quản trị dự trữ. |
| `holidays`, `holiday_names` | Ngày lễ và tên ngày lễ. | Giữ ngày, tên và hành vi theo tháng/năm, không làm thay đổi tính lương cũ. |
| `geofence` | Cấu hình vùng chấm công. | Giữ ý nghĩa bật/tắt, toạ độ cấu hình và kiểm tra quyền; không ghi dữ liệu vị trí cá nhân vào báo cáo. |
| `params_mode`, `config_rev`, `catalog_rev` và các dấu migration | Công tắc hoặc phiên bản kỹ thuật. | Cần phân biệt trạng thái vận hành với dữ liệu nghiệp vụ và giữ đúng cơ chế tăng phiên bản/khởi tạo. |
| `session_secret` | Khoá ký phiên khi chạy ngoài production mà không đặt biến môi trường. | Dữ liệu nhạy cảm; không đọc, in hoặc di chuyển giá trị thật khi kiểm kê. |

**Lỗi ghi đè đồng thời ở tạm ứng tại commit kiểm kê:** `AdvanceApprovals.move()` đọc tài liệu tháng, thay một người rồi ghi đè toàn bộ `users`. Các handler bọc thao tác bằng giao dịch nhưng không khoá chung theo tháng trước khi đọc; upsert `settings` thay toàn bộ giá trị. Đã tái hiện trên PostgreSQL 16 thật bằng hai kết nối và hai giao dịch độc lập: cả hai yêu cầu thành công nhưng tài liệu cuối chỉ còn một người, `rev` tháng bằng 1. Trong worktree, dữ liệu này đã được chuyển sang `advance_approval_months` và `advance_approval_entries`; test PostgreSQL thực tế xác nhận hai người cùng tháng được giữ, xung đột rev và rollback hoạt động. Test đồng thời hiện ở mức class/repository, chưa qua HTTP.

`roles.custom` có mô hình đọc cả danh sách, sửa một vai trò, rồi ghi cả danh sách tương tự (`src/domain/roles/roles.ts:440–441,521–559`); cần kiểm thử đồng thời riêng cho vai trò. Đây là nghi vấn từ mã, chưa được tái hiện như trường hợp tạm ứng.

**Lỗi ghi nhật ký đồng thời:** `store.audit.write()` đọc dòng cuối rồi tự chọn ID kế tiếp trước khi chèn. Đã ép hai lần gọi thật đọc cùng dòng cuối trên hai giao dịch PostgreSQL độc lập: một lần thành công, một lần thất bại với mã trùng khoá `23505`; chuỗi băm còn hợp lệ. Vì nhật ký thường nằm trong giao dịch nghiệp vụ, lỗi có thể làm thao tác nghiệp vụ liên quan bị hoàn tác. Đây là kiểm thử ở mức store, chưa tái hiện qua HTTP. Cần thiết kế thứ tự khoá và kiểm tra mọi chỗ ghi nhiều nhật ký trong một giao dịch trước khi sửa; không chỉ thêm một khoá có thể gây kẹt với khoá dữ liệu khác.

Bảng `advance_requests` cũng tồn tại, nhưng hiện phục vụ lịch sử yêu cầu ứng lương có số tiền; đường tạm ứng hiện hành dùng các bảng `advance_approval_*` mới và công thức lương (`src/domain/advance/advance-requests.ts:1–4`, `src/domain/payroll/payroll-service.ts:165`). Không được giả định hai nguồn có cùng ý nghĩa hoặc gộp dữ liệu cũ mà không đối chiếu nghiệp vụ.

## Cơ chế thuộc tính đã bỏ

`src/params/attributes.ts` định nghĩa thuộc tính bậc lương động. Chủ dự án xác nhận cơ chế này đã bỏ về nghiệp vụ, nhưng mã hiện tại vẫn:

1. Nhận diện, kiểm và xử lý khoá ở `src/params/validate.ts:341–344` và `src/params/save.ts:269–292`.
2. Bổ sung cột động vào dữ liệu trả về ở `src/params/store.ts:376`.
3. Có hàm dựng/đọc thuộc tính trong `src/engine/payroll-params.ts:888–915` và nhánh bảo hiểm trong `src/engine/pay-tail-calc.ts:83–100`.
4. Nhánh bảo hiểm `insuranceAttr` có trong engine thuần và test, nhưng đường tính lương thật chặn lựa chọn này qua `assertAvailable` (`src/domain/payroll/payroll-service.ts:229`; `src/engine/pay-tail-calc.ts:39–56`). Không nên nói nhánh đó đang được phép chạy trong nghiệp vụ thật.

Cần gỡ theo toàn bộ đường đọc/ghi/giao diện/engine/test và kiểm tra dữ liệu cũ, thay vì chỉ xoá file `attributes.ts`. Chưa biết DB thật có khoá `class.level.attr.*` hoặc `level.*.*.attr.*` hay không.

## Mã và tên biến cần rà tiếp

Quét đồ thị import/require chuỗi tĩnh từ `src/server.ts` đi được tới 237/244 file `.ts` trong `src`. Số còn lại **không đồng nghĩa** mã rác: `schema.generated.ts` là kiểu dữ liệu; `src/ops/pg-backup.ts` được công cụ sao lưu gọi, không phải server gọi. Quét tĩnh không chứng minh mọi nhánh bên trong file đã được sử dụng.

Danh sách 244 file, số nơi tham chiếu trực tiếp từ `src`, `scripts`, `test` và tình trạng nằm trong đồ thị tĩnh của server ở `2026-11-02-backend-file-map.tsv`. Công cụ, test hoặc môi trường bên ngoài có thể nạp động; đây là danh sách để điều tra, không phải danh sách tự động xoá.

Các ứng viên cụ thể cần kiểm tra thêm trước khi gỡ:

- `src/domain/pay-entries.ts`: handler HTTP kiểu cũ không nằm trong đồ thị server; chức năng tương ứng hiện có trong `src/modules/pay-entries/pay-entries.controller.ts`. Tìm thấy tài liệu/test nhắc tên file cũ trong chú thích, chưa tìm thấy nơi chạy trực tiếp.
- `src/domain/payroll/index.ts` và `src/domain/payroll/payroll.ts`: class `Payroll` chỉ thấy được xuất qua index cùng thư mục; chưa tìm thấy nơi khác khởi tạo class này.
- `src/domain/position/seed-data.ts`: dữ liệu seed trong file; migration `0002_seed.sql` hiện chứa dữ liệu khởi tạo, chưa tìm thấy nơi import file này trong mã chạy.
- `src/engine/attendance-status.ts`: tìm thấy các test gọi, chưa tìm thấy server hay Vue source gọi. Cần đối chiếu chức năng hiển thị thay thế trước khi quyết định.
- Các bảng AI cũ, cờ AI trên phiếu, và `attendance_days`: có phần là dữ liệu lịch sử, có phần vẫn tham gia logic; không gộp tất cả thành một mục để xoá.
- Registry vẫn có ít nhất 27 mục có `id` chứa AI/Agent; 18 mục trong số đó được đánh dấu `wired: true` nhưng không có khoá tương ứng trong `DEFAULTS` hiện tại. `src/params/store.ts:260–290` vẫn duyệt registry để dựng dữ liệu cài đặt, còn `src/params/save.ts:294–297` từ chối lưu khoá không có trong `DEFAULTS`. Đây là metadata còn sót và có thể gây hiểu sai về khả năng thực tế; chưa kết luận toàn bộ mục đều hiện trên giao diện. Ngoài 27 mục này còn các tên nhắc AI theo dạng khác, cần rà theo ý nghĩa chứ không chỉ đếm tên.

Ví dụ tên cần làm rõ: `u` là người đăng nhập, `b` là nội dung yêu cầu ở `src/modules/attendance/attendance.controller.ts:63–71`; `u` và `r` lần lượt là người dùng và dòng bảng công ở `src/platform/db.ts:1276–1279`. Trong các khai báo ngoài class của `src`, 496 tên chỉ có một ký tự; số đó gồm cả chỉ số vòng lặp và biến thông dụng, không phải 496 lỗi đặt tên. Ưu tiên những tên làm mờ dữ liệu hoặc trách nhiệm nghiệp vụ.

## Biến ngoài class

Quét lại cú pháp TypeScript 245 file trong `src` của worktree hiện tại, không có lỗi parse. Quy ước: đếm từng tên khai báo `const`, `let`, `var` và biến `catch` mà không có class bao quanh; bao gồm biến cục bộ trong hàm và biến nhận từ `require`. Không đếm tham số hàm, `import` của TypeScript, khai báo hàm hoặc thuộc tính class. Kết quả:

- **5.140 tên khai báo ngoài class:** 3.599 trong hàm ngoài class và 1.541 ngoài cả hàm lẫn class. Con số sau bao gồm cả biến trong khối `if` ở cấp file, không đồng nghĩa tất cả là biến toàn cục.
- 4.884 `const`, 234 `let`, 22 biến `catch`. Trong nhóm ngoài hàm/class, 751 tên là binding từ `require` và 325 tên khởi tạo bằng hàm; không nên kết luận chúng đều là trạng thái nghiệp vụ.
- 4.377 tên nằm ngoài thư mục `src/params` và file `src/engine/payroll-params.ts`; 763 tên nằm trong các vị trí đó. Đây chỉ là phân nhóm theo vị trí, **không** khẳng định đã nhận diện chính xác mọi biến liên quan tham số bằng ngữ nghĩa.
- Danh sách từng file, dòng, tên, loại và phạm vi nằm trong `2026-11-02-variables-outside-class.tsv`. Vì đây là kết quả quét tĩnh, mỗi tên vẫn cần rà theo ngữ cảnh trước khi đổi tên hoặc gom vào class.
- Quét riêng 57 file `.ts`, `.js`, `.cjs` trong `scripts`: thêm 2.138 tên ngoài class, gồm 1.454 tên trong hàm và 684 tên ngoài hàm/class. Danh sách ở `2026-11-02-variables-outside-class-scripts.tsv`; 427 tên thuộc `scripts/params`, đây cũng chỉ là phân nhóm theo thư mục. Chưa tính code test hay frontend trong hai thống kê này.

Ví dụ trạng thái dùng chung cần xem thiết kế vòng đời: hàng đợi giao dịch `transactionTail` (`src/platform/db.ts:93`), danh sách kết nối sự kiện (`src/platform/events.ts:103–106`) và cache tham số (`src/params/store.ts:101–110`). Không phải biến cục bộ nào cũng nên thành thuộc tính class.

## Giới hạn kiểm chứng

- Đã đối chiếu schema sinh kiểu, migration, các điểm `JSON.stringify`/`JSON.parse`, đường gọi chính và test liên quan. Không đọc dữ liệu cá nhân, khoá hay DB thật.
- Đã dùng PGlite trong RAM ở lượt kiểm tra trước để xác minh hành vi hiện tại; đây là kiểm chứng mã cũ, không thay thế kiểm thử PostgreSQL thật cho phương án mới.
- Đã dựng PostgreSQL 16 riêng cho dev/test bằng Docker và chạy một số test API trên database test thật. Chưa hoàn thành kiểm thử toàn bộ hệ thống hoặc chuyển toàn bộ đường chạy sang PostgreSQL-only.
- Chưa rà hết backend bằng tay, chưa rà frontend theo phạm vi mới; thay đổi mã ở thời điểm cập nhật gồm rào chắn cho sandbox/cấu hình DB, kiểm tra schema mới và xử lý dọn DB tạm của bộ đo tải.
