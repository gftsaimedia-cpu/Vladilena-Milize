import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { KYSELY_DB, type DB } from '../../database';
import { AttendanceService } from '../attendance/attendance.service';
import type { Employee } from '../employees/domain';
import { EmployeesService } from '../employees/employees.service';
import { PayrollService } from '../payroll/payroll.service';
import { PeriodsService } from '../periods';
import { ExplanationsService } from '../requests/explanations.service';
import { RequestsService } from '../requests/requests.service';
import type { SystemRequestDTO } from '../requests/domain';
import { SettingsReader, TypeWeekMissingError } from '../settings';
import { monthOf, vnToday } from '../me/domain';
import {
  GROUP_LABELS,
  GROUP_OF_TYPE,
  PERIOD_LABELS,
  STATUS_TEXT,
  WHAT_OF_TYPE,
  addDays,
  ageText,
  caseText,
  cellOf,
  dm,
  dowShort,
  foldText,
  initialsOf,
  isPresent,
  mondayOf,
  monthEnd,
  shiftText,
  slipStateOf,
  weekdayName,
  type Cell,
  type CellKind,
  type InboxGroup,
  type SlipState,
  type WorkItem
} from './domain';

const TOP_LINES = 5;
const PAYROLL_ROWS = 6;
const APPROVAL_ITEMS = 8;
const HISTORY_LIMIT = 50;
const PENDING_LIMIT = 500;
const OT_LIMIT = 5000;
const DEFAULT_RECENT_DAYS = 6;
export const MAX_WINDOW_DAYS = 35;
export const MAX_RECENT_DAYS = 14;

/** Còn làm trong khoảng [from, to]: chưa nghỉ việc trước `from`, chưa bắt đầu sau `to`. */
function activeIn(emp: Employee, from: string, to: string): boolean {
  const { effectiveFrom, resignedOn } = emp.contract;
  if (effectiveFrom && effectiveFrom > to) return false;
  if (resignedOn && resignedOn < from) return false;
  return true;
}

const byName = (a: Employee, b: Employee) => a.fullName.localeCompare(b.fullName, 'vi');
const prevMonthOf = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};
const round1 = (n: number) => Math.round(n * 10) / 10;
const hhmmVn = (d: Date) => new Date(d.getTime() + 7 * 3600000).toISOString().slice(11, 16);

type Sheet = Awaited<ReturnType<AttendanceService['listTimesheets']>>[number];
type Weeks = Map<string, Record<string, number[]>>;

function personOf(emp: Employee) {
  const { position, shift, leave, status, effectiveFrom } = emp.toDTO().contract;
  return {
    username: emp.username,
    name: emp.fullName,
    initials: initialsOf(emp.fullName),
    /** BE chưa có phòng ban: nhóm = mã chức vụ (position.type). */
    group: String(position.type).toLowerCase(),
    title: position.jobTitle ?? null,
    code: emp.username,
    startDate: effectiveFrom,
    contract: STATUS_TEXT[status] ?? null,
    position,
    shift,
    shiftText: shiftText(shift),
    leaveLeftDays: leave?.remainingDays ?? 0
  };
}

@Injectable()
export class OverviewService {
  constructor(
    @Inject(AttendanceService) private readonly attendance: AttendanceService,
    @Inject(EmployeesService) private readonly employees: EmployeesService,
    @Inject(PayrollService) private readonly payroll: PayrollService,
    @Inject(PeriodsService) private readonly periods: PeriodsService,
    @Inject(RequestsService) private readonly requests: RequestsService,
    @Inject(ExplanationsService) private readonly explanations: ExplanationsService,
    @Inject(SettingsReader) private readonly settings: SettingsReader,
    @Inject(KYSELY_DB) private readonly db: Kysely<DB>
  ) {}

  // Tuần làm từng người theo username ở các tháng của `dates`; người chưa có tuần thì để trống (dùng tuần mặc định).
  private async weekdaysByMonth(dates: string[]): Promise<Weeks> {
    const out: Weeks = new Map();
    for (const m of new Set(dates.map(d => d.slice(0, 7)))) out.set(m, await this.settings.workWeeksAt(m));
    return out;
  }

