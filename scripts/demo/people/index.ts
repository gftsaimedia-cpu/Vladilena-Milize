// Danh sách mọi người trong DB demo, gộp từ file của từng mảng. Module thuần: test Playwright cũng import được.
// Mỗi mảng chỉ sửa file của mình (staff.ts, attendance.ts, requests.ts, payroll.ts); file này không cần sửa.
import { AREA_PREFIX, type DemoPerson, type PersonArea } from './types';
import { SMOKE } from './smoke';
import { STAFF } from './staff';
import { ATTENDANCE } from './attendance';
import { REQUESTS } from './requests';
import { PAYROLL } from './payroll';

export * from './types';

/** Ném lỗi nếu có username trùng, sai tiền tố của mảng, hoặc không viết thường. */
export function checkPeople(people: DemoPerson[]): void {
  const seen = new Set<string>();
  for (const p of people) {
    if (seen.has(p.username)) throw new Error(`Username trùng trong DB demo: ${p.username}`);
    seen.add(p.username);
    const prefix = AREA_PREFIX[p.area];
    if (!p.username.startsWith(prefix)) throw new Error(`${p.username} thuộc mảng ${p.area} nên phải có tiền tố '${prefix}'`);
    if (p.username !== p.username.toLowerCase()) throw new Error(`Username phải viết thường: ${p.username}`);
  }
}

export const PEOPLE: DemoPerson[] = [...SMOKE, ...STAFF, ...ATTENDANCE, ...REQUESTS, ...PAYROLL];
checkPeople(PEOPLE);

export const peopleOf = (areas: PersonArea[]): DemoPerson[] => PEOPLE.filter(p => areas.includes(p.area));

export function personNamed(username: string): DemoPerson {
  const found = PEOPLE.find(p => p.username === username);
  if (!found) throw new Error(`Không có ${username} trong scripts/demo/people`);
  return found;
}
