export interface EmployeeAccountParams {
  username: string;
  passwordHash: string;
  roles?: readonly string[] | string[];
  isLocked?: boolean;
  lockedAt?: string | null;
  lockedBy?: string | null;
  createdAt?: string;
}

export interface EmployeeAccountPatch {
  passwordHash?: string;
  roles?: string[];
  isLocked?: boolean;
  lockedAt?: string | null;
  lockedBy?: string | null;
}

export class EmployeeAccount {
  readonly username: string;
  readonly passwordHash: string;
  readonly roles: readonly string[];
  readonly isLocked: boolean;
  readonly lockedAt: string | null;
  readonly lockedBy: string | null;
  readonly createdAt: string;

  constructor(params: EmployeeAccountParams) {
    if (!params || typeof params !== 'object') {
      throw new Error('EmployeeAccount parameters are required');
    }

    const u = params.username != null ? String(params.username).trim().toLowerCase() : '';
    if (!u) {
      throw new Error('Username must be non-empty');
    }
    this.username = u;

    const p = params.passwordHash != null ? String(params.passwordHash).trim() : '';
    if (!p) {
      throw new Error('Password hash must be non-empty');
    }
    this.passwordHash = p;

    const r = params.roles === undefined ? ['staff'] : params.roles;
    if (!Array.isArray(r) || r.length === 0) {
      throw new Error('Roles must be non-empty');
    }
    const sanitizedRoles = r.map(x => String(x).trim()).filter(Boolean);
    if (sanitizedRoles.length === 0) {
      throw new Error('Roles must be non-empty');
    }
    this.roles = Object.freeze(sanitizedRoles);

    this.lockedAt = params.lockedAt ? String(params.lockedAt).trim() : null;
    this.lockedBy = params.lockedBy ? String(params.lockedBy).trim() : null;
    this.isLocked = Boolean(this.lockedAt || params.isLocked);

    this.createdAt = params.createdAt ? String(params.createdAt).trim() : new Date().toISOString();
  }

  hasRole(role: string): boolean {
    return this.roles.includes(role);
  }

  lock(by: string, at?: string): EmployeeAccount {
    const lockedBy = by != null ? String(by).trim() : '';
    if (!lockedBy) {
      throw new Error('Lock author must be provided');
    }
    const lockedAt = at != null ? String(at).trim() : new Date().toISOString();
    return new EmployeeAccount({
      username: this.username,
      passwordHash: this.passwordHash,
      roles: this.roles,
      isLocked: true,
      lockedAt,
      lockedBy,
      createdAt: this.createdAt
    });
  }

  unlock(): EmployeeAccount {
    return new EmployeeAccount({
      username: this.username,
      passwordHash: this.passwordHash,
      roles: this.roles,
      isLocked: false,
      lockedAt: null,
      lockedBy: null,
      createdAt: this.createdAt
    });
  }

  update(patch: EmployeeAccountPatch): EmployeeAccount {
    return new EmployeeAccount({
      username: this.username,
      passwordHash: patch.passwordHash !== undefined ? patch.passwordHash : this.passwordHash,
      roles: patch.roles !== undefined ? patch.roles : this.roles,
      isLocked: patch.isLocked !== undefined ? patch.isLocked : this.isLocked,
      lockedAt: patch.lockedAt !== undefined ? patch.lockedAt : this.lockedAt,
      lockedBy: patch.lockedBy !== undefined ? patch.lockedBy : this.lockedBy,
      createdAt: this.createdAt
    });
  }

  toJSON(): {
    username: string;
    roles: string[];
    primaryRole: string;
    isLocked: boolean;
    lockedAt: string | null;
    lockedBy: string | null;
    createdAt: string;
  } {
    return {
      username: this.username,
      roles: [...this.roles],
      primaryRole: this.roles[0] || 'staff',
      isLocked: this.isLocked,
      lockedAt: this.lockedAt,
      lockedBy: this.lockedBy,
      createdAt: this.createdAt
    };
  }
}
