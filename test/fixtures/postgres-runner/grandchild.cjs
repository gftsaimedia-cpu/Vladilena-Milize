const fs = require('node:fs');
process.on('SIGTERM', () => {});
fs.writeFileSync(process.env.PG_RUNNER_GRANDCHILD_PID_FILE, String(process.pid));
setInterval(() => {}, 30000);
