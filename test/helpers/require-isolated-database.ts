'use strict';

// Test có thể xoá dữ liệu. Chỉ nhận database tạm do runner cấp trên máy chủ test riêng.
const invalid = () => new Error('Database test không được nhận diện an toàn; hãy chạy test qua PostgreSQL runner.');

function urlOf(value: string | undefined): URL {
  try {
    return new URL(value || '');
  } catch {
    throw invalid();
  }
}

function isTestControl(url: URL): boolean {
  return ['postgres:', 'postgresql:'].includes(url.protocol) && url.pathname === '/luong_test_control';
}

function requireIsolatedDatabase(): void {
  const name = process.env.TEST_PG_DATABASE_NAME;
  // Tương thích tạm với runner cũ: adapter tạo một DB riêng từ control URL, không dùng DATABASE_URL/DB_PATH.
  if (
    !name &&
    !process.env.DATABASE_URL &&
    !process.env.DB_PATH &&
    !process.env.TEST_PG_CONTROL_URL &&
    process.env.PG_TEST_URL
  ) {
    if (!isTestControl(urlOf(process.env.PG_TEST_URL))) throw invalid();
    // Ngăn .env nạp lại cấu hình app sau khi DB test đã được chọn.
    process.env.DATABASE_URL = '';
    process.env.DB_PATH = '';
    return;
  }
  if (!name || !/^luong_test_[0-9a-f]{24}$/.test(name) || process.env.DB_PATH || process.env.PG_TEST_URL)
    throw invalid();
  const target = urlOf(process.env.DATABASE_URL);
  const control = urlOf(process.env.TEST_PG_CONTROL_URL);
  if (
    !isTestControl(control) ||
    !['postgres:', 'postgresql:'].includes(target.protocol) ||
    target.pathname !== `/${name}`
  )
    throw invalid();
  target.pathname = control.pathname;
  if (target.toString() !== control.toString()) throw invalid();
}

requireIsolatedDatabase();
