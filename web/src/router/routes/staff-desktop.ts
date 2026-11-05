// Route của nhóm staff-desktop: đăng nhập (/dang-nhap) và liên kết cũ /nv-may-tinh (chuyển về /nv/hom-nay;
// trang máy tính nay là khung 'staff' của /nv/*, chọn theo bề ngang).
export default [
  { path: '/nv-may-tinh', redirect: '/nv/hom-nay' },
  {
    path: '/dang-nhap',
    component: () => import('@/views/auth/LoginView.vue'),
    meta: { layout: 'blank', title: 'Đăng nhập' }
  }
];
