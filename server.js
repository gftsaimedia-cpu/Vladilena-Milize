// Lương Nhân Sự — web app tính lương tự phục vụ. Chạy: node server.js (Node.js >= 22.13, không cần npm install).
// Số luồng libuv phải đặt TRƯỚC khi có việc nền đầu tiên (băm mật khẩu, nén gzip); biến môi trường do người vận hành đặt thì giữ.
process.env.UV_THREADPOOL_SIZE = process.env.UV_THREADPOOL_SIZE || String(require('./lib/config').UV_THREADPOOL_SIZE);
require('./lib/register-ts'); // nạp TypeScript lúc chạy cho src/** (kiểm kiểu: npm run typecheck)
const { createServer } = require('./src/bootstrap');
const fs = require('node:fs');
const path = require('node:path');
// Nạp file .env (nếu có) vào biến môi trường, không ghi đè biến đã đặt sẵn.
try {
  for (const line of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined)
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch {}
const { cutRuleView } = require('./src/modules/sheet/sheet.helpers'); // sheet: hàm phụ đã chuyển sang module Nest
const { checkInDay, declaredDay, checkoutPreview } = require('./src/modules/attendance/attendance.helpers'); // attendance: hàm phụ đã chuyển sang module Nest
const store = require('./lib/db');
const auth = require('./lib/auth');
const { HttpError, send, readJson, securityHeaders, serveStatic, clientIp } = require('./lib/http'); // tiện ích HTTP: lỗi, gửi JSON, đọc thân, tiêu đề bảo mật, file tĩnh
const {
  requestRules,
  rulesFor,
  monthParams,
  typeParam,
  benefitOf,
  levelCountOf,
  vnToday,
  nowIso
} = require('./lib/request-rules'); // quy tắc theo tháng của từng yêu cầu: rulesFor(tháng).<mô-đun> dựng bằng create(bộ tham số của tháng đó)
// lượt gửi cho màn hình: kèm lượt bấm, yêu cầu điều chỉnh và status / statusNote
const domainRoutes = require('./lib/domain/routes'); // khối phụ cấp, khoản điền thêm, lịch theo loại nhân sự
const Roles = require('./lib/roles'); // vai trò tuỳ chỉnh (dữ liệu ở settings)
const config = require('./lib/config'); // giới hạn kỹ thuật có tên (không số trong mã)
const Positions = require('./lib/params/positions'); // chức vụ là dữ liệu: danh sách, quyền lợi, bảng quyền lợi
const events = require('./lib/events'); // báo cho màn đang mở (SSE), phát SAU KHI giao dịch đã COMMIT
const { attachAccessLog } = require('./lib/ops/access-log'); // nhật ký truy cập JSON + X-Request-Id
const { container } = require('./lib/domain/container'); // các lớp của lib/domain (danh mục ca, sổ phép, nhân viên theo uuid)
const { monitor, hashGate, writeLimiter, shedder } = require('./src/http/load-control'); // giới hạn tải dùng chung với cổng ApiGuard (src/http)
const warnings = require('./lib/warnings'); // cảnh báo thay cho chặn
const { warnIf, selfDecision } = warnings;


const PORT = Number(process.env.PORT || 3000);
// Hợp đồng mặc định của chức vụ mới đọc type.<mã>.defaultContract của tháng hiện tại (lỗi hoặc giá trị lạ thì db dùng mặc định của nó)
store.setDefaultContractResolver(async type => typeParam(await monthParams(), type, 'defaultContract'));
 // % đạt từng phần KPI; Tổng KPI = Σ % × trọng số (40/24/12/18/6) + Bonus



/* ---------- API ---------- */

// Bộ xử lý cũ cho route chưa chuyển sang module Nest (src/). Cổng quyền, giới hạn tải, giới hạn tốc độ ghi đã chạy ở src/http (ApiGuard).
async function api({ req, res, url, me, seg, route, policy, actx, need, needAdmin, guardPeriod }) {
  const routed = domainRoutes.handlerFor(seg); // quyền đã kiểm ở cổng ROUTE_CAPS ở trên
  if (routed) return await routed({ req, res, seg, url, me, actx });

      
  
    
    
                                /* ---------- vai trò (Cài đặt › Phân quyền) ---------- */
  // GET /roles và các route vai trò tuỳ chỉnh nằm ở lib/domain/roles.js (lib/roles.js); ở đây chỉ còn gán vai trò cho tài khoản
      throw new HttpError(404, 'Không có API này');
}

/* ---------- server ---------- */
Roles.reconcileStaffRole().catch(error => console.error('reconcileStaffRole:', error)); // tài khoản đã gán vai trò staff mà payrollSubject còn false thì bật (staff = nhân sự được trả lương)
// HTTP do Nest đảm nhận (src/): route đã chuyển module chạy ở đó, phần còn lại rơi về api() ở trên.
const server = createServer(api);
// Giữ kết nối 65 giây thay vì 5 giây mặc định của Node (xem lib/config.js → HTTP_KEEP_ALIVE_MS)
server.keepAliveTimeout = config.HTTP_KEEP_ALIVE_MS;
server.headersTimeout = config.HTTP_HEADERS_TIMEOUT_MS;
server.requestTimeout = config.HTTP_REQUEST_TIMEOUT_MS; // kẻ gửi chậm không giữ socket mãi (luồng SSE là phản hồi nên không bị tính)

if (require.main === module)
  (async () => {
  await auth.ready; // khoá ký phiên (đọc từ DB khi không đặt SESSION_SECRET)
  if ((await store.listStaff()).length === 0) {
    let boot;
    try {
      boot = auth.bootstrapAdminPassword();
    } catch (e) {
      console.error(e.message);
      process.exit(1);
    }
    await store.upsertStaff({
      username: 'admin',
      name: 'Admin',
      role: 'admin',
      type: Positions.defaultCode,
      level: 0,
      passHash: auth.hashPassword(boot.password)
    });
    // Không bao giờ in mật khẩu ra log
    console.log(
      boot.generated
        ? 'Đã tạo tài khoản admin với mật khẩu ngẫu nhiên (không hiển thị). Muốn đặt mật khẩu: xoá DB vừa tạo, đặt ADMIN_PASSWORD trong .env rồi chạy lại.'
        : 'Đã tạo tài khoản admin với mật khẩu lấy từ ADMIN_PASSWORD — hãy đổi mật khẩu sau khi đăng nhập.'
    );
  }
  const proxyWarning = auth.trustProxyWarning();
  if (proxyWarning) console.warn(proxyWarning);
  // Dọn bảng nhớ requestId của Check-in/out: một lần lúc khởi động rồi mỗi PUNCH_REQUEST_PURGE_MS.
  // Chỉ xoá bản ghi cũ hơn PUNCH_REQUEST_KEEP_DAYS ngày; .unref() để timer không giữ tiến trình sống. Chỉ chạy khi chạy thật
  // (require.main === module) nên test nạp server không sinh timer. Không in dữ liệu cá nhân, chỉ số dòng.
  const purgePunchRequests = async () => {
    try {
      const removed = await store.purgePunchRequests(config.PUNCH_REQUEST_KEEP_DAYS);
      console.log(`Dọn bảng nhớ lượt chấm công: đã xoá ${removed} dòng cũ hơn ${config.PUNCH_REQUEST_KEEP_DAYS} ngày`);
    } catch (e) {
      console.error('Không dọn được bảng nhớ lượt chấm công:', e.message);
    }
  };
  await purgePunchRequests();
  setInterval(purgePunchRequests, config.PUNCH_REQUEST_PURGE_MS).unref();
  // Số phép lưu sẵn: tính lại lúc khởi động rồi mỗi LEAVE_REFRESH_MS, để qua tháng làm việc tròn hay sinh nhật là DB tự cập nhật
  container.leave.start(config.LEAVE_REFRESH_MS);
  server.listen(PORT, () => console.log(`Lương Nhân Sự đang chạy tại http://localhost:${PORT}`));
  monitor.start();
  attachAccessLog(server, monitor);
  // Tắt êm: kết thúc các luồng báo tin (khách tự nối lại) rồi đóng máy chủ; không có bước này server.close() chờ luồng SSE mãi.
  // Hết kết nối thì đóng DB (SQLite gộp file WAL về file chính); quá SHUTDOWN_GRACE_MS thì thoát cưỡng bức.
  let closing = false;
  const shutdown = code => {
    if (closing) return;
    closing = true;
    events.closeAll();
    setTimeout(() => process.exit(code || 1), config.SHUTDOWN_GRACE_MS).unref();
    server.close(() => {
      try {
        store.db.close();
      } catch (error) {
        console.error('Không đóng được DB:', error.message);
      }
      process.exit(code);
    });
    server.closeAllConnections();
  };
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => shutdown(0));
  // Windows không có SIGTERM mềm (kill = giết ngay): tiến trình cha có kênh IPC (bộ đo tải, trình giám sát) gửi 'shutdown' để tắt êm
  if (process.send) process.on('message', message => message === 'shutdown' && shutdown(0));
  // Lỗi không ai bắt: ghi log rồi tắt êm với mã 1 để trình giám sát (docker restart, systemd) dựng lại tiến trình sạch.
  // Rejection không ai bắt chỉ ghi log: để Node tự thoát vì một lỗi phụ (báo tin SSE...) sẽ làm mất cả hệ thống.
  process.on('uncaughtException', error => {
    console.error('uncaughtException:', error);
    shutdown(1);
  });
  process.on('unhandledRejection', reason => console.error('unhandledRejection:', reason));
  })().catch(error => {
    console.error(error);
    process.exit(1);
  });
server.limits = { hashGate, writeLimiter, shedder, monitor }; // để test và vận hành chỉnh/đọc số liệu giới hạn tải
module.exports = server;
