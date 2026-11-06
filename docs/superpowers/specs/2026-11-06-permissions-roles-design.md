# Phân quyền: ma trận vai trò (thiết kế và kế hoạch, chờ duyệt)

Ngày 06/11/2026. Trạng thái: **bản nháp chờ sếp duyệt**, chưa có dòng code nào. Theo `CLAUDE.md`, đây là việc Architectural: duyệt spec này, rồi mới viết plan chi tiết (`writing-plans`), rồi mới code.

## 1. Mục tiêu

Cài đặt › Phân quyền › **Vai trò**: Admin tạo vai trò, đặt mức quyền theo khu vực (Không / Xem / Sửa), chọn loại yêu cầu được xử lý, bật các việc khác, ngừng dùng vai trò; gán vai trò cho tài khoản. Quyền được BE kiểm thật trên mọi route, không chỉ ẩn nút ở FE.

**Quan hệ với D3** (spec auth-foundation: "đợt đầu chỉ có hai vai trò `admin` và `staff`, kiểm quyền viết theo năng lực để mở rộng sau"): D3 tự ghi là "đợt đầu" và đã chuẩn bị chỗ mở rộng (mọi route đã kiểm theo năng lực). Spec này là đợt mở rộng đó. Nếu sếp duyệt, ghi vào spec auth-foundation một dòng `Ruling: D3 hết hiệu lực từ spec Phân quyền, theo yêu cầu của sếp 06/11/2026`.

## 2. Hiện trạng (đã kiểm trong code)

| Lớp | Hiện có | Thiếu |
|---|---|---|
| BE kiểm quyền | `AuthGuard` đòi `RequireCap(cap)` trên từng handler; 9 năng lực: `config.read`, `config.write`, `payroll.calculate`, `payroll.approve`, `attendance.correct`, `attendance.lock`, `audit.read`, `staff.manage`, `requests.review` (`src/common/decorators/access.decorator.ts`) | Bảng vai trò → năng lực **cứng trong mã** (`src/modules/auth/domain/capabilities.ts`: `admin` = tất cả, `staff` = rỗng); `capsOf(role)` dùng ở `auth.guard.ts:37` và `auth.service.ts:108` |
| BE vai trò | `GET /api/roles` và `/api/v2/roles` chỉ liệt kê `admin`, `manager`, `staff` + mã lạ trong `staff_roles` (`roles.service.ts`). `manager` hiện **không có năng lực nào** | Tạo/sửa/ngừng vai trò, lưu mức quyền, `rev` chống ghi đè |
| BE tài khoản | Đổi vai trò, khoá, đặt lại mật khẩu qua `PUT /employees/:username` (`account.roles`); `staff.role` một giá trị + `staff_roles` có lịch sử thu hồi | Kiểm vai trò tồn tại và chưa ngừng dùng |
| FE | Màn ma trận đã dựng: `PermRolesView.vue`, `CreateRoleDialog.vue`, `DeprecateRoleDialog.vue`, `builders/admin-perm/roles.ts`; tab Tài khoản chạy thật | `services/admin-perm.ts` trả `notConnected()` cho `getRoles/saveRoles/createRole/deprecateRole`; hình dạng dữ liệu `builders` viết cho API v1 (`areas`, `approvalItems`, `extras`, `levels`, `scope`, `rev`) |
| Design | Không có board nào cho Phân quyền trong 45 board `design/` | Cần sếp xác nhận dùng lại màn đã dựng (mục 8, câu 1) |
| Tổ chức | Không có quan hệ quản lý/nhóm: `staff` không có người quản lý hay phòng ban dùng được cho phạm vi | Cần cho phạm vi "Nhóm mình quản lý" (mục 8, câu 3) |
| Bước hoãn | Tab "Xử lý yêu cầu" (quy tắc duyệt) đã ẩn ở FE | Ngoài phạm vi, giữ ẩn |

## 3. Quyết định thiết kế đề xuất