  /** Việc cần xử lý của mọi người: đơn chờ duyệt rồi ngày cần giải trình, mới nhất trước. */
  private async workItems(people: Employee[], nowMs: number): Promise<WorkItem[]> {
    const who = new Map<string, Employee>();
    for (const e of people) {
      who.set(e.username, e);
      who.set(e.uuid, e);
    }
    const [pending, due] = await Promise.all([
      this.requests.listRequests({ status: 'PENDING', limit: PENDING_LIMIT }),
      this.explanations.listDue().catch(() => [])
    ]);
    const items: WorkItem[] = [];
    for (const r of pending.items) {
      const emp = who.get(r.employeeId);
      if (!emp) continue;
      items.push(requestItem(r, emp, nowMs));
    }
    for (const d of due) {
      const emp = who.get(d.employeeId);
      if (!emp) continue;
      const what = caseText(d.cases);
      items.push({
        id: `due:${d.employeeId}:${d.date}`,
        kind: 'explanation-due',
        group: 'att',
        groupLabel: GROUP_LABELS.att,
        action: 'remind',
        username: emp.username,
        name: emp.fullName,
        initials: initialsOf(emp.fullName),
        title: emp.toDTO().contract.position.jobTitle ?? null,
        what,
        when: dm(d.date),
        days: [d.date],
        age: ageText(`${d.date}T00:00:00+07:00`, nowMs)
      });
    }
    return items;
  }

  /** Giờ OT đã duyệt trong `month` theo username. */
  private async approvedOt(people: Employee[], month: string): Promise<Map<string, number>> {
    const who = new Map<string, string>();
    for (const e of people) {
      who.set(e.username, e.username);
      who.set(e.uuid, e.username);
    }
    const { items } = await this.requests.listRequests({ status: 'APPROVED', type: 'OVERTIME', limit: OT_LIMIT });
    const out = new Map<string, number>();
    for (const r of items) {
      const u = who.get(r.employeeId);
      if (u && r.otDate?.startsWith(month)) out.set(u, (out.get(u) ?? 0) + (r.otHours ?? 0));
    }
    return out;
  }

