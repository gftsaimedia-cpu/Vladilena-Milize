# PROGRAM — Tái cấu trúc hệ thống lương sang mô hình class

Tài liệu sống: Claude cập nhật sau mỗi giai đoạn. Phiên mới đọc file này trước tiên để biết đang ở đâu.

## Mục tiêu
Hệ thống dễ mở rộng và bảo trì: đổi một luật hay thêm một luật chỉ sửa đúng một module, không rải sang nhiều file. Hành vi tính lương giữ nguyên bit-for-bit trừ khi nói rõ.

## Quyết định đã chốt (người dùng, trong chat)
- Gom hàm cùng mục đích vào cùng một class; chuyển toàn bộ backend.
- DB: **PostgreSQL** + lớp truy vấn có kiểu (Kysely hoặc Drizzle) + migration chuẩn. Không dùng ORM nặng.
- Framework: **NestJS + TypeScript** (Fastify adapter nếu phù hợp).
- Thứ tự: sửa bug → commit → tái cấu trúc → dọn html/css thừa → viết lại spec từ mã thật.

## Ủy quyền (người dùng, trong chat)
Claude có **toàn quyền** đi hết các giai đoạn dưới đây không cần chờ duyệt giữa chừng: tự viết spec/plan, tự ra quyết định kỹ thuật (ghi vào ledger), tự xoá file thừa. Người dùng sẽ test và phản hồi sau khi xong.

Ủy quyền này **không** bao gồm (vẫn phải dừng và hỏi):
1. Thao tác không hoàn tác được trên dữ liệu thật (DB lương thật, `data/`, bản sao lưu).
2. Việc nhạy cảm bảo mật (khoá, token, `.env` thật, mật khẩu).
3. Tác động ngoài máy này: `git push`, tạo remote, deploy, publish, đụng DB Postgres chạy ở nơi khác.
4. Plan hỏng đến mức mọi hướng đi đều là đoán mò.

An toàn khi xoá file: luôn commit trước khi xoá, nên mọi thứ khôi phục được bằng git.

## Cách thực thi
Thực thi inline theo `superpowers:executing-plans` (không phái subagent vì chưa được yêu cầu). Mỗi task: TDD, chạy test liên quan, commit nhỏ. Cuối mỗi giai đoạn: chạy toàn bộ `npm test` và ghi kết quả vào ledger.

## Giai đoạn
| ID | Nội dung | Điều kiện xong |
|----|----------|----------------|
| G0 | `git init`, commit mốc; điều tra và sửa bug; gỡ nhãn `openBug` cũ; ghi lại `todo-baseline.json` | `npm test` không còn test đỏ, commit riêng cho phần sửa |
| G1 | Tách luật nghiệp vụ thành class `Rule`/`Policy` theo module (vd. `modules/overtime`) trên app hiện tại, chưa đổi DB/framework | Test xanh, một nguồn duy nhất cho mỗi con số luật |
| G2 | Mọi truy cập DB sang `async` ngay trên SQLite | Test xanh, repository là điểm truy cập duy nhất |
| G3 | PostgreSQL + Kysely/Drizzle + migration + script chuyển dữ liệu và đối chiếu | Số liệu lương đối chiếu khớp trên DB thử |
| G4 | NestJS + TypeScript theo từng module, test kiến trúc cấm import ruột module khác | Toàn bộ route chạy trên Nest, test xanh |
| G5 | Dọn html/css/js thừa (chỉ xoá file không còn được tham chiếu, có bằng chứng) | Không file mồ côi, giao diện vẫn chạy |
| G6 | Viết lại `spec/` từ mã thật (đọc mã, không dùng trí nhớ) | Mỗi mục spec dẫn tới file/hàm thật |

