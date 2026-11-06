import type { RequestStatus, RequestType } from './types';
import { formatDayMonth } from './working-days';

/** Trạng thái ngày do một đơn chiếm. */
export type ClaimStatus = 'LEAVE' | 'LEAVE_WITH_MAKEUP' | 'SHIFT_CHANGE' | 'ISAT' | 'HALF_SHIFT';

/** Trạng thái của đơn còn giữ ngày: đơn đã từ chối hoặc huỷ không giữ ngày nào. */
export type ActiveStatus = 'PENDING' | 'APPROVED';

/** Một dòng của bảng `day_status`; `date` dạng YYYY-MM-DD. */
export interface DayStatusRow {
  employeeId: string;
  date: string;
  status: ClaimStatus;
  requestId: string;
  /** Đơn đổi ca bị đơn này thay đúng ngày này; chỉ có khi `status` không phải `SHIFT_CHANGE`. */
  baseRequestId: string | null;
}

/** Dòng `day_status` kèm trạng thái hiện tại của đơn giữ ngày và của đơn gốc. */
export interface DayClaim extends DayStatusRow {
  requestStatus: ActiveStatus;
  baseRequestStatus: RequestStatus | null;
}

/** Loại đơn đang nộp mà `planClaims` xét; khung bù của đơn nghỉ có làm bù là `MAKEUP_SLOT`. */
export type NewRequestKind =
  | 'LEAVE'
  | 'LEAVE_WITH_MAKEUP'
  | 'SHIFT_CHANGE'
  | 'ISAT'
  | 'HALF_SHIFT_LEAVE'
  | 'OVERTIME'
  | 'MAKEUP_SLOT'
  | 'EXPLANATION';

/** Khung OT hoặc khung bù đang giữ một ngày, kèm đơn sinh ra khung. */
export interface WindowSource {
  kind: 'OT' | 'MAKEUP';
  requestId: string;
  requestStatus: ActiveStatus;
}

/** Phần của lịch nhân sự mà `planClaims` cần đọc. */
export interface DayView {
  claimOn(date: string): DayClaim | null;
  windowSourcesOn(date: string): WindowSource[];
  isHoliday(date: string): boolean;
}

export interface ClaimPlan {
  /** Các ngày đơn chiếm, theo thứ tự ngày, không trùng; `replaces` là dòng đổi ca bị thay đúng ngày đó. */
  take: Array<{ date: string; replaces: DayClaim | null }>;
  /** Các ngày bị bỏ khỏi đơn, theo thứ tự ngày. */
  skipped: string[];
  warnings: string[];
}

export interface DayConflictInfo {
  date: string;
  requestId: string | null;
  requestType: RequestType | null;
  requestStatus: RequestStatus | null;
}

/** Ngày bị chặn bởi một đơn khác (mã `DAY_CONFLICT`); `info` là đơn gây chặn. */
export class DayConflictError extends Error {
  constructor(
    message: string,
    readonly info: DayConflictInfo
  ) {
    super(message);
    this.name = 'DayConflictError';
  }

  /** Lúc duyệt: cùng lỗi, thêm câu nói admin chỉ còn cách từ chối. */
  forReview(): DayConflictError {
    return new DayConflictError(`${this.message} Chỉ có thể từ chối đơn này.`, this.info);
  }
}

const RANGE_KINDS: ReadonlySet<NewRequestKind> = new Set(['LEAVE', 'LEAVE_WITH_MAKEUP', 'SHIFT_CHANGE']);
const CLAIMING_KINDS: ReadonlySet<NewRequestKind> = new Set([...RANGE_KINDS, 'ISAT', 'HALF_SHIFT_LEAVE']);

const satText = (date: string): string => `Thứ Bảy ${formatDayMonth(date)}`;

/** Lỗi do `row` gây ra; `row` null (ngày lễ) thì ba trường đơn đều null. */
const blockedBy = (date: string, row: DayClaim | null, message: string): DayConflictError =>
  new DayConflictError(message, {
    date,
    requestId: row?.requestId ?? null,
    requestType: row?.status ?? null,
    requestStatus: row?.requestStatus ?? null
  });

type DayOutcome =
  | { action: 'take'; replaces: DayClaim | null }
  | { action: 'allow' }
  | { action: 'skip'; warning: string; byIsat: DayClaim | null };

