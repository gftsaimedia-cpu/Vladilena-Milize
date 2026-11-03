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
