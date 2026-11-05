// Route của nhóm staff-desktop: nhân viên trên máy tính (/nv-may-tinh) và đăng nhập (/dang-nhap).
// ?kb=linh|ca-dem|ctv|tts|quen-checkout|yeu-cau-cho  ?thang=YYYY-MM  ?hop=cach-tinh|chi-tiet-ngay|menu|ho-so
// Máy chủ thật: màn máy tính còn dựng trên API V1 (/sheet, /punch), nên chuyển sang app nhân viên /nv/* (đã nối /me).
export default [
  __MOCK__
    ? {
        path: '/nv-may-tinh',
        component: () => import('@/views/staff-desktop/StaffHome.vue'),
        meta: { layout: 'staffDesktop', title: 'Nhân viên' }
      }
    : { path: '/nv-may-tinh', redirect: '/nv/hom-nay' },
  {
    path: '/dang-nhap',
    component: () => import('@/views/auth/LoginView.vue'),
    meta: { layout: 'blank', title: 'Đăng nhập' }
  }
];