  /**
   * Lưới chấm công: `days` ngày liên tiếp (mặc định 7, tối đa 35) bắt đầu từ thứ Hai của tuần chứa `from`. Không có `from`:
   * 7 ngày thì tuần hôm nay; nhiều hơn 7 ngày thì tuần cách hôm nay 14 ngày (hôm nay ở tuần thứ ba của lưới 4 tuần).
   * `month` (mặc định tháng hôm nay) chọn tháng của các cột Công / Trễ / OT và thẻ số.
   */
  async week(opts: { from?: string; days?: number; q?: string; group?: string; month?: string } = {}) {
    const now = this.nowDate();
    const today = vnToday(now);
    const count = opts.days ?? 7;
    const start = mondayOf(opts.from ?? (count > 7 ? addDays(today, -14) : today));
    const days = Array.from({ length: count }, (_, i) => addDays(start, i));
    const last = days[count - 1];
    const month = opts.month ?? today.slice(0, 7);
    const mFrom = `${month}-01`;
    const mTo = monthEnd(month);
    const needle = opts.q ? foldText(opts.q) : '';
    const wantGroup = opts.group?.trim().toLowerCase();

    const everyone = (await this.employees.list()).filter(e => activeIn(e, start, last)).sort(byName);
    const [sheets, weeks, items, ot, lockedPeriod] = await Promise.all([
      this.attendance.listTimesheets({ startDate: mFrom < start ? mFrom : start, endDate: mTo > last ? mTo : last }),
      this.weekdaysByMonth([...days, mFrom]),
      this.workItems(everyone, now.getTime()),
      this.approvedOt(everyone, month),
      this.periods.getPeriod(month)
    ]);
    const bySheet = new Map<string, Sheet>();
    for (const s of sheets) bySheet.set(`${s.employeeId}|${s.workDate}`, s);

    // Đơn phủ lên ô: mỗi (người, ngày) nhớ việc đầu tiên.
    const overlay = new Map<string, WorkItem>();
    for (const it of items) for (const d of it.days) if (!overlay.has(`${it.username}|${d}`)) overlay.set(`${it.username}|${d}`, it);

    const all = everyone.map(emp => {
      const person = personOf(emp);
      const cells: Cell[] = days.map(d => {
        const it = overlay.get(`${emp.username}|${d}`);
        return cellOf(bySheet.get(`${emp.uuid}|${d}`), d, today, weeks.get(d.slice(0, 7))?.[emp.username], person.shiftText, it ? { id: it.id, what: it.what } : null);
      });
      const mine = sheets.filter(s => s.employeeId === emp.uuid && s.workDate >= mFrom && s.workDate <= mTo);
      return {
        person,
        cells,
        totals: {
          workDays: mine.filter(s => s.countsAsWorkday).length,
          lateMinutes: mine.reduce((n, s) => n + (s.metrics?.lateMinutes || 0), 0),
          otHours: round1(ot.get(emp.username) ?? 0)
        },
        needsAction: cells.filter(c => c.kind === 'todo').length,
        absentDays: mine.filter(s => s.status === 'ABSENT').length
      };
    });

    const rows = all
      .filter(r => {
        if (needle && !foldText(r.person.username).includes(needle) && !foldText(r.person.name).includes(needle)) return false;
        if (wantGroup && r.person.group !== wantGroup && String(r.person.shift.type).toLowerCase() !== wantGroup) return false;
        return true;
      })
      .map(({ person, cells, totals, needsAction }) => ({ ...person, days: cells, totals, needsAction }));
    const shown = new Set(rows.map(r => r.username));

    const pending = items
      .filter(it => shown.has(it.username))
      .map(it => ({ it, date: it.days.find(d => d >= start && d <= last) }))
      .filter((p): p is { it: WorkItem; date: string } => !!p.date)
      .map(({ it, date }) => ({ ...it, date }))
      .sort((a, b) => a.date.localeCompare(b.date) || a.username.localeCompare(b.username));

    const todayAt = days.indexOf(today);
    const todayCells = todayAt < 0 ? [] : all.map(r => r.cells[todayAt]);
    const lateToday = todayCells.filter(c => c.base === 'late');
    const forgot = pending.filter(p => p.action === 'remind').length;
    const countGroup = (g: InboxGroup) => items.filter(i => i.group === g).length;
    const present = todayCells.filter(isPresent).length;
    // Cùng nghĩa với `kpis.notCheckedIn` của Tổng quan: chỉ người đang phải đi làm hôm nay mà chưa có giờ vào (ngày nghỉ, nghỉ phép, ngoài hợp đồng không tính).
    const notCheckedIn = todayCells.filter(c => c.base === 'nocheck').length;
    const avgLate = lateToday.length ? Math.round(lateToday.reduce((n, c) => n + c.lateMinutes, 0) / lateToday.length) : 0;
    const otTotal = round1([...ot.values()].reduce((n, h) => n + h, 0));
    const tiles = [
      { key: 'todo', label: 'Cần xử lý', value: pending.length, note: `${forgot} chưa giải trình · ${pending.length - forgot} yêu cầu chờ duyệt` },
      { key: 'present', label: 'Có mặt hôm nay', value: present, of: all.length, note: `${notCheckedIn} người chưa Check-in` },
      { key: 'late', label: 'Đi muộn hôm nay', value: lateToday.length, note: avgLate ? `trung bình ${avgLate} phút` : '' },
      { key: 'leave', label: 'Nghỉ có phép', value: todayCells.filter(c => c.base === 'leave').length, note: `${countGroup('leave')} đơn chờ duyệt` },
      { key: 'absent', label: 'Vắng không phép', value: all.reduce((n, r) => n + r.absentDays, 0), note: `trong tháng ${Number(month.slice(5, 7))}` },
      { key: 'ot', label: 'Làm thêm tháng này', value: otTotal, unit: 'giờ', note: `${countGroup('ot')} yêu cầu chờ duyệt` }
    ];

    const groupCount = new Map<string, number>();
    for (const r of all) groupCount.set(r.person.group, (groupCount.get(r.person.group) ?? 0) + 1);
    const [y, m] = month.split('-');
    return {
      today,
      month,
      periodState: lockedPeriod && lockedPeriod.status !== 'open' ? 'locked' : 'open',
      subtitle: `Kỳ công 01–${mTo.slice(8, 10)}/${m}/${y} · hôm nay ${weekdayName(today)} ${dm(today)}`,
      tiles,
      days: days.map(iso => ({
        iso,
        dow: dowShort(iso),
        dm: dm(iso),
        scheduled: new Date(`${iso}T00:00:00Z`).getUTCDay() !== 0,
        today: iso === today,
        monday: dowShort(iso) === 'T2',
        periodStart: iso.endsWith('-01')
      })),
      groups: [...groupCount].map(([key, n]) => ({ key, count: n })).sort((a, b) => a.key.localeCompare(b.key)),
      rows,
      pending,
      total: all.length,
      matched: rows.length
    };
  }

