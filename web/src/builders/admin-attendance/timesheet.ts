// Đổi phản hồi thật (GET /team, /today, /sheet, /ot) về hình dạng các màn Chấm công của Admin đang đọc.
import {
  STATUS_LABEL,
  TYPE_LABEL,
  TYPE_SHORT,
  dayKeyOf,
  fold,
  hhmm,
  lateMinOf,
  paginate,
  shiftIndex,
  shiftLine
} from './common';

// Mã trạng thái của máy chủ → dấu ô trong Bảng công. Ô của ngày lấy dấu của lượt cần xử lý nhất.
const CELL = { pending: 'w', rejected: 'q', 'checked-in': 'in', 'checked-out': 'ok', approved: 'ok', admin: 'ok' };
const RANK = ['pending', 'rejected', 'checked-in', 'checked-out', 'approved', 'admin'];
const COUNTED = new Set<any>(['checked-in', 'checked-out', 'approved', 'admin']);
const DAY_KIND: Record<string, { text: string; label: string }> = {
  work: { text: 'LV', label: 'Khai ngày làm việc' },
  leave: { text: 'PN', label: 'Nghỉ phép năm' },
  unpaid: { text: 'KL', label: 'Nghỉ không lương' },
  approved: { text: 'NP', label: 'Nghỉ được duyệt' },
  isat: { text: 'iS', label: 'Ngày iSAT' },
  willmakeup: { text: 'Bù', label: 'Nghỉ, sẽ làm bù' },
  makeup: { text: 'Bù*', label: 'Làm bù (loại khai cũ)' }
};

function daysOf(sessions?) {
  const days = new Map<any, any>();
  for (const s of sessions || []) {
    const key = dayKeyOf(s);
    if (!days.has(key)) days.set(key, []);
    days.get(key).push(s);
  }
  return days;
}
const worst = (list?) => RANK.find(code => list.some(s => s.status === code));

export function buildTimesheet({ team, shifts, today, holidays }: any, { filter = 'all', q = '', page = 1 }: any = {}) {
  const idx = shiftIndex(shifts);
  const all = (team.rows || []).map(r => {
    const st = r.staff;
    const cells: Record<string, any> = {};
    let present = 0;
    let pending = 0;
    for (const [date, day] of Object.entries(r.days || {})) {
      // estimateDays giữ lại bản ghi legacy thiếu kind; cleanDays mặc định các record đó thành work.
      const storedKind = (day as any)?.kind;
      const kind = DAY_KIND[storedKind === undefined ? 'work' : storedKind];
      if (!kind) continue;
      cells[date] = { ...cells[date], declared: kind };
    }
    for (const [date, list] of daysOf(r.attendanceSessions)) {
      const code = worst(list);
      if (!code) continue;
      cells[date] = { ...cells[date], k: CELL[code] };
      if (code === 'pending') pending += 1;
      else if (COUNTED.has(code)) present += 1;
    }
    const line = shiftLine(idx, st.shiftCode);
    return {
      id: st.username,
      name: st.name,
      type: st.type,
      sub: st.shiftCode
        ? [TYPE_SHORT[st.type], line].filter(Boolean).join(' · ')
        : `${TYPE_SHORT[st.type]} · chưa gán ca`,
      noShift: !st.shiftCode,
      cells,
      present,
      pending
    };
  });
  all.sort((a: any, b: any) => a.name.localeCompare(b.name, 'vi'));
  const counts = { all: all.length, tts: 0, ctv: 0, nv: 0 };
  for (const r of all) if (counts[r.type] != null) counts[r.type] += 1;
  let list = all;
  if (filter === 'pending') list = list.filter(r => r.pending > 0 || r.noShift);
  else if (filter !== 'all') list = list.filter(r => r.type === filter);
  if (q) list = list.filter(r => fold(r.name).includes(fold(q)));
  const p = paginate(list, page);
  const rows = p.rows.map(({ type, ...row }: any) => row);
  return {
    month: team.month,
    empty: !all.some(r => Object.keys(r.cells).length),
    today,
    holidays: holidays || [],
    counts,
    rows,
    total: p.total,
    page: p.page,
    pages: p.pages
  };
}

