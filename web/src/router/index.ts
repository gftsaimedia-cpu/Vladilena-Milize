// Bảng route của v2. Mỗi nhóm màn có một file route riêng trong ./routes (mỗi người làm một file, không sửa file của nhóm khác).
// Quy ước chung:
//   meta.layout: 'admin' | 'phone' | 'staffDesktop' | 'blank'   meta.nav: mục sáng trên thanh bên Admin   meta.title: tiêu đề tab
//   ?thang=YYYY-MM  tháng của kỳ lương (thanh kỳ lương Admin đọc)
//   ?kb=<tên>       kịch bản dữ liệu giả (một trạng thái của màn trong bộ thiết kế)
//   ?hop=<tên>      mở sẵn một hộp thoại, ngăn kéo hay bảng trượt khi vào màn
import { createRouter, createWebHistory } from 'vue-router';
import { LOGIN_PATH, useSessionStore } from '@/stores/session';
import adminAttendance from './routes/admin-attendance';
import adminMain from './routes/admin-main';
import adminPayroll from './routes/admin-payroll';
import adminSettings from './routes/admin-settings';
import payslip from './routes/payslip';
import staffDesktop from './routes/staff-desktop';
import staffPhone from './routes/staff-phone';

const PHONE_MAX = 767; // dưới bề rộng này là điện thoại

const routes = [
  { path: '/', redirect: () => useSessionStore().home },
  // Mục lục thiết kế chạy trên dữ liệu giả: chỉ có ở chế độ mock, không vào bản build thật.
  ...(__MOCK__
    ? [
        {
          path: '/thiet-ke',
          component: () => import('@/views/DesignIndex.vue'),
          meta: { layout: 'blank', title: 'Mục lục thiết kế' }
        }
      ]
    : []),
  { path: '/admin', redirect: '/admin/tong-quan' },
  {
    path: '/nhan-vien',
    redirect: () => (!__MOCK__ || window.innerWidth <= PHONE_MAX ? '/nv/hom-nay' : '/nv-may-tinh')
  },
  ...adminMain,
  ...adminAttendance,
  ...adminSettings,
  ...adminPayroll,
  ...payslip,
  ...staffPhone,
  ...staffDesktop,
  {
    path: '/:pathMatch(.*)*',
    component: () => import('@/views/NotFound.vue'),
    meta: { layout: 'blank', title: 'Không có trang này' }
  }
];

const router = createRouter({
  history: createWebHistory(),
  routes: routes as any,
  scrollBehavior: (to?, from?, saved?) => saved || (to.path === from.path ? false : { top: 0 })
});

// Cổng vào theo phiên: chưa đăng nhập → đăng nhập; khu Admin chỉ cho người có năng lực quản trị;
// khu nhân viên cho người đã đăng nhập (tài khoản quản trị không thuộc bảng lương về khu Admin).
// Mục lục thiết kế (/thiet-ke) và trang không có trong bảng route để mở không cần đăng nhập. Máy chủ vẫn kiểm quyền từng yêu cầu.
const OPEN_PATHS = ['/thiet-ke'];
router.beforeEach(async to => {
  const session = useSessionStore();
  if (!session.ready) await session.load().catch(() => session.clear());
  if (to.path === LOGIN_PATH) return session.isLoggedIn ? session.home : true;
  if (OPEN_PATHS.includes(to.path) || !to.matched.length) return true;
  const layout = to.meta.layout;
  const isPrint = to.path.startsWith('/in/');
  if (layout !== 'admin' && layout !== 'phone' && layout !== 'staffDesktop' && !isPrint) return true;
  if (!session.isLoggedIn) return { path: LOGIN_PATH, query: to.fullPath !== '/' ? { tiep: to.fullPath } : {} };
  if (layout === 'admin') return session.isAdminCapable ? true : session.home;
  if (layout === 'phone' || layout === 'staffDesktop')
    return session.isAdminCapable && !session.payrollSubject ? session.home : true;
  return true;
});

router.afterEach(to => {
  document.title = to.meta.title ? `AiCB · ${to.meta.title}` : 'AiCB';
});

export default router;
