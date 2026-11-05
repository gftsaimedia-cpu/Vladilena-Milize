// Route của nhóm admin-main: Tổng quan (khung Admin).
// Màn Yêu cầu cũ đã bỏ: hai địa chỉ cũ chuyển về Tổng quan, chỉ giữ ?thang; việc chờ duyệt xem ở chuông.
const toOverview = (to?: any) => ({ path: '/admin/tong-quan', query: to.query.thang ? { thang: to.query.thang } : {} });

export default [
  {
    path: '/admin/tong-quan',
    component: () => import('@/views/admin/overview/OverviewView.vue'),
    meta: { layout: 'admin', nav: 'tong-quan', title: 'Tổng quan' }
  },
  { path: '/admin/yeu-cau', redirect: toOverview },
  { path: '/admin/yeu-cau/moi-thang', redirect: toOverview }
];
