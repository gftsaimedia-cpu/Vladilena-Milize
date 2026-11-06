// Route của nhóm admin-main: Tổng quan và Yêu cầu (khung Admin).
// Yêu cầu (06/11): mọi đơn, cả đơn đã xử lý; ?don mở ngăn chi tiết, ?tuchoi=1 mở ô ghi lý do từ chối.
// Địa chỉ cũ /admin/yeu-cau/moi-thang vẫn chuyển về Tổng quan, chỉ giữ ?thang.
const toOverview = (to?: any) => ({ path: '/admin/tong-quan', query: to.query.thang ? { thang: to.query.thang } : {} });

export default [
  {
    path: '/admin/tong-quan',
    component: () => import('@/views/admin/overview/OverviewView.vue'),
    meta: { layout: 'admin', nav: 'tong-quan', title: 'Tổng quan' }
  },
  {
    path: '/admin/yeu-cau',
    component: () => import('@/views/admin/requests/RequestsView.vue'),
    meta: { layout: 'admin', nav: 'yeu-cau', title: 'Yêu cầu' }
  },
  { path: '/admin/yeu-cau/moi-thang', redirect: toOverview }
];
