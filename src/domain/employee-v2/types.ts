export type ShiftType = 'NORMAL' | 'FLEX' | 'NIGHT';

export type ContractStatus = 'tts' | 'ctv' | 'thuviec' | 'nv' | 'nghiviec';

export interface PersonNameLike {
  readonly familyName: string;
  readonly givenName: string;
  readonly fullName: string;
  toJSON?(): { familyName: string; givenName: string; fullName: string };
}

export interface PositionLike {
  readonly type: string;
  readonly level: number;
  readonly jobTitle: string | null;
  toJSON?(): { type: string; level: number; jobTitle: string | null };
}

export interface ShiftLike {
  readonly type: ShiftType;
  readonly startTime: string;
  readonly endTime: string;
  readonly allowancePct: number;
  isOvernight?(): boolean;
  toJSON?(): { type: ShiftType; startTime: string; endTime: string; allowancePct: number; isOvernight?: boolean };
}

export interface LeaveLike {
  readonly totalDays: number;
  readonly usedDays: number;
  remainingDays?(): number;
  toJSON?(): { totalDays: number; usedDays: number; remainingDays: number };
}

export function normalizeName(input: any): PersonNameLike {
  if (!input) {
    throw new Error('Name is required');
  }

  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) {
      throw new Error('Name is required');
    }
    const words = trimmed.split(/\s+/).filter(Boolean);
    const givenName = words.pop() || '';
    const familyName = words.join(' ');
    const fullName = trimmed;
    return {
      familyName,
      givenName,
      fullName,
      toJSON() {
        return { familyName: this.familyName, givenName: this.givenName, fullName: this.fullName };
      }
    };
  }

  if (typeof input !== 'object') {
    throw new Error('Name is required');
  }

  const fam = input.familyName != null ? String(input.familyName).trim() : undefined;
  const giv = input.givenName != null ? String(input.givenName).trim() : undefined;
  const full = input.fullName != null ? String(input.fullName).trim() : undefined;

  let familyName = '';
  let givenName = '';
  let fullName = '';

  if (giv !== undefined || fam !== undefined) {
    familyName = fam ?? '';
    givenName = giv ?? '';
    fullName = full || [familyName, givenName].filter(Boolean).join(' ');
  } else if (full) {
    const words = full.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      throw new Error('Name is required');
    }
    givenName = words.pop() || '';
    familyName = words.join(' ');
    fullName = full;
  } else {
    throw new Error('Name is required');
  }

  if (!givenName && !fullName) {
    throw new Error('Name is required');
  }

  return {
    familyName,
    givenName,
    fullName,
    toJSON() {
      return { familyName: this.familyName, givenName: this.givenName, fullName: this.fullName };
    }
  };
}

export function normalizePosition(input: any): PositionLike {
  if (!input || typeof input !== 'object') {
    throw new Error('Position type is required');
  }

  const type = input.type != null ? String(input.type).trim() : '';
  if (!type) {
    throw new Error('Position type is required');
  }

  const level = input.level == null ? 1 : input.level;
  if (typeof level !== 'number' || isNaN(level) || !Number.isInteger(level) || level < 1) {
    throw new Error('Position level must be an integer >= 1');
  }

  const jobTitle = input.jobTitle != null && String(input.jobTitle).trim() ? String(input.jobTitle).trim() : null;

  return {
    type,
    level,
    jobTitle,
    toJSON() {
      return { type: this.type, level: this.level, jobTitle: this.jobTitle };
    }
  };
}

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

export function normalizeShift(input: any): ShiftLike {
  if (!input || typeof input !== 'object') {
    throw new Error('Shift is required');
  }

  const validTypes: ShiftType[] = ['NORMAL', 'FLEX', 'NIGHT'];
  const rawType = input.type != null ? String(input.type).trim().toUpperCase() : '';
  if (!validTypes.includes(rawType as ShiftType)) {
    throw new Error('Invalid shift type');
  }
  const type = rawType as ShiftType;

  const startTime = input.startTime != null ? String(input.startTime).trim() : '';
  if (!TIME_REGEX.test(startTime)) {
    throw new Error('Invalid shift startTime');
  }

  const endTime = input.endTime != null ? String(input.endTime).trim() : '';
  if (!TIME_REGEX.test(endTime)) {
    throw new Error('Invalid shift endTime');
  }

  const allowancePct = input.allowancePct == null ? 0 : input.allowancePct;
  if (typeof allowancePct !== 'number' || isNaN(allowancePct) || allowancePct < 0) {
    throw new Error('allowancePct must be a number >= 0');
  }

  const isOvernight = typeof input.isOvernight === 'function' ? () => input.isOvernight() : () => startTime > endTime;

  return {
    type,
    startTime,
    endTime,
    allowancePct,
    isOvernight,
    toJSON() {
      return {
        type: this.type,
        startTime: this.startTime,
        endTime: this.endTime,
        allowancePct: this.allowancePct,
        isOvernight: this.isOvernight ? this.isOvernight() : startTime > endTime
      };
    }
  };
}

export function normalizeLeave(input: any): LeaveLike {
  const obj = input && typeof input === 'object' ? input : {};

  const totalDays = obj.totalDays == null ? 0 : obj.totalDays;
  if (typeof totalDays !== 'number' || isNaN(totalDays) || totalDays < 0) {
    throw new Error('totalDays must be a number >= 0');
  }

  const usedDays = obj.usedDays == null ? 0 : obj.usedDays;
  if (typeof usedDays !== 'number' || isNaN(usedDays) || usedDays < 0) {
    throw new Error('usedDays must be a number >= 0');
  }

  const remainingDays =
    typeof obj.remainingDays === 'function' ? () => obj.remainingDays() : () => totalDays - usedDays;

  return {
    totalDays,
    usedDays,
    remainingDays,
    toJSON() {
      return {
        totalDays: this.totalDays,
        usedDays: this.usedDays,
        remainingDays: this.remainingDays ? this.remainingDays() : this.totalDays - this.usedDays
      };
    }
  };
}
