/* Giao diện Admin: danh sách nhân sự dùng chung cho nhiều màn (GET /api/staff). */
(function (A) {
  'use strict';
  A.staff = { state: 'idle', list: [], byUser: new Map(), error: null, promise: null };
  A.loadStaff = (force = false) => {
    if (!force && A.staff.promise && A.staff.state !== 'fail') return A.staff.promise;
    const mine = A.staff;
    mine.state = 'loading';
    mine.error = null;
    mine.promise = A.api('GET', '/staff')
      .then(res => {
        mine.list = res.staff;
        mine.byUser = new Map(res.staff.map(s => [s.username, s]));
        mine.state = 'ok';
      })
      .catch(e => {
        mine.state = 'fail';
        mine.error = A.errText(e);
      });
    return mine.promise;
  };
  /* Người tính lương: theo payrollSubject của máy chủ (tài khoản tạo ở Phân quyền là false). Thiếu cờ thì bỏ tài khoản Admin */
  A.people = () =>
    A.staff.list.filter(s => (typeof s.payrollSubject === 'boolean' ? s.payrollSubject : s.role !== 'admin'));
  A.holidaySet = () => new Set((A.meInfo && A.meInfo.holidays) || []);
})(window.Admin);
