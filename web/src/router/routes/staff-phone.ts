// Route của nhóm staff-phone: app nhân viên trên điện thoại (khung 'phone', thanh tab nổi), chạy trên dữ liệu giả.
// Hộp trượt mở theo tham số: /nv/cham-cong?ngay=YYYY-MM-DD (một ngày), /nv/yeu-cau?yc=<id> (một yêu cầu),
// /nv/toi?hop=doi-mat-khau (đổi mật khẩu). Tham số lạ bị bỏ khỏi URL bằng replace; đóng hộp cũng bỏ tham số bằng replace.
const meta = (title?) => ({ layout: 'phone', nav: 'nv', title });

export default [
  {
    path: '/nv/hom-nay',
    name: 'nv-hom-nay',
    component: () => import('@/views/staff-phone/HomeView.vue'),
    meta: meta('Hôm nay')
  },
  {
    path: '/nv/cham-cong',
    name: 'nv-cham-cong',
    component: () => import('@/views/staff-phone/AttendanceView.vue'),
    meta: meta('Chấm công')
  },
  {
    path: '/nv/yeu-cau',
    name: 'nv-yeu-cau',
    component: () => import('@/views/staff-phone/RequestsView.vue'),
    meta: meta('Yêu cầu')
  },
  {
    path: '/nv/thu-nhap',
    name: 'nv-thu-nhap',
    component: () => import('@/views/staff-phone/IncomeView.vue'),
    meta: meta('Thu nhập')
  },
  {
    path: '/nv/toi',
    name: 'nv-toi',
    component: () => import('@/views/staff-phone/ProfileView.vue'),
    meta: meta('Tôi')
  }
];