/** Một ngày theo ma trận §2.3; ném `DayConflictError` ở ô "Chặn". */
function planDay(kind: NewRequestKind, date: string, row: DayClaim | null, days: DayView, ownRequestId?: string): DayOutcome {
  const claims = CLAIMING_KINDS.has(kind);
  let outcome: DayOutcome = claims ? { action: 'take', replaces: null } : { action: 'allow' };

  if (kind === 'ISAT' && days.isHoliday(date)) {
    throw blockedBy(date, null, `${satText(date)} là ngày lễ, không chọn được cho iSAT.`);
  }

  if (row?.status === 'SHIFT_CHANGE') {
    if (kind === 'SHIFT_CHANGE') throw blockedBy(date, row, `Ngày ${formatDayMonth(date)} đã có đơn đổi ca khác`);
    if (claims) outcome = { action: 'take', replaces: row };
  } else if (row?.status === 'LEAVE' || row?.status === 'LEAVE_WITH_MAKEUP') {
    if (kind === 'LEAVE' || kind === 'LEAVE_WITH_MAKEUP' || kind === 'HALF_SHIFT_LEAVE') {
      throw blockedBy(date, row, `Ngày ${formatDayMonth(date)} đã có đơn nghỉ`);
    }
    if (kind === 'SHIFT_CHANGE') {
      return {
        action: 'skip',
        warning: `Ngày ${formatDayMonth(date)} đang nghỉ, giữ nguyên ngày nghỉ, không đổi ca.`,
        byIsat: null
      };
    }
    if (kind === 'ISAT') {
      throw blockedBy(
        date,
        row,
        row.requestStatus === 'APPROVED'
          ? `${satText(date)} đã nghỉ theo đơn đã duyệt, không chọn được cho iSAT.`
          : `${satText(date)} đang có đơn nghỉ chờ duyệt. Huỷ đơn nghỉ hoặc chọn Thứ Bảy khác.`
      );
    }
  } else if (row?.status === 'ISAT') {
    if (kind === 'ISAT') {
      throw blockedBy(date, row, `Đã có đơn iSAT cho Thứ Bảy ${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`);
    }
    if (row.requestStatus === 'PENDING') {
      throw blockedBy(date, row, `${satText(date)} đang có đơn iSAT chờ duyệt. Huỷ đơn iSAT hoặc chọn ngày khác.`);
    }
    if (RANGE_KINDS.has(kind)) {
      return { action: 'skip', warning: `${satText(date)} đã có iSAT được duyệt, không tính vào đơn.`, byIsat: row };
    }
    throw blockedBy(date, row, `${satText(date)} đã có iSAT được duyệt, không chọn được ngày này.`);
  } else if (row?.status === 'HALF_SHIFT') {
    if (kind === 'HALF_SHIFT_LEAVE' || kind === 'LEAVE' || kind === 'LEAVE_WITH_MAKEUP') {
      throw blockedBy(date, row, `Ngày ${formatDayMonth(date)} đã có đơn nghỉ giữa ca`);
    }
    if (kind === 'SHIFT_CHANGE') {
      return {
        action: 'skip',
        warning: `Ngày ${formatDayMonth(date)} đã có đơn nghỉ giữa ca, giữ nguyên, không đổi ca.`,
        byIsat: null
      };
    }
    if (kind === 'ISAT') {
      throw blockedBy(date, row, `${satText(date)} đã có đơn nghỉ giữa ca`);
    }
  }

  if (kind === 'ISAT') {
    const windows = days.windowSourcesOn(date).filter(w => w.requestId !== ownRequestId);
    const info = (w: WindowSource): DayConflictInfo => ({
      date,
      requestId: w.requestId,
      requestType: w.kind === 'OT' ? 'OVERTIME' : 'LEAVE_WITH_MAKEUP',
      requestStatus: w.requestStatus
    });
    const approved = windows.find(w => w.requestStatus === 'APPROVED');
    if (approved) {
      throw new DayConflictError(
        `${satText(date)} đã có khung OT hoặc làm bù được duyệt, không chọn được cho iSAT.`,
        info(approved)
      );
    }
    const pending = windows.find(w => w.requestStatus === 'PENDING');
    if (pending) {
      const name = pending.kind === 'OT' ? 'đơn OT' : 'đơn nghỉ có làm bù';
      throw new DayConflictError(`${satText(date)} đang có ${name} chờ duyệt. Huỷ đơn đó hoặc chọn Thứ Bảy khác.`, info(pending));
    }
  }

  return outcome;
}

/**
 * Ma trận §2.3: với mỗi ngày của đơn mới, quyết định chiếm, bỏ (kèm cảnh báo) hay chặn. Không đụng DB.
 * `dates` là các ngày làm việc trong khoảng (đơn theo khoảng) hoặc đúng một ngày; dòng của `ownRequestId` coi như không có.
 * Chỉ nghỉ, nghỉ có làm bù, đổi ca và iSAT chiếm ngày; OT, khung bù và giải trình chỉ được kiểm nên `take` rỗng.
 */
export function planClaims(input: {
  kind: NewRequestKind;
  dates: readonly string[];
  days: DayView;
  ownRequestId?: string;
}): ClaimPlan {
  const { kind, days, ownRequestId } = input;
  const take: ClaimPlan['take'] = [];
  const skips: Array<{ date: string; warning: string; byIsat: DayClaim | null }> = [];

  for (const date of [...new Set(input.dates)].sort()) {
    const found = days.claimOn(date);
    const row = found && found.requestId !== ownRequestId ? found : null;
    const outcome = planDay(kind, date, row, days, ownRequestId);
    if (outcome.action === 'take') take.push({ date, replaces: outcome.replaces });
    else if (outcome.action === 'skip') skips.push({ date, warning: outcome.warning, byIsat: outcome.byIsat });
  }

  if (RANGE_KINDS.has(kind) && take.length === 0) {
    const first = skips[0];
    if (first && skips.every(s => s.byIsat)) {
      throw blockedBy(first.date, first.byIsat, `${satText(first.date)} đã có iSAT được duyệt, không chọn được ngày này.`);
    }
    throw new Error(kind === 'SHIFT_CHANGE' ? 'Khoảng đổi ca không có ngày làm việc' : 'Khoảng nghỉ không có ngày làm việc');
  }

  return { take, skipped: skips.map(s => s.date), warnings: skips.map(s => s.warning) };
}
