const store = require('../../platform/db');
const { HttpError } = require('../../platform/http');
const { positiveId } = require('../input');
const { rulesFor, nowIso } = require('../../platform/request-rules');
const schedule = require('../schedule'); // lịch làm việc của người (một nguồn)
const events = require('../../platform/events'); // báo cho màn đang mở, phát SAU KHI giao dịch đã COMMIT
const config = require('../../platform/config');
const { ADMIN_ORIGIN } = require('./attendance-sessions'); // dấu của lượt Admin khai thay giờ vào / ra

// Hồ sơ cho punch.js: ca cố định và hàm "ngày có trong lịch" giải theo THÁNG CỦA NGÀY ĐÓ (ca đêm cuối tháng lấy lịch của ngày công, không của tháng chấm)
// dates: các ngày (hoặc mốc ISO) sẽ đưa vào punch.js; mặc định hôm nay
const punchStaff = async (s, ...dates) => ({
  shiftCode: s.shiftCode,
  isWorkDay: await schedule.isWorkDayFn(s, ...dates)
});
const sessionHistory = async (session?) =>
  session && {
    ...session,
    punches: await store.sessionPunches(session.id),
    corrections: await store.listCorrections({ username: session.username, sessionId: session.id })
  };
// Gắn lượt bấm và yêu cầu điều chỉnh vào NHIỀU phiên bằng một truy vấn mỗi loại cho mỗi nhóm id (không hỏi riêng từng phiên:
// 1.000 người thì /api/attendance, /api/team quá chậm). Hình phản hồi y hệt sessionHistory: punches theo id tăng, corrections theo id giảm.
async function sessionsWithHistory(sessions?) {
  const punchesBy = new Map<any, any>(),
    correctionsBy = new Map<any, any>();
  for (let i = 0; i < sessions.length; i += config.SQL_IN_CHUNK) {
    const ids = sessions.slice(i, i + config.SQL_IN_CHUNK).map(s => s.id);
    for (const p of await store.sessionsRepo.punchesOfSessions(ids)) {
      if (!punchesBy.has(p.session_id)) punchesBy.set(p.session_id, []);
      punchesBy.get(p.session_id).push({ ...p, ts: p.at, context: p.context_json ? JSON.parse(p.context_json) : null });
    }
    for (const c of await store.repos.corrections.ofSessions(ids)) {
      if (!correctionsBy.has(c.session_id)) correctionsBy.set(c.session_id, []);
      correctionsBy.get(c.session_id).push({
        ...c,
        sessionId: c.session_id ?? null,
        sessionVersion: c.session_version ?? null,
        context: c.context_json ? JSON.parse(c.context_json) : null
      });
    }
  }
  return sessions.map(s => ({
    ...s,
    punches: punchesBy.get(s.id) || [],
    corrections: (correctionsBy.get(s.id) || []).filter(c => c.username === s.username)
  }));
}
const sessionsFor = async (filter?) => await sessionsWithHistory(await store.listSessions(filter));
// Lượt chấm công vừa đổi (Check-in, Check-out, lượt quá hạn tự đóng) trong yêu cầu đang chạy: { 'tên|ngày': { username, date } }.
// Ghi trong lúc xử lý, phát MỘT lần sau khi yêu cầu xong (đã COMMIT); lỗi thì xoá, không báo.
const punchHints = new Map<any, any>();
const hintPunch = (username?, date?) => punchHints.set(`${username}|${date}`, { username, date });
// Phát tin chấm công đã gom: người có attendance.correct nhận 'attendance.changed' kind 'punch' (mỗi tháng một tin), chính người chấm nhận 'punch.changed'
async function announcePunches() {
  const hints = [...punchHints.values()];
  punchHints.clear();
  for (const month of new Set<any>(hints.map(h => h.date.slice(0, 7))))
    await events.emit.attendanceChanged('punch', month);
  for (const h of hints) await events.emit.punchChanged(h.username, h.date);
}
async function closeStale(staff?) {
  return await store.transaction(async () => {
    const session = await store.openSession(staff.username),
      t = nowIso();
    if (!session || !session.entry.presIn || !(await rulesFor()).punch.forgotOut(session.entry.presIn, t)) return;
    const entry = { ...session.entry, kind: 'pending', reason: 'forgot-out' };
    delete entry.presOut;
    await store.updateSession(session.id, session.version, { date: session.date, state: 'closed', entry });
    await store.addPunch(
      staff.username,
      t,
      'out',
      null,
      true,
      { plannedShift: entry.plannedShift || null },
      session.id
    );
    hintPunch(staff.username, session.date);
  });
}
// Đóng các lượt mở quá hạn của những người trong tập names có lượt đang mở ở tháng month (danh sách kiểm kỳ lương đếm lượt "đang mở" sau khi gọi hàm này)
async function closeStaleIn(month?, names?) {
  const open = (await store.listSessions({ month })).filter(s => s.state === 'open' && names.has(s.username));
  for (const username of new Set<any>(open.map(s => s.username))) await closeStale({ username });
}
// Đóng lượt quá hạn cho cả danh sách người: lọc bằng SQL (state='open' + presIn trước mốc quên Check-out của punch.staleBefore)
// nên chỉ mở giao dịch cho người THẬT SỰ quá hạn — thường không có ai. Đường ĐỌC (GET /api/attendance, /alerts, /today, /team)
// không được ghi DB khi không có ai quá hạn.
async function closeStaleFor(staffList?) {
  const stale = await store.sessionsRepo.staleOpenUsers((await rulesFor()).punch.staleBefore(nowIso()));
  const wanted = new Set<any>(staffList.map(s => s.username));
  for (const username of new Set<any>(stale.map(r => r.username)))
    if (wanted.has(username)) await closeStale({ username });
}
async function sessionOverlap(username?, inIso?, outIso?, excludeId?) {
  const a = Date.parse(inIso),
    b = Date.parse(outIso);
  for (const s of await store.listSessions({ username })) {
    // Lượt Admin khai thay (src/domain/attendance/admin-presence.ts) không chặn Check-in/out thật: lượt chấm thật dùng được thắng nó
    if (s.id === excludeId || !s.entry.presIn || s.entry.origin === ADMIN_ORIGIN) continue;
    const start = Date.parse(s.entry.presIn),
      end = s.state === 'open' ? Infinity : Date.parse(s.entry.presOut);
    if (Number.isFinite(start) && !Number.isNaN(end) && a < end && b > start)
      return `Giờ có mặt chồng với lượt ngày ${s.date}`;
  }
  return '';
}
function correctionVersion(session?, value?) {
  if (!positiveId(value)) throw new HttpError(400, 'Cần phiên bản lượt chấm công');
  if (session.version !== value) throw new HttpError(409, 'Lượt chấm công đã thay đổi — tải lại trước khi xử lý');
}

export = {
  punchStaff,
  sessionHistory,
  sessionsFor,
  closeStale,
  closeStaleIn,
  closeStaleFor,
  sessionsWithHistory,
  punchHints,
  hintPunch,
  announcePunches,
  sessionOverlap,
  correctionVersion
};
