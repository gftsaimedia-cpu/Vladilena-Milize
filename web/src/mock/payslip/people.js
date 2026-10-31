// Người giả của kỳ lương (tên bịa). 20 tên đầu theo hộp "In tất cả phiếu" của thiết kế; còn lại sinh theo quy tắc.
export const DEMO_BROKEN = 'demo_a_broken'; // Lương Minh My
export const DEMO_OT_CHECK = 'demo_a_ot_check'; // Hoàng Quang Châu (phiếu có cảnh báo)

const NAMED = [
  [DEMO_BROKEN, 'Lương Minh My', 'CTV · Fresher'],
  ['demo_a_vy', 'Võ Nhật Vy'],
  ['demo_a_hieu', 'Ngô Gia Hiếu'],
  ['demo_a_tri', 'Kiều Thu Trí'],
  [DEMO_OT_CHECK, 'Hoàng Quang Châu', 'NV · Chuyên viên'],
  ['demo_a_mai', 'Mai Nhật Mai'],
  ['demo_a_khoa', 'Dương Mỹ Khoa'],
  ['demo_a_chau2', 'Nguyễn Nhật Châu'],
  ['demo_a_quynh1', 'Chu Minh Quỳnh'],
  ['demo_a_quynh2', 'Kiều Phương Quỳnh'],
  ['demo_a_binh', 'Hoàng Hồng Bình'],
  ['demo_a_ha', 'Đặng Ngọc Hà'],
  ['demo_a_trang', 'Phan Thanh Trang'],
  ['demo_a_yen', 'Đỗ Anh Yến'],
  ['demo_a_khoi', 'Đinh Khánh Khôi'],
  ['demo_a_nga', 'Chu Đức Nga'],
  ['demo_a_oanh', 'La Nhật Oanh'],
  ['demo_a_son', 'Phạm Gia Sơn'],
  ['demo_a_quan', 'La Tuấn Quân'],
  ['demo_a_dat', 'Ngô Khánh Đạt']
];

const HO = ['Trần', 'Lê', 'Phạm', 'Huỳnh', 'Vũ', 'Bùi', 'Lý', 'Trương'];
const DEM = ['Thị', 'Văn', 'Hữu', 'Thanh', 'Bảo', 'Ngọc'];
const TEN = ['An', 'Bảo', 'Cường', 'Dung', 'Giang', 'Hải', 'Khánh', 'Lan', 'Minh', 'Nam', 'Phúc', 'Tâm'];

const generated = n =>
  Array.from({ length: n }, (_, i) => [
    `demo_a_nv${String(i + 1).padStart(2, '0')}`,
    `${HO[i % HO.length]} ${DEM[(i * 5) % DEM.length]} ${TEN[(i * 7) % TEN.length]}`
  ]);

const ALL = [...NAMED, ...generated(48)].map(([username, name, role]) => ({
  username,
  name,
  role: role || 'NV · Bậc 1'
}));

/** Người trong kỳ (68 người, đã phê duyệt ở tháng 10 đã trả lương). */
export const PEOPLE = ALL;

/** Tìm người theo username; không có thì trả tên/loại mặc định. */
export const findPerson = username => PEOPLE.find(p => p.username === username) || null;
