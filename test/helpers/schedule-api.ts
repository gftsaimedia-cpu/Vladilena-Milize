'use strict';
// Đồ dùng chung cho test API lịch làm việc. Dựng trên api-fixture (DB trong bộ nhớ,
// đồng hồ giả, người bịa qa_*). Hợp đồng:
//   GET  /api/staff/:u/schedule?month=YYYY-MM         200 { username, month, type, source: 'type', schedule, workdaysStd, scheduledDates }
//   Lịch của người luôn suy từ loại nhân sự; không có đường dẫn ghi lịch riêng.
const S = require('./settings-api');
const F0 = require('./schedule-fixtures');

const { F, store } = S;
const MONTH = '2026-11';
const CLOCK = '2026-11-02T09:00:00';
const NOT_PAYEE: Record<string, any> = { type: 'tts', level: 0, shiftCode: null, startDate: null }; // như `admin` của các test khác: không thuộc diện trả lương

// Dựng lại thế giới: nhân sự bịa của mọi vai trò
async function world() {
  await F.reset();
  await F.at(CLOCK);
  await F.person('admin', 'admin', NOT_PAYEE);
  await F.person('qa_cb', 'cb', NOT_PAYEE);
  await F.person('qa_hr', 'hr', NOT_PAYEE);
  await F.person('qa_acc', 'accounting', NOT_PAYEE);
  await F.person('qa_cb_self', 'cb'); // C&B cũng là nhân sự được trả lương
  await F.person('qa_s_nv', 'staff');
  await F.person('qa_s_nv2', 'staff');
  await F.person('qa_s_tts', 'staff', { type: 'tts', level: 3 });
  // vai trò thật nằm ở staff_roles (chỉ thêm dòng, reset() không xoá): thu hồi hết rồi gán lại cho đúng người của mỗi test
  await store.db
    .prepare('UPDATE staff_roles SET revoked_at = ? WHERE revoked_at IS NULL')
    .run(new Date(Date.now()).toISOString());
  for (const [username, role] of [
    ['qa_cb', 'cb'],
    ['qa_hr', 'hr'],
    ['qa_acc', 'accounting'],
    ['qa_cb_self', 'cb']
  ])
    await S.grant(username, role);
}
const url = (username?, tail = '') => `/staff/${username}/schedule${tail}`;
const get = async (username?, month = MONTH, who = 'admin') =>
  await F.call('GET', url(username, `?month=${month}`), { who });
const must = (res?, what?) => S.must(res, what);

module.exports = {
  ...S,
  F0,
  MONTH,
  CLOCK,
  world,
  url,
  get,
  must
};
