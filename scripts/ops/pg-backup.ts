'use strict';
/*
 * Sao lưu / kiểm / khôi phục PostgreSQL (không cần pg_dump). Logic ở src/ops/pg-backup.ts.
 *
 *   node scripts/ops/pg-backup.ts backup  [--source=<DB>] [--dir=<thư-mục>] [--keep=<n>]
 *   node scripts/ops/pg-backup.ts verify  --backup=<file>
 *   DRILL_PG_CONTROL_URL=postgres://…/luong_drill_control node scripts/ops/pg-backup.ts drill --backup=<file>
 *   node scripts/ops/pg-backup.ts restore --backup=<file> --to=<DB mới> --confirm-new-empty-db
 *
 * <DB>: postgres://user:pass@host/db. Drill cần DRILL_PG_CONTROL_URL của control database riêng.
 * Mặc định --source = biến DATABASE_URL; --dir = BACKUP_DIR hoặc ./backups (đã nằm trong .gitignore); --keep = BACKUP_KEEP hoặc 30.
 * Không đọc .env. Không bao giờ in dữ liệu hay mật khẩu (URL được che). Mã thoát: 0 đạt, 1 lỗi hoặc không đạt.
 *
 * backup  : ảnh chụp nhất quán (giao dịch REPEATABLE READ chỉ đọc) → file luong-YYYYMMDD-HHMMSS.pgbak.gz; tự kiểm lại file rồi mới giữ.
 * verify  : đọc cả file, tính lại số dòng và dấu vân tay từng bảng.
 * drill   : khôi phục vào PostgreSQL tạm rồi dọn; đối chiếu từng bảng và tổng tiền kỳ lương.
 * restore : chỉ vào DB MỚI (đã chạy migration, chưa có dữ liệu); một giao dịch, lệch là hoàn tác. Cần cờ --confirm-new-empty-db.
 */
const path = require('node:path');
const { backup, verifyFile, restore, drill, PgBackupError } = require('../../src/ops/pg-backup');

const args = Object.fromEntries(
  process.argv
    .slice(3)
    .filter(a => a.startsWith('--'))
    .map(a => {
      const [key, ...rest] = a.slice(2).split('=');
      return [key, rest.length ? rest.join('=') : true];
    })
);
const command = process.argv[2];
const mask = (text?) => String(text).replace(/\/\/[^@/\s]*@/g, '//***@');

async function main() {
  if (command === 'backup') {
    const source = args.source || process.env.DATABASE_URL;
    const dir = path.resolve(String(args.dir || process.env.BACKUP_DIR || 'backups'));
    const keep =
      args.keep !== undefined
        ? Number(args.keep)
        : process.env.BACKUP_KEEP
          ? Number(process.env.BACKUP_KEEP)
          : undefined;
    const r = await backup(source, dir, { keep });
    console.log(
      `Đã sao lưu ${r.tables} bảng, ${r.rows} dòng → ${path.basename(r.file)} (${r.bytes} byte, ${r.tookMs} ms). Đã kiểm lại file: ĐẠT.`
    );
    return 0;
  }
  if (command === 'verify' || command === 'drill' || command === 'restore') {
    if (!args.backup) throw new PgBackupError('Thiếu --backup=<file>.');
    const file = path.resolve(String(args.backup));
    if (command === 'verify') {
      const r = await verifyFile(file);
      for (const t of r.tables) console.log(`${t.ok ? '[ĐẠT]' : '[LỖI]'} ${t.name}: ${t.rows}/${t.expected} dòng`);
      for (const p of r.problems) console.error('LỆCH: ' + p);
      console.log(r.ok ? 'KẾT QUẢ: ĐẠT (file toàn vẹn).' : 'KẾT QUẢ: KHÔNG ĐẠT.');
      return r.ok ? 0 : 1;
    }
    if (command === 'drill') {
      const r = await drill(file, process.env.DRILL_PG_CONTROL_URL);
      console.log(
        `Diễn tập khôi phục PostgreSQL: ${r.tables} bảng, ${r.rows} dòng, ${r.tookMs} ms; dấu vân tay từng bảng và tổng tiền kỳ lương khớp. KẾT QUẢ: ĐẠT.`
      );
      return 0;
    }
    if (!args.to) throw new PgBackupError('Thiếu --to=<DB mới>.');
    if (args['confirm-new-empty-db'] !== true)
      throw new PgBackupError(
        'Khôi phục ghi dữ liệu vào ' +
          mask(args.to) +
          '. Thêm --confirm-new-empty-db để xác nhận đó là DB MỚI, chưa có dữ liệu.'
      );
    const r = await restore(file, String(args.to));
    console.log(
      `Đã khôi phục ${r.tables} bảng, ${r.rows} dòng vào ${mask(args.to)} (${r.tookMs} ms); đối chiếu từng bảng và tổng tiền kỳ lương: KHỚP.`
    );
    return 0;
  }
  console.error('Dùng: pg-backup.js backup|verify|drill|restore (xem đầu file).');
  return 1;
}

main()
  .then(code => process.exit(code))
  .catch(error => {
    console.error(error instanceof PgBackupError ? error.message : 'Lỗi: ' + mask(error && error.message));
    process.exit(1);
  });
