import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { KYSELY_DB, type DB } from '../../database';
import { AttendanceService } from '../attendance/attendance.service';
import type { Employee } from '../employees/domain';
import { EmployeesService } from '../employees/employees.service';
import { PayrollService } from '../payroll/payroll.service';
import { PeriodsService } from '../periods';
import { RequestsService } from '../requests/requests.service';
import type { SystemRequestDTO } from '../requests/domain';
import { SettingsReader, TypeWeekMissingError } from '../settings';
import { daySummaryOf, monthOf, vnToday, weekOf, type DayKind, type DaySummary } from '../me/domain';

const TOP_LINES = 5;
const HISTORY_LIMIT = 50;
const PENDING_LIMIT = 500;

const monthEnd = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

/** Còn làm trong khoảng [from, to]: chưa nghỉ việc trước `from`, chưa bắt đầu sau `to`. */
function activeIn(emp: Employee, from: string, to: string): boolean {
  const { effectiveFrom, resignedOn } = emp.contract;
  if (effectiveFrom && effectiveFrom > to) return false;
  if (resignedOn && resignedOn < from) return false;
  return true;
}

// Ngày (trong tuần) mà một đơn chờ duyệt nói tới; đơn không gắn ngày (ứng lương, iSAT) thì null.
function requestKind(r: SystemRequestDTO): string {
  return r.type.toLowerCase().replace(/_/g, '-');
}
function requestDateIn(r: SystemRequestDTO, from: string, to: string): string | null {
  let start: string | null = null;
  let end: string | null = null;
  switch (r.type) {
    case 'EXPLANATION': start = end = r.explanationDate; break;
    case 'OVERTIME': start = end = r.otDate; break;
    case 'LEAVE':
    case 'LEAVE_WITH_MAKEUP': start = r.leaveStartDate; end = r.leaveEndDate ?? r.leaveStartDate; break;
    case 'SHIFT_CHANGE': start = r.changeStartDate; end = r.changeEndDate ?? r.changeStartDate; break;
    default: return null;
  }
  if (!start || !end || end < from || start > to) return null;
  return start > from ? start : from;
}

@Injectable()
export class OverviewService {
  constructor(
    @Inject(AttendanceService) private readonly attendance: AttendanceService,
    @Inject(EmployeesService) private readonly employees: EmployeesService,
    @Inject(PayrollService) private readonly payroll: PayrollService,
    @Inject(PeriodsService) private readonly periods: PeriodsService,
    @Inject(RequestsService) private readonly requests: RequestsService,
    @Inject(SettingsReader) private readonly settings: SettingsReader,
    @Inject(KYSELY_DB) private readonly db: Kysely<DB>
  ) {}

  // Tuần làm từng người theo username ở các tháng của `dates`; người chưa có tuần thì để trống (dùng tuần mặc định).
  private async weekdaysByMonth(dates: string[]): Promise<Map<string, Record<string, number[]>>> {
    const months = [...new Set(dates.map(d => d.slice(0, 7)))];
    const out = new Map<string, Record<string, number[]>>();
    for (const m of months) out.set(m, await this.settings.workWeeksAt(m));
    return out;
  }

  /** Tuần Hai–CN chứa `from` (mặc định hôm nay): mỗi người một hàng bảy ô ngày + đơn chờ duyệt rơi vào tuần. */
  async week(from: string | undefined, q?: string, group?: string) {
    const today = vnToday();
    const days = weekOf(from ?? today);
    const needle = q?.trim().toLowerCase();
    const wantGroup = group?.trim().toLowerCase();

    const people = (await this.employees.list()).filter(emp => {
      if (!activeIn(emp, days[0], days[6])) return false;
      if (needle && !emp.username.toLowerCase().includes(needle) && !emp.fullName.toLowerCase().includes(needle)) return false;
      if (wantGroup) {
        const { position, shift } = emp.toDTO().contract;
        if (String(position.type).toLowerCase() !== wantGroup && String(shift.type).toLowerCase() !== wantGroup) return false;
      }
      return true;
    });

    const [sheets, weeks, pendingList] = await Promise.all([
      this.attendance.listTimesheets({ startDate: days[0], endDate: days[6] }),
      this.weekdaysByMonth(days),
      this.requests.listRequests({ status: 'PENDING', limit: PENDING_LIMIT })
    ]);
    const byPerson = new Map<string, Map<string, (typeof sheets)[number]>>();
    for (const s of sheets) {
      const m = byPerson.get(s.employeeId) ?? new Map();
      m.set(s.workDate, s);
      byPerson.set(s.employeeId, m);
    }

    const rows = people.map(emp => ({
      username: emp.username,
      name: emp.fullName,
      days: days.map(d => {
        const own = byPerson.get(emp.uuid)?.get(d);
        return daySummaryOf(own as any, d, today, weeks.get(d.slice(0, 7))?.[emp.username]);
      })
    }));

    // Đơn lưu theo uuid hoặc username: quy về username, chỉ giữ người đang hiện.
    const nameOf = new Map<string, string>();
    for (const emp of people) {
      nameOf.set(emp.username, emp.username);
      nameOf.set(emp.uuid, emp.username);
    }
    const pending: { username: string; date: string; kind: string }[] = [];
    for (const r of pendingList.items) {
      const username = nameOf.get(r.employeeId);
      const date = username ? requestDateIn(r, days[0], days[6]) : null;
      if (username && date) pending.push({ username, date, kind: requestKind(r) });
    }
    pending.sort((a, b) => a.date.localeCompare(b.date) || a.username.localeCompare(b.username));
    return { days, rows, pending };
  }

