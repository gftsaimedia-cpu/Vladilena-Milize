# Bộ dữ liệu thử đủ mọi trường hợp (demo)

Một lệnh dựng ra một DB đầy đủ để thử bằng tay hoặc chạy test: nhân sự giả phủ 111 ca, chấm công, lịch khai, khoản chờ duyệt, KPI, rồi các thao tác vận hành đi qua **route thật** của máy chủ (vai trò, tham số, khoản điền thêm, giải trình, tạm ứng, sổ phép, kỳ lương ở mọi trạng thái). Toàn bộ là người giả (`demo_*`), không có dữ liệu thật.

## Dựng

| Việc | Lệnh |
| --- | --- |
| SQLite (file) | `npm run seed:demo` → `data/demo.sqlite` (hoặc `--db=<file>`; `DB_PATH` cũng được) |
| PostgreSQL trong RAM (PGlite) | `DB_DIALECT=postgres node scripts/db/seed-demo.js --db=:memory:` |
| PostgreSQL máy chủ | `DB_DIALECT=postgres DATABASE_URL=postgres://… node scripts/db/seed-demo.js --confirm-demo-db` — chỉ vào DB **mới** (chưa có nhân sự); từ chối DB đã có nhân sự; không bao giờ xoá gì trên máy chủ |
| Xem CSV | `node scripts/db/seed-demo.js --export` → `data/demo/*.csv` |

Cờ: `--today=YYYY-MM-DD` (mặc định 2026-11-26 12:00 giờ VN; chỉ bản mặc định được đòi mọi kỳ vọng AI đạt), `--scale=N` (thêm N nhân sự nền thử hiệu năng), `--no-check` (bỏ tự kiểm AI), `--no-lifecycle` (bỏ lớp vận hành), `--no-coverage` (bỏ đo độ phủ), `--coverage-json=<file>` (ghi kết quả đo độ phủ). Mật khẩu mọi tài khoản demo: `DEMO_PASSWORD` hoặc mặc định ghi đầu `scripts/db/seed-demo.js`. An toàn: từ chối `data/luong.sqlite`; chỉ ghi vào file mới, file rỗng hoặc file demo (khoá `demo_dataset`).

Mã thoát: 0 = mọi kỳ vọng đạt; 2 = kỳ vọng AI hoặc đồng hồ lệch; 3 = lớp vận hành có bước lỗi; 4 = độ phủ thiếu.

## Ba lớp

1. **Persona** (`scripts/db/demo/scenarios.js` → `generate.js`): 71 nhân sự + 2 Admin, mỗi persona khai các ca (`CASES`, 111 ca: S hồ sơ, C lịch và duyệt, K KPI, T thuế và BH, A Check-in/out, B bất thường, P kỳ lương) và kỳ vọng (`expect`, `ai.fire/miss`, `unreasonable`). 14 persona "bất thường" cố ý (hồ sơ hỏng, loại ngoài bảng, thiếu ngày vào làm...). Dựng bằng `store` dưới đồng hồ giả từng sự kiện nên `created_at`, `decided_at`… đúng thứ tự.
2. **Tự kiểm AI** (`demo/selfcheck.js`): chạy bộ "Soát dữ liệu" trên chính dữ liệu vừa dựng với bộ tham số hiệu lực của tháng; mỗi luật phải bắn đúng persona "phải bắn" và không bắn persona "sát ngưỡng". Luật luôn bị bỏ qua theo thiết kế (`kpi-self-100-streak`, `skipWhen` trong `lib/ai/review.js`) và luật hệ thống (`SYSTEM_RULES`) được liệt kê riêng trong `scenarios.js`.
3. **Lớp vận hành** (`demo/lifecycle.js`, gọi route thật trong cùng tiến trình): bật Agents và luật AI "Khai sau hạn"; gán vai trò `hr`/`cb`/`accounting`/`manager`, thu hồi một vai trò, tạo hai vai trò tuỳ chỉnh (một ngưng dùng); khoản điền thêm (chờ, duyệt, từ chối, huỷ, lô, khoản trừ lớn làm thực nhận âm); từ chối khoản chờ duyệt đủ mọi loại; giải trình (yêu cầu của Admin, của AI, trả lời, duyệt, từ chối, Check-out muộn qua `POST /punch` kèm `requestId`); tạm ứng (xin, duyệt, từ chối, huỷ duyệt, rút — ở cửa sổ ngày 16); sổ phép; **kỳ lương ở mọi trạng thái**: 04 `attendance_locked`, 05 `calculated`, 06 chốt rồi mở lại (`open`), 07 `paid`, 08 `approved`, 09 `paid` → mở lại → tính lần hai (`run_no` 2, phiếu lần một thành lịch sử), 10 `reviewed`, 11 chưa có dòng (mở); số sửa phiếu; bỏ qua một phát hiện AI; lịch sử yêu cầu ứng lương cũ (bảng chỉ còn đọc, nạp thẳng đủ bốn trạng thái).

## Độ phủ và cách giữ

`scripts/db/demo/coverage.js` đo trên DB vừa dựng và đối chiếu với vũ trụ ca **rút từ mã**: mọi bảng của `migrations/postgres` có dòng (29/29); mọi giá trị của mọi ràng buộc `CHECK (cột IN (...))` xuất hiện (48 giá trị); mọi trạng thái kỳ lương và có kỳ tính lần hai; mọi chức vụ × bậc và mọi ca có người; mọi vai trò mặc định có người và có vai trò bị thu hồi; vai trò tuỳ chỉnh có cả loại ngưng dùng; mọi loại khoản duyệt còn dùng (`isat`, `approved`, `ot`, `makeup_hours`, `leave`, `willmakeup`) × `pending`/`approved`/`rejected`.

Thêm bảng, trạng thái, chức vụ hay loại khoản mới mà chưa có dữ liệu demo thì `seed-demo.js` thoát 4 và `test/db/demo-coverage.test.js` đỏ (chạy ở cả SQLite và `DB_DIALECT=postgres`). Chỗ cố ý không phủ phải ghi lý do trong `EXCLUDED` (hiện 3):

| Giá trị | Lý do |
| --- | --- |
| `leave_ledger.kind = start` | `leave.accrual.start` mặc định 0: ngày vào làm không cộng phép nên không sinh dòng |
| `leave_ledger.kind = expire` | phép hết hạn chỉ sinh khi sang năm mới của một khoản phép cũ; mốc demo (cuối 11/2026) chưa tới |
| `ai_finding_actions.action = restore` | chưa có route khôi phục phát hiện đã bỏ qua |

## Dùng để thử các tình huống

- Mở giao diện Vue (`web/`) trỏ vào máy chủ chạy trên DB demo (`DB_PATH=data/demo.sqlite npm start`) rồi đăng nhập `demo_admin` hoặc một `demo_*`.
- Soát nhanh một kỳ: `node scripts/db/demo/period-check.js --db=data/demo.sqlite --month=2026-10 --full` (chạy trên bản sao, không ghi vào DB nguồn).
- Dựng một DB demo rồi sao lưu/khôi phục thử: `npm run pg:backup` / `pg:drill` (xem `platform.md`).
