// Mục lục thiết kế của nhóm staff-phone (nhân viên trên điện thoại): 7 board J1–J7 và hộp đổi mật khẩu, mỗi dòng một màn.
export default [
  { file: 'PhoneHome.dc.html', title: 'Hôm nay · đang trong ca', to: '/nv/hom-nay' },
  { file: 'PhoneAttendance.dc.html', title: 'Chấm công · tháng 10', to: '/nv/cham-cong' },
  {
    file: 'PhoneDay.dc.html',
    title: 'Hộp trượt · một ngày chấm công (27/10)',
    to: '/nv/cham-cong?ngay=2026-10-27'
  },
  { file: 'PhoneRequests.dc.html', title: 'Yêu cầu của tôi', to: '/nv/yeu-cau' },
  {
    file: 'PhoneRequest.dc.html',
    title: 'Hộp trượt · một yêu cầu (Phép năm 12/10)',
    to: '/nv/yeu-cau?yc=phep-1210'
  },
  { file: 'PhoneIncome.dc.html', title: 'Thu nhập · tháng 10 tạm tính', to: '/nv/thu-nhap' },
  { file: 'PhoneMe.dc.html', title: 'Tôi', to: '/nv/toi' },
  { file: 'nv-sheet-doi-mat-khau.html', title: 'Hộp trượt · đổi mật khẩu', to: '/nv/toi?hop=doi-mat-khau' }
];
