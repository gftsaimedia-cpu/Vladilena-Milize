// Seed của mảng 'staff' (spec docs/superpowers/specs/2026-11-05-demo-db-e2e-design.md mục 6). Chỉ phiên staff sửa file này.
// Lúc hàm chạy, mọi người trong scripts/demo/people/staff.ts đã có tài khoản và hợp đồng (POST /api/v2/employees).
// Gọi API như admin qua ctx.admin, hoặc như nhân viên qua `await ctx.api.as(username)`. Ngày lấy từ ctx.months
// (hôm nay, m0, m1, m2 theo giờ Việt Nam), không viết cứng. Chỉ ghi SQL thẳng khi không có route nào làm được,
// và ghi rõ chỗ đó trong docs/demo-db/staff.md. Mảng này không ghi SQL thẳng.
import type { SeedContext } from '../seed';

export async function seed(ctx: SeedContext): Promise<void> {
  const { admin, log } = ctx;

  // ns-giang nghỉ việc: route nghỉ việc của Admin (khoá tài khoản, ghi ngày nghỉ việc).
  await admin.del('/employees/ns-giang');
  log('ns-giang: đã cho nghỉ việc (DELETE /employees/ns-giang)');

  // ns-khoa bị khoá tài khoản: như nút "Khoá" ở Cài đặt › Phân quyền › Tài khoản.
  await admin.put('/employees/ns-khoa', { account: { isLocked: true } });
  log('ns-khoa: đã khoá tài khoản (PUT /employees/ns-khoa)');

  // Kiểm lại: mọi người của mảng đọc được qua GET /employees/:username.
  for (const p of ctx.people) await admin.get(`/employees/${p.username}`);
  log(`đọc lại ${ctx.people.length} hồ sơ`);
}
