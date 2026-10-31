// Route của nhóm staff-desktop: nhân viên trên máy tính (/nv-may-tinh) và đăng nhập (/dang-nhap).
// ?kb=linh|ca-dem|ctv|tts|quen-checkout|yeu-cau-cho  ?thang=YYYY-MM  ?hop=cach-tinh|chi-tiet-ngay|menu|ho-so
export default [
  {
    path: '/nv-may-tinh',
    component: () => import('@/views/staff-desktop/StaffHome.vue'),
    meta: { layout: 'staffDesktop', title: 'Nhân viên' }
  },
  {
    path: '/dang-nhap',
    component: () => import('@/views/auth/LoginView.vue'),
    meta: { layout: 'blank', title: 'Đăng nhập' }
  }
];
