# Bộ SPEC Lương Nhân Sự

Spec mô tả **mã đang có trong cây này**. Hai loại tài liệu:

## 1. Tham chiếu sinh từ mã — `spec/reference/`

Do `scripts/docs/gen-spec.ts` dựng từ mã (`npm run spec:gen`); `test/unit/spec-reference.test.ts` dựng lại và so sánh nên spec không thể lệch mã âm thầm. Mỗi mục dẫn tới file và dòng thật.

| File | Nội dung | Nguồn trong mã |
| --- | --- | --- |
| [api-routes.md](reference/api-routes.md) | 101 route `/api`: quyền, khoá kỳ, controller (file:dòng) | `src/platform/authz.ts` (`ROUTE_CAPS`), `src/modules/**/*.controller.ts` |
| [modules.md](reference/modules.md) | Hạ tầng `src/` và 20 module NestJS, quan hệ import | cây `src/` |
| [capabilities.md](reference/capabilities.md) | Năng lực, loại khoản duyệt, vai trò mặc định | `src/platform/authz.ts` |
| [database.md](reference/database.md) | Bảng, cột, ràng buộc, trigger, chỉ mục | `migrations/postgres/*.sql` |
| [rules.md](reference/rules.md) | Luật nghiệp vụ dạng lớp `Rule` và mã cảnh báo | `src/domain/**/rules/*.js` |
| [events.md](reference/events.md) | Sự kiện SSE và hàm phát | `src/platform/events.ts` |
| [config.md](reference/config.md) | Hằng số kỹ thuật và biến môi trường | `src/platform/config.ts`, `process.env.*` |
| [web-routes.md](reference/web-routes.md) | Route và màn của giao diện Vue | `web/src/router/**` |

## 2. Mô tả nghiệp vụ và vận hành — viết tay

Điểm vào là [overview.md](overview.md) (bối cảnh, kiến trúc, cấu trúc thư mục, cách chạy). Các tài liệu còn lại đi sâu từng mảng:

| File | Mảng |
| --- | --- |
| [overview.md](overview.md) | Tổng quan, kiến trúc, luồng chính, cách chạy |
| [platform.md](platform.md) | Nền tảng: luồng một yêu cầu, giới hạn tải, SSE, nhật ký, DB, sao lưu, sandbox, biến môi trường |
| [people-access.md](people-access.md) | Nhân sự, quyền, vai trò, đăng nhập |
| [attendance.md](attendance.md) | Chấm công, Check-in/out, lịch khai, OT |
| [requests.md](requests.md) | Yêu cầu chờ duyệt, giải trình, tạm ứng, khoản điền thêm |
| [payroll-engine.md](payroll-engine.md) | Bộ máy tính lương, công thức, tham số |
| [payroll-period.md](payroll-period.md) | Vòng đời kỳ lương, phiếu, ước tính |
| [data-fixtures.md](data-fixtures.md) | Bộ dữ liệu thử đủ mọi trường hợp (demo), cách dựng và đo độ phủ |

Quy ước của phần viết tay (`test/unit/spec-refs.test.ts` giữ):

- File được dẫn trong dấu huyền (`` `src/platform/db.ts` ``) phải tồn tại.
- Không dùng neo "tên file : số dòng": số dòng trôi sau mỗi lần sửa. Chỉ định vị bằng tên hàm/lớp/khoá; cần dòng chính xác thì xem `spec/reference/`.
- Luật nghiệp vụ và con số trong spec phải khớp mã; khi mã và spec mâu thuẫn, mã là sự thật và spec phải sửa (hoặc hỏi người quyết định nghiệp vụ trước khi đổi mã).
