export interface PositionProps {
  type: string;
  level?: number;
  jobTitle?: string | null;
}

export class Position {
  readonly type: string;
  readonly level: number;
  readonly jobTitle: string | null;

  constructor(props: PositionProps) {
    if (!props || typeof props.type !== 'string' || !props.type.trim()) {
      throw new Error('Loại chức vụ không được để trống');
    }
    this.type = props.type.trim().toLowerCase();

    const lvl = props.level ?? 1;
    if (typeof lvl !== 'number' || !Number.isInteger(lvl) || lvl < 1) {
      throw new Error('Cấp bậc phải là số nguyên >= 1');
    }
    this.level = lvl;

    if (props.jobTitle != null && typeof props.jobTitle === 'string' && props.jobTitle.trim() !== '') {
      this.jobTitle = props.jobTitle.trim();
    } else {
      this.jobTitle = null;
    }
  }

  withChanges(patch: { type?: string; level?: number; jobTitle?: string | null }): Position {
    return new Position({
      type: patch.type !== undefined ? patch.type : this.type,
      level: patch.level !== undefined ? patch.level : this.level,
      jobTitle: patch.jobTitle !== undefined ? patch.jobTitle : this.jobTitle,
    });
  }

  toJSON(): { type: string; level: number; jobTitle: string | null } {
    return {
      type: this.type,
      level: this.level,
      jobTitle: this.jobTitle,
    };
  }
}
