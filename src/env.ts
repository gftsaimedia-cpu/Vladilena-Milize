import fs from 'node:fs';
import path from 'node:path';

/** Nạp file .env (nếu có) vào biến môi trường, không ghi đè biến đã đặt sẵn. Phải chạy TRƯỚC khi nạp src/platform/db, src/platform/auth... (đọc biến lúc nạp). */
export function loadDotEnv(dir: string): void {
  try {
    for (const line of fs.readFileSync(path.join(dir, '.env'), 'utf8').split('\n')) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
      if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined)
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch {
    // không có .env thì thôi
  }
}
