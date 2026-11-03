export type ShiftType = 'NORMAL' | 'FLEX' | 'NIGHT';

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export interface ShiftProps {
  type: ShiftType;
  startTime: string;
  endTime: string;
  allowancePct?: number;
}

export class Shift {
  readonly type: ShiftType;
  readonly startTime: string;
  readonly endTime: string;
  readonly allowancePct: number;

  constructor(props: ShiftProps) {
    if (!props || (props.type !== 'NORMAL' && props.type !== 'FLEX' && props.type !== 'NIGHT')) {
      throw new Error(`Loại ca không hợp lệ (NORMAL, FLEX, NIGHT): ${props?.type}`);
    }
    this.type = props.type;

    if (
      typeof props.startTime !== 'string' ||
      !TIME_REGEX.test(props.startTime) ||
      typeof props.endTime !== 'string' ||
      !TIME_REGEX.test(props.endTime)
    ) {
      throw new Error('Định dạng giờ không hợp lệ (HH:mm)');
    }
    this.startTime = props.startTime;
    this.endTime = props.endTime;

    if (this.type === 'NORMAL') {
      if (props.allowancePct !== undefined && props.allowancePct !== 0) {
        throw new Error('Ca NORMAL không có phụ cấp ca (0%)');
      }
      this.allowancePct = 0;
    } else if (this.type === 'FLEX') {
      if (props.allowancePct !== undefined && props.allowancePct !== 10) {
        throw new Error('Ca FLEX có phụ cấp ca cố định là 10%');
      }
      this.allowancePct = 10;
    } else {
      // NIGHT
      const pct = props.allowancePct ?? 30;
      if (pct !== 30 && pct !== 40 && pct !== 60) {
        throw new Error('Ca NIGHT chỉ nhận phụ cấp ca 30%, 40% hoặc 60%');
      }
      this.allowancePct = pct;
    }
  }

  isOvernight(): boolean {
    return this.endTime <= this.startTime;
  }

  withChanges(patch: Partial<{ type: ShiftType; startTime: string; endTime: string; allowancePct: number }>): Shift {
    const nextType = patch.type ?? this.type;
    const nextStart = patch.startTime ?? this.startTime;
    const nextEnd = patch.endTime ?? this.endTime;

    let nextAllowance: number | undefined = patch.allowancePct;
    if (nextAllowance === undefined) {
      if (patch.type !== undefined && patch.type !== this.type) {
        nextAllowance = undefined;
      } else {
        nextAllowance = this.allowancePct;
      }
    }

    return new Shift({
      type: nextType,
      startTime: nextStart,
      endTime: nextEnd,
      allowancePct: nextAllowance,
    });
  }

  toJSON(): { type: ShiftType; startTime: string; endTime: string; allowancePct: number; isOvernight: boolean } {
    return {
      type: this.type,
      startTime: this.startTime,
      endTime: this.endTime,
      allowancePct: this.allowancePct,
      isOvernight: this.isOvernight(),
    };
  }
}
