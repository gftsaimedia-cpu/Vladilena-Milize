import type http from 'node:http';
const store = require('./platform/db');
import auth = require('./platform/auth');
import config = require('./platform/config');
import events = require('./platform/events');
import Positions = require('./params/positions');
import { attachAccessLog } from './ops/access-log';
import { container } from './domain/container';
import { monitor } from './http/load-control';

/** Tài khoản admin đầu tiên khi DB còn trống (mật khẩu từ ADMIN_PASSWORD hoặc sinh ngẫu nhiên, không bao giờ in ra log). */
async function ensureFirstAdmin(): Promise<void> {
  if ((await store.listStaff()).length > 0) return;
  let boot;
  try {
    boot = auth.bootstrapAdminPassword();
  } catch (e) {
    console.error((e as Error).message);
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
  console.log(
    boot.generated
      ? 'Đã tạo tài khoản admin với mật khẩu ngẫu nhiên (không hiển thị). Muốn đặt mật khẩu: xoá DB vừa tạo, đặt ADMIN_PASSWORD trong .env rồi chạy lại.'
      : 'Đã tạo tài khoản admin với mật khẩu lấy từ ADMIN_PASSWORD — hãy đổi mật khẩu sau khi đăng nhập.'
  );
}

/**
 * Dọn bảng nhớ requestId của Check-in/out: một lần lúc khởi động rồi mỗi PUNCH_REQUEST_PURGE_MS.
 * Chỉ xoá bản ghi cũ hơn PUNCH_REQUEST_KEEP_DAYS ngày; .unref() để timer không giữ tiến trình sống. Chỉ chạy khi chạy thật nên test nạp server
 * không sinh timer. Không in dữ liệu cá nhân, chỉ số dòng.
 */
async function schedulePunchRequestPurge(): Promise<void> {
  const purge = async () => {
    try {
      const removed = await store.purgePunchRequests(config.PUNCH_REQUEST_KEEP_DAYS);
      console.log(`Dọn bảng nhớ lượt chấm công: đã xoá ${removed} dòng cũ hơn ${config.PUNCH_REQUEST_KEEP_DAYS} ngày`);
    } catch (e) {
      console.error('Không dọn được bảng nhớ lượt chấm công:', (e as Error).message);
    }
  };
  await purge();
  setInterval(purge, config.PUNCH_REQUEST_PURGE_MS).unref();
}

/**
 * Tắt êm: kết thúc các luồng báo tin (khách tự nối lại) rồi đóng máy chủ; không có bước này server.close() chờ luồng SSE mãi.
 * Hết kết nối thì đóng DB (SQLite gộp file WAL về file chính); quá SHUTDOWN_GRACE_MS thì thoát cưỡng bức.
 */
function installShutdown(server: http.Server): void {
  let closing = false;
  const shutdown = (code: number) => {
    if (closing) return;
    closing = true;
    events.closeAll();
    setTimeout(() => process.exit(code || 1), config.SHUTDOWN_GRACE_MS).unref();
    server.close(() => {
      try {
        store.db.close();
      } catch (error) {
        console.error('Không đóng được DB:', (error as Error).message);
      }
      process.exit(code);
    });
    server.closeAllConnections();
  };
  for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, () => shutdown(0));
  // Windows không có SIGTERM mềm (kill = giết ngay): tiến trình cha có kênh IPC (bộ đo tải, trình giám sát) gửi 'shutdown' để tắt êm
  if (process.send) process.on('message', message => message === 'shutdown' && shutdown(0));
  // Lỗi không ai bắt: ghi log rồi tắt êm với mã 1 để trình giám sát (docker restart, systemd) dựng lại tiến trình sạch.
  // Rejection không ai bắt chỉ ghi log: để Node tự thoát vì một lỗi phụ (báo tin SSE...) sẽ làm mất cả hệ thống.
  process.on('uncaughtException', error => {
    console.error('uncaughtException:', error);
    shutdown(1);
  });
  process.on('unhandledRejection', reason => console.error('unhandledRejection:', reason));
}

/** Chạy thật (node server.js): khởi tạo dữ liệu, hẹn giờ dọn dẹp, mở cổng. */
export async function start(server: http.Server): Promise<void> {
  const port = Number(process.env.PORT || 3000);
  await auth.ready; // khoá ký phiên (đọc từ DB khi không đặt SESSION_SECRET)
  await ensureFirstAdmin();
  const proxyWarning = auth.trustProxyWarning();
  if (proxyWarning) console.warn(proxyWarning);
  await schedulePunchRequestPurge();
  // Số phép lưu sẵn: tính lại lúc khởi động rồi mỗi LEAVE_REFRESH_MS, để qua tháng làm việc tròn hay sinh nhật là DB tự cập nhật
  container.leave.start(config.LEAVE_REFRESH_MS);
  server.listen(port, () => console.log(`Lương Nhân Sự đang chạy tại http://localhost:${port}`));
  monitor.start();
  attachAccessLog(server, monitor);
  installShutdown(server);
}
