# Bộ dữ liệu thử đủ mọi trường hợp (demo)

Seed demo tạo dữ liệu giả trên một database PostgreSQL trống, được chỉ rõ bằng `DATABASE_URL`; dữ liệu gồm nhân sự, chấm công, khoản chờ duyệt, KPI và các thao tác đi qua **route thật** của máy chủ. Các công cụ kiểm kỳ và chạy server đọc snapshot `.pgbak.gz`, khôi phục snapshot vào database tạm riêng rồi tự dọn database đó. Toàn bộ là người giả (`demo_*`), không có dữ liệu thật.

## Dựng

| Việc | Lệnh |
| --- | --- |
| Seed vào database demo mới | Đặt `DATABASE_URL` tới database PostgreSQL mới, trống rồi chạy `npm run seed:demo -- --confirm-demo-db` |
| Tạo snapshot để chia sẻ hoặc chạy công cụ demo | `npm run pg:backup -- --source="$env:DATABASE_URL" --dir=backups/demo` |
| Xem CSV | `npm run seed:demo -- --confirm-demo-db --export` → `data/demo/*.csv` |

Cờ seed: `--today=YYYY-MM-DD` (mặc định 2026-11-26), `--scale=N` (thêm N nhân sự nền thử hiệu năng), `--no-lifecycle`, `--no-coverage`, `--coverage-json=<file>`, `--export` và `--out=<dir>`. Mật khẩu tài khoản demo: `DEMO_PASSWORD` hoặc mật khẩu mặc định ghi đầu `scripts/db/seed-demo.ts`. Seed bắt buộc `DATABASE_URL` và `--confirm-demo-db`; kiểm tra database chưa có schema hay quan hệ người dùng trước khi nạp ứng dụng/migration. Không nhận `DB_PATH`/`--db`, không ghi đè hoặc xoá database đã có; để dựng lại, tạo database mới.

Mã thoát: 0 = mọi kỳ vọng đạt; 2 = kỳ vọng AI hoặc đồng hồ lệch; 3 = lớp vận hành có bước lỗi; 4 = độ phủ thiếu.

## Ba lớp

1. **Persona** (`scripts/db/demo/scenarios.ts` → `scripts/db/demo/generate.ts`): 71 nhân sự + 2 Admin, mỗi persona khai các ca (`CASES`, 111 ca: S hồ sơ, C lịch và duyệt, K KPI, T thuế và BH, A Check-in/out, B bất thường, P kỳ lương) và kỳ vọng (`expect`, `ai.fire/miss`, `unreasonable`). 14 persona "bất thường" cố ý (hồ sơ hỏng, loại ngoài bảng, thiếu ngày vào làm...). Dựng bằng `store` dưới đồng hồ giả từng sự kiện nên `created_at`, `decided_at`… đúng thứ tự.
3. **Lớp vận hành** (`scripts/db/demo/lifecycle.ts`, gọi route thật trong cùng tiến trình): gán vai trò, tạo khoản điền thêm, giải trình, tạm ứng, sổ phép và dựng các trạng thái kỳ lương. Các luồng nghiệp vụ không đổi khi database demo chuyển sang PostgreSQL.

## Độ phủ và cách giữ

`scripts/db/demo/coverage.ts` đo trên database vừa dựng và đối chiếu với vũ trụ ca **rút từ mã**: mọi bảng, giá trị CHECK, trạng thái kỳ lương, chức vụ × bậc và loại khoản duyệt còn dùng.

Thêm bảng, trạng thái, chức vụ hay loại khoản mới mà chưa có dữ liệu demo thì `seed-demo.ts` thoát 4 và `test/db/demo-coverage.test.ts` đỏ (test tự tạo database PostgreSQL riêng từ `PG_TEST_URL`). Chỗ cố ý không phủ phải ghi lý do trong `EXCLUDED`:

| Giá trị | Lý do |
| --- | --- |
| `leave_ledger.kind = start` | `leave.accrual.start` mặc định 0: ngày vào làm không cộng phép nên không sinh dòng |
| `leave_ledger.kind = expire` | phép hết hạn chỉ sinh khi sang năm mới của một khoản phép cũ; mốc demo (cuối 11/2026) chưa tới |
| `ai_finding_actions.action = restore` | chưa có route khôi phục phát hiện đã bỏ qua |

## Dùng để thử các tình huống

- Chạy demo trên snapshot: đặt `DEMO_PG_CONTROL_URL` tới control database dành riêng cho demo, rồi chạy `node scripts/dev/ts.cjs scripts/db/demo/serve-demo.ts --snapshot=backups/demo/<file>.pgbak.gz`. Server chỉ nghe `127.0.0.1`; dừng bằng Ctrl+C để dọn database tạm.
- Soát một kỳ trên bản sao: `node scripts/dev/ts.cjs scripts/db/demo/period-check.ts --snapshot=backups/demo/<file>.pgbak.gz --month=2026-10 --full --keep=test-results/period-check.pgbak.gz`. `--keep` phải là file `.pgbak.gz` mới; công cụ không ghi đè file đã có.
- Database nguồn và snapshot không bị thay đổi. Tạo/kiểm snapshot bằng `npm run pg:backup`, `npm run pg:verify` và `npm run pg:drill` (xem `platform.md`).