  /** Công cả tháng của một người từ dòng ngày dùng chung (như /me) + lịch sử thao tác trong nhật ký. Không có người → null. */
  async employeeMonth(username: string, month?: string) {
    const emp = await this.employees.findByUsernameOrUuid(username);
    if (!emp) return null;
    const today = vnToday();
    const m = month ?? today.slice(0, 7);

    let workWeek = null as Awaited<ReturnType<SettingsReader['workWeekOf']>> | null;
    try {
      workWeek = await this.settings.workWeekOf(emp.uuid, m);
    } catch (err) {
      if (!(err instanceof TypeWeekMissingError)) throw err;
    }
    const [rows, period, audit] = await Promise.all([
      this.attendance.listTimesheets({ employeeId: emp.uuid, startDate: `${m}-01`, endDate: monthEnd(m) }),
      this.periods.getPeriod(m),
      this.db
        .selectFrom('audit_log')
        .select(['at', 'actor', 'action', 'reason'])
        .where('subject', '=', emp.username)
        .where('month', '=', m)
        .orderBy('id', 'desc')
        .limit(HISTORY_LIMIT)
        .execute()
    ]);
    const view = monthOf(rows as any, m, today, period?.status ?? null, workWeek?.weekdays);
    const { position, shift } = emp.toDTO().contract;
    return {
      person: { username: emp.username, name: emp.fullName, position, shift },
      month: m,
      periodState: view.periodState,
      totals: workWeek ? { ...view.totals, standardDays: workWeek.standardWorkdays } : view.totals,
      days: view.days,
      history: audit.map(a => ({ at: a.at, actor: a.actor, text: a.reason ? `${a.action}: ${a.reason}` : a.action }))
    };
  }

  /** Số liệu gộp cho màn Tổng quan: người, công hôm nay, đơn chờ, lương và trạng thái kỳ của `month`. */
  async overview(month?: string) {
    const today = vnToday();
    const m = month ?? today.slice(0, 7);

    const people = (await this.employees.list()).filter(emp => activeIn(emp, today, today));
    const [sheets, weeks, pending, slips, period] = await Promise.all([
      this.attendance.listTimesheets({ startDate: today, endDate: today }),
      this.settings.workWeeksAt(today.slice(0, 7)),
      this.requests.listRequests({ status: 'PENDING', limit: 1 }),
      this.payroll.listPayslips(m),
      this.periods.snapshot(m)
    ]);

    const byPerson = new Map(sheets.map(s => [s.employeeId, s]));
    const counts: Record<DayKind, number> = {
      work: 0, late: 0, leave: 0, absent: 0, todo: 0, off: 0, future: 0, outside: 0, extra: 0
    };
    // `work` của dòng ngày hôm nay có thể là dòng đã lập sẵn nhưng chưa ai chấm: người đó chưa có mặt. Đếm riêng ở
    // notCheckedIn để "có mặt hôm nay" và biểu đồ Tổng quan khớp với màn Chấm công (người chưa chấm vào = chưa có mặt).
    let notCheckedIn = 0;
    let present = 0;
    for (const emp of people) {
      const day: DaySummary = daySummaryOf(byPerson.get(emp.uuid) as any, today, today, weeks[emp.username]);
      // Hôm nay chưa hết ngày: chưa có dòng, hoặc dòng chờ chấm, chưa chấm vào thì chưa thể là vắng.
      if ((day.kind === 'work' || day.kind === 'absent') && !day.in) {
        notCheckedIn += 1;
        continue;
      }
      counts[day.kind] += 1;
      if (day.in && (day.kind === 'work' || day.kind === 'late' || day.kind === 'todo' || day.kind === 'extra')) present += 1;
    }

    const nameOf = new Map(people.map(e => [e.username, e.fullName]));
    const lines = [...slips]
      .sort((a, b) => b.net - a.net)
      .slice(0, TOP_LINES)
      .map(s => ({ username: s.username, name: nameOf.get(s.username) ?? s.username, net: s.net, status: s.status }));

    return {
      kpis: {
        headcount: people.length,
        presentToday: present,
        pendingRequests: pending.total,
        payrollNet: slips.reduce((sum, s) => sum + s.net, 0)
      },
      attendance: { today: counts, notCheckedIn },
      payroll: { status: period.status, lines },
      period: { month: m, state: period.status }
    };
  }
}