  /** Hồ sơ công cả tháng của một người từ ô ngày dùng chung + lịch sử thao tác. Không có người → null. */
  async employeeMonth(username: string, month?: string) {
    const emp = await this.employees.findByUsernameOrUuid(username);
    if (!emp) return null;
    const now = this.nowDate();
    const today = vnToday(now);
    const m = month ?? today.slice(0, 7);
    const mFrom = `${m}-01`;
    const mTo = monthEnd(m);

    let workWeek = null as Awaited<ReturnType<SettingsReader['workWeekOf']>> | null;
    try {
      workWeek = await this.settings.workWeekOf(emp.uuid, m);
    } catch (err) {
      if (!(err instanceof TypeWeekMissingError)) throw err;
    }
    const everyone = (await this.employees.list()).filter(e => activeIn(e, mFrom, mTo)).sort(byName);
    const [rows, period, audit, items, ot] = await Promise.all([
      this.attendance.listTimesheets({ employeeId: emp.uuid, startDate: mFrom, endDate: mTo }),
      this.periods.getPeriod(m),
      this.db
        .selectFrom('audit_log')
        .select(['at', 'actor', 'action', 'reason'])
        .where('subject', '=', emp.username)
        .where('month', '=', m)
        .orderBy('id', 'desc')
        .limit(HISTORY_LIMIT)
        .execute(),
      this.workItems([emp], now.getTime()),
      this.approvedOt([emp], m)
    ]);
    const person = personOf(emp);
    const view = monthOf(rows as any, m, today, period?.status ?? null, workWeek?.weekdays);
    const overlay = new Map<string, WorkItem>();
    for (const it of items) for (const d of it.days) if (!overlay.has(d)) overlay.set(d, it);
    const bySheet = new Map(rows.map(r => [r.workDate, r]));
    const cells: Cell[] = view.days.map(d => {
      const it = overlay.get(d.date);
      return cellOf(bySheet.get(d.date) as any, d.date, today, workWeek?.weekdays, person.shiftText, it ? { id: it.id, what: it.what } : null);
    });
    const chips: Record<'work' | 'late' | 'leave' | 'absent' | 'todo', number> = { work: 0, late: 0, leave: 0, absent: 0, todo: 0 };
    for (const c of cells) if (c.kind in chips) chips[c.kind as keyof typeof chips] += 1;

    const lateMinutes = rows.reduce((n, r) => n + (r.metrics?.lateMinutes || 0), 0);
    const otHours = round1(ot.get(emp.username) ?? 0);
    const totals = {
      ...view.totals,
      standardDays: workWeek ? workWeek.standardWorkdays : view.totals.standardDays,
      lateMinutes,
      otHours,
      absentDays: chips.absent
    };
    const at = everyone.findIndex(e => e.username === emp.username);
    // Việc có ngày rơi vào tháng đang xem, ngày đầu tiên trong tháng của từng việc.
    const dated = items
      .map(i => ({ ...i, first: i.days.find(d => d >= mFrom && d <= mTo) }))
      .filter((i): i is WorkItem & { first: string } => !!i.first)
      .sort((a, b) => a.first.localeCompare(b.first));
    const mn = Number(m.slice(5, 7));
    const dayHistory = [...cells]
      .filter(c => c.date <= today && c.kind !== 'off')
      .reverse()
      .map(c => ({
        date: c.date,
        dayLabel: `${weekdayName(c.date)} ${dm(c.date)}`,
        kind: c.kind,
        tone: (c.kind === 'nocheck' || c.kind === 'fu' ? 'nocheck' : c.kind) as CellKind,
        text: c.text,
        status: c.label,
        shift: person.shiftText,
        in: c.in,
        out: c.out,
        itemId: c.itemId
      }));
    return {
      person: { ...person, joinedMonth: person.startDate ? person.startDate.slice(0, 7) : null },
      month: m,
      periodState: view.periodState,
      locked: view.periodState === 'locked',
      index: at >= 0 ? at + 1 : null,
      total: everyone.length,
      prev: at > 0 ? everyone[at - 1].username : null,
      next: at >= 0 && at < everyone.length - 1 ? everyone[at + 1].username : null,
      pending: dated.length
        ? { count: dated.length, date: dated[0].first, itemId: dated[0].id, group: dated[0].group, text: `${dated[0].what} · ${dated[0].when}` }
        : null,
      stats: [
        { key: 'workDays', label: 'Ngày đi làm', value: totals.workDays, note: `trong tháng ${mn}` },
        { key: 'late', label: 'Lần đi muộn', value: totals.lateCount, note: `${lateMinutes} phút` },
        { key: 'ot', label: 'Làm thêm', value: otHours, unit: 'giờ', note: '' },
        { key: 'leave', label: 'Phép năm còn', value: person.leaveLeftDays, unit: 'ngày', note: '' }
      ],
      totals,
      chips,
      days: cells,
      dayHistory,
      history: audit.map(a => ({ at: a.at, actor: a.actor, text: a.reason ? `${a.action}: ${a.reason}` : a.action }))
    };
  }

