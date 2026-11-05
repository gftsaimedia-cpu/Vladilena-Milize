// Người của phần nền: chỉ để thử đăng nhập (web/tests/api/demo-smoke.spec.ts). Không mảng nào sửa dữ liệu của họ.
import type { DemoPerson } from './types';

export const SMOKE: DemoPerson[] = [
  {
    username: 'smoke-mau',
    familyName: 'Trần Thị',
    givenName: 'Mẫu',
    area: 'smoke',
    start: { monthOffset: -2, day: 1 },
    contract: { status: 'nv', position: { type: 'nv', level: 1 } },
    note: 'Nhân viên mẫu của phần nền: đăng nhập được vào app nhân viên.'
  }
];
