import { hashPassword } from '../../../src/modules/employees/employees.service';
import { ADMIN, Demo, PASSWORD, must, setClock } from './harness';

export interface Person {
  username: string;
  name: string;
  /** contract.status: nv | tts | ctv | thuviec ... */
  status: string;
  type: string;
  level: number;
  dept: string | null;
  shiftType: 'NORMAL' | 'FLEX' | 'NIGHT';
  start: string;
  end: string;
  /** Ngày vào làm (effectiveFrom). */
  from: string;
  /** Có mật khẩu (đã kích hoạt) hay chưa. */
  activated?: boolean;
}

const N = { shiftType: 'NORMAL' as const, start: '08:00', end: '17:00' };
export const PEOPLE: Person[] = [
  { username: 'an', name: 'Nguyễn Văn An', status: 'nv', type: 'nv', level: 2, dept: 'Phòng ban 1', ...N, from: '2026-01-05' },
  { username: 'binh', name: 'Trần Thị Bình', status: 'nv', type: 'nv', level: 1, dept: 'Phòng ban 1', ...N, from: '2026-01-05' },
  { username: 'chi', name: 'Lê Thu Chi', status: 'nv', type: 'nv', level: 3, dept: 'Phòng ban 2', shiftType: 'FLEX', start: '06:00', end: '15:00', from: '2026-01-05' },
  { username: 'dung', name: 'Phạm Văn Dũng', status: 'nv', type: 'nv', level: 2, dept: 'Phòng ban 2', shiftType: 'NIGHT', start: '22:00', end: '07:00', from: '2026-01-05' },
  { username: 'em', name: 'Hoàng Thị Em', status: 'tts', type: 'tts', level: 1, dept: 'Phòng ban 1', ...N, from: '2026-03-02' },
  { username: 'phuc', name: 'Đặng Văn Phúc', status: 'nv', type: 'nv', level: 1, dept: 'Phòng ban 1', ...N, from: '2026-01-05' },
  { username: 'giang', name: 'Vũ Hương Giang', status: 'nv', type: 'nv', level: 2, dept: 'Phòng ban 2', ...N, from: '2026-01-05' },
  { username: 'hanh', name: 'Bùi Thị Hạnh', status: 'nv', type: 'nv', level: 2, dept: 'Phòng ban 1', ...N, from: '2026-01-05' },
  { username: 'khoa', name: 'Phan Minh Khoa', status: 'thuviec', type: 'nv', level: 1, dept: 'Phòng ban 2', ...N, from: '2026-09-15' },
  { username: 'lan', name: 'Đỗ Mai Lan', status: 'nv', type: 'nv', level: 2, dept: 'Phòng ban 1', ...N, from: '2026-01-05' },
  { username: 'minh', name: 'Ngô Quốc Minh', status: 'nv', type: 'nv', level: 1, dept: 'Phòng ban 2', ...N, from: '2026-01-05' },
  { username: 'nam', name: 'Trịnh Văn Nam', status: 'ctv', type: 'ctv', level: 1, dept: 'Phòng ban 2', ...N, from: '2026-02-02' },
  { username: 'oanh', name: 'Lý Kim Oanh', status: 'nv', type: 'nv', level: 1, dept: null, ...N, from: '2026-09-21', activated: false }
];

/** Admin `boss` là dòng duy nhất ghi thẳng vào bảng (gốc của mọi thao tác sau, giống ensureFirstAdmin). */
export async function createAdmin(demo: Demo): Promise<void> {
  await demo.db.query(
    `INSERT INTO staff (username, name, role, type, level, pass_hash, created_at, uuid, start_date)
     VALUES ($1, 'Quản trị demo', 'admin', 'nv', 1, $2, '2026-01-01T00:00:00Z', gen_random_uuid(), '2026-01-01')`,
    [ADMIN, hashPassword(PASSWORD)]
  );
}

export async function createPerson(demo: Demo, p: Person, deptIds: Map<string, number>): Promise<void> {
  const body: any = {
    username: p.username,
    name: p.name,
    role: 'staff',
    type: p.type,
    level: p.level,
    shiftType: p.shiftType,
    shiftStartTime: p.start,
    shiftEndTime: p.end,
    contract: { status: p.status, effectiveFrom: p.from },
    leaveTotalDays: 12,
    departmentId: p.dept ? deptIds.get(p.dept) : null
  };
  if (p.activated !== false) body.password = PASSWORD;
  const out = must(await demo.admin.post('/api/v2/employees', body), `tạo ${p.username}`);
  demo.uuids.set(p.username, out.employee.profile.uuid);
}

export { setClock };
