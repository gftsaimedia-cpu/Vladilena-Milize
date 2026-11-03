export interface PersonNameProps {
  familyName?: string | null;
  givenName?: string | null;
  fullName?: string | null;
}

export class PersonName {
  readonly familyName: string;
  readonly givenName: string;
  readonly fullName: string;

  constructor(props: PersonNameProps = {}) {
    const rawFamily = props.familyName != null ? String(props.familyName).trim().replace(/\s+/g, ' ') : '';
    const rawGiven = props.givenName != null ? String(props.givenName).trim().replace(/\s+/g, ' ') : '';
    const hasFamilyOrGiven =
      Boolean(props.familyName != null && String(props.familyName).trim()) ||
      Boolean(props.givenName != null && String(props.givenName).trim());

    if (hasFamilyOrGiven) {
      this.familyName = rawFamily;
      this.givenName = rawGiven;
      this.fullName = [this.familyName, this.givenName].filter(Boolean).join(' ');
    } else {
      const rawFull = props.fullName != null ? String(props.fullName).trim().replace(/\s+/g, ' ') : '';
      if (!rawFull) {
        throw new Error('Họ tên nhân viên không được để trống');
      }
      const words = rawFull.split(' ').filter(Boolean);
      if (words.length <= 1) {
        this.familyName = '';
        this.givenName = words[0] || '';
        this.fullName = this.givenName;
      } else {
        this.givenName = words[words.length - 1];
        this.familyName = words.slice(0, -1).join(' ');
        this.fullName = rawFull;
      }
    }

    if (!this.fullName) {
      throw new Error('Họ tên nhân viên không được để trống');
    }
  }

  static fromFullName(fullName: string): PersonName {
    return new PersonName({ fullName });
  }

  static fromParts(familyName: string, givenName: string): PersonName {
    return new PersonName({ familyName, givenName });
  }

  withChanges(patch: { familyName?: string; givenName?: string; fullName?: string }): PersonName {
    if (patch.fullName !== undefined && patch.familyName === undefined && patch.givenName === undefined) {
      return new PersonName({ fullName: patch.fullName });
    }
    return new PersonName({
      familyName: patch.familyName !== undefined ? patch.familyName : this.familyName,
      givenName: patch.givenName !== undefined ? patch.givenName : this.givenName,
    });
  }

  toJSON(): { familyName: string; givenName: string; fullName: string } {
    return {
      familyName: this.familyName,
      givenName: this.givenName,
      fullName: this.fullName,
    };
  }
}
