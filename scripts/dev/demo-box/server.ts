import http from 'node:http';
import { createKysely, createPgPool } from '../../../src/database/kysely';
import { TransactionCoordinator } from '../../../src/database/transaction';
import { AttendanceDaysJob } from '../../../src/modules/attendance/attendance-days.job';
import { AttendanceDaysRepository } from '../../../src/modules/attendance/attendance-days.repository';
import { AttendanceDaysService } from '../../../src/modules/attendance/attendance-days.service';
import { SettingsAttendanceSettings } from '../../../src/modules/attendance/attendance-settings.port';
import { SettingsReader } from '../../../src/modules/settings/settings-reader';
import { SettingsRepository } from '../../../src/modules/settings/settings.repository';
import { restoreClock, setRunningClock } from '../seed-demo/harness';
import { seedDemo } from '../seed-demo/index';
import { PAGE } from './page';

// Hộp demo: BE thật + DB demo + đồng hồ giả chạy được, trên MỘT cổng. Đường /__box/* là bảng điều khiển (chỉ dùng trên máy dev);
// mọi đường khác chuyển nguyên vào app. Đặt lại dữ liệu = nạp lại kịch bản demo (về 06/11/2026 10:30).
const URL_DB = process.env.BOX_DB_URL ?? 'postgres://postgres@host.docker.internal:55480/luong_box';
const PORT = Number(process.env.PORT ?? 3001);
const START = '2026-11-06T10:30:00+07:00';

let app: http.Server | null = null;
let busy = 'đang nạp dữ liệu lần đầu';
let lastError = '';
let jobDb: ReturnType<typeof createKysely> | null = null;

// Vị trí giả cho nút Check-in / Check-out của nhân viên: hộp đứng trước app nên sửa toạ độ trong lượt chấm gửi lên.
// 'office' = trong văn phòng, 'far' = cách văn phòng khoảng 2 km, 'real' = giữ nguyên vị trí của trình duyệt.
const PLACES: Record<string, { lat: number; lng: number } | null> = {
  office: { lat: 10.8, lng: 106.7 },
  far: { lat: 10.818, lng: 106.7 },
  real: null
};
let where = 'office';

// Nạp lại DB làm các kết nối cũ của app bị cắt (mã 57P01): đó là việc dự kiến, không làm sập hộp.
process.on('uncaughtException', err => {
  if ((err as any)?.code === '57P01') return;
  console.error('Lỗi không bắt được:', err);
});

async function runDayJob(): Promise<void> {
  if (!app) return;
  jobDb ??= createKysely(createPgPool(URL_DB));
  const repo = new AttendanceDaysRepository(jobDb);
  const tx = new TransactionCoordinator(jobDb);
  const days = new AttendanceDaysService(repo, new SettingsAttendanceSettings(new SettingsReader(new SettingsRepository(jobDb))), tx);
  await new AttendanceDaysJob(repo, days, tx).runOnce(new Date());
}

async function reset(): Promise<void> {
  busy = 'đang nạp lại dữ liệu demo (khoảng 1 phút)';
  lastError = '';
  app = null;
  try {
    await jobDb?.destroy().catch(() => {});
    jobDb = null;
    const demo = await seedDemo(URL_DB, line => console.log(line));
    await demo.stop();
    setRunningClock(START);
    app = require('../../../src/bootstrap').createServer();
    await runDayJob();
    busy = '';
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
    busy = '';
    restoreClock();
    console.error(lastError);
  }
}

function json(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}
async function readBody(req: http.IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  try {
    return JSON.parse(Buffer.concat(chunks).toString() || '{}');
  } catch {
    return {};
  }
}

const server = http.createServer(async (req, res) => {
  const path = (req.url ?? '/').split('?')[0];
  if (!path.startsWith('/__box')) {
    if (!app) {
      res.writeHead(503, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'Hộp demo đang nạp dữ liệu, mở /__box để xem tiến độ' }));
      return;
    }
    const place = PLACES[where];
    if (place && req.method === 'POST' && path === '/api/v2/me/punches') {
      // Đọc thân rồi đặt sẵn req.body: express.json bỏ qua khi req._body đã đặt.
      const body = await readBody(req);
      (req as any).body = { ...body, lat: place.lat, lng: place.lng, accuracyM: 10 };
      (req as any)._body = true;
    }
    app.emit('request', req, res);
    return;
  }
  if (path === '/__box' || path === '/__box/') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(PAGE);
    return;
  }
  if (path === '/__box/state' && req.method === 'GET') {
    json(res, 200, { now: new Date().toISOString(), busy, error: lastError, where });
    return;
  }
  if (busy) return json(res, 409, { error: `Hộp đang bận: ${busy}` });
  if (path === '/__box/clock' && req.method === 'POST') {
    const body = await readBody(req);
    const ms = new Date(String(body.at)).getTime();
    if (Number.isNaN(ms)) return json(res, 400, { error: 'Thời điểm không hợp lệ' });
    setRunningClock(new Date(ms).toISOString());
    await runDayJob().catch(e => console.error('job ngày công:', e));
    return json(res, 200, { now: new Date().toISOString() });
  }
  if (path === '/__box/advance' && req.method === 'POST') {
    const body = await readBody(req);
    const minutes = Number(body.minutes);
    if (!Number.isFinite(minutes)) return json(res, 400, { error: 'Số phút không hợp lệ' });
    setRunningClock(new Date(Date.now() + minutes * 60000).toISOString());
    await runDayJob().catch(e => console.error('job ngày công:', e));
    return json(res, 200, { now: new Date().toISOString() });
  }
  if (path === '/__box/where' && req.method === 'POST') {
    const body = await readBody(req);
    if (!(body.mode in PLACES)) return json(res, 400, { error: 'Vị trí không có' });
    where = body.mode;
    return json(res, 200, { where });
  }
  if (path === '/__box/reset' && req.method === 'POST') {
    void reset();
    return json(res, 202, { started: true });
  }
  json(res, 404, { error: 'Không có lệnh này' });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Hộp demo chạy tại http://localhost:${PORT} (bảng điều khiển: /__box)`);
  void reset();
  // Đồng hồ giả trôi theo giờ thật; cập nhật ngày công mỗi phút.
  setInterval(() => void runDayJob().catch(() => {}), 60_000).unref();
});