1. **Vai trò và quyền lưu trong DB**, thay bảng cứng. Một tài khoản có đúng một vai trò chính (`staff.role`), khớp `setAccountRole` của FE đang gửi một vai trò. Bỏ vai trò phụ trong `staff_roles` khỏi luồng gán (giữ bảng làm lịch sử).
2. **Mức quyền theo khu vực** quy về tập năng lực: mỗi khu có tập năng lực "xem" và "sửa". Bảng ánh xạ nằm trong mã (`domain/permission-areas.ts`), thuần và có test; DB chỉ lưu mức đã chọn, nên đổi ánh xạ không cần di trú dữ liệu.
3. **Xử lý yêu cầu theo từng loại**: thay `requests.review` dùng chung bằng `request.decide.<loại>` (nghỉ, làm bù, làm thêm, đổi ca, giải trình, tạm ứng). Giữ `requests.review` như năng lực "mọi loại" cho `admin` để không gãy route hiện có.
4. **Bộ giải năng lực** (`CapabilityResolver`): đọc vai trò từ DB, cache theo `rev`, vô hiệu khi vai trò hoặc tài khoản đổi; `AuthGuard` và `AuthService` đổi từ `capsOf` cứng sang bộ giải này. Quyền đổi có hiệu lực ngay ở request kế tiếp, không cần đăng nhập lại.
5. **Vai trò mặc định khoá**: `admin` (mọi năng lực, không sửa được), `staff` (không năng lực quản trị, không sửa được). Vai trò `manager` hiện chỉ là nhãn rỗng: **đề xuất bỏ** khỏi danh sách mặc định, sếp tạo bằng ma trận khi cần.
6. **An toàn**: không hạ quyền hay khoá tài khoản `admin` cuối cùng; không sửa/ngừng vai trò khoá; ngừng dùng vai trò đang có tài khoản thì giữ cho tài khoản cũ nhưng không gán mới được; `rev` chống ghi đè (409 khi lệch); mọi thay đổi ghi `audit_log` (`role.create`, `role.update`, `role.deprecate`, `account.role`).

## 4. Thiết kế BE

**Schema** (sửa `migrations/postgres/schema.sql`, vẫn một file; không có thư mục migration rời):
- `roles(code PK, label, is_default, readonly, scope, rev, deprecated_at, deprecated_by, deprecated_reason, created_by, created_at, updated_at)`.
- `role_permissions(role, kind, key, value)` với `kind` thuộc `area` (key = mã khu, value = `none|view|edit`), `approve` (key = loại yêu cầu), `extra` (key = năng lực). Nạp sẵn `admin` và `staff`.
- Ràng buộc: `staff.role` phải tồn tại trong `roles` (kiểm ở service, không FK cứng để giữ tương thích dữ liệu cũ).

**Endpoint** (đều `RequireCap('staff.manage')`, ghi `docs/api/v2-contract.md`):
- `GET /api/v2/roles`: trả `{ areas[], approvalItems[], extras[], roles[], staff[], limits }` đúng hình dạng `builders/admin-perm/roles.ts` đang đọc, để FE đổi tối thiểu.
- `POST /api/v2/roles`: tạo vai trò (nhãn, sao chép từ vai trò có sẵn tuỳ chọn).
- `PUT /api/v2/roles/:code`: lưu nhãn, `perms`, `approve`, `extras`, `scope` kèm `rev`.
- `POST /api/v2/roles/:code/deprecate`: ngừng dùng, bắt buộc lý do.
- Gán vai trò: giữ `PUT /employees/:username` (`account.roles`), thêm kiểm vai trò tồn tại và chưa ngừng dùng.

## 5. Thiết kế FE

- `services/admin-perm.ts`: thay bốn hàm `notConnected()` bằng gọi API; nhánh mock dựng dữ liệu theo cùng hình dạng để test mock chạy.
- `builders/admin-perm/roles.ts`: chỉnh theo DTO v2 (phạm vi, `rev`); bỏ nhánh `HIDDEN_APPROVALS` nếu BE không trả.
- `PermRolesView`, dialog tạo/ngừng: giữ giao diện, nối lỗi 409 và lỗi "admin cuối cùng" bằng câu tiếng Việt của server.
- FE đã lưu `caps` từ `GET /api/v2/auth/me` (`stores/session.ts`), nhưng mới có `isAdminCapable` và vài chỗ kiểm cap lẻ (ví dụ `PeriodStrip`). Cần thêm hàm dùng chung `can(cap)` trong store, rồi áp cho thanh bên, nút hành động và route guard theo các cap mới (T8); BE vẫn là nơi quyết định, FE chỉ ẩn cho gọn.

## 6. Kế hoạch thực hiện (sau khi duyệt, mỗi task TDD, test xanh mới sang task kế)

