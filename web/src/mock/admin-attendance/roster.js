// 20 nhân sự đang hiện ở trang 1 của các tab Chấm công (CTV, xếp theo tên như thiết kế).
// Mỗi tab (bảng công, hôm nay, phép) lấy danh sách này rồi thêm số liệu riêng.
export const ROSTER = [
  ['u01', 'Bùi Đức Khoa', 'n1'],
  ['u02', 'Chu Đức Nga', 'f2'],
  ['u03', 'Hoàng Bảo An', 'n1'],
  ['u04', 'Hồ Phương Lam', 'n2'],
  ['u05', 'La Nhật Oanh', 'n1'],
  ['u06', 'Lý Phương Mai', 'n1'],
  ['u07', 'Lương Minh My', 'n1'],
  ['u08', 'Lương Quang Khôi', null],
  ['u09', 'Nguyễn Anh Bình', 'n1'],
  ['u10', 'Ngô Khánh Đạt', 'n1'],
  ['u11', 'Ngô Thu Yến', 'f1'],
  ['u12', 'Phan Mỹ Uyên', 'n1'],
  ['u13', 'Phan Thanh Trang', 'n1'],
  ['u14', 'Phạm Gia Sơn', 'n2'],
  ['u15', 'Phạm Mỹ Thảo', 'n1'],
  ['u16', 'Trần Ngọc Thảo', 'n2'],
  ['u17', 'Tạ Quang Quân', 'n1'],
  ['u18', 'Võ Anh Uyên', 'n1'],
  ['u19', 'Võ Nhật Vy', 'n1'],
  ['u20', 'Đinh Khánh Khôi', 'f1']
].map(([id, name, shift]) => ({ id, name, shift }));

export const personOf = id => ROSTER.find(p => p.id === id) || null;
