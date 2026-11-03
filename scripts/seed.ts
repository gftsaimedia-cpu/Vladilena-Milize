// Kiểm cấu hình và cờ xác nhận TRƯỚC khi nạp src/platform/db: import này mở DB và chạy migration.
// npm run seed không đọc .env; chỉ dùng biến môi trường của tiến trình.
const databaseUrl = process.env.DATABASE_URL || '';
if ((process.env.DB_PATH || '').trim()) {
  console.error('Từ chối chạy: DB_PATH đã bị gỡ; hãy chọn PostgreSQL bằng DATABASE_URL.');
  process.exit(1);
}
if ((process.env.PG_TEST_URL || '').trim()) {
  console.error('Từ chối chạy: PG_TEST_URL dành riêng cho test; hãy dùng DATABASE_URL cho seed.');
  process.exit(1);
}
if (!databaseUrl.trim()) {
  console.error('Chưa chọn database. Đặt DATABASE_URL trỏ tới database PostgreSQL dành riêng cho dữ liệu mẫu.');
  process.exit(1);
}
let parsedDatabaseUrl: URL;
try {
  parsedDatabaseUrl = new URL(databaseUrl);
} catch {
  console.error('DATABASE_URL phải là URL PostgreSQL hợp lệ; giá trị không được hiển thị.');
  process.exit(1);
}
if (
  (parsedDatabaseUrl.protocol !== 'postgres:' && parsedDatabaseUrl.protocol !== 'postgresql:') ||
  !parsedDatabaseUrl.hostname ||
  !parsedDatabaseUrl.pathname ||
  parsedDatabaseUrl.pathname === '/'
) {
  console.error('DATABASE_URL phải là URL PostgreSQL hợp lệ có máy chủ và tên database.');
  process.exit(1);
}
if (process.env.SEED_ALLOW_REAL_DB !== '1') {
  console.error(
    'Từ chối chạy: seed ghi dữ liệu mẫu vào database PostgreSQL đã chọn. Chỉ chạy trên database thử riêng sau khi đặt SEED_ALLOW_REAL_DB=1.'
  );
  process.exit(1);
}
const store = require('../src/platform/db');
const auth = require('../src/platform/auth');

const now = new Date(),
  y = now.getFullYear(),
  m = now.getMonth() + 1;
const mk = `${y}-${String(m).padStart(2, '0')}`;
const iso = (d?) => `${mk}-${String(d).padStart(2, '0')}`;
const dow = (d?) => new Date(y, m - 1, d).getDay();
const daysIn = new Date(y, m, 0).getDate();

const SAMPLE = [
  { username: 'admin', name: 'Admin', role: 'admin', type: 'tts', level: 0 },
  { username: 'minhanh', name: 'Nguyễn Minh Anh', role: 'staff', type: 'tts', level: 3, shiftCode: 'n1' },
  { username: 'quocbao', name: 'Trần Quốc Bảo', role: 'staff', type: 'tts', level: 1, shiftCode: 'f1' },
  { username: 'thuha', name: 'Lê Thu Hà', role: 'staff', type: 'ctv', level: 2, shiftCode: 'n2' },
  {
    username: 'giahuy',
    name: 'Phạm Gia Huy',
    role: 'staff',
    type: 'nv',
    level: 1,
    nightPct: 60,
    idorm: false,
    shiftCode: 'g2'
  },
  {
    username: 'ngoclinh',
    name: 'Võ Ngọc Linh',
    role: 'staff',
    type: 'nv',
    level: 3,
    nightPct: 40,
    idorm: true,
    shiftCode: 'f2'
  }
];
const PASSWORD = process.env.SEED_PASSWORD || '123456';

function sampleDays(type?) {
  const days: Record<string, any> = {};
  const sched = type === 'tts' ? [1, 2, 3, 4, 5] : [1, 2, 3, 4, 5, 6];
  let i = 0;
  for (let d = 1; d <= Math.min(daysIn, now.getDate()); d++) {
    if (!sched.includes(dow(d))) continue;
    i++;
    if (type !== 'tts' && i === 4) {
      days[iso(d)] = { kind: 'leave' };
      continue;
    }
    if (type !== 'tts' && i === 9) {
      days[iso(d)] = { kind: 'unpaid' };
      continue;
    }
    if (type === 'nv' && dow(d) === 6 && i > 10) {
      days[iso(d)] = { kind: 'isat' };
      continue;
    }
    if (i % 7 === 0) days[iso(d)] = { kind: 'work', shift: 'night', in: '22:00', out: '06:00', breakMin: 0 };
    else if (i % 5 === 0) days[iso(d)] = { kind: 'work', shift: 'flex', in: '06:00', out: '14:00', breakMin: 30 };
    else
      days[iso(d)] = { kind: 'work', shift: 'normal', in: i % 3 === 0 ? '08:45' : '08:30', out: '17:30', breakMin: 0 };
  }
  return days;
}

(async () => {
  let added = 0;
  for (const s of SAMPLE) {
    if (await store.getStaff(s.username)) continue;
    await store.upsertStaff({
      ...s,
      passHash: auth.hashPassword(s.username === 'admin' ? process.env.ADMIN_PASSWORD || 'admin123' : PASSWORD)
    });
    if (s.role !== 'admin') {
      const days = sampleDays(s.type);
      await store.setSheet(s.username, mk, days, s.type === 'tts' ? null : 85);
      // Seed ghi thẳng vào DB nên các khoản tự khai (iSAT...) mặc định chờ duyệt; duyệt sẵn để bản mẫu có số ngay.
      await store.approvals.reconcile(s.username, mk, store.approvals.declaredItems(days));
      const pending = await store.approvals.list({ username: s.username, month: mk, status: 'pending' });
      if (pending.length) await store.approvals.decide(pending, 'approved', 'system');
    }
    added++;
  }
  if (!(await store.getSetting('holidays', null))) {
    // 24/11 (Ngày Văn hóa Việt Nam) là ngày nghỉ hưởng lương từ 01/7/2026 — NQ 28/2026/QH16; Tết Âm lịch, Giỗ Tổ đổi ngày theo năm, Admin tự thêm
    await store.setSetting('holidays', [
      `${y}-01-01`,
      `${y}-04-30`,
      `${y}-05-01`,
      `${y}-09-02`,
      ...(y >= 2026 ? [`${y}-11-24`] : [])
    ]);
  }
  console.log(`Đã thêm ${added} tài khoản mẫu cho tháng ${mk}.`);
})().catch(error => {
  console.error(error);
  process.exit(1);
});
