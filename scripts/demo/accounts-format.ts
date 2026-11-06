// Định dạng file tài khoản DB demo (deploy/demo/accounts.local, git bỏ qua). Module thuần: test Playwright cũng import được.
// Không bao giờ in giá trị trong file này ra màn hình.

export interface DemoAccounts {
  adminUser: string;
  adminPassword: string;
  /** Mọi nhân viên demo dùng chung mật khẩu này. */
  staffPassword: string;
  sessionSecret: string;
}

const KEYS: Record<keyof DemoAccounts, string> = {
  adminUser: 'DEMO_ADMIN_USER',
  adminPassword: 'DEMO_ADMIN_PASSWORD',
  staffPassword: 'DEMO_STAFF_PASSWORD',
  sessionSecret: 'DEMO_SESSION_SECRET'
};

export function formatAccounts(a: DemoAccounts): string {
  const lines = [
    '# Tài khoản DB demo (npm run demo). File này git bỏ qua: không commit, không dán vào chat.',
    '# Admin đăng nhập bằng DEMO_ADMIN_USER / DEMO_ADMIN_PASSWORD; mọi nhân viên demo dùng DEMO_STAFF_PASSWORD.',
    ...Object.entries(KEYS).map(([field, key]) => `${key}=${a[field as keyof DemoAccounts]}`)
  ];
  return lines.join('\n') + '\n';
}

export function parseAccounts(text: string): DemoAccounts {
  const values = new Map<string, string>();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq > 0) values.set(line.slice(0, eq), line.slice(eq + 1));
  }
  const out = {} as DemoAccounts;
  for (const [field, key] of Object.entries(KEYS)) {
    const value = values.get(key);
    if (!value) throw new Error(`File tài khoản demo thiếu ${key}`);
    out[field as keyof DemoAccounts] = value;
  }
  return out;
}
