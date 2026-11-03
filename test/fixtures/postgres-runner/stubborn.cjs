process.on('SIGTERM', () => {});
require('./common.cjs').run('stubborn', { hold: true });
