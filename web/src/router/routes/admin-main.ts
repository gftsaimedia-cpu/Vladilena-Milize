// Route của nhóm admin-main: Tổng quan, Yêu cầu (khung Admin).
// Yêu cầu có hai chế độ xem theo meta.scope: 'thang' (tháng hiện tại) và 'moi-thang' (cả các tháng trước).
const requests = () => import('@/views/admin/requests/RequestsView.vue');

export default [
  {
    path: '/admin/tong-quan',
    component: () => import('@/views/admin/overview/OverviewView.vue'),
    meta: { layout: 'admin', nav: 'tong-quan', title: 'Tổng quan' }
  },
  {
    path: '/admin/yeu-cau',
    component: requests,
    meta: { layout: 'admin', nav: 'duyet', title: 'Yêu cầu', scope: 'thang' }
  },
  {
    path: '/admin/yeu-cau/moi-thang',
    component: requests,
    meta: { layout: 'admin', nav: 'duyet', title: 'Yêu cầu · Mọi tháng', scope: 'moi-thang' }
  }
];
