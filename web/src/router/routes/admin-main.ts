// Route của nhóm admin-main: Tổng quan, Yêu cầu, Trợ lý AI (khung Admin).
// Yêu cầu có hai chế độ xem theo meta.scope: 'thang' (tháng hiện tại) và 'moi-thang' (cả các tháng trước).
// Trợ lý AI: ?kb=nhieu-phep chọn câu hỏi "Ai còn nhiều phép?"; ?hop=ly-do mở hộp lý do AI.
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
  },
  {
    path: '/admin/tro-ly-ai',
    component: () => import('@/views/admin/assistant/AssistantView.vue'),
    meta: { layout: 'admin', nav: 'tro-ly', title: 'Trợ lý AI' }
  }
];
