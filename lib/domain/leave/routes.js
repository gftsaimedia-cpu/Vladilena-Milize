'use strict';
// Sổ phép năm lưu sẵn (vừa lưu vừa tính, tự cập nhật khi qua tháng làm việc tròn hoặc sinh nhật).
//   GET  /api/leave/ledger[?user=]     số dư hiện tại + các lần cộng/hết hạn của một người (mặc định chính mình); xem người khác cần profile.read
//   POST /api/leave/refresh { user? }  tính lại ngay một người (user) hoặc mọi người; cần profile.write
// Đọc sổ cũng làm mới người đó, nên số luôn đúng tới hôm nay dù hẹn giờ chưa chạy.
const store = require('../../db');
const authz = require('../../authz');
const { HttpError, send, readJson } = require('../../http');
const { USERNAME_RE } = require('../input');
const { container } = require('../container');

const bad = (message, code) => new HttpError(400, message, { code });

async function staffOf(username) {
  if (!USERNAME_RE.test(username)) throw bad('user không hợp lệ', 'BAD_USER');
  const staff = await store.getStaff(username);
  if (!staff) throw new HttpError(404, 'Không có nhân viên này', { code: 'STAFF_NOT_FOUND' });
  return staff;
}

async function handle({ req, res, seg, url, me }) {
  const leave = container.leave;
  if (seg[2] === 'ledger' && seg.length === 3 && req.method === 'GET') {
    const username = (url.searchParams.get('user') || me.username).toLowerCase();
    if (username !== me.username && !await authz.can(me, 'profile.read', { username }))
      throw new HttpError(403, 'Không có quyền xem sổ phép của người khác', { code: 'FORBIDDEN_CAP' });
    const staff = await staffOf(username);
    const result = await leave.refresh(staff);
    return send(res, 200, {
      username,
      uuid: staff.uuid,
      hasAccount: !!result,
      balance: result ? result.balance : null,
      on: result ? result.on : null,
      summary: result ? result.summary : null,
      events: result ? await container.leave.ledger.eventsOf(staff.uuid) : []
    });
  }
  if (seg[2] === 'refresh' && seg.length === 3 && req.method === 'POST') {
    const body = (await readJson(req)) || {};
    if (body.user) {
      const staff = await staffOf(String(body.user).toLowerCase());
      const result = await leave.refresh(staff);
      return send(res, 200, {
        checked: 1,
        accounts: result ? 1 : 0,
        failed: 0,
        balance: result ? result.balance : null
      });
    }
    return send(res, 200, await leave.refreshAll());
  }
  throw new HttpError(404, 'Không có đường dẫn này');
}

module.exports = { handle };