| # | Việc | Đầu ra | Kiểm chứng |
|---|---|---|---|
| T0 | Kiểm toàn bộ route ↔ năng lực và chốt bảng khu vực → năng lực (xem/sửa) | Bảng trong spec, danh sách route đổi cap | Rà soát có người duyệt |
| T1 | Schema `roles`, `role_permissions`, nạp `admin`/`staff`; repository | `schema.sql`, `roles.repository.ts` | Test PG: nạp, đọc, `rev` |
| T2 | Hàm thuần khu vực → năng lực, loại yêu cầu → `request.decide.*` | `domain/permission-areas.ts` | Test đơn vị từng ô |
| T3 | `CapabilityResolver` + cache + vô hiệu; đổi `AuthGuard`/`AuthService` | `auth/capability-resolver.ts` | Test: đổi vai trò có hiệu lực ngay; toàn bộ test cũ vẫn xanh (admin giữ mọi quyền) |
| T4 | Đổi cap trên route theo T0 (`request.decide.*`, tách đọc/ghi nếu cần) | Controller | Test bảng quyền `auth-access.test.ts` phủ mọi handler |
| T5 | `GET/POST/PUT /roles`, `deprecate`, kiểm admin cuối cùng, audit | `roles.service.ts`, controller | Test HTTP: quyền, 409 `rev`, 409 admin cuối, audit |
| T6 | Gán vai trò: kiểm tồn tại/chưa ngừng dùng; thu hồi vai trò phụ | `employees` service | Test PG |
| T7 | Hợp đồng API | `docs/api/v2-contract.md` | Rà soát |
| T8 | FE: nối service, chỉnh builder, nhánh mock | `admin-perm.ts`, builders | Spec Playwright mock mới cho tạo/sửa/ngừng vai trò |
| T9 | FE với BE thật: tạo vai trò, gán cho nhân viên thử, đăng nhập nhân viên thấy/không thấy đúng màn và route trả 403 | `web/tests/api/permissions.spec.ts` | Chạy trên DB sạch |
| T10 | Rà toàn bộ: test BE, FE mock, FE BE thật, build; cập nhật bàn giao | Báo cáo | Lệnh xác minh của `CLAUDE.md` mục 5 |

## 7. Rủi ro

- **Khoá mình khỏi hệ thống:** chặn bằng quy tắc admin cuối cùng (T5) và vai trò `admin` khoá.
- **Quyền cũ gãy:** `admin` giữ tập năng lực cũ nguyên vẹn; test `auth-access` phải phủ mọi handler trước khi đổi cap (T4).
- **Cache lệch:** vô hiệu theo `rev` và theo thay đổi tài khoản; có test cho đường đổi vai trò của một phiên đang mở.
- **Phạm vi "Nhóm mình quản lý":** chưa có mô hình tổ chức, xem câu 3 bên dưới; đây là phần lớn nhất nếu làm đủ.
- **Quy tắc duyệt theo ngữ cảnh** (tab "Xử lý yêu cầu") không nằm trong spec này.

## 8. Cần sếp quyết trước khi viết plan chi tiết

1. **Giao diện:** dùng lại màn ma trận đã dựng (`PermRolesView`: khu vực × Không/Xem/Sửa, loại yêu cầu, việc khác) hay có board thiết kế mới? *Đề xuất: dùng lại.*
2. **Danh sách khu vực và việc khác** hiển thị trong ma trận: dùng bộ đang có trong builder (Tổng quan, Chấm công, Bảng lương, Nhân sự, Cài đặt…) và 9 năng lực hiện tại, hay có danh sách riêng? T0 sẽ liệt kê cụ thể để sếp xem.
3. **Phạm vi** (Tất cả / Nhóm mình quản lý / Chỉ bản thân):
   - A. Đợt này chỉ có "Tất cả", ẩn cột phạm vi. *Đề xuất.*
   - B. Làm đủ: thêm `staff.manager_username` (hoặc bảng nhóm), áp phạm vi vào mọi truy vấn danh sách chấm công, đơn, lương, nhân sự. Cần spec riêng, lớn.
4. **Vai trò `manager`:** bỏ khỏi danh sách mặc định (đề xuất), hay định nghĩa sẵn một tập quyền cho Quản lý? Nếu giữ, cho mình biết tập quyền.
5. **Một người một vai trò** (đề xuất) hay cho nhiều vai trò?

Sau khi sếp trả lời 5 câu, mình viết plan chi tiết (`docs/superpowers/plans/2026-11-06-permissions-roles.md`), chờ sếp duyệt, rồi mới thực thi.
