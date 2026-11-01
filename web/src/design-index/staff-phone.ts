// Mục lục thiết kế của nhóm staff-phone (nhân viên trên điện thoại): mỗi file HTML một dòng.
export default [
  { file: 'nhan-vien-trang-chu.html', title: 'Hôm nay · đang trong ca (mặc định)', to: '/nv/hom-nay' },
  { file: 'nv-home-ca-dem.html', title: 'Hôm nay · ca đêm, chưa tới giờ Check-in', to: '/nv/hom-nay?kb=ca-dem' },
  { file: 'nv-home-ctv.html', title: 'Hôm nay · chuyên trách viên', to: '/nv/hom-nay?kb=ctv' },
  { file: 'nv-home-quen-checkout.html', title: 'Hôm nay · quên Check-out', to: '/nv/hom-nay?kb=quen-checkout' },
  { file: 'nv-home-tts.html', title: 'Hôm nay · thực tập sinh', to: '/nv/hom-nay?kb=tts' },
  { file: 'nv-cham-cong.html', title: 'Chấm công · tháng 11', to: '/nv/cham-cong' },
  { file: 'nv-yeu-cau.html', title: 'Yêu cầu · chưa có đơn', to: '/nv/yeu-cau' },
  { file: 'nv-yeu-cau-cho.html', title: 'Yêu cầu · có đơn chờ xử lý', to: '/nv/yeu-cau?kb=cho' },
  { file: 'nv-thu-nhap.html', title: 'Thu nhập · tháng 11', to: '/nv/thu-nhap' },
  { file: 'nv-thu-nhap-thang-10.html', title: 'Thu nhập · tháng 10 chính thức', to: '/nv/thu-nhap?kb=thang-10' },
  { file: 'nv-thu-nhap-ca-dem.html', title: 'Thu nhập · ca đêm', to: '/nv/thu-nhap?kb=ca-dem' },
  { file: 'nv-thu-nhap-ctv.html', title: 'Thu nhập · chuyên trách viên', to: '/nv/thu-nhap?kb=ctv' },
  { file: 'nv-thu-nhap-quen-checkout.html', title: 'Thu nhập · quên Check-out', to: '/nv/thu-nhap?kb=quen-checkout' },
  { file: 'nv-thu-nhap-tts.html', title: 'Thu nhập · thực tập sinh', to: '/nv/thu-nhap?kb=tts' },
  { file: 'nv-toi.html', title: 'Tôi · thông tin cá nhân', to: '/nv/toi' },
  {
    file: 'nv-sheet-chi-tiet-ngay.html',
    title: 'Bảng trượt · chi tiết một ngày chấm công',
    to: '/nv/cham-cong?hop=chi-tiet-ngay'
  },
  { file: 'nv-sheet-xin-nghi.html', title: 'Bảng trượt · xin nghỉ phép năm', to: '/nv/yeu-cau?hop=xin-nghi' },
  { file: 'nv-sheet-khai-ot.html', title: 'Bảng trượt · khai OT', to: '/nv/yeu-cau?hop=khai-ot' },
  { file: 'nv-sheet-ngay-khac.html', title: 'Bảng trượt · khai một ngày khác', to: '/nv/yeu-cau?hop=ngay-khac' },
  { file: 'nv-sheet-doi-mat-khau.html', title: 'Bảng trượt · đổi mật khẩu', to: '/nv/toi?hop=doi-mat-khau' }
];
