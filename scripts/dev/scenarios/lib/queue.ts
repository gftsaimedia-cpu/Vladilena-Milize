'use strict';
// Phần nền của hàng đợi: tạo tài khoản, lịch lễ, đổi hồ sơ, lượt bấm mặc định mỗi ngày làm, Admin khai thay tháng 10,
// phép và KPI của nhân sự nền, lượt Check-in sáng 01/03/2027.
const cal = require('./calendar');
const { ADMINS, PAYROLL, BACKGROUND, byUser } = require('./cast');
const { T, shiftOn, typeOn, resignedOn, createdAt } = require('./builder');

// Bộ sinh số giả ngẫu nhiên có hạt giống (mulberry32): cùng hạt giống → cùng giờ bấm mỗi lần dựng
function prng(seed?) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const END = '2027-02-28';
// Người được Admin khai thay cả tháng 10 (tập dượt trước ngày chạy thật): nhân sự nền và P32
const OCTOBER_ADMIN = new Set<any>([...BACKGROUND.map(b => b.u), 'nv2_phat']);

function accounts(S?) {
  S.at('2026-01-01T00:00', 'data.bootstrap', { u: 'admin1' }, { tags: ['DATA'] });
  for (const a of ADMINS.filter(a => a.u !== 'admin1'))
    S.at('2026-01-01T00:01', 'staff.create', { u: a.u }, { ref: `create-${a.u}` });
  S.at('2026-01-01T00:02', 'roles', { u: 'cb1', roles: ['cb'] }, { ref: 'roles-cb1' });
  S.at('2026-01-01T00:05', 'holidays.put', {}, { ref: 'G01', caseId: 'G01' });
  for (const p of PAYROLL) {
    S.at(createdAt(p.u), 'staff.create', { u: p.u }, { ref: `create-${p.u}` });
    for (const ch of p.changes || [])
      S.at(ch.at, 'staff.change', { u: p.u, set: ch.set }, { caseId: ch.caseId, ref: ch.caseId });
  }
}

function defaultPunches(S, { early }: any) {
  const rnd = prng(20261029);
  const from = early ? '2026-01-01' : '2026-10-01';
  for (const p of PAYROLL) {
    const start = p.start > from ? p.start : from;
    const resign = resignedOn(p.u);
    const last = resign && resign < END ? resign : END;
    for (const d of cal.daysBetween(start, last)) {
      const type = typeOn(p.u, d);
      if (!cal.isWorkday(type, d) || S.skips.has(`${p.u}|${d}`)) continue;
      if (OCTOBER_ADMIN.has(p.u) && d.startsWith('2026-10')) continue;
      const code = shiftOn(p.u, d);
      if (!code) continue;
      const s = cal.SHIFTS[code];
      const inOff = p.background ? -2 - Math.floor(rnd() * 9) : -5;
      const late = p.background ? Math.floor(rnd() * 16) : 3;
      const inT = cal.addMinutes(s.in, inOff);
      const outT = cal.addMinutes(s.out, late);
      // Vào trước 0 giờ (ca bắt đầu 00:xx) thì lượt vào thuộc hôm trước; ra ≤ giờ vào ca thì ra sang hôm sau
      const outDate = cal.toMin(s.out) <= cal.toMin(s.in) ? cal.addDays(d, 1) : d;
      S.at(T(d, inT), 'punch', { u: p.u, type: 'in' }, { auto: true });
      S.at(T(outDate, outT), 'punch', { u: p.u, type: 'out' }, { auto: true });
    }
  }
  // Sáng 01/03/2027: người có ca bắt đầu trước 09:30 đã Check-in (đang mở lúc 09:30)
  for (const p of PAYROLL) {
    const resign = resignedOn(p.u);
    if (resign && resign < '2027-03-01') continue;
    const code = shiftOn(p.u, '2027-03-01');
    if (!code || !cal.isWorkday(typeOn(p.u, '2027-03-01'), '2027-03-01')) continue;
    const s = cal.SHIFTS[code];
    if (cal.toMin(s.in) >= cal.toMin('09:30') || cal.toMin(s.out) <= cal.toMin(s.in)) continue;
    const inOff = p.background ? -2 - Math.floor(rnd() * 9) : -5;
    S.at(T('2027-03-01', cal.addMinutes(s.in, inOff)), 'punch', { u: p.u, type: 'in' }, { auto: true });
  }
}

// Tháng 10/2026: Admin khai thay tuần đã qua vào sáng Chủ nhật (L6 Đã chấm công (Admin))
function octoberAdmin(S?) {
  const sundays = ['2026-10-04', '2026-10-11', '2026-10-18', '2026-10-25', '2026-11-01'];
  for (const u of OCTOBER_ADMIN) {
    const p = byUser[u];
    for (const sun of sundays) {
      const days: Record<string, any> = {};
      for (let i = 6; i >= 1; i--) {
        const d = cal.addDays(sun, -i);
        if (!d.startsWith('2026-10') || d < p.start || !cal.isWorkday(typeOn(u, d), d)) continue;
        if ((p.bgLeave || []).includes(d)) continue;
        const code = shiftOn(u, d);
        if (!code) continue;
        days[d] = { kind: 'work', in: cal.SHIFTS[code].in, out: cal.SHIFTS[code].out, preset: code };
      }
      if (Object.keys(days).length)
        S.adminEntry(T(sun, '10:00'), u, days, { caseId: u === 'nv2_phat' ? 'P32-01' : undefined });
    }
  }
}

// Nhân sự nền: hai ngày phép được duyệt mỗi người (NV, CTV), KPI 85 điểm mỗi tháng
function backgroundRoutine(S?) {
  for (const b of BACKGROUND) {
    for (const d of b.bgLeave || []) {
      // B03: phép 02/01/2027 xin từ 10/12 để G03 (thêm ngày lễ trùng phép) có dữ liệu
      const filed = b.u === 'bg_nv2_c' && d === '2027-01-02' ? '2026-12-10T18:00' : undefined;
      S.leave(b.u, [d], { filed, caseId: b.u === 'bg_nv2_c' && d === '2027-01-02' ? 'G03' : undefined });
    }
    if (b.type === 'tts') continue;
    for (const m of cal.monthsBetween('2026-01', '2027-02')) {
      if (`${m}-28` < b.start) continue;
      S.at(T(`${m}-${m === '2027-02' ? '26' : '28'}`, '10:30'), 'kpi', {
        u: b.u,
        month: m,
        scores: { wework: 85, user: 85, peer: 85, manager: 85, self: 85 }
      });
    }
  }
}

module.exports = { accounts, defaultPunches, octoberAdmin, backgroundRoutine, OCTOBER_ADMIN };
