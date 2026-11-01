'use strict';
// Chạy app thật trên MỘT BẢN SAO của DB demo, đồng hồ giả chạy tiếp từ đúng "bây giờ" của dữ liệu demo: ngày `today` ghi ở khoá demo_dataset (lúc dựng,
// mặc định 26/11/2026) vào giờ S.NOW_TIME (tháng 10 đã kết thúc nên chốt công được, và còn đủ khoản chờ duyệt, phiếu cờ AI, phiếu lỗi).
// Không còn ngày gõ cứng: dữ liệu không có phiên hay lượt bấm nào sau mốc này, nên nhân sự demo bấm Check-out là đóng đúng phiên của hôm nay. Dùng để thử màn Admin Lương trên dữ liệu có đủ ca, thay cho
// sandbox (dev/sandbox-server.cjs luôn dùng DB trong RAM với 6 tài khoản qa_*, không có phát hiện AI hay phiếu lỗi).
//   npm run seed:demo
//   node scripts/db/demo/serve-demo.js [--db=data/demo] [--port=3116] [--today=YYYY-MM-DD]
// Đăng nhập bằng tài khoản demo (demo_admin là Admin); mật khẩu: biến DEMO_PASSWORD, nếu bỏ trống thì mật khẩu mặc định ghi ở scripts/db/seed-demo.js.
// AN TOÀN: không bao giờ mở data/luong.sqlite (từ chối theo đường dẫn và theo tên file), chỉ nhận DB demo (khoá demo_dataset) và chỉ nghe ở
// 127.0.0.1. Mọi thao tác ghi vào bản sao trong thư mục tạm, xoá khi dừng (Ctrl+C); DB demo gốc không bị đổi. Dùng DB sạch lần sau = chạy lại script.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { demoInfo, copyDemo } = require('./demo-dir');
const S = require('./scenarios.js');

const ROOT = path.join(__dirname, '..', '..', '..');
const args = Object.fromEntries(
  process.argv.slice(2).map(a => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v === undefined ? true : v];
  })
);
const fail = message => {
  console.error(message);
  process.exit(1);
};
const canonical = file => {
  const full = path.resolve(file);
  let real = full;
  try {
    real = path.join(fs.realpathSync.native(path.dirname(full)), path.basename(full));
  } catch {}
  return process.platform === 'win32' || process.platform === 'darwin' ? real.toLowerCase() : real;
};
const source = typeof args.db === 'string' ? args.db : path.join(ROOT, 'data', 'demo');
if (path.basename(path.resolve(source)).toLowerCase() === 'luong')
  fail('Từ chối chạy: đường dẫn trông như DB lương thật.');
if (!fs.existsSync(source)) fail(`Không thấy ${source}. Dựng trước bằng: npm run seed:demo`);
// Ngày "hôm nay" mà dữ liệu giả định, ghi lúc dựng ở khoá demo_dataset
const info = demoInfo(source);
if (!info.marked) fail('Từ chối chạy: thư mục không phải DB demo (thiếu khoá demo_dataset).');
const datasetToday = info.today;
const port = args.port === undefined ? 3116 : Number(args.port);
if (!Number.isInteger(port) || port < 0 || port > 65535) fail('--port không hợp lệ');
const today = typeof args.today === 'string' ? args.today : datasetToday;
if (typeof today !== 'string')
  fail('DB demo chưa ghi ngày "hôm nay" (dựng dở?). Dựng lại bằng: npm run seed:demo, hoặc truyền --today=YYYY-MM-DD');
if (!/^\d{4}-\d{2}-\d{2}$/.test(today) || Number.isNaN(Date.parse(today))) fail('--today phải có dạng YYYY-MM-DD');

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'aicb-serve-demo-'));
const copy = path.join(work, 'copy');
copyDemo(source, copy);
process.env.DB_PATH = copy;
process.env.SESSION_SECRET = process.env.SESSION_SECRET || `serve-demo-${Date.now()}`;
process.env.COOKIE_SECURE = '0'; // chạy http://127.0.0.1, không có https
const server = require('../../../src/server');

// Đồng hồ giả chạy tiếp theo giờ thật từ S.NOW_TIME (giờ Việt Nam) của ngày today, cùng mốc mà generate.js dựng dữ liệu
const realNow = Date.now;
const offset = Date.parse(`${today}T${S.NOW_TIME}:00+07:00`) - realNow();
Date.now = () => realNow() + offset;

const cleanup = () => {
  try {
    server.closeAllConnections();
    server.close();
    require('../../../lib/db').db.close();
  } catch {}
  fs.rmSync(work, { recursive: true, force: true });
  process.exit(0);
};
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
server.listen(port, '127.0.0.1', () => {
  console.log(`Demo AiCB trên bản sao của ${path.relative(ROOT, path.resolve(source)) || source}`);
  console.log(`Địa chỉ  http://127.0.0.1:${server.address().port}   (chỉ máy này)`);
  console.log(`Đồng hồ  ${today} ${S.NOW_TIME} giờ Việt Nam, chạy tiếp theo giờ thật`);
  if (today !== datasetToday)
    console.log(
      `Cảnh báo: dữ liệu demo dựng cho ${datasetToday}; --today khác nên có phiên, lượt bấm nằm sau đồng hồ (Check-out có thể đóng nhầm phiên tương lai).`
    );
  console.log('Tài khoản demo_admin (Admin); các tài khoản demo_* khác là nhân sự. Dừng bằng Ctrl+C: bản sao bị xoá.');
});
