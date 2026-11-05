// Tạo hoặc đọc file tài khoản DB demo. Mật khẩu sinh ngẫu nhiên ở lần đầu, sau đó giữ nguyên; không in ra màn hình.
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ACCOUNTS_FILE } from './config';
import { formatAccounts, parseAccounts, type DemoAccounts } from './accounts-format';

const password = (): string => 'D' + randomBytes(12).toString('base64url') + '7a';

export function ensureAccounts(file: string = ACCOUNTS_FILE): { accounts: DemoAccounts; created: boolean } {
  if (fs.existsSync(file)) return { accounts: parseAccounts(fs.readFileSync(file, 'utf8')), created: false };
  const accounts: DemoAccounts = {
    adminUser: 'admin',
    adminPassword: password(),
    staffPassword: password(),
    sessionSecret: randomBytes(32).toString('hex')
  };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, formatAccounts(accounts), { mode: 0o600 });
  return { accounts, created: true };
}
