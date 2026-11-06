import { Demo, must, setClock } from './harness';
import { PEOPLE, createAdmin, createPerson } from './people';
import { plan } from './plan';
import { Script } from './scenario';

export interface SeedLog {
  (line: string): void;
}

/** Nạp toàn bộ dữ liệu demo vào `url`. Trả `Demo` còn mở để test đọc kiểm; gọi `stop()` khi xong. */
export async function seedDemo(url: string, log: SeedLog = () => {}): Promise<Demo> {
  const demo = new Demo(url);
  await demo.start();
  try {
    setClock('2026-08-31T09:00:00+07:00');
    await createAdmin(demo);
    const admin = demo.admin;

    const depts = must(await admin.get('/api/v2/departments'), 'đọc phòng ban').departments as Array<{ id: number; name: string }>;
    const deptIds = new Map(depts.map(d => [d.name, d.id]));
    const d3 = must(await admin.post('/api/v2/departments', { name: 'Phòng ban 3' }), 'tạo Phòng ban 3');
    deptIds.set('Phòng ban 3', (d3.department ?? d3).id);
    log(`phòng ban: ${[...deptIds.keys()].join(', ')}`);

    for (const [k, v] of deptIds) demo.depts.set(k, v);
    for (const p of PEOPLE) await createPerson(demo, p, deptIds);
    log(`nhân sự: ${demo.uuids.size}`);

    const s = new Script(demo, log);
    for (const p of PEOPLE) s.weeks.set(p.username, p.username === 'em' || p.username === 'oanh' ? [1, 2, 3, 4, 5] : [1, 2, 3, 4, 5, 6]);
    plan(s);
    await s.runAll();
    for (const e of s.expected) log(`bị chặn (đúng): ${e.label} → ${e.status} ${JSON.stringify(e.body).slice(0, 140)}`);
  } catch (err) {
    await demo.stop();
    throw err;
  }
  return demo;
}
