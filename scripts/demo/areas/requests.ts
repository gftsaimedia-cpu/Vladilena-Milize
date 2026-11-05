// Seed của mảng 'requests' (spec docs/superpowers/specs/2026-11-05-demo-db-e2e-design.md mục 6). Chỉ phiên requests sửa file này.
// Lúc hàm chạy, mọi người trong scripts/demo/people/requests.ts đã có tài khoản và hợp đồng (POST /api/v2/employees).
// Gọi API như admin qua ctx.admin, hoặc như nhân viên qua `await ctx.api.as(username)`. Ngày lấy từ ctx.months
// (hôm nay, m0, m1, m2 theo giờ Việt Nam), không viết cứng. Chỉ ghi SQL thẳng khi không có route nào làm được,
// và ghi rõ chỗ đó trong docs/demo-db/requests.md.
//
// Bảng tình huống (người → đơn → trạng thái) nằm ở docs/demo-db/requests.md. Cách chọn ngày:
// - Đơn Admin nộp thay để làm lịch sử: tháng trước (m1), như Admin nhập bù.
// - Đơn nhân viên tự nộp (/me): tháng sau, vì luật đã chốt 05/11 chỉ cho chọn từ hôm nay tới hết tháng sau
//   (giải trình thì ngày đã qua của tháng trước hoặc tháng này). Như vậy seed vẫn chạy khi nhánh staff-requests vào main.
// - iSAT: các Thứ Bảy sắp tới (luật 05/11: chỉ Thứ Bảy sau hôm nay).
// - Ngày làm việc: thứ Hai–thứ Bảy, bỏ Chủ nhật và ngày lễ đã có trong lịch công ty (mảng attendance có thể đã thêm).
//   Đơn theo khoảng chọn thứ Hai–thứ Tư của một tuần để khoảng không chứa Thứ Bảy (iSAT) hay Chủ nhật.
import { addMonths, daysInMonth, dateIn, weekday } from '../dates';
import type { DemoSession } from '../api';
import type { SeedContext } from '../seed';

const DAY_MS = 86_400_000;
const shift = (date: string, n: number): string => new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

/** Ngày lễ đã có trong lịch công ty của các năm chứa `months`. */
async function holidaysOf(admin: DemoSession, months: string[]): Promise<Set<string>> {
  const years = [...new Set(months.map(m => m.slice(0, 4)))];
  const out = new Set<string>();
  for (const year of years) {
    const { items = [] } = await admin.get(`/holidays?year=${year}`);
    for (const h of items) out.add(String(h.date).slice(0, 10));
  }
  return out;
}

/** Bộ chọn ngày: ngày làm việc của nhân viên loại nv (thứ Hai–thứ Bảy), không phải ngày lễ. */
export class DayPicker {
  constructor(private readonly holidays: ReadonlySet<string>) {}

  isWorkday(date: string): boolean {
    return weekday(date) !== 0 && !this.holidays.has(date);
  }

  /** Thứ Hai thứ `week` (1 = thứ Hai đầu tiên) của tháng `ym`. */
  monday(ym: string, week: number): string {
    let date = dateIn(ym, 1);
    while (weekday(date) !== 1) date = shift(date, 1);
    return shift(date, 7 * (week - 1));
  }

  /** `count` ngày làm việc liền nhau, bắt đầu từ thứ Hai thứ `week` cộng `offset` ngày, trong tháng `ym`. */
  days(ym: string, week: number, count: number, offset = 0): string[] {
    const out: string[] = [];
    let date = shift(this.monday(ym, week), offset);
    while (out.length < count) {
      if (!date.startsWith(ym)) throw new Error(`Tháng ${ym} không đủ ngày làm việc từ tuần ${week}`);
      if (this.isWorkday(date)) out.push(date);
      date = shift(date, 1);
    }
    return out;
  }

  day(ym: string, week: number, offset = 0): string {
    return this.days(ym, week, 1, offset)[0];
  }

