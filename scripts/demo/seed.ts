// Seed DB demo: tạo tài khoản và hợp đồng cho mọi người của các mảng được chọn (POST /api/v2/employees),
// rồi chạy seed của từng mảng theo thứ tự staff → attendance → requests → payroll.
// File này không cần sửa khi thêm người hay dữ liệu: mỗi mảng sửa scripts/demo/people/<mảng>.ts và scripts/demo/areas/<mảng>.ts.
import { addMonths, dateIn, type DemoMonths } from './dates';
import { AREAS, peopleOf, type Area, type DemoPerson } from './people/index';
import type { DemoApi, DemoSession } from './api';
import { seed as seedStaff } from './areas/staff';
import { seed as seedAttendance } from './areas/attendance';
import { seed as seedRequests } from './areas/requests';
import { seed as seedPayroll } from './areas/payroll';

export interface SeedContext {
  /** Đăng nhập như một người khác: `await ctx.api.as('cc-binh')`. */
  api: DemoApi;
  /** Phiên admin đã đăng nhập. */
  admin: DemoSession;
  /** Hôm nay và ba tháng của DB demo, theo giờ Việt Nam. */
  months: DemoMonths;
  /** Người của mảng này (đã có tài khoản và hợp đồng). */
  people: DemoPerson[];
  log: (message: string) => void;
}

export type AreaSeeder = (ctx: SeedContext) => Promise<void>;

const SEEDERS: Record<Area, AreaSeeder> = {
  staff: seedStaff,
  attendance: seedAttendance,
  requests: seedRequests,
  payroll: seedPayroll
};

/** Ngày vào làm của một người, theo `start` trong danh sách người. */
export const startDateOf = (p: DemoPerson, months: DemoMonths): string => dateIn(addMonths(months.m0, p.start.monthOffset), p.start.day);

export function employeeBody(p: DemoPerson, months: DemoMonths, password: string): Record<string, unknown> {
  return {
    username: p.username,
    password,
    // BE đọc họ tên ở profile.name (employees.service.ts buildEmployeeFromInput); profile.familyName bị bỏ qua.
    profile: { name: { familyName: p.familyName, givenName: p.givenName } },
    account: { username: p.username, roles: ['staff'] },
    contract: { ...p.contract, effectiveFrom: startDateOf(p, months) },
    ...p.extra
  };
}

export interface SeedOptions {
  api: DemoApi;
  adminUser: string;
  staffPassword: string;
  areas: Area[];
  months: DemoMonths;
  log: (message: string) => void;
  /** true: mảng nào lỗi thì ghi lại rồi seed tiếp mảng sau (dựng DB demo). false: ném lỗi ngay (chạy test). */
  keepGoing: boolean;
}

/** Trả về danh sách mảng bị lỗi (chỉ khác rỗng khi keepGoing). */
export async function seed(o: SeedOptions): Promise<Array<{ area: Area; error: unknown }>> {
  const admin = await o.api.as(o.adminUser);
  const people = peopleOf(['smoke', ...o.areas]);
  for (const p of people) await admin.post('/employees', employeeBody(p, o.months, o.staffPassword));
  o.log(`đã tạo ${people.length} người (${['smoke', ...o.areas].join(', ')})`);

  const failed: Array<{ area: Area; error: unknown }> = [];
  for (const area of AREAS.filter(a => o.areas.includes(a))) {
    const log = (m: string) => o.log(`[${area}] ${m}`);
    log('bắt đầu seed');
    try {
      await SEEDERS[area]({ api: o.api, admin, months: o.months, people: peopleOf([area]), log });
    } catch (error) {
      if (!o.keepGoing) throw error;
      log(`LỖI, bỏ qua mảng này: ${error instanceof Error ? error.message : String(error)}`);
      failed.push({ area, error });
    }
  }
  return failed;
}