  /** Số liệu gộp cho màn Tổng quan: người, công các ngày làm gần nhất, đơn chờ, lương và tiến độ kỳ của `month`. */
  async overview(opts: { month?: string; days?: number } = {}) {
    const now = this.nowDate();
    const today = vnToday(now);
    const m = opts.month ?? today.slice(0, 7);
    const count = opts.days ?? DEFAULT_RECENT_DAYS;

    // `count` ngày làm gần nhất tới hôm nay (bỏ Chủ nhật), cũ trước.
    const recent: string[] = [];
    for (let d = today; recent.length < count; d = addDays(d, -1)) if (new Date(`${d}T00:00:00Z`).getUTCDay() !== 0) recent.unshift(d);

    const everyone = (await this.employees.list()).filter(e => activeIn(e, recent[0], today));
    const people = everyone.filter(e => activeIn(e, today, today));
    const [sheets, weeks, slips, prevSlips, period, payday, items] = await Promise.all([
      this.attendance.listTimesheets({ startDate: recent[0], endDate: today }),
      this.weekdaysByMonth(recent),
      this.payroll.listPayslips(m),
      this.payroll.listPayslips(prevMonthOf(m)),
      this.periods.snapshot(m),
      this.periods.paydayFor(m),
      this.workItems(people, now.getTime())
    ]);
    const bySheet = new Map(sheets.map(s => [`${s.employeeId}|${s.workDate}`, s]));
    const cellsOn = (date: string, list: Employee[]) =>
      list.map(e => cellOf(bySheet.get(`${e.uuid}|${date}`) as any, date, today, weeks.get(date.slice(0, 7))?.[e.username], ''));

    // Hôm nay: đếm theo loại ô; người ô `work` / `absent` mà chưa có giờ vào là `nocheck` (không phải vắng).
    const counts: Record<string, number> = { work: 0, late: 0, leave: 0, absent: 0, todo: 0, off: 0, future: 0, outside: 0, extra: 0 };
    const todayCells = cellsOn(today, people);
    let notCheckedIn = 0;
    for (const c of todayCells) {
      if (c.base === 'nocheck') notCheckedIn += 1;
      else counts[c.base === 'fu' ? 'future' : c.base] += 1;
    }
    const present = todayCells.filter(isPresent).length;
    const rate = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0);

