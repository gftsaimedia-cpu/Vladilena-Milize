export interface PersonNameProps {
  familyName?: string | null;
  givenName?: string | null;
  fullName?: string | null;
}

const SPACES = /\s+/u;
const LOCALE = 'vi';

export const titleWord = (word?: string) =>
  word ? word.charAt(0).toLocaleUpperCase(LOCALE) + word.slice(1).toLocaleLowerCase(LOCALE) : '';

export const titleCase = (text?: string) =>
  String(text || '')
    .trim()
    .split(SPACES)
    .filter(Boolean)
    .map(titleWord)
    .join(' ');

export class PersonName {
  readonly familyName: string;
  readonly givenName: string;
  readonly fullName: string;

  constructor(arg1?: PersonNameProps | string, arg2?: string) {
    if (typeof arg1 === 'string' || arg2 !== undefined) {
      // Legacy signature: constructor(familyName?: string, givenName?: string)
      this.familyName = titleCase(arg1 as string);
      this.givenName = titleCase(arg2);
      this.fullName = [this.familyName, this.givenName].filter(Boolean).join(' ');
      return;
    }

    const props = arg1 || {};
    const rawFamily = props.familyName != null ? String(props.familyName).trim().replace(/\s+/g, ' ') : '';
    const rawGiven = props.givenName != null ? String(props.givenName).trim().replace(/\s+/g, ' ') : '';
    const hasFamilyOrGiven =
      Boolean(props.familyName != null && String(props.familyName).trim()) ||
      Boolean(props.givenName != null && String(props.givenName).trim());

    if (hasFamilyOrGiven) {
      this.familyName = titleCase(rawFamily);
      this.givenName = titleCase(rawGiven);
      this.fullName = [this.familyName, this.givenName].filter(Boolean).join(' ');
    } else {
      const rawFull = props.fullName != null ? String(props.fullName).trim().replace(/\s+/g, ' ') : '';
      if (!rawFull) {
        throw new Error('Họ tên nhân viên không được để trống');
      }
      const words = titleCase(rawFull).split(' ').filter(Boolean);
      if (words.length <= 1) {
        this.familyName = '';
        this.givenName = words[0] || '';
        this.fullName = this.givenName;
      } else {
        this.givenName = words[words.length - 1];
        this.familyName = words.slice(0, -1).join(' ');
        this.fullName = [this.familyName, this.givenName].join(' ');
      }
    }

    if (!this.fullName) {
      throw new Error('Họ tên nhân viên không được để trống');
    }
  }

  static empty(): PersonName {
    const p = Object.create(PersonName.prototype);
    Object.assign(p, { familyName: '', givenName: '', fullName: '' });
    return p;
  }

  static fromFullName(fullName: string): PersonName {
    return new PersonName({ fullName });
  }

  static fromParts(familyName: string, givenName: string): PersonName {
    return new PersonName({ familyName, givenName });
  }

  static parse(fullName?: string): PersonName {
    if (!fullName || !String(fullName).trim()) {
      return PersonName.empty();
    }
    return PersonName.fromFullName(fullName);
  }

  static from({ familyName, givenName, fullName }: any = {}): PersonName {
    if ((familyName && String(familyName).trim()) || (givenName && String(givenName).trim()))
      return new PersonName({ familyName, givenName });
    if (fullName && String(fullName).trim()) return PersonName.fromFullName(fullName);
    return PersonName.empty();
  }

  withChanges(patch: { familyName?: string; givenName?: string; fullName?: string }): PersonName {
    if (patch.fullName !== undefined && patch.familyName === undefined && patch.givenName === undefined) {
      return new PersonName({ fullName: patch.fullName });
    }
    return new PersonName({
      familyName: patch.familyName !== undefined ? patch.familyName : this.familyName,
      givenName: patch.givenName !== undefined ? patch.givenName : this.givenName
    });
  }

  isEmpty(): boolean {
    return !this.givenName;
  }

  toJSON(): { familyName: string; givenName: string; fullName: string } {
    return {
      familyName: this.familyName,
      givenName: this.givenName,
      fullName: this.fullName
    };
  }
}
