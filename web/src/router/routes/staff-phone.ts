// Route của nhóm staff-phone: giao diện nhân viên trên điện thoại (khung 'phone', thanh tab dưới đáy).
// ?kb=<tên> chọn kịch bản dữ liệu giả; ?hop=<tên> mở sẵn bảng trượt.
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
