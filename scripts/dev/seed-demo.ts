import { seedDemo } from './seed-demo/index';

const url = process.env.DEMO_DB_URL ?? 'postgres://postgres@127.0.0.1:55480/luong_demo';
seedDemo(url, line => console.log(line))
  .then(async demo => {
    await demo.stop();
    console.log('xong');
  })
  .catch(err => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
