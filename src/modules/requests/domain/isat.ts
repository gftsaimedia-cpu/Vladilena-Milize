export type IsatConditionCode = 'NO_VIOLATION' | 'REPORTS_DONE' | 'WORK_COMPLETED' | 'OFFICIAL_EMPLOYEE';

export const ISAT_CONDITIONS: ReadonlyArray<{ readonly code: IsatConditionCode; readonly label: string }> = [
  {
    code: 'NO_VIOLATION',
    label: 'Không vi phạm Nội quy lao động hoặc các quy định của Công ty trong kỳ xét duyệt'
  },
  { code: 'REPORTS_DONE', label: 'Thực hiện đầy đủ các báo cáo' },
  { code: 'WORK_COMPLETED', label: 'Hoàn thành công việc được giao theo kế hoạch' },
  { code: 'OFFICIAL_EMPLOYEE', label: 'Là nhân viên chính thức' }
];

export interface IsatCondition {
  code: string;
  label: string;
  passed: boolean;
}

export interface IsatProfileSnapshot {
  fullName: string;
  positionType: string;
  positionLevel: number;
  levelName: string | null;
  shiftType: string;
  shiftStartTime: string;
  shiftEndTime: string;
}

export interface IsatRegistrationRow {
  request_id: string;
  saturday: string;
  full_name: string;
  team: string;
  position_type: string;
  position_level: number;
  level_name: string | null;
  shift_type: string;
  shift_start_time: string;
  shift_end_time: string;
}

export interface IsatConditionRow {
  request_id: string;
  sort_order: number;
  code: string;
  label: string;
  passed: boolean;
}

export interface IsatRegistrationDTO {
  saturday: string;
  fullName: string;
  team: string;
  positionType: string;
  positionLevel: number;
  levelName: string | null;
  shift: { type: string; startTime: string; endTime: string };
  conditions: IsatCondition[];
  passedCount: number;
  totalCount: number;
}

interface IsatRegistrationProps {
  saturday: string;
  fullName: string;
  team: string;
  positionType: string;
  positionLevel: number;
  levelName: string | null;
  shiftType: string;
  shiftStartTime: string;
  shiftEndTime: string;
  conditions: ReadonlyArray<IsatCondition>;
}

function requireSaturday(value: unknown): string {
  if (typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value)) {
    const [y, m, d] = value.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    const exists = date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
    if (exists && date.getUTCDay() === 6) {
      return value;
    }
  }
  throw new Error(`saturday phải là ngày Thứ Bảy dạng YYYY-MM-DD, nhận: ${String(value)}`);
}

function requireTeam(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error('team (Bộ phận / Team) không được để trống');
  }
  return value.trim();
}

function assessConditions(value: unknown): IsatCondition[] {
  const answers = value ?? {};
  if (typeof answers !== 'object' || Array.isArray(answers)) {
    throw new Error('conditions phải là object {mã: true|false}');
  }
  const known = new Set<string>(ISAT_CONDITIONS.map(c => c.code));
  for (const [code, answer] of Object.entries(answers)) {
    if (!known.has(code)) {
      throw new Error(`Mã điều kiện iSAT không hợp lệ: ${code}`);
    }
    if (answer !== true && answer !== false && answer !== null && answer !== undefined) {
      throw new Error(`Giá trị điều kiện ${code} phải là true, false hoặc null`);
    }
  }
  return ISAT_CONDITIONS.map(c => ({
    code: c.code,
    label: c.label,
    passed: (answers as Record<string, unknown>)[c.code] === true
  }));
}

export class IsatRegistration {
  readonly saturday: string;
  readonly fullName: string;
  readonly team: string;
  readonly positionType: string;
  readonly positionLevel: number;
  readonly levelName: string | null;
  readonly shiftType: string;
  readonly shiftStartTime: string;
  readonly shiftEndTime: string;
  readonly conditions: ReadonlyArray<IsatCondition>;

  constructor(props: IsatRegistrationProps) {
    this.saturday = props.saturday;
    this.fullName = props.fullName;
    this.team = props.team;
    this.positionType = props.positionType;
    this.positionLevel = props.positionLevel;
    this.levelName = props.levelName ?? null;
    this.shiftType = props.shiftType;
    this.shiftStartTime = props.shiftStartTime;
    this.shiftEndTime = props.shiftEndTime;
    this.conditions = props.conditions;
  }

  get passedCount(): number {
    return this.conditions.filter(c => c.passed).length;
  }

  get totalCount(): number {
    return this.conditions.length;
  }

  get allPassed(): boolean {
    return this.passedCount === this.totalCount;
  }

  static assess(input: {
    saturday: unknown;
    team: unknown;
    conditions: unknown;
    profile: IsatProfileSnapshot;
  }): IsatRegistration {
    const saturday = requireSaturday(input?.saturday);
    const team = requireTeam(input?.team);
    const conditions = assessConditions(input?.conditions);
    const profile = input.profile;

    return new IsatRegistration({
      saturday,
      fullName: profile.fullName,
      team,
      positionType: profile.positionType,
      positionLevel: profile.positionLevel,
      levelName: profile.levelName,
      shiftType: profile.shiftType,
      shiftStartTime: profile.shiftStartTime,
      shiftEndTime: profile.shiftEndTime,
      conditions
    });
  }

  static fromRows(row: IsatRegistrationRow, conditionRows: IsatConditionRow[]): IsatRegistration {
    if (!row || typeof row !== 'object') {
      throw new Error('row must be an object');
    }

    return new IsatRegistration({
      saturday: row.saturday,
      fullName: row.full_name,
      team: row.team,
      positionType: row.position_type,
      positionLevel: Number(row.position_level),
      levelName: row.level_name ?? null,
      shiftType: row.shift_type,
      shiftStartTime: row.shift_start_time,
      shiftEndTime: row.shift_end_time,
      conditions: [...conditionRows]
        .sort((a, b) => a.sort_order - b.sort_order)
        .map(c => ({ code: c.code, label: c.label, passed: c.passed }))
    });
  }

  toRow(requestId: string): IsatRegistrationRow {
    return {
      request_id: requestId,
      saturday: this.saturday,
      full_name: this.fullName,
      team: this.team,
      position_type: this.positionType,
      position_level: this.positionLevel,
      level_name: this.levelName,
      shift_type: this.shiftType,
      shift_start_time: this.shiftStartTime,
      shift_end_time: this.shiftEndTime
    };
  }

  toConditionRows(requestId: string): IsatConditionRow[] {
    return this.conditions.map((c, index) => ({
      request_id: requestId,
      sort_order: index + 1,
      code: c.code,
      label: c.label,
      passed: c.passed
    }));
  }

  toJSON(): IsatRegistrationDTO {
    return {
      saturday: this.saturday,
      fullName: this.fullName,
      team: this.team,
      positionType: this.positionType,
      positionLevel: this.positionLevel,
      levelName: this.levelName,
      shift: { type: this.shiftType, startTime: this.shiftStartTime, endTime: this.shiftEndTime },
      conditions: this.conditions.map(c => ({ code: c.code, label: c.label, passed: c.passed })),
      passedCount: this.passedCount,
      totalCount: this.totalCount
    };
  }
}
