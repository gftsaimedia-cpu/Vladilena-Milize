// Seed của mảng 'requests' (spec docs/superpowers/specs/2026-11-05-demo-db-e2e-design.md mục 6). Chỉ phiên requests sửa file này.
// Lúc hàm chạy, mọi người trong scripts/demo/people/requests.ts đã có tài khoản và hợp đồng (POST /api/v2/employees).
// Gọi API như admin qua ctx.admin, hoặc như nhân viên qua `await ctx.api.as(username)`. Ngày lấy từ ctx.months
// (hôm nay, m0, m1, m2 theo giờ Việt Nam), không viết cứng. Chỉ ghi SQL thẳng khi không có route nào làm được,
// và ghi rõ chỗ đó trong docs/demo-db/requests.md.
import type { SeedContext } from '../seed';

export async function seed(ctx: SeedContext): Promise<void> {
  void ctx;
}
