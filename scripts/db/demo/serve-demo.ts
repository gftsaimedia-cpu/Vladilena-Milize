'use strict';
// Chạy app thật trên bản khôi phục tạm từ snapshot demo PostgreSQL; database chỉ tồn tại trong thời gian server chạy.
//   npm run pg:backup -- backup --source="$DATABASE_URL" --dir=backups/demo
//   DEMO_PG_CONTROL_URL=postgres://… node scripts/db/demo/serve-demo.ts --snapshot=backups/demo/luong-....pgbak.gz
// Đăng nhập bằng demo_admin; mật khẩu DEMO_PASSWORD hoặc mật khẩu demo mặc định.
// Chỉ nghe 127.0.0.1. Snapshot nguồn không bị sửa; database do công cụ tạo sẽ được dọn sau SIGINT/SIGTERM.
const path = require('node:path');
const { demoInfo, withDemoSnapshot } = require('./demo-dir');
const S = require('./scenarios');

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

if (typeof args.snapshot !== 'string' || typeof args.db === 'string')
  fail('Cần --snapshot=<file.pgbak.gz>; tạo snapshot bằng scripts/ops/pg-backup.ts backup. --db đã bị gỡ.');
const port = args.port === undefined ? 3116 : Number(args.port);
if (!Number.isInteger(port) || port < 0 || port > 65535) fail('--port không hợp lệ');
const info = demoInfo(args.snapshot);
// demoInfo is asynchronous because it verifies the complete compressed snapshot.
Promise.resolve(info)
  .then(snapshotInfo => {
    if (!snapshotInfo.marked)
      fail('Từ chối chạy: --snapshot phải là file .pgbak.gz hợp lệ có dữ liệu demo (demo_dataset).');
    const today = typeof args.today === 'string' ? args.today : snapshotInfo.today;
    if (typeof today !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(today) || Number.isNaN(Date.parse(today)))
      fail('--today phải có dạng YYYY-MM-DD; snapshot phải có ngày demo hợp lệ.');
    process.env.SESSION_SECRET = process.env.SESSION_SECRET || `serve-demo-${Date.now()}`;
    process.env.COOKIE_SECURE = '0';
    return withDemoSnapshot(args.snapshot, async ({ setStopAction }) => {
      const server = require('../../../src/server');
      const realNow = Date.now;
      const offset = Date.parse(`${today}T${S.NOW_TIME}:00+07:00`) - realNow();
      Date.now = () => realNow() + offset;
      let shutdownRequested = false;
      let stopPromise: Promise<void> | null = null;
      let finish: () => void;
      const lifetime = new Promise<void>(resolve => (finish = resolve));
      const stopServer = (): Promise<void> => {
        shutdownRequested = true;
        if (!server.listening) return Promise.resolve();
        if (!stopPromise) {
          server.closeAllConnections();
          stopPromise = new Promise<void>(resolve =>
            server.close(() => {
              finish();
              resolve();
            })
          );
        }
        return stopPromise;
      };
      setStopAction(stopServer);
      try {
        await new Promise((resolve, reject) => {
          server.once('error', reject);
          server.listen(port, '127.0.0.1', resolve);
        });
        if (shutdownRequested) await stopServer();
        else {
          console.log(`Demo AiCB trên snapshot ${path.basename(args.snapshot)}`);
          console.log(`Địa chỉ  http://127.0.0.1:${server.address().port}   (chỉ máy này)`);
          console.log(`Đồng hồ  ${today} ${S.NOW_TIME} giờ Việt Nam, chạy tiếp theo giờ thật`);
          if (today !== snapshotInfo.today)
            console.log(
              `Cảnh báo: snapshot dựng cho ${snapshotInfo.today}; --today khác có thể làm lệch phiên tương lai.`
            );
          console.log('Tài khoản demo_admin (Admin); dừng bằng Ctrl+C để đóng và dọn database tạm.');
        }
        await lifetime;
      } finally {
        Date.now = realNow;
        await stopServer();
      }
    });
  })
  .then(() => {
    if (process.exitCode === undefined) process.exitCode = 0;
  })
  .catch(error => {
    console.error(String(error && error.message).replace(/\/\/[^@/\s]*@/g, '//***@'));
    process.exitCode = 1;
  });
