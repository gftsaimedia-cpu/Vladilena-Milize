'use strict';
// Bộ dựng sự kiện của kịch bản: mỗi sự kiện có giờ Việt Nam chính xác, người làm, thao tác, mã trường hợp; một hàng đợi chung sắp theo giờ.
// Ngày có trường hợp riêng (giờ bấm riêng, nghỉ, không bấm) được đánh dấu để hàng đợi không thêm lượt bấm mặc định.
const cal = require('./calendar');
const { byUser } = require('./cast');

const T = (date?, hhmm?) => `${date}T${hhmm.length === 5 ? hhmm + ':00' : hhmm}`;
const norm = (at?) => (at.length === 16 ? at + ':00' : at);

// Ca của một người vào ngày d: ca hồ sơ ban đầu, đổi theo các lần đổi hồ sơ (đổi trước 07:00 có hiệu lực ngay ngày đó, sau đó thì từ hôm sau)
function shiftOn(u?, d?) {
  const p = byUser[u];
  let shift = p.shift;
  for (const ch of p.changes || []) {
    if (!Object.hasOwn(ch.set, 'shift')) continue;
    const from = ch.at.slice(11, 16) <= '07:00' ? ch.at.slice(0, 10) : cal.addDays(ch.at.slice(0, 10), 1);
    if (d >= from) shift = ch.set.shift;
  }
  return shift;
}
// Loại nhân sự vào ngày d (đổi loại có hiệu lực từ ngày đổi)
function typeOn(u?, d?) {
  const p = byUser[u];
  let type = p.type;
  for (const ch of p.changes || []) if (ch.set.type && d >= ch.at.slice(0, 10)) type = ch.set.type;
  return type;
}
const resignedOn = (u?) => {
  const ch = (byUser[u].changes || []).find(c => c.set.resignedOn);
  return ch ? ch.set.resignedOn : null;
};
const createdAt = (u?) => byUser[u].createAt || '2026-01-01T00:10';

class Story {
  declare variant: any;
  declare events: any;
  declare cases: any;
  declare skips: any;
  declare seq: any;

