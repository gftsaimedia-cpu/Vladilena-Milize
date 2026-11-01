'use strict';
// Đọc trạng thái một ngày chấm công qua API (GET /api/sheet của Admin + GET /api/explanations) và quy ra một trong sáu nhãn:
//   L1 Đã Check-in        lượt đang mở
//   L4 Được phê duyệt     giải trình của ngày đã duyệt
//   L5 Bị từ chối         giải trình của ngày bị từ chối
//   L3 Chờ xử lý          giải trình đang chờ, hoặc ngày ở trạng thái quên Check-in/out, chờ đối soát, ngoài ca
//   L6 Đã chấm công (Admin)  ngày được trả theo lượt Admin khai thay (không có lượt thật dùng được)
//   L2 Đã Check-out       lượt thật đã đóng, ngày ở trạng thái ok
// Ngày không có lượt nào: không nhãn (null).
const ADMIN_ORIGIN = 'sheet.onBehalf';
const PENDING_STATES = [
  'forgot-in',
  'forgot-out',
  'review',
  'off-shift',
  'off-schedule',
  'pending',
  'multiple-sessions',
  'undeclared-punch'
];
const LABEL_TEXT = {
  L1: 'Đã Check-in',
  L2: 'Đã Check-out',
  L3: 'Chờ xử lý (giải trình)',
  L4: 'Được phê duyệt',
  L5: 'Bị từ chối',
  L6: 'Đã chấm công (Admin)'
};

function deriveLabel({ sessions, report, explanations }: any) {
  if (!sessions.length) return null;
  if (sessions.some(s => s.state === 'open')) return 'L1';
  const ex = explanations.slice().sort((a: any, b: any) => b.id - a.id)[0];
  if (ex && ex.status === 'approved') return 'L4';
  if (ex && ex.status === 'rejected') return 'L5';
  // Lượt thật dùng được: có cả giờ vào và giờ ra, không chờ đối soát, không phải lượt Admin khai thay
  const real = sessions.filter(
    s => s.origin !== ADMIN_ORIGIN && s.presIn && s.presOut && !['needs-review', 'legacy-review'].includes(s.reason)
  );
  const admin = sessions.some(s => s.origin === ADMIN_ORIGIN);
  const state = report && report.state;
  if (!real.length) return admin ? 'L6' : 'L3';
  if (ex || (state && PENDING_STATES.includes(state))) return 'L3';
  if (!state || state === 'ok' || state === 'declared-wins') return 'L2';
  return `?${state}`;
}

async function dayView(client?, u?, date?) {
  const month = date.slice(0, 7);
  const sheet = await client.request('admin1', 'GET', `/api/sheet?month=${month}&user=${encodeURIComponent(u)}`);
  const body = sheet.body || {};
  const sessions = (body.attendanceSessions || [])
    .filter(s => s.date === date)
    .map(s => {
      const e = s.entry || {};
      return {
        id: s.id,
        state: s.state,
        reason: e.reason || null,
        kind: e.kind || null,
        origin: e.origin || null,
        presIn: e.presIn || null,
        presOut: e.presOut || null,
        requestedOut: e.requestedOut || null,
        outsideShift: !!e.outsideShift,
        outsideZone: !!e.outsideZone
      };
    });
  const rep = body.actualReport && body.actualReport.report && body.actualReport.report[date];
  const report = rep
    ? { state: rep.state, note: rep.note || null, lateMin: rep.lateMin, earlyMin: rep.earlyMin, cutMin: rep.cutMin }
    : null;
  const ex = await client.request('admin1', 'GET', `/api/explanations?user=${encodeURIComponent(u)}`);
  const explanations = ((ex.body && ex.body.items) || [])
    .filter(e => e.date === date)
    .map(e => ({ id: e.id, kind: e.kind, status: e.status }));
  const view = { sessions, report, explanations };
  return { ...view, label: deriveLabel(view) };
}

module.exports = { dayView, deriveLabel, LABEL_TEXT, ADMIN_ORIGIN };
