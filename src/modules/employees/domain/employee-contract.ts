import {
  ContractStatus,
  ContractTerm,
  PositionLike,
  ShiftLike,
  LeaveLike,
  ShiftType,
  normalizePosition,
  normalizeShift,
  normalizeLeave
} from './types';

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const VALID_STATUSES: ContractStatus[] = ['tts', 'ctv', 'thuviec', 'nv', 'nghiviec'];
const VALID_TERMS: ContractTerm[] = ['long', 'short'];

// term null: nhãn theo loại nhân sự (tts → 'short', loại khác → 'long').
// hasInsurance null: đóng bảo hiểm theo mặc định của hợp đồng.
export interface EmployeeContractParams {
  position?: any;
  shift?: any;
  leave?: any;
  status?: ContractStatus;
  term?: ContractTerm | null;
  effectiveFrom?: string | null;
  resignedOn?: string | null;
  hasInsurance?: boolean | null;
  isUnionMember?: boolean;
  hasTax?: boolean;
  canAdvance?: boolean;
  isDormResident?: boolean;
}

export class EmployeeContract {
  readonly position: PositionLike;
  readonly shift: ShiftLike;
  readonly leave: LeaveLike;
  readonly status: ContractStatus;
  readonly term: ContractTerm | null;
  readonly effectiveFrom: string | null;
  readonly resignedOn: string | null;
  readonly hasInsurance: boolean | null;
  readonly isUnionMember: boolean;
  readonly hasTax: boolean;
  readonly canAdvance: boolean;
  readonly isDormResident: boolean;

  constructor(params: EmployeeContractParams = {}) {
    this.position = normalizePosition(params.position ?? { type: 'nv', level: 1 });
    this.shift = normalizeShift(
      params.shift ?? { type: 'NORMAL', startTime: '08:00', endTime: '17:00', allowancePct: 0 }
    );
    this.leave = normalizeLeave(params.leave ?? { totalDays: 0, usedDays: 0 });

    const status = params.status === undefined ? 'nv' : params.status;
    if (!VALID_STATUSES.includes(status)) {
      throw new Error(`Invalid contract status: ${status}`);
    }
    this.status = status;

    const term = params.term ?? null;
    if (term !== null && !VALID_TERMS.includes(term)) {
      throw new Error(`Loại hợp đồng không hợp lệ: ${term}`);
    }
    this.term = term;

    if (params.effectiveFrom !== undefined && params.effectiveFrom !== null) {
      const ef = String(params.effectiveFrom).trim();
      if (!DATE_REGEX.test(ef)) {
        throw new Error('Invalid effectiveFrom date format; expected YYYY-MM-DD');
      }
      this.effectiveFrom = ef;
    } else {
      this.effectiveFrom = null;
    }

    if (params.resignedOn !== undefined && params.resignedOn !== null) {
      const ro = String(params.resignedOn).trim();
      if (!DATE_REGEX.test(ro)) {
        throw new Error('Invalid resignedOn date format; expected YYYY-MM-DD');
      }
      this.resignedOn = ro;
    } else {
      this.resignedOn = null;
    }

    this.hasInsurance = params.hasInsurance != null ? Boolean(params.hasInsurance) : null;
    this.isUnionMember = params.isUnionMember !== undefined ? Boolean(params.isUnionMember) : false;
    this.hasTax = params.hasTax !== undefined ? Boolean(params.hasTax) : true;
    this.canAdvance = params.canAdvance !== undefined ? Boolean(params.canAdvance) : true;
    this.isDormResident = params.isDormResident !== undefined ? Boolean(params.isDormResident) : false;
  }

  update(patch: Partial<EmployeeContractParams>): EmployeeContract {
    return new EmployeeContract({
      position: patch.position !== undefined ? patch.position : this.position,
      shift: patch.shift !== undefined ? patch.shift : this.shift,
      leave: patch.leave !== undefined ? patch.leave : this.leave,
      status: patch.status !== undefined ? patch.status : this.status,
      term: patch.term !== undefined ? patch.term : this.term,
      effectiveFrom: patch.effectiveFrom !== undefined ? patch.effectiveFrom : this.effectiveFrom,
      resignedOn: patch.resignedOn !== undefined ? patch.resignedOn : this.resignedOn,
      hasInsurance: patch.hasInsurance !== undefined ? patch.hasInsurance : this.hasInsurance,
      isUnionMember: patch.isUnionMember !== undefined ? patch.isUnionMember : this.isUnionMember,
      hasTax: patch.hasTax !== undefined ? patch.hasTax : this.hasTax,
      canAdvance: patch.canAdvance !== undefined ? patch.canAdvance : this.canAdvance,
      isDormResident: patch.isDormResident !== undefined ? patch.isDormResident : this.isDormResident
    });
  }

  changePosition(patch: { type?: string; level?: number; jobTitle?: string | null }): EmployeeContract {
    const newPosition = normalizePosition({
      type: patch.type ?? this.position.type,
      level: patch.level ?? this.position.level,
      jobTitle: patch.jobTitle !== undefined ? patch.jobTitle : this.position.jobTitle
    });
    return this.update({ position: newPosition });
  }

  changeShift(patch: {
    type?: ShiftType;
    startTime?: string;
    endTime?: string;
    allowancePct?: number;
  }): EmployeeContract {
    const newShift = normalizeShift({
      type: patch.type ?? this.shift.type,
      startTime: patch.startTime ?? this.shift.startTime,
      endTime: patch.endTime ?? this.shift.endTime,
      allowancePct: patch.allowancePct ?? this.shift.allowancePct
    });
    return this.update({ shift: newShift });
  }

  updateLeave(patch: { totalDays?: number; usedDays?: number }): EmployeeContract {
    const newLeave = normalizeLeave({
      totalDays: patch.totalDays ?? this.leave.totalDays,
      usedDays: patch.usedDays ?? this.leave.usedDays
    });
    return this.update({ leave: newLeave });
  }

  toJSON(): {
    position: ReturnType<NonNullable<PositionLike['toJSON']>> | PositionLike;
    shift: ReturnType<NonNullable<ShiftLike['toJSON']>> | ShiftLike;
    leave: ReturnType<NonNullable<LeaveLike['toJSON']>> | LeaveLike;
    status: ContractStatus;
    term: ContractTerm | null;
    effectiveFrom: string | null;
    resignedOn: string | null;
    hasInsurance: boolean | null;
    isUnionMember: boolean;
    hasTax: boolean;
    canAdvance: boolean;
    isDormResident: boolean;
  } {
    return {
      position: typeof this.position.toJSON === 'function' ? this.position.toJSON() : this.position,
      shift: typeof this.shift.toJSON === 'function' ? this.shift.toJSON() : this.shift,
      leave: typeof this.leave.toJSON === 'function' ? this.leave.toJSON() : this.leave,
      status: this.status,
      term: this.term,
      effectiveFrom: this.effectiveFrom,
      resignedOn: this.resignedOn,
      hasInsurance: this.hasInsurance,
      isUnionMember: this.isUnionMember,
      hasTax: this.hasTax,
      canAdvance: this.canAdvance,
      isDormResident: this.isDormResident
    };
  }
}
