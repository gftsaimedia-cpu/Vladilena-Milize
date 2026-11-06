// Hồ sơ chấm công giả của một nhân viên trong tháng 10/2026, trả cùng dạng DTO với GET /api/v2/attendance/employees/:username.
// Dựng mỗi lần gọi từ ô chấm công (mock/attendance.ts) và các việc còn chờ (mock/inbox.ts); xử lý một việc chỉ đưa ô
// về ghi nhận gốc, không đổi công, trễ, OT hay lương (spec mục 1.3 và 5).
import type { Cell, DayCellDTO, DayHistoryDTO, EmployeeMonthDTO, GroupKey } from '../builders/api/attendance';
import { dm, weekdayName } from '@/utils/format';
import { ROSTER, STANDARD_DAYS, cellDto, cellOf, personDto } from './attendance';
import { MOCK_MONTH, MOCK_TODAY } from './clock';
import { pendingInbox } from './inbox';

const SHIFT = 'HC 08:00–17:00';

/** Hồ sơ chấm công của một người trong một tháng; null khi không có người hoặc tháng không có dữ liệu giả. */
export function employeeDto(personId: string, month: string): EmployeeMonthDTO | null {
  const at = ROSTER.findIndex(p => p.id === personId);
  if (at < 0) return null;
  const person = ROSTER[at];
  const last = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
  // Chỉ những ngày có dữ liệu giả (01/10 – 08/11/2026); tháng ngoài khoảng đó không có ngày nào.
  const cells = Array.from({ length: last }, (_, k) => cellOf(person.id, `${month}-${String(k + 1).padStart(2, '0')}`)).filter(
    (c): c is Cell => c !== null
  );
  const items = new Map(pendingInbox().map(item => [item.id, item]));
  const days: DayCellDTO[] = cells.map(cellDto);

  const chips: Record<GroupKey, number> = { work: 0, late: 0, leave: 0, absent: 0, todo: 0 };
  for (const cell of cells) if (cell.kind in chips) chips[cell.kind as GroupKey]++;

  const todo = cells.filter(cell => cell.kind === 'todo');
  const headItem = todo[0]?.itemId ? items.get(todo[0].itemId) : null;
  const dayHistory: DayHistoryDTO[] = cells
    .filter(cell => cell.date <= MOCK_TODAY && cell.base !== 'off')
    .reverse()
    .map(cell => ({
      date: cell.date,
      dayLabel: `${weekdayName(cell.date)} ${dm(cell.date)}`,
      kind: cell.kind,
      tone: cell.kind === 'fu' ? 'nocheck' : cell.kind,
      text: cell.text,
      status: cell.label,
      shift: SHIFT,
      in: cell.in,
      out: cell.out,
      itemId: cell.itemId
    }));

  return {
    person: personDto(person),
    month,
    periodState: 'open',
    locked: false,
    index: at + 1,
    total: ROSTER.length,
    prev: ROSTER[at - 1]?.id ?? null,
    next: ROSTER[at + 1]?.id ?? null,
    pending:
      todo[0] && headItem
        ? { count: todo.length, date: todo[0].date, itemId: headItem.id, group: headItem.group, text: `${headItem.what} · ${dm(todo[0].date)}` }
        : null,
    stats: [
      { key: 'workDays', label: 'Ngày đi làm', value: person.period.worked, note: 'trong tháng 10' },
      { key: 'late', label: 'Lần đi muộn', value: person.lateCount, note: `${person.sums.late} phút` },
      { key: 'ot', label: 'Làm thêm', value: person.sums.ot, unit: 'giờ', note: '' },
      { key: 'leave', label: 'Phép năm còn', value: Number(person.leaveLeft.split(' ')[0]), unit: 'ngày', note: '' }
    ],
    totals: {
      workDays: person.period.worked,
      standardDays: STANDARD_DAYS,
      lateCount: person.lateCount,
      paidLeaveDays: person.period.leave,
      lateMinutes: person.sums.late,
      otHours: person.sums.ot,
      absentDays: person.period.unpaid
    },
    chips,
    days,
    dayHistory,
    history: [{ at: '2026-10-27T01:00:00.000Z', actor: 'admin', text: 'attendance.recalculate: sửa giờ' }]
  };
}