    const nameOf = new Map(everyone.map(e => [e.username, e]));
    const slipRows = [...slips].map(s => {
      const d = s.details as any;
      const name = d?.fullName || nameOf.get(s.username)?.fullName || s.username;
      return {
        username: s.username,
        name,
        initials: initialsOf(name),
        title: d?.positionLevelText ?? null,
        actualDays: d?.actualWorkDays ?? 0,
        standardDays: d?.standardWorkdays ?? 0,
        base: d?.baseSalaryPolicy ?? 0,
        allowance: d?.totalAllowanceActual ?? 0,
        net: s.net,
        status: slipStateOf(s.status)
      };
    });
    const lines = [...slips]
      .sort((a, b) => b.net - a.net)
      .slice(0, TOP_LINES)
      .map(s => ({ username: s.username, name: nameOf.get(s.username)?.fullName ?? s.username, net: s.net, status: s.status }));
    const sum = (k: 'gross' | 'insurance' | 'tax' | 'advance' | 'net', list = slips) => list.reduce((n, s) => n + (Number(s[k]) || 0), 0);
    const slipCount: Record<SlipState, number> = { done: 0, pending: 0, draft: 0, rejected: 0 };
    for (const s of slips) slipCount[slipStateOf(s.status)] += 1;
    const gross = sum('gross');
    const net = sum('net');
    const deductions = sum('insurance') + sum('tax') + sum('advance');
    const prevGross = sum('gross', prevSlips);

    const decide = items.filter(i => i.action === 'decide');
    const remind = items.filter(i => i.action === 'remind');
    const groupCounts = new Map<InboxGroup, number>();
    for (const i of items) groupCounts.set(i.group, (groupCounts.get(i.group) ?? 0) + 1);
    const to = monthEnd(m);
    const daysLeft = Math.max(0, Math.round((Date.parse(to) - Date.parse(today)) / 86400000));

    return {
      today,
      month: m,
      kpis: {
        headcount: people.length,
        presentToday: present,
        notCheckedIn,
        pendingRequests: decide.length,
        payrollNet: net,
        payrollGross: gross
      },
      headline: { blocking: items.length, closeOn: to, daysLeft },
      attendance: {
        today: counts,
        notCheckedIn,
        present,
        total: people.length,
        todayRate: rate(present, people.length),
        days: recent.map(date => {
          const active = everyone.filter(e => activeIn(e, date, date));
          const p = cellsOn(date, active).filter(isPresent).length;
          return {
            date,
            dow: date === today ? 'Hôm nay' : dowShort(date),
            dm: dm(date),
            today: date === today,
            present: p,
            total: active.length,
            rate: rate(p, active.length)
          };
        })
      },
      payroll: {
        status: period.status,
        lines,
        rows: slipRows.sort((a, b) => a.name.localeCompare(b.name, 'vi')).slice(0, PAYROLL_ROWS),
        total: slips.length,
        updatedAt: hhmmVn(now),
        gross,
        insurance: sum('insurance'),
        tax: sum('tax'),
        advance: sum('advance'),
        deductions,
        net,
        netShare: gross ? Math.round((net / gross) * 100) : 0,
        counts: { all: slips.length, ...slipCount },
        previous: prevSlips.length
          ? { month: prevMonthOf(m), gross: prevGross, net: sum('net', prevSlips), grossDeltaPct: prevGross ? round1(((gross - prevGross) / prevGross) * 100) : null }
          : null
      },
      period: {
        month: m,
        state: period.status,
        label: PERIOD_LABELS[period.status] ?? period.status,
        from: `${m}-01`,
        to,
        closeOn: to,
        payday,
        daysLeft
      },
      approvals: {
        total: items.length,
        decide: decide.length,
        remind: remind.length,
        groups: [...groupCounts].map(([key, n]) => ({ key, label: GROUP_LABELS[key], count: n })),
        items: items.slice(0, APPROVAL_ITEMS)
      }
    };
  }

  private nowDate(): Date {
    return new Date();
  }
}

function requestItem(r: SystemRequestDTO, emp: Employee, nowMs: number): WorkItem {
  const dates = r.dates ?? [];
  return {
    id: r.id,
    kind: r.type.toLowerCase().replace(/_/g, '-'),
    group: GROUP_OF_TYPE[r.type] ?? 'leave',
    groupLabel: GROUP_LABELS[GROUP_OF_TYPE[r.type] ?? 'leave'],
    action: 'decide',
    username: emp.username,
    name: emp.fullName,
    initials: initialsOf(emp.fullName),
    title: emp.toDTO().contract.position.jobTitle ?? null,
    what: WHAT_OF_TYPE[r.type] ?? r.type,
    when: dates.length ? (dates.length > 1 ? `${dm(dates[0])}–${dm(dates[dates.length - 1])}` : dm(dates[0])) : '',
    days: dates,
    age: ageText(r.createdAt, nowMs)
  };
}