export function buildToday({ today, shifts }: any, { filter = 'all', q = '', page = 1 }: any = {}) {
  const idx = shiftIndex(shifts);
  const all = (today.rows || []).map(r => ({
    id: r.username,
    name: r.name,
    sub: TYPE_SHORT[r.type] || '',
    shiftLabel: shiftLine(idx, r.shiftCode),
    checkIn: r.in,
    checkOut: r.out,
    lateMin: r.late || 0,
    status: r.status || 'none',
    count: r.sessionCount || 0
  }));
  all.sort((a: any, b: any) => a.name.localeCompare(b.name, 'vi'));
  const inShift = all.filter(r => r.status === 'checked-in').length;
  let list = all;
  if (filter === 'in') list = list.filter(r => r.status === 'checked-in');
  else if (filter === 'none') list = list.filter(r => r.status === 'none');
  else if (filter === 'late') list = list.filter(r => r.lateMin > 0);
  if (q) list = list.filter(r => fold(r.name).includes(fold(q)));
  const p = paginate(list, page);
  return {
    date: today.today,
    updatedAt: '',
    counts: { all: all.length, in: inShift },
    empty: !all.length,
    rows: p.rows,
    total: p.total,
    page: p.page,
    pages: p.pages
  };
}

/** Hộp chi tiết ngày: mọi lượt của ngày (kể cả OT và giờ bù) với giờ bấm gốc. */
export function buildDayDetail({ sheet, shifts }: any, personId?, date?) {
  const owner = sheet.owner || {};
  const idx = shiftIndex(shifts);
  const sessions = (sheet.attendanceSessions || []).filter(s => dayKeyOf(s) === date);
  const punches = sessions.map(s => {
    const ins = (s.punches || []).filter(p => p.type === 'in');
    const outs = (s.punches || []).filter(p => p.type === 'out');
    return {
      id: s.id,
      version: s.version,
      status: STATUS_LABEL[s.status] || s.status,
      closed: s.state !== 'open',
      checkIn: hhmm(ins.length ? ins[0].at : s.entry && s.entry.presIn),
      checkOut: hhmm(outs.length ? outs[outs.length - 1].at : s.entry && s.entry.presOut),
      lateMin: lateMinOf(s.statusNote),
      ot: s.entry && s.entry.kind === 'ot' ? 'Có' : '—',
      result: s.statusNote || STATUS_LABEL[s.status] || ''
    };
  });
  return {
    personId,
    name: owner.name || personId,
    date,
    role: TYPE_LABEL[owner.type] || '',
    shiftLabel: owner.shiftCode
      ? `ca ${shiftLine(idx, owner.shiftCode) || owner.shiftLabel || owner.shiftCode}`
      : 'chưa có ca',
    shiftOptions: [
      { value: '', label: 'Không chọn ca (giờ tự đối chiếu)' },
      ...[...new Set<any>([...idx.values()])].map(s => ({
        value: s.code,
        label: `${s.name} · ${s.in}–${s.out}`,
        in: s.in,
        out: s.out
      }))
    ],
    assignedShift: owner.shiftCode || '',
    punches,
    rev: sheet.rev,
    days: sheet.days || {}
  };
}

/** Thân PUT /sheet: Admin chấm công thay một người một ngày, giữ nguyên các ngày khác của tháng. */
export function buildSheetBody(detail, { date, checkIn, checkOut, shift, reason }: any) {
  const prev = (detail.days && detail.days[date]) || {};
  const trimmed = typeof reason === 'string' ? reason.trim() : '';
  const days = {
    ...(detail.days || {}),
    [date]: {
      ...prev,
      kind: 'work',
      in: checkIn,
      out: checkOut,
      ...(shift ? { preset: shift } : {}),
      ...(trimmed ? { note: trimmed } : {})
    }
  };
  return {
    month: date.slice(0, 7),
    user: detail.personId,
    days,
    confirmDays: [date],
    ...(trimmed ? { reason: trimmed } : {}),
    ...(Number.isInteger(detail.rev) ? { expectedRev: detail.rev } : {})
  };
}

const OT_PILL = { pending: ['p-pend', 'Chờ xử lý'], approved: ['p-done', 'Đã đồng ý'], rejected: ['p-err', 'Từ chối'] };

export function buildOvertime({ ot, month, status }: any) {
  const items = (ot.ot || []).filter(o => !month || String(o.date || '').startsWith(month));
  const pill = OT_PILL[status] || OT_PILL.pending;
  return {
    month,
    status,
    counts: { pending: status === 'pending' ? items.length : 0 },
    rows: items.map(o => ({
      id: String(o.sessionId || o.id || `${o.username}|${o.date}`),
      sessionId: o.sessionId || o.id,
      version: o.version ?? 1,
      canDecide: status === 'pending' && Boolean(o.sessionId || o.id),
      name: o.name || o.username,
      sub: o.username,
      cols: [o.date, o.shiftCode || '', o.declared || o.otHours || '', o.present || ''],
      pill: { cls: pill[0], label: pill[1] }
    }))
  };
}
