'use strict';
const { AsyncList } = require('../../shared/async-list');
// Lượt chấm công gửi cho màn hình: lượt kèm lượt bấm và yêu cầu điều chỉnh (src/domain/attendance/index.ts), cộng thêm
// { status, statusNote } do SessionStatus (./session-status.js) tính, và superseded: true cho lượt bị lượt khác cùng ngày công thay
// khi tính giờ (xem supersededIds). Các route đọc lượt từ đây, không đọc thẳng attendance.js.
const config = require('../../platform/config');
const attendance = require('../attendance');
const { AdminPresence } = require('./admin-presence');
const { container } = require('../container');
const { estimateSheet } = require('../sheet');

const REVIEW_REASONS = ['needs-review', 'legacy-review'];
const epochMin = (iso?) => {
  const ms = typeof iso === 'string' ? Date.parse(iso) : NaN;
  return Number.isFinite(ms) ? Math.floor(ms / 60000) : NaN;
};
// Lượt dùng được để tính giờ, đúng điều kiện ActualHours (src/engine/actual-hours.ts → inspectDay): đã đóng, không chờ đối soát, giờ ra sau
// giờ vào (tính theo phút), có ca đã gán
function usable(session?) {
  const e = session.entry || {};
  const a = epochMin(e.presIn),
    b = epochMin(e.presOut);
  return (
    session.state !== 'open' &&
    !REVIEW_REASONS.includes(e.reason) &&
    Number.isFinite(a) &&
    Number.isFinite(b) &&
    b > a &&
    !!(e.plannedShift && e.plannedShift.startIso)
  );
}

// id các lượt bị thay trong ngày công của mỗi người, cùng luật ActualHours dùng để tính lương: ngày có lượt Admin khai thay dùng được
// mà cũng có lượt chấm thật dùng được thì lượt Admin bị thay (ngày tính theo giờ thật); không có lượt thật dùng được thì lượt Admin
// thay mọi lượt bấm đã đóng còn lại của ngày (quên Check-in/out, chờ đối soát, Check-out muộn chờ duyệt). Lượt đang mở giữ nguyên.
// Nhãn của ngày (src/engine/attendance-status.ts → dayStatus) bỏ qua lượt bị thay; nhãn riêng của từng lượt vẫn giữ.
function supersededIds(sessions?) {
  const days = new Map<any, any>();
  for (const s of sessions) {
    if (!s || !s.entry) continue;
    const key = `${s.username}|${AdminPresence.dayOf(s)}`;
    if (!days.has(key)) days.set(key, []);
    days.get(key).push(s);
  }
  const out = new Set<any>();
  for (const list of days.values()) {
    const admin = list.filter(s => AdminPresence.isOurs(s) && usable(s));
    if (!admin.length) continue;
    const realUsable = list.some(s => !AdminPresence.isOurs(s) && usable(s));
    for (const s of list)
      if (realUsable ? AdminPresence.isOurs(s) : !AdminPresence.isOurs(s) && s.state !== 'open') out.add(s.id);
  }
  return out;
}

const DECIDED = ['approved', 'rejected'];
// Giải trình đã quyết định của ngày công (Admin yêu cầu hoặc AI đề nghị, không có session_id) theo "người|ngày": một truy vấn cho các người
// và khoảng ngày của danh sách lượt
async function dayExplanationsOf(sessions?) {
  const withEntry = sessions.filter(s => s && s.entry);
  const users = [...new Set<any>(withEntry.map(s => s.username))];
  const days = withEntry.map(AdminPresence.dayOf).sort();
  const by = new Map<any, any>();
  if (!days.length) return by;
  for (const x of await container.explanationRepository.forDays(users, days[0], days[days.length - 1])) {
    if (!DECIDED.includes(x.status)) continue;
    const key = `${x.username}|${x.date}`;
    if (!by.has(key)) by.set(key, []);
    by.get(key).push(x);
  }
  return by;
}

// Giải trình có session_id nạp theo lô id, cộng giải trình đã quyết định của ngày công của lượt; ngày khai của lượt lấy từ Lịch ước tính
// (cùng nguồn POST /api/punch dùng để đo Check-out muộn), mỗi người mỗi tháng một lần.
async function withStatus(sessions?) {
  if (!sessions.length) return sessions;
  const dayExplanations = await dayExplanationsOf(sessions);
  const explanationsBy = new Map<any, any>();
  for (let i = 0; i < sessions.length; i += config.SQL_IN_CHUNK)
    for (const x of await container.explanationRepository.forSessions(
      sessions.slice(i, i + config.SQL_IN_CHUNK).map(s => s.id)
    )) {
      if (!explanationsBy.has(x.sessionId)) explanationsBy.set(x.sessionId, []);
      explanationsBy.get(x.sessionId).push(x);
    }
  const sheets = new Map<any, any>();
  const sheetDay = async (s?) => {
    const key = `${s.username}|${s.date.slice(0, 7)}`;
    if (!sheets.has(key)) sheets.set(key, (await estimateSheet(s.username, s.date.slice(0, 7))).days || {});
    return sheets.get(key)[s.date] || null;
  };
  const classifier = container.sessionStatus;
  const superseded = supersededIds(sessions);
  return await AsyncList.map(sessions, async s => ({
    ...s,
    explanations: (explanationsBy.get(s.id) || []).filter(x => x.username === s.username),
    ...(await classifier.classify(s, {
      explanations: [
        ...(explanationsBy.get(s.id) || []).filter(x => x.username === s.username),
        ...((s.entry && dayExplanations.get(`${s.username}|${AdminPresence.dayOf(s)}`)) || [])
      ],
      sheetDay: await sheetDay(s)
    })),
    ...(superseded.has(s.id) ? { superseded: true } : {})
  }));
}

const sessionHistory = async (session?) => session && (await withStatus([await attendance.sessionHistory(session)]))[0];
const sessionsWithHistory = async (sessions?) => await withStatus(await attendance.sessionsWithHistory(sessions));
const sessionsFor = async (filter?) => await withStatus(await attendance.sessionsFor(filter));

export = { withStatus, supersededIds, sessionHistory, sessionsWithHistory, sessionsFor };
