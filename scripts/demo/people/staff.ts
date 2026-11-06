// Người của mảng 'staff' (spec docs/superpowers/specs/2026-11-05-demo-db-e2e-design.md mục 6).
// Chỉ phiên staff sửa file này. Username bắt đầu bằng 'ns-'. Phần nền tự tạo tài khoản và hợp đồng
// qua POST /api/v2/employees trước khi chạy seed của mảng (scripts/demo/areas/staff.ts).
// Bảng tình huống dùng những người này: docs/demo-db/staff.md.
import type { DemoPerson } from './types';

const since = { monthOffset: -2, day: 1 };

export const STAFF: DemoPerson[] = [
  {
    username: 'ns-an',
    familyName: 'Nguyễn Văn',
    givenName: 'An',
    area: 'staff',
    start: since,
    contract: { status: 'nv', position: { type: 'nv', level: 2, jobTitle: 'Kế toán viên' }, term: 'long', hasInsurance: true },
    note: 'NV bậc 2, HĐLĐ từ 3 tháng, có bảo hiểm. So hồ sơ Admin với /nv/toi (điện thoại, máy tính); gọi route Admin bằng tài khoản nhân viên.'
  },
  {
    username: 'ns-binh',
    familyName: 'Trần Thị',
    givenName: 'Bình',
    area: 'staff',
    start: since,
    contract: { status: 'tts', position: { type: 'tts', level: 1 }, term: 'short', hasInsurance: false },
    note: 'Thực tập sinh bậc 1, HĐLĐ dưới 3 tháng, không bảo hiểm: trạng thái hợp đồng tts phải đọc lại đúng.'
  },
  {
    username: 'ns-chau',
    familyName: 'Lê Minh',
    givenName: 'Châu',
    area: 'staff',
    start: since,
    contract: {
      status: 'ctv',
      position: { type: 'ctv', level: 1 },
      shift: { type: 'FLEX', startTime: '06:00', endTime: '15:00' }
    },
    note: 'Chuyên trách viên bậc 1, ca Flex 06:00–15:00, bảo hiểm để trống (theo mặc định hợp đồng).'
  },
  {
    username: 'ns-dung',
    familyName: 'Phạm Thu',
    givenName: 'Dung',
    area: 'staff',
    start: { monthOffset: 0, day: 1 },
    contract: { status: 'thuviec', position: { type: 'nv', level: 1 } },
    note: 'Nhân viên thử việc, vào làm ngày 01 tháng này: nhãn "Thử việc" ở danh sách Admin và /nv/toi.'
  },
  {
    username: 'ns-giang',
    familyName: 'Hoàng Văn',
    givenName: 'Giang',
    area: 'staff',
    start: since,
    contract: { status: 'nv', position: { type: 'nv', level: 1 } },
    note: 'Đã nghỉ việc: seed gọi DELETE /employees/ns-giang. Không đăng nhập được; danh sách phải ghi "Đã nghỉ việc".'
  },
  {
    username: 'ns-khoa',
    familyName: 'Vũ Đức',
    givenName: 'Khoa',
    area: 'staff',
    start: since,
    contract: { status: 'nv', position: { type: 'nv', level: 1 } },
    note: 'Tài khoản bị khoá trong seed (PUT account.isLocked). Đúng mật khẩu thì báo "Tài khoản đã bị tạm khóa".'
  },
  {
    username: 'ns-mo',
    familyName: 'Đỗ Thị',
    givenName: 'Mơ',
    area: 'staff',
    start: since,
    contract: { status: 'nv', position: { type: 'nv', level: 1 } },
    note: 'Test khoá rồi mở khoá ở Cài đặt › Phân quyền › Tài khoản.'
  },
  {
    username: 'ns-doimk',
    familyName: 'Bùi Văn',
    givenName: 'Đổi',
    area: 'staff',
    start: since,
    contract: { status: 'nv', position: { type: 'nv', level: 1 } },
    note: 'Test tự đổi mật khẩu ở /nv/toi; test trả lại mật khẩu cũ khi xong.'
  },
  {
    username: 'ns-datlai',
    familyName: 'Ngô Thị',
    givenName: 'Lại',
    area: 'staff',
    start: since,
    contract: { status: 'nv', position: { type: 'nv', level: 1 } },
    note: 'Test Admin đặt lại mật khẩu ở Phân quyền › Tài khoản; test trả lại mật khẩu cũ khi xong.'
  },
  {
    username: 'ns-vaitro',
    familyName: 'Đinh Văn',
    givenName: 'Trò',
    area: 'staff',
    start: since,
    contract: { status: 'nv', position: { type: 'nv', level: 1 } },
    note: 'Test đổi vai trò Nhân viên → Admin → Nhân viên ở Phân quyền › Tài khoản.'
  },
  {
    username: 'ns-sua',
    familyName: 'Lý Thị',
    givenName: 'Sửa',
    area: 'staff',
    start: since,
    contract: { status: 'nv', position: { type: 'nv', level: 1 }, term: 'long', hasInsurance: true },
    note: 'Test sửa hồ sơ qua PUT /employees (bậc, ca, chức danh, hợp đồng, bảo hiểm, người phụ thuộc).'
  },
  {
    username: 'ns-trung',
    familyName: 'Mai Văn',
    givenName: 'Trùng',
    area: 'staff',
    start: since,
    contract: { status: 'nv', position: { type: 'nv', level: 1 } },
    note: 'Test POST /employees lần hai với cùng tên đăng nhập.'
  },
  {
    username: 'ns-sai',
    familyName: 'Cao Văn',
    givenName: 'Sai',
    area: 'staff',
    start: since,
    contract: { status: 'nv', position: { type: 'nv', level: 1 } },
    note: 'Test sai mật khẩu và giới hạn 5 lần sai trong 15 phút. Không test nào khác đăng nhập bằng người này.'
  },
  {
    username: 'ns-xoa',
    familyName: 'Tạ Thị',
    givenName: 'Xoá',
    area: 'staff',
    start: since,
    contract: { status: 'nv', position: { type: 'nv', level: 1 } },
    note: 'Test gọi DELETE /employees/ns-xoa trong lúc người này đang có phiên.'
  },
  {
    username: 'ns-nhatky',
    familyName: 'Trần Văn',
    givenName: 'Ký',
    area: 'staff',
    start: since,
    contract: { status: 'nv', position: { type: 'nv', level: 1 } },
    note: 'Test Nhật ký: Admin khoá tài khoản và sửa số người phụ thuộc trong một lần lưu (gộp × 2), đặt lại mật khẩu rồi trả về như cũ.'
  }
];
