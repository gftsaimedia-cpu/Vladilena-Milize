export interface LeaveProps {
  totalDays?: number;
  usedDays?: number;
}

export class Leave {
  readonly totalDays: number;
  readonly usedDays: number;

  constructor(props: LeaveProps = {}) {
    const total = props.totalDays ?? 0;
    const used = props.usedDays ?? 0;

    if (
      typeof total !== 'number' ||
      !Number.isFinite(total) ||
      total < 0 ||
      typeof used !== 'number' ||
      !Number.isFinite(used) ||
      used < 0
    ) {
      throw new Error('Số ngày phép phải là số không âm hợp lệ');
    }

    this.totalDays = Number(total.toFixed(2));
    this.usedDays = Number(used.toFixed(2));
  }

  remainingDays(): number {
    return Math.max(0, Number((this.totalDays - this.usedDays).toFixed(2)));
  }

  canTakeLeave(days: number): boolean {
    if (typeof days !== 'number' || !Number.isFinite(days) || days <= 0) {
      return false;
    }
    const nextUsed = Number((this.usedDays + days).toFixed(2));
    return nextUsed <= this.totalDays;
  }

  useLeave(days: number): Leave {
    if (!this.canTakeLeave(days)) {
      throw new Error('Số ngày nghỉ không hợp lệ hoặc vượt quá số ngày phép còn lại');
    }
    const nextUsed = Number((this.usedDays + days).toFixed(2));
    return new Leave({
      totalDays: this.totalDays,
      usedDays: nextUsed
    });
  }

  withChanges(patch: { totalDays?: number; usedDays?: number }): Leave {
    return new Leave({
      totalDays: patch.totalDays !== undefined ? patch.totalDays : this.totalDays,
      usedDays: patch.usedDays !== undefined ? patch.usedDays : this.usedDays
    });
  }

  toJSON(): { totalDays: number; usedDays: number; remainingDays: number } {
    return {
      totalDays: this.totalDays,
      usedDays: this.usedDays,
      remainingDays: this.remainingDays()
    };
  }
}