  /** `n` Thứ Bảy sau hôm nay, bỏ Thứ Bảy là ngày lễ. */
  saturdays(today: string, n: number): string[] {
    const out: string[] = [];
    let date = shift(today, 1);
    while (out.length < n) {
      if (weekday(date) === 6 && !this.holidays.has(date)) out.push(date);
      date = shift(date, 1);
    }
    return out;
  }
}

const ALL_CONDITIONS = { NO_VIOLATION: true, REPORTS_DONE: true, WORK_COMPLETED: true, OFFICIAL_EMPLOYEE: true };

type Req = { id: string; status: string };

export async function seed(ctx: SeedContext): Promise<void> {
  const { admin, months, log } = ctx;
  const next = addMonths(months.m0, 1);
  const pick = new DayPicker(await holidaysOf(admin, [months.m1, months.m0, next]));
  const sats = pick.saturdays(months.today, 4);

  // ---- lời gọi ----
  const asAdmin = async (kind: string, employeeId: string, body: Record<string, unknown>): Promise<Req> =>
    (await admin.post(`/requests/${kind}`, { employeeId, ...body })).request;
  const selves = new Map<string, DemoSession>();
  const self = async (username: string): Promise<DemoSession> => {
    if (!selves.has(username)) selves.set(username, await ctx.api.as(username));
    return selves.get(username)!;
  };
  const bySelf = async (username: string, kind: string, body: Record<string, unknown>): Promise<Req> =>
    (await (await self(username)).post(`/me/requests/${kind}`, body)).request;
  const approve = (r: Req, note?: string) => admin.patch(`/requests/${r.id}/review`, { action: 'APPROVE', ...(note ? { note } : {}) });
  const reject = (r: Req, note: string) => admin.patch(`/requests/${r.id}/review`, { action: 'REJECT', note });
  const cancelSelf = async (username: string, r: Req) => (await self(username)).patch(`/me/requests/${r.id}/cancel`, {});

  const leave = (leaveType: string, dates: string[], reason: string) => ({
    title: 'Đơn nghỉ',
    reason,
    leaveType,
    startDate: dates[0],
    endDate: dates[dates.length - 1]
  });
  const ot = (date: string, startTime: string, endTime: string, reason: string) => ({ title: 'Làm thêm giờ', reason, otDate: date, startTime, endTime });
  const shiftChange = (dates: string[], shiftType: string, startTime: string, reason: string) => ({
    title: 'Đổi ca',
    reason,
    startDate: dates[0],
    endDate: dates[dates.length - 1],
    shiftType,
    startTime
  });
  const forgot = (date: string, reason: string) => ({
    title: 'Giải trình',
    reason,
    workDate: date,
    cases: ['MISSING_CHECK_IN', 'MISSING_CHECK_OUT'],
    actualCheckIn: '08:00',
    actualCheckOut: '17:00'
  });
  const late = (date: string, reason: string) => ({ title: 'Giải trình', reason, workDate: date, cases: ['LATE_CHECK_IN'] });
  // Mỗi ngày nghỉ cần đúng 8 giờ bù: hai khung 18:00–22:00 (4 giờ mỗi khung) trên hai ngày sau ngày nghỉ, cùng tháng.
  const withMakeup = (leaveDay: string, makeupDays: [string, string], reason: string) => ({
    title: 'Nghỉ có làm bù',
    reason,
    startDate: leaveDay,
    endDate: leaveDay,
    slots: makeupDays.map(date => ({ date, startTime: '18:00', endTime: '22:00' }))
  });
  const isat = (saturday: string, conditions: Record<string, boolean> = ALL_CONDITIONS) => ({ saturday, team: 'Kinh doanh', conditions });
  const advance = (period: string, amount: number, reason: string) => ({ title: 'Tạm ứng lương', reason, period, amount });

  // ---- dt-an: đơn nghỉ ----
  const an = 'dt-an';
  await approve(await asAdmin('leave', an, leave('PERSONAL_PAID', pick.days(months.m1, 1, 2), 'Đám cưới em gái')), 'Chúc mừng gia đình');
  await reject(await asAdmin('leave', an, leave('UNPAID', [pick.day(months.m1, 2, 2)], 'Việc riêng')), 'Tuần này đang chốt dự án, em đổi sang tuần sau nhé');
  await cancelSelf(an, await bySelf(an, 'leave', leave('PERSONAL_UNPAID', [pick.day(next, 1, 1)], 'Về quê')));
  await bySelf(an, 'leave', leave('ANNUAL', [pick.day(next, 2, 1)], 'Đi khám sức khoẻ định kỳ'));

  // ---- dt-binh: làm thêm giờ ----
  const binh = 'dt-binh';
  await approve(await asAdmin('overtime', binh, ot(pick.day(months.m1, 1, 1), '18:00', '20:00', 'Kiểm kê kho cuối tháng')));
  await reject(await asAdmin('overtime', binh, ot(pick.day(months.m1, 2, 1), '18:00', '20:00', 'Hoàn thiện báo cáo')), 'Báo cáo này để sáng mai làm');
  await cancelSelf(binh, await bySelf(binh, 'overtime', ot(pick.day(next, 1, 1), '18:00', '20:00', 'Hỗ trợ sự kiện')));
  await bySelf(binh, 'overtime', ot(pick.day(next, 2, 1), '18:00', '21:00', 'Chạy chương trình khuyến mãi'));

  // ---- dt-chi: đổi ca ----
  const chi = 'dt-chi';
  await approve(await asAdmin('shift-change', chi, shiftChange(pick.days(months.m1, 1, 2), 'FLEX', '06:00', 'Đưa con đi học buổi chiều')));
  await reject(await asAdmin('shift-change', chi, shiftChange([pick.day(months.m1, 2, 2)], 'NORMAL', '10:00', 'Đi làm giấy tờ buổi sáng')), 'Hôm đó thiếu người ca sáng');
  await cancelSelf(chi, await bySelf(chi, 'shift-change', shiftChange([pick.day(next, 1, 1)], 'NORMAL', '10:00', 'Khám răng buổi sáng')));
  await bySelf(chi, 'shift-change', shiftChange(pick.days(next, 2, 2), 'FLEX', '13:00', 'Học thêm buổi sáng'));

  // ---- dt-dung: giải trình (ngày đã qua) ----
  const dung = 'dt-dung';
  await approve(await asAdmin('explanation', dung, late(pick.day(months.m1, 1, 0), 'Xe hỏng giữa đường')));
  await reject(await asAdmin('explanation', dung, late(pick.day(months.m1, 1, 1), 'Ngủ quên')), 'Lý do không hợp lệ');
  await cancelSelf(dung, await bySelf(dung, 'explanation', forgot(pick.day(months.m1, 2, 0), 'Quên chấm công')));
  await bySelf(dung, 'explanation', forgot(pick.day(months.m1, 2, 1), 'Máy chấm công hỏng'));

  // ---- dt-giang: tạm ứng (Admin nộp thay; luật 16–17 chỉ áp cho nhân viên tự nộp) ----
  const giang = 'dt-giang';
  await approve(await asAdmin('advance', giang, advance(months.m2, 2_000_000, 'Tạm ứng giữa tháng')));
  await reject(await asAdmin('advance', giang, advance(months.m1, 1_500_000, 'Tạm ứng giữa tháng')), 'Tháng này đã ứng ngoài');
  await cancelSelf(giang, await asAdmin('advance', giang, advance(months.m0, 1_000_000, 'Tạm ứng giữa tháng')));
  await asAdmin('advance', giang, advance(months.m0, 1_800_000, 'Tạm ứng giữa tháng'));

  // ---- dt-hoa: nghỉ có làm bù ----
  const hoa = 'dt-hoa';
  await approve(await asAdmin('leave-with-makeup', hoa, withMakeup(pick.day(months.m1, 1, 0), [pick.day(months.m1, 1, 2), pick.day(months.m1, 1, 3)], 'Đưa mẹ đi khám')));
  await reject(await asAdmin('leave-with-makeup', hoa, withMakeup(pick.day(months.m1, 2, 0), [pick.day(months.m1, 2, 2), pick.day(months.m1, 2, 3)], 'Việc gia đình')), 'Tuần này không xếp được người thay');
  await cancelSelf(hoa, await bySelf(hoa, 'leave-with-makeup', withMakeup(pick.day(next, 1, 0), [pick.day(next, 1, 2), pick.day(next, 1, 3)], 'Làm giấy tờ nhà')));
  await bySelf(hoa, 'leave-with-makeup', withMakeup(pick.day(next, 2, 0), [pick.day(next, 2, 2), pick.day(next, 2, 3)], 'Họp phụ huynh'));

  // ---- dt-khoa: iSAT (các Thứ Bảy sắp tới) ----
  const khoa = 'dt-khoa';
  await bySelf(khoa, 'isat', isat(sats[0]));
  await approve(await asAdmin('isat', khoa, isat(sats[1])));
  await cancelSelf(khoa, await bySelf(khoa, 'isat', isat(sats[2])));
  await bySelf(khoa, 'isat', isat(sats[2], { ...ALL_CONDITIONS, REPORTS_DONE: false })); // máy tự từ chối (3/4)
  await reject(await asAdmin('isat', khoa, isat(sats[3])), 'Thứ Bảy này có kiểm kê');

  // ---- dt-lam: trùng ngày, ngày lễ ----
  const lam = 'dt-lam';
  await asAdmin('leave', lam, leave('PERSONAL_PAID', pick.days(next, 3, 3), 'Đi du lịch cùng gia đình')); // thứ Hai–thứ Tư tuần 3
  await asAdmin('leave', lam, leave('PERSONAL_PAID', [pick.day(next, 4, 2)], 'Việc riêng')); // một ngày, tuần 4
  await asAdmin('leave-with-makeup', lam, withMakeup(pick.day(next, 2, 0), [pick.day(next, 2, 2), pick.day(next, 2, 3)], 'Đi đám giỗ'));
  await bySelf(lam, 'isat', isat(sats[0]));
  await approve(await asAdmin('isat', lam, isat(sats[1])));

  // ---- dt-mai: đơn chờ duyệt của tháng trước (test chốt công tháng đó) ----
  const mai = 'dt-mai';
  await asAdmin('leave', mai, leave('PERSONAL_PAID', [pick.day(months.m1, 3, 0)], 'Đi khám bệnh'));
  await asAdmin('explanation', mai, late(pick.day(months.m1, 3, 1), 'Tắc đường'));

  // ---- dt-nam: đơn rồi nghỉ việc ----
  const nam = 'dt-nam';
  await approve(await asAdmin('leave', nam, leave('PERSONAL_PAID', [pick.day(months.m1, 1, 3)], 'Việc gia đình')));
  await bySelf(nam, 'leave', leave('PERSONAL_PAID', [pick.day(next, 3, 0)], 'Về quê'));
  await admin.del(`/employees/${nam}`);

  // ---- dt-quan: đơn chờ duyệt cho test giao diện Admin ----
  const quan = 'dt-quan';
  await asAdmin('leave', quan, leave('PERSONAL_PAID', [pick.day(next, 1, 0)], 'Đi đám cưới bạn'));
  await asAdmin('overtime', quan, ot(pick.day(next, 1, 2), '18:00', '20:00', 'Trực hệ thống'));
  await asAdmin('explanation', quan, late(pick.day(months.m1, 4, 0), 'Mưa ngập đường'));
  await asAdmin('shift-change', quan, shiftChange([pick.day(next, 2, 4)], 'FLEX', '06:00', 'Chiều đi học'));

  log(`đã tạo đơn cho ${ctx.people.length} người; Thứ Bảy iSAT: ${sats.join(', ')}; tháng sau: ${next} (${daysInMonth(next)} ngày)`);
}
