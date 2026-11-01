'use strict';
// Nạp người dùng giả cho bộ đo tải. Dùng chung cho chế độ tự dựng DB tạm (run.js) và cho sandbox (nạp vào DB trong RAM).
// Mọi người dùng chung MỘT chuỗi băm mật khẩu: băm scrypt từng người mất ~60 ms, 300 người là 18 giây vô ích.
const pad = (n?, width = 4) => String(n).padStart(width, '0');
const userName = (prefix?, i?) => `${prefix}${pad(i)}`;
const ADMIN_NAME = 'lt_admin';
const DEFAULT_PREFIX = 'lt_';

// store: src/platform/db, passHash: chuỗi băm đã tính sẵn. Trả { users: [tên...], admin }.
async function seedLoadUsers(store, { count, passHash, prefix = DEFAULT_PREFIX }: any) {
  const users: any[] = [];
  await store.transaction(async () => {
    await store.upsertStaff({
      username: ADMIN_NAME,
      name: 'Admin đo tải',
      role: 'admin',
      type: 'tts',
      level: 0,
      passHash
    });
    for (let i = 1; i <= count; i++) {
      const username = userName(prefix, i);
      users.push(username);
      await store.upsertStaff({
        username,
        name: `Người đo tải ${pad(i)}`,
        role: 'staff',
        type: 'nv',
        level: 1,
        nightPct: 40,
        shiftCode: 'n1',
        startDate: '2026-01-05',
        passHash
      });
    }
  });
  return { users, admin: ADMIN_NAME };
}

module.exports = { seedLoadUsers, userName, ADMIN_NAME, DEFAULT_PREFIX };
