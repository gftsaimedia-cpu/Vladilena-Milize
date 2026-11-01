'use strict';
// Họ tên người Việt: lưu họ (gồm tên đệm) trước, tên sau. Tên là chữ CUỐI, viết hoa chữ đầu từng chữ.
//   "Bùi Đăng Khoa"      → họ "Bùi Đăng",     tên "Khoa"
//   "Hồ thị khánh huyền" → họ "Hồ Thị Khánh", tên "Huyền"
// Họ tên chỉ một chữ thì họ rỗng. Lớp thuần: không đọc DB.
const SPACES = /\s+/u;
const LOCALE = 'vi';

const titleWord = (word?) => word.charAt(0).toLocaleUpperCase(LOCALE) + word.slice(1).toLocaleLowerCase(LOCALE);
const titleCase = (text?) =>
  String(text || '')
    .trim()
    .split(SPACES)
    .filter(Boolean)
    .map(titleWord)
    .join(' ');

class PersonName {
  declare familyName: any;
  declare givenName: any;

  constructor(familyName?, givenName?) {
    this.familyName = titleCase(familyName); // họ và tên đệm
    this.givenName = titleCase(givenName); // tên
  }

  // Tách một chuỗi họ tên đầy đủ
  static parse(fullName?) {
    const words = titleCase(fullName).split(' ').filter(Boolean);
    const givenName = words.pop() || '';
    return new PersonName(words.join(' '), givenName);
  }

  // Dựng từ họ, tên Admin nhập riêng; thiếu cả hai thì tách từ họ tên đầy đủ
  static from({ familyName, givenName, fullName }: any) {
    if ((familyName && String(familyName).trim()) || (givenName && String(givenName).trim()))
      return new PersonName(familyName, givenName);
    return PersonName.parse(fullName);
  }

  get fullName() {
    return [this.familyName, this.givenName].filter(Boolean).join(' ');
  }

  isEmpty() {
    return !this.givenName;
  }
}

export = { PersonName, titleCase };
