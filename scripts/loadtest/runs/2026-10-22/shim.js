'use strict';
// Nạp bằng node -r: (1) dịch Date.now tới SHIM_NOW (đồng hồ vẫn chạy), chỉ ghi đè Date.now (server chỉ đọc giờ qua Date.now);
// (2) ghi mỗi 500 ms RSS, CPU, độ trễ vòng lặp sự kiện ra MON_FILE.
const fs = require('node:fs');
const { monitorEventLoopDelay } = require('node:perf_hooks');
if (process.env.SHIM_NOW) {
  const off = Date.parse(process.env.SHIM_NOW) - Date.now();
  const real = Date.now;
  Date.now = () => real() + off;
}
if (process.env.MON_FILE) {
  const h = monitorEventLoopDelay({ resolution: 5 });
  h.enable();
  let last = process.cpuUsage(),
    lastT = process.hrtime.bigint();
  const fd = fs.openSync(process.env.MON_FILE, 'w');
  setInterval(() => {
    const now = process.hrtime.bigint();
    const cpu = process.cpuUsage();
    const wall = Number(now - lastT) / 1e3; // µs
    const cpuPct = ((cpu.user - last.user + cpu.system - last.system) / wall) * 100;
    const m = process.memoryUsage();
    fs.writeSync(
      fd,
      JSON.stringify({
        t: Date.now(),
        rss: m.rss,
        heap: m.heapUsed,
        cpu: Math.round(cpuPct),
        eld50: h.percentile(50) / 1e6,
        eld99: h.percentile(99) / 1e6,
        eldMax: h.max / 1e6
      }) + '\n'
    );
    h.reset();
    last = cpu;
    lastT = now;
  }, 500).unref();
}
