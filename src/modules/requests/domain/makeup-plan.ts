import type { FilingChoices } from './filing-choices';
import type { HourOption } from './filing-rules';

/** Một dòng khung làm bù đang điền ở form (giờ tròn 'HH:00'; ô chưa chọn là ''). */
export interface MakeupSlotInput {
  date: string;
  startTime: string;
  endTime: string;
}

/** Một dòng sau khi BE chỉnh lại, kèm các giờ chọn được của chính dòng đó. */
export interface MakeupSlotPlan extends MakeupSlotInput {
  /** Giờ bắt đầu chọn được ('HH:00'), đã bỏ giờ dòng khác cùng ngày chiếm và phần quá số giờ còn thiếu. */
  startOptions: string[];
  /** Giờ kết thúc chọn được khi `startTime` đã chọn hợp lệ. */
  endOptions: string[];
}

export interface MakeupPlan {
  /** Phút phải bù cho khoảng nghỉ (0 khi khoảng nghỉ không hợp lệ). */
  requiredMinutes: number;
  /** Phút đã xếp (dòng chưa điền đủ tính 0). */
  plannedMinutes: number;
  /** Còn thiếu giờ bù thì còn thêm được dòng. */
  canAdd: boolean;
  /** Ngày bù chọn được (sau ngày nghỉ cuối, cùng tháng, còn giờ trống). */
  slotDates: string[];
  slots: MakeupSlotPlan[];
}

type PlanDay = { date: string; hours: HourOption[] };
type PlanContext = { days: readonly PlanDay[]; choices: Pick<FilingChoices, 'leave-with-makeup'> };

const hourOf = (hhmm: string): number => Number(hhmm.slice(0, 2));
const hourText = (h: number): string => `${String(h).padStart(2, '0')}:00`;
const minutesIn = (hours: readonly HourOption[], start: number, end: number): number =>
  hours.find(h => h.start === start)?.ends.find(e => e.end === end)?.minutes ?? 0;

type Window = { start: number; end: number };
const overlaps = (start: number, end: number, w: Window): boolean => start < w.end && end > w.start;

function requiredOf(ctx: PlanContext, startDate: string, endDate: string): number {
  return ctx.choices['leave-with-makeup'].ends[startDate]?.find(e => e.date === endDate)?.makeupMinutesRequired ?? 0;
}

function plannedOf(ctx: PlanContext, slots: readonly MakeupSlotInput[]): number {
  return slots.reduce((sum, s) => {
    if (!s.date || !s.startTime || !s.endTime) return sum;
    const day = ctx.days.find(d => d.date === s.date);
    return sum + (day ? minutesIn(day.hours, hourOf(s.startTime), hourOf(s.endTime)) : 0);
  }, 0);
}

/**
 * Bảng giờ của dòng thứ `index` (spec 4.4, form chỉ đưa lựa chọn hợp lệ): bảng `hours` của ngày bù, bỏ giờ mà dòng khác cùng
 * ngày đã chiếm, và không quá số phút còn thiếu sau các dòng khác. Các dòng khác cùng ngày cũng trừ vào phần còn lại của trần
 * 12 giờ một ngày: khung dài nhất trong `hours` là phần đó, nên phút của chúng trừ vào khung dài nhất.
 */
function hoursOfSlot(ctx: PlanContext, required: number, slots: readonly MakeupSlotInput[], index: number): HourOption[] {
  const slot = slots[index];
  const day = slot?.date ? ctx.days.find(d => d.date === slot.date) : undefined;
  if (!day) return [];
  const others = slots.filter((_, j) => j !== index);
  const taken: Window[] = others
    .filter(o => o.date === slot.date && o.startTime && o.endTime)
    .map(o => ({ start: hourOf(o.startTime), end: hourOf(o.endTime) }));
  let cap = Math.max(0, required - plannedOf(ctx, others));
  if (taken.length) {
    const longest = Math.max(0, ...day.hours.flatMap(h => h.ends.map(e => e.minutes)));
    cap = Math.min(cap, longest - taken.reduce((sum, w) => sum + minutesIn(day.hours, w.start, w.end), 0));
  }
  return day.hours
    .filter(h => !taken.some(w => h.start >= w.start && h.start < w.end))
    .map(h => ({ start: h.start, ends: h.ends.filter(e => e.minutes <= cap && !taken.some(w => overlaps(h.start, e.end, w))) }))
    .filter(h => h.ends.length > 0);
}

/**
 * Bỏ giá trị không còn hợp lệ của các dòng sau khi đổi ngày nghỉ hay đổi một dòng: ngày bù không còn chọn được thì bỏ cả dòng,
 * giờ bắt đầu không còn thì bỏ hai ô giờ, giờ kết thúc không còn thì bỏ ô đó. Xét lần lượt từ dòng đầu, mỗi dòng so với các
 * dòng trước nó, nên dòng sau mất giá trị trước.
 */
function fitSlots(ctx: PlanContext, required: number, slotDates: readonly string[], slots: readonly MakeupSlotInput[]): MakeupSlotInput[] {
  const out: MakeupSlotInput[] = [];
  for (const s of slots) {
    const date = slotDates.includes(s.date) ? s.date : '';
    const hours = hoursOfSlot(ctx, required, [...out, { date, startTime: '', endTime: '' }], out.length);
    const startOk = !!s.startTime && hours.some(h => h.start === hourOf(s.startTime));
    const endOk =
      startOk && !!s.endTime && (hours.find(h => h.start === hourOf(s.startTime))?.ends ?? []).some(e => e.end === hourOf(s.endTime));
    out.push({ date, startTime: startOk ? s.startTime : '', endTime: endOk ? s.endTime : '' });
  }
  return out;
}

/** Kế hoạch bù của form Nghỉ có làm bù: BE tính số phút, chỉnh các dòng và đưa giờ chọn được; form chỉ hiện. */
export function planMakeup(ctx: PlanContext, startDate: string, endDate: string, slots: readonly MakeupSlotInput[]): MakeupPlan {
  const required = requiredOf(ctx, startDate, endDate);
  const slotDates = ctx.choices['leave-with-makeup'].slotDates[endDate] ?? [];
  const fitted = fitSlots(ctx, required, slotDates, slots);
  const planned = plannedOf(ctx, fitted);
  return {
    requiredMinutes: required,
    plannedMinutes: planned,
    canAdd: required > 0 && planned < required,
    slotDates: [...slotDates],
    slots: fitted.map((s, i) => {
      const hours = hoursOfSlot(ctx, required, fitted, i);
      const chosen = s.startTime ? hours.find(h => h.start === hourOf(s.startTime)) : undefined;
      return { ...s, startOptions: hours.map(h => hourText(h.start)), endOptions: (chosen?.ends ?? []).map(e => hourText(e.end)) };
    })
  };
}
