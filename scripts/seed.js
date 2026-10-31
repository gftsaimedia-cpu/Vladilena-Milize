// Tạo dữ liệu mẫu để xem thử: DB_PATH=./data/dev.sqlite npm run seed  (an toàn chạy lại; chỉ thêm tài khoản chưa có)
// Phải kiểm đường dẫn TRƯỚC khi nạp lib/db: nạp lib/db là mở và nâng cấp luôn file DB.
const fs = require('node:fs');
const path = require('node:path');
// Seed chỉ đọc biến môi trường (không đọc .env như npm start). So sánh đường dẫn đã giải thành tuyệt đối, kể cả liên kết tượng trưng,
// để ./data/../data/luong.sqlite hay đường dẫn tuyệt đối cũng bị chặn.
const canonical = file => {
  const full = path.resolve(file);
  let real = full;
  try {
    // Giải liên kết ở thư mục chứa file (file có thể chưa tồn tại)
    real = path.join(fs.realpathSync.native(path.dirname(full)), path.basename(full));
  } catch {}
  return process.platform === 'win32' || process.platform === 'darwin' ? real.toLowerCase() : real;
};
const realDb = canonical(path.join(__dirname, '..', 'data', 'luong.sqlite'));
if (!process.env.DB_PATH) {
  console.error(
    'Chưa đặt DB_PATH. npm run seed không đọc file .env, chỉ nhận biến môi trường.\n' +
      "  bash: DB_PATH=./data/dev.sqlite npm run seed   PowerShell: $env:DB_PATH='./data/dev.sqlite'; npm run seed"
  );
  process.exit(1);
}
if (canonical(process.env.DB_PATH) === realDb && process.env.SEED_ALLOW_REAL_DB !== '1') {
  console.error(
    'Từ chối chạy: DB_PATH đang trỏ vào DB thật (data/luong.sqlite). Seed thêm tài khoản mật khẩu mẫu, không được chạy trên dữ liệu thật.\n' +
      'Dùng DB thử, ví dụ DB_PATH=./data/dev.sqlite npm run seed. Chỉ khi chắc chắn mới đặt thêm SEED_ALLOW_REAL_DB=1.'
  );
  process.exit(1);
}
const store = require('../lib/db');
const auth = require('../lib/auth');

const now = new Date(),
  y = now.getFullYear(),
  m = now.getMonth() + 1;
const mk = `${y}-${String(m).padStart(2, '0')}`;
const iso = d => `${mk}-${String(d).padStart(2, '0')}`;
const dow = d => new Date(y, m - 1, d).getDay();
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

function sampleDays(type) {
  const days = {};
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
    if (store.getStaff(s.username)) continue;
    store.upsertStaff({
      ...s,
      passHash: auth.hashPassword(s.username === 'admin' ? process.env.ADMIN_PASSWORD || 'admin123' : PASSWORD)
    });
    if (s.role !== 'admin') {
      const days = sampleDays(s.type);
      store.setSheet(s.username, mk, days, s.type === 'tts' ? null : 85);
      // Seed ghi thẳng vào DB nên các khoản tự khai (iSAT...) mặc định chờ duyệt; duyệt sẵn để bản mẫu có số ngay.
      store.approvals.reconcile(s.username, mk, store.approvals.declaredItems(days));
      const pending = store.approvals.list({ username: s.username, month: mk, status: 'pending' });
      if (pending.length) store.approvals.decide(pending, 'approved', 'system');
    }
    added++;
  }
  if (!store.getSetting('holidays', null)) {
    // 24/11 (Ngày Văn hóa Việt Nam) là ngày nghỉ hưởng lương từ 01/7/2026 — NQ 28/2026/QH16; Tết Âm lịch, Giỗ Tổ đổi ngày theo năm, Admin tự thêm
    store.setSetting('holidays', [
      `${y}-01-01`,
      `${y}-04-30`,
      `${y}-05-01`,
      `${y}-09-02`,
      ...(y >= 2026 ? [`${y}-11-24`] : [])
    ]);
  }
  console.log(
    `Đã thêm ${added} tài khoản mẫu cho tháng ${mk}. Mật khẩu nhân sự mẫu: ${PASSWORD}; admin: ${process.env.ADMIN_PASSWORD || 'admin123'}`
  );
})().catch(error => {
  console.error(error);
  process.exit(1);
});
