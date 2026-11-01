'use strict';
// Admin khai lịch ước tính thay nhân sự (PUT /api/sheet kèm `user`).
// Hai việc nằm ngoài server.js: xác định chủ của lịch (và chặn người không đủ quyền), và duyệt ngay + ghi nhật ký sau khi lưu.
const store = require('../platform/db');
const { AsyncList } = require('../shared/async-list');
const { HttpError } = require('../platform/http');
const authz = require('../platform/authz');
const audit = require('../platform/audit');
const { USERNAME_RE } = require('./input');

const ON_BEHALF_NOTE = 'Admin khai thay'; // ghi chú của khoản được duyệt ngay
// Trường quyết định một ngày có "đổi" hay không (preset do máy chủ gán nên không tính); makeupDate là dạng cũ chỉ có ngày làm bù
const DAY_FIELDS = ['kind', 'in', 'out', 'extraKind', 'extraIn', 'extraOut', 'makeupDate'];
// Lịch làm bù dự kiến của "Nghỉ, sẽ làm bù" là danh sách (đã làm sạch ở cleanDays): chỉ sửa lịch này cũng là đổi ngày đó,
// nếu không nhật ký ghi changedDays 0 trong khi khoản vẫn được duyệt lại. Không có và danh sách rỗng coi như nhau.
const plansKey = (day?) => JSON.stringify(Array.isArray(day.makeupPlans) ? day.makeupPlans : []);

// Chủ của lịch đang lưu: người gọi (không có user, hoặc trùng người gọi), hoặc người được khai thay.
// Khai thay cần quyền duyệt (request.decide.*) ở phạm vi người đó, nếu không 403 trước cả khi tìm người; người được khai phải có và thuộc bảng lương.
async function sheetOwner(caller?, userField?) {
  if (userField !== undefined && userField !== null && typeof userField !== 'string')
    throw new HttpError(400, 'user phải là tên đăng nhập');
  const who = String(userField || '').toLowerCase();
  if (!who || who === caller.username) return caller;
  if (!(await authz.can(caller, authz.DECIDE_ALL, { username: who })))
    throw new HttpError(403, 'Bạn không có quyền khai lịch thay người khác', {
      code: 'FORBIDDEN_CAP',
      cap: authz.DECIDE_ALL
    });
  if (!USERNAME_RE.test(who)) throw new HttpError(400, 'user không hợp lệ');
  const target = await store.getStaff(who);
  if (!target) throw new HttpError(404, 'Không có nhân sự này');
  if (!target.payrollSubject)
    throw new HttpError(400, 'Tài khoản này không thuộc bảng lương nên không có lịch để khai');
  return target;
}

// Gọi TRONG giao dịch lưu lịch, sau reconcile. found: kết quả reconcile ({ added, reset, resubmitted, removed });
// prevDays, clean: lịch trước và sau khi lưu. Trả { decided, presence }: decided = các dòng đã duyệt ngay ([{ username, date, status, rev }]),
// presence = { set, removed, skipped } ngày có lượt chấm công Admin được ghi, bỏ, không ghi được.
// Khoản cần duyệt vừa khai (thêm, về chờ, khai lại) được người khai duyệt bằng đường quyết định có sẵn, nhưng chỉ khoản họ có quyền duyệt;
// khoản khác vẫn chờ như thường. Một dòng nhật ký cho mỗi lần lưu: người khai (actx), người được khai, tháng, số ngày đổi (không ghi nội dung từng ngày).
async function approveOnBehalf({ caller, owner, month, found, prevDays, clean, actx, confirmDays }: any) {
  const rows = await AsyncList.map([...found.added, ...found.reset, ...found.resubmitted], date =>
    store.approvals.get(owner.username, date)
  );
  const mine = (
    await AsyncList.filter(
      rows,
      async row =>
        row &&
        row.status === 'pending' &&
        (await authz.can(caller, `request.decide.${row.item}`, { username: row.username }))
    )
  ).map(row => ({ username: row.username, date: row.date, rev: row.rev, fingerprint: row.fingerprint }));
  const decided = mine.length ? await store.approvals.decide(mine, 'approved', caller.username, ON_BEHALF_NOTE) : [];
  const same = (a?, b?) => DAY_FIELDS.every(key => (a[key] || '') === (b[key] || '')) && plansKey(a) === plansKey(b);
  const changedDays = [...new Set<any>([...Object.keys(prevDays), ...Object.keys(clean)])].filter(
    date => !prevDays[date] || !clean[date] || !same(prevDays[date], clean[date])
  ).length;
  // Ngày đi làm Admin khai thay giờ vào / ra (đã qua giờ ra) thành lượt chấm công nguồn Admin (src/domain/attendance/admin-presence.ts);
  // confirmDays: ngày Admin vừa lưu trong hộp khai thay, ghi cả khi giờ không đổi
  const presence = await require('./container').container.adminPresence.sync({
    caller,
    owner,
    month,
    prevDays,
    clean,
    actx,
    confirmDays
  });
  await audit.write(actx, {
    action: 'sheet.onBehalf',
    entityKind: 'timesheet',
    entityId: `${owner.username}:${month}`,
    subject: owner.username,
    month,
    after: { changedDays, autoApproved: decided.length }
  });
  return { decided, presence };
}

export = { ON_BEHALF_NOTE, sheetOwner, approveOnBehalf };
