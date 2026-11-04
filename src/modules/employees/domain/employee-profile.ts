import crypto from 'node:crypto';
import { PersonNameLike, normalizeName } from './types';

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export interface EmployeeProfileParams {
  uuid?: string;
  name?: any;
  familyName?: string;
  givenName?: string;
  fullName?: string;
  birthday?: string | null;
  dependants?: number;
}

export interface EmployeeProfilePatch {
  name?: any;
  familyName?: string;
  givenName?: string;
  fullName?: string;
  birthday?: string | null;
  dependants?: number;
}

export class EmployeeProfile {
  readonly uuid: string;
  readonly name: PersonNameLike;
  readonly birthday: string | null;
  readonly dependants: number;

  constructor(params: EmployeeProfileParams) {
    if (!params || typeof params !== 'object') {
      throw new Error('EmployeeProfile parameters are required');
    }

    if (params.uuid !== undefined && params.uuid !== null) {
      const u = String(params.uuid).trim();
      if (!u) {
        throw new Error('UUID must be a non-empty string');
      }
      this.uuid = u;
    } else {
      this.uuid = crypto.randomUUID();
    }

    const nameInput =
      params.name !== undefined
        ? params.name
        : {
            familyName: params.familyName,
            givenName: params.givenName,
            fullName: params.fullName
          };
    this.name = normalizeName(nameInput);

    if (params.birthday !== undefined && params.birthday !== null) {
      const b = String(params.birthday).trim();
      if (!DATE_REGEX.test(b)) {
        throw new Error('Invalid birthday format; expected YYYY-MM-DD');
      }
      this.birthday = b;
    } else {
      this.birthday = null;
    }

    const dep = params.dependants === undefined || params.dependants === null ? 0 : params.dependants;
    if (typeof dep !== 'number' || isNaN(dep) || !Number.isInteger(dep) || dep < 0) {
      throw new Error('dependants must be an integer >= 0');
    }
    this.dependants = dep;
  }

  get familyName(): string {
    return this.name.familyName;
  }

  get givenName(): string {
    return this.name.givenName;
  }

  get fullName(): string {
    return this.name.fullName;
  }

  update(patch: EmployeeProfilePatch): EmployeeProfile {
    let nameInput: any;
    if (patch.name !== undefined) {
      nameInput = patch.name;
    } else if (patch.familyName !== undefined || patch.givenName !== undefined || patch.fullName !== undefined) {
      nameInput = {
        familyName: patch.familyName ?? this.name.familyName,
        givenName: patch.givenName ?? this.name.givenName,
        fullName: patch.fullName
      };
    } else {
      nameInput = this.name;
    }

    const birthday = patch.birthday !== undefined ? patch.birthday : this.birthday;
    const dependants = patch.dependants !== undefined ? patch.dependants : this.dependants;

    return new EmployeeProfile({
      uuid: this.uuid,
      name: nameInput,
      birthday,
      dependants
    });
  }

  toJSON(): {
    uuid: string;
    familyName: string;
    givenName: string;
    fullName: string;
    birthday: string | null;
    dependants: number;
  } {
    return {
      uuid: this.uuid,
      familyName: this.name.familyName,
      givenName: this.name.givenName,
      fullName: this.name.fullName,
      birthday: this.birthday,
      dependants: this.dependants
    };
  }
}
