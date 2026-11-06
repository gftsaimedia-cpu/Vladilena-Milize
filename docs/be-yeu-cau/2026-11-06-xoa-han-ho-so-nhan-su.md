# Yêu cầu BE: xoá hẳn hồ sơ nhân sự tạo nhầm (2026-11-06)

Người gửi: phiên FE staff-crud (Thêm / Sửa hồ sơ / Cho nghỉ việc ở màn Nhân sự).
Nhánh: `claude/staff-crud`, tách từ main `b45bc121`. Chưa merge, chưa push.

**Trạng thái: chờ người dùng quyết có cần xoá hẳn không.** Mục 3 chỉ là đề xuất, người dùng chưa duyệt.

## 1. Đã có

- `DELETE /api/v2/employees/:username` là **cho nghỉ việc**, không phải xoá: `contract.status = 'nghiviec'`, `resignedOn` = hôm nay, tài khoản khoá. Hồ sơ, chấm công, phiếu lương vẫn giữ. Trả `{ deactivated: true, username }`.
- FE đã dùng route này cho nút **Cho nghỉ việc** trong ngăn kéo hồ sơ (`web/src/views/admin/staff/StaffEndDialog.vue`, dịch vụ `endEmployment` ở `web/src/services/admin-hr.ts`). Nút ẩn với người đã nghỉ việc.

## 2. Còn thiếu

Không có cách xoá hẳn một hồ sơ tạo nhầm, ví dụ gõ sai tên đăng nhập hay tạo trùng một người. Tên đăng nhập không đổi được (`PUT` báo "Không đổi được tên đăng nhập hoặc mã nhân sự"). Vì vậy hồ sơ nhầm chỉ có thể cho nghỉ việc, và nó vẫn nằm trong danh sách với trạng thái Đã nghỉ việc.

## 3. Đề xuất (chưa duyệt)

- Thêm một route xoá hẳn riêng, tách khỏi `DELETE` hiện có, ví dụ `DELETE /api/v2/employees/:username/purge`.
- Chỉ cho xoá khi người đó chưa có dữ liệu nghiệp vụ: chưa có chấm công, đơn, phiếu lương hay kỳ lương nào nhắc tới. Có dữ liệu thì trả 409 kèm mã lỗi.
- Ngăn trước thay vì báo lỗi sau: `GET /api/v2/employees/:username` trả thêm `canPurge: boolean`. FE chỉ hiện nút **Xoá hồ sơ** khi `canPurge` là true.
- Ghi nhật ký `staff.delete` gồm bản hồ sơ trước khi xoá.

## 4. Câu hỏi cho người dùng

1. Có cần xoá hẳn không, hay chỉ Cho nghỉ việc là đủ?
2. Nếu có: chỉ Admin được xoá, và chỉ khi chưa có dữ liệu như mục 3?

## 5. Phía FE khi BE xong

Nút **Xoá hồ sơ** đặt trong ngăn kéo hồ sơ, cạnh Cho nghỉ việc, chỉ hiện khi `canPurge`. Có hộp hỏi lại trước khi xoá. Xoá xong thì đóng ngăn kéo và tải lại danh sách.
