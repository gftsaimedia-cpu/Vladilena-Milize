// Mục lục thiết kế của nhóm staff-desktop (nhân viên trên máy tính và đăng nhập).
// Dòng K mở bản máy tính khi cửa sổ từ 1136px; dòng J của staff-phone.ts mở bản điện thoại khi cửa sổ hẹp hơn.
// Cùng URL nên giao diện theo bề ngang lúc mở.
export default [
  { file: 'StaffDesktop.dc.html', title: 'Nhân viên trên máy tính · một trang ba cột', to: '/nv/hom-nay' },
  {
    file: 'StaffDesktopDay.dc.html',
    title: 'Máy tính · ngăn kéo một ngày (27/10)',
    to: '/nv/cham-cong?ngay=2026-10-27'
  },
  {
    file: 'StaffDesktopRequest.dc.html',
    title: 'Máy tính · ngăn kéo yêu cầu bị từ chối',
    to: '/nv/yeu-cau?yc=gio-vao-0909'
  },
  { file: 'StaffDesktop.dc.html#menu', title: 'Máy tính · menu tài khoản', to: '/nv/toi' },
  { file: 'dang-nhap.html', title: 'Đăng nhập', to: '/dang-nhap' },
  { file: 'dang-nhap-sai.html', title: 'Đăng nhập · sai mật khẩu', to: '/dang-nhap?kb=sai' }
];