## Ghi chú kỹ thuật đã biết
- DB hiện tại: SQLite qua `node:sqlite` (đồng bộ), 19 bảng, `lib/db.js` ~2180 dòng, ~197 chỗ `.prepare(`, 44 file lib gọi DB trực tiếp, 86 file test đụng DB.
- Trần OT hiện là 40 giờ/**tháng** (`law.ceiling.otMonthHours`, trần theo luật), số này đang bị gán cứng ở nhiều nơi (registry, `public/payroll-params.js`, test, spec). Thiết kế mới: một nguồn, tách "trần luật" và "chính sách công ty".
- Nhãn `openBug` ở nhiều test đã cũ (vd. `PUT /api/blocks/:mã/confirm` đã tồn tại). Phải điều tra nguyên nhân từng mục, không sửa theo tên test.
- 16 mục `# TODO` (Q1–Q13, POLICY) chờ chủ dự án quyết: **không** thuộc phạm vi sửa bug.
- Chưa cài `node_modules` (test chạy được vì không có dependency runtime); `free-identifiers` bị skip vì thiếu Prettier.

## Ledger
| Thời điểm | Sự kiện |
|-----------|---------|
| 2026-10-31 | Chốt lộ trình G0–G6 và ủy quyền. Baseline test: 3097 test, 3050 pass, 1 fail, 7 skipped, 39 todo. |
| 2026-10-31 | **G0 xong.** `git init`, commit mốc `c074a2f`. Sửa 5 mục, `npm test`: 3097 test, 3072 pass, **0 fail**, 7 skipped, 18 todo (16 `# TODO` chờ chủ dự án + 2 mục R1). Chỉ 2 file mã sản phẩm đổi (`lib/db.js` chuẩn hoá `params_json`, `lib/periods.js` guard `allowanceStatus`); còn lại là test và helper. |
| 2026-10-31 | **G1 lát 1–3 xong** (commit `b9a96db` và kế tiếp). Spec `specs/2026-10-31-g1-rules-as-classes-design.md`, plan `plans/2026-10-31-g1-slice1-overtime.md`. Có: `shared/rule.js` (Violation, Rule, RuleSet.check), `overtime/` (OtLimits, WorkedHours, 3 luật, SheetLimits), `advance/AdvanceRequestWindow`, `kpi/KpiScoring`, `attendance/GeofencePolicy`; `limits.js`, `work-hours.js`, `kpi.js`, `geofence.js` thành facade. `npm test`: 3106 test, 3081 pass, 0 fail, 7 skipped, 18 todo. |
| 2026-10-31 | Ruling: tên `enforce(` bị cấm bởi `test/unit/no-control-mode.test.js` → phương thức của `RuleSet` đặt là `check`. |
| 2026-10-31 | **Việc tiếp theo (G1 lát 4):** `lib/domain/sheet-checks.js` là một hàm `checkSheet` ~250 dòng trộn nhiều luật cảnh báo và còn GÁN `clean[d].preset`; phải tách theo từng nhóm luật (chồng giờ, ngày ngoài lịch, ca khai thay, đêm, quyền lợi, phép năm) thành phương thức/Rule trong class `TimesheetValidator`, GIỮ NGUYÊN THỨ TỰ cảnh báo (test so mảng warnings). Sau đó `sheet.js`, `sheet-bulk.js`, `sheet-on-behalf.js`, `ot.js`, `ot-sheet.js` (lát 4), `attendance.js`, `approvals.js`, `ai-*.js` (lát 5), các `handle` (lát 6). |
| 2026-10-31 | Ruling: "thiếu lý do → 400" ở `block-allowance` là test cũ, trái chính sách lý do không bắt buộc (spec + `optionalReason`) → sửa test, không sửa mã. Cost nếu sai: chính sách đổi thì phải thêm kiểm tra lý do ở `addBlock`. |
| 2026-10-31 | Ruling: test `advanceRate` giả định luôn trừ 80 % tạm ứng, trái spec (chỉ trừ khi Admin duyệt) → sửa test theo `input.advanceApproved`. Mã đúng. |
| 2026-10-31 | Ruling: `params_json` không phải đối tượng coi như thiếu (`null`); `allowanceStatus` trả `{ hasAttendance: false }` khi thiếu. Cost nếu sai: nhân sự không thấy trạng thái chuyên cần trên phiếu của lần chạy hỏng dữ liệu. |
