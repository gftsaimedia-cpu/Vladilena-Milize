export interface WorkMetricsProps {
  workHours?: number;
  workUnits?: number;
  otHours?: number;
  lateMinutes?: number;
  earlyMinutes?: number;
}

export interface WorkMetricsDTO {
  workHours: number;
  workUnits: number;
  otHours: number;
  lateMinutes: number;
  earlyMinutes: number;
}

export class WorkMetrics {
  readonly workHours: number;
  readonly workUnits: number;
  readonly otHours: number;
  readonly lateMinutes: number;
  readonly earlyMinutes: number;

  constructor(props: WorkMetricsProps = {}) {
    const { workHours = 0, workUnits = 0, otHours = 0, lateMinutes = 0, earlyMinutes = 0 } = props;

    if (typeof workHours !== 'number' || !Number.isFinite(workHours) || workHours < 0) {
      throw new Error('Số giờ làm việc (workHours) phải là số không âm');
    }

    if (typeof workUnits !== 'number' || !Number.isFinite(workUnits) || workUnits < 0) {
      throw new Error('Công chuẩn (workUnits) phải là số không âm');
    }

    if (typeof otHours !== 'number' || !Number.isFinite(otHours) || otHours < 0) {
      throw new Error('Số giờ làm thêm (otHours) phải là số không âm');
    }

    if (typeof lateMinutes !== 'number' || !Number.isFinite(lateMinutes) || lateMinutes < 0) {
      throw new Error('Số phút vào muộn (lateMinutes) phải là số không âm');
    }

    if (typeof earlyMinutes !== 'number' || !Number.isFinite(earlyMinutes) || earlyMinutes < 0) {
      throw new Error('Số phút về sớm (earlyMinutes) phải là số không âm');
    }

    this.workHours = workHours;
    this.workUnits = workUnits;
    this.otHours = otHours;
    this.lateMinutes = lateMinutes;
    this.earlyMinutes = earlyMinutes;
  }

  static zero(): WorkMetrics {
    return new WorkMetrics({
      workHours: 0,
      workUnits: 0,
      otHours: 0,
      lateMinutes: 0,
      earlyMinutes: 0
    });
  }

  static empty(): WorkMetrics {
    return WorkMetrics.zero();
  }

  withChanges(patch: Partial<WorkMetricsProps>): WorkMetrics {
    return new WorkMetrics({
      workHours: patch.workHours !== undefined ? patch.workHours : this.workHours,
      workUnits: patch.workUnits !== undefined ? patch.workUnits : this.workUnits,
      otHours: patch.otHours !== undefined ? patch.otHours : this.otHours,
      lateMinutes: patch.lateMinutes !== undefined ? patch.lateMinutes : this.lateMinutes,
      earlyMinutes: patch.earlyMinutes !== undefined ? patch.earlyMinutes : this.earlyMinutes
    });
  }

  equals(other: WorkMetrics): boolean {
    if (!other || !(other instanceof WorkMetrics)) return false;
    return (
      this.workHours === other.workHours &&
      this.workUnits === other.workUnits &&
      this.otHours === other.otHours &&
      this.lateMinutes === other.lateMinutes &&
      this.earlyMinutes === other.earlyMinutes
    );
  }

  toJSON(): WorkMetricsDTO {
    return {
      workHours: this.workHours,
      workUnits: this.workUnits,
      otHours: this.otHours,
      lateMinutes: this.lateMinutes,
      earlyMinutes: this.earlyMinutes
    };
  }
}
