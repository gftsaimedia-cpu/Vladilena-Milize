/* Đường vào giao diện sau khi đăng nhập: dùng chung cho trang đăng nhập, Admin và Nhân viên.
   Người có năng lực quản trị trong /api/me (Admin, C&B, Kế toán...) vào admin.html; còn lại vào nhan-vien.html.
   Chỉ quyết định nơi vào: máy chủ vẫn kiểm quyền từng yêu cầu. */
(function (root) {
  'use strict';
  const ADMIN_CAPS = [
    'config.read',
    'payroll.calculate',
    'payroll.approve',
    'attendance.correct',
    'attendance.lock',
    'audit.read'
  ];
  const LOGIN_PAGE = '/dang-nhap.html';
  const adminCapable = me => {
    if (!me || !me.user) return false;
    if (me.user.role === 'admin') return true;
    return Array.isArray(me.caps) && me.caps.some(c => ADMIN_CAPS.includes(c));
  };
  const homeFor = me => (adminCapable(me) ? '/admin.html' : '/nhan-vien.html');
  root.HomeRoute = { ADMIN_CAPS, LOGIN_PAGE, adminCapable, homeFor };
})(window);