  constructor({ variant }: any) {
    this.variant = variant;
    this.events = [];
    this.cases = {};
    this.skips = new Set(); // 'u|date': không thêm lượt bấm mặc định
    this.seq = 0;
  }
  // Thêm một sự kiện; meta: { caseId, ref, expect: { status, code }, tags }
  at(at?, op?, args: any = {}, meta: any = {}) {
    this.events.push({ at: norm(at), seq: this.seq++, op, args, ...meta });
  }
  skip(u?, date?) {
    this.skips.add(`${u}|${date}`);
  }
  // Một lượt có mặt riêng của ngày date: vào inT, ra outT (ra ≤ vào thì sang hôm sau). opts.explain: giải trình gửi kèm Check-out;
  // opts.tryWithout: bấm Check-out trước không kèm giải trình (để thấy 409) rồi mới gửi kèm; opts.noOut: không Check-out
  work(u?, date?, inT?, outT?, opts: any = {}) {
    this.skip(u, date);
    const meta = { caseId: opts.caseId, tags: opts.tags };
    this.at(
      T(opts.inDate || date, inT),
      'punch',
      { u, type: 'in', location: opts.location },
      { ...meta, ref: opts.refIn }
    );
    if (opts.noOut || !outT) return;
    const outDate = opts.outDate || (cal.toMin(outT) <= cal.toMin(inT) ? cal.addDays(date, 1) : date);
    this.at(
      T(outDate, outT),
      'punch',
      { u, type: 'out', explanation: opts.explain, tryWithout: !!opts.tryWithout },
      { ...meta, ref: opts.refOut }
    );
  }
  // Nhiều lượt trong một ngày: [[vào, ra], ...]
  sessions(u?, date?, pairs?, opts: any = {}) {
    this.skip(u, date);
    for (const [a, b] of pairs) {
      this.at(T(date, a), 'punch', { u, type: 'in' }, { caseId: opts.caseId });
      this.at(T(date, b), 'punch', { u, type: 'out' }, { caseId: opts.caseId });
    }
  }
  // Yêu cầu qua lịch tháng (PUT /api/sheet) của chính người đó; mỗi tháng một lần lưu. opts.decide: 'approve' | 'reject' | false
  req(u?, days?, opts: any = {}) {
    const dates = Object.keys(days).sort();
    const filed = norm(opts.filed || T(cal.workdaysBefore(dates[0], 3), '18:00'));
    const byMonth: Record<string, any> = {};
    for (const d of dates) (byMonth[d.slice(0, 7)] = byMonth[d.slice(0, 7)] || {})[d] = days[d];
    for (const d of dates) if (days[d] && days[d].kind !== 'work') this.skip(u, d);
    for (const [month, part] of Object.entries<any>(byMonth))
      this.at(
        filed,
        'sheet',
        { u, by: opts.by || u, month, days: part },
        { caseId: opts.caseId, ref: opts.ref, expect: opts.expect, tags: opts.tags }
      );
    if (opts.decide) {
      const at = norm(opts.decideAt || T(cal.nextWorkday(filed.slice(0, 10)), '09:00'));
      this.at(
        at,
        'decide',
        { u, dates, action: opts.decide, note: opts.note || (opts.decide === 'reject' ? 'Không phù hợp lịch' : '') },
        { caseId: opts.caseId, ref: opts.decideRef }
      );
    }
    return filed;
  }
  leave(u?, dates?, opts: any = {}) {
    return this.req(u, Object.fromEntries(dates.map(d => [d, { kind: opts.kind || 'leave' }])), {
      decide: 'approve',
      ...opts
    });
  }
  // Ngày đi làm có làm thêm (OT hoặc làm bù) trước ca (before) và/hoặc sau ca (after), theo ca của người vào ngày đó
  extraDay(u?, date?, kind?, { before, after }: any = {}) {
    const s = cal.SHIFTS[shiftOn(u, date)];
    return {
      kind: 'work',
      in: s.in,
      out: s.out,
      preset: shiftOn(u, date),
      extraKind: kind,
      ...(before ? { extraIn: before } : {}),
      ...(after ? { extraOut: after } : {})
    };
  }
  // Admin khai thay (PUT /api/sheet kèm user, confirmDays các ngày đi làm vừa khai)
  adminEntry(at?, u?, days?, opts: any = {}) {
    this.at(
      at,
      'sheet',
      {
        u,
        by: opts.by || 'admin1',
        month: Object.keys(days)[0].slice(0, 7),
        days,
        confirmDays: Object.keys(days).filter(d => days[d] && days[d].kind === 'work')
      },
      { caseId: opts.caseId, ref: opts.ref, tags: opts.tags }
    );
  }
  // Ảnh chụp số phép năm của hệ thống tại ngày date (GET /api/sheet → leaveBalance và GET /api/leave/ledger)
  probeLeave(u?, date?, key?, hhmm = '23:50') {
    this.at(T(date, hhmm), 'probe.leave', { u, key });
  }
  // Ảnh chụp trạng thái một ngày chấm công (lượt, báo cáo ngày, giải trình) tại thời điểm at
  probeDay(u?, date?, key?, at?) {
    this.at(at, 'probe.day', { u, date, key });
  }
  // Ảnh chụp phiếu của lần tính hiện hành tại thời điểm at
  probeSlip(u?, month?, key?, at?) {
    this.at(at, 'probe.slip', { u, month, key });
  }
  check(id?, def?) {
    if (this.cases[id]) throw new Error(`Trùng mã trường hợp ${id}`);
    this.cases[id] = { id, ...def };
  }
}

module.exports = { Story, T, norm, shiftOn, typeOn, resignedOn, createdAt };
