// Phần nền của DB demo: admin và nhân viên đã seed đăng nhập được. Chạy qua `npm run demo -- test smoke`
// (spec docs/superpowers/specs/2026-11-05-demo-db-e2e-design.md); chạy thẳng test:api thì bị bỏ qua.
import { expect, test } from '@playwright/test';
import { ADMIN, apiAs, demoReady, seededPeople, signIn } from './fixtures/demo';

test.skip(!demoReady, 'Chạy qua npm run demo -- test smoke');

test('admin signs in to the admin area', async ({ page }) => {
  await signIn(page, ADMIN);
  await expect(page).toHaveURL(/\/admin/);
});

test('a seeded staff member signs in to the staff app and sees their own name', async ({ page }) => {
  const who = seededPeople().find(p => p.area === 'smoke')!;
  await signIn(page, who.username);
  await expect(page).toHaveURL(/\/nv\/hom-nay/);
  await expect(page.getByText(who.givenName).first()).toBeVisible();
});

test('every seeded person can sign in through the API', async ({ request }) => {
  for (const who of seededPeople()) {
    const me = await apiAs(request, who.username, () => request.get('/api/v2/me/profile'));
    expect(me.status(), `${who.username} đọc được hồ sơ của mình`).toBe(200);
  }
});
