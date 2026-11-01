// Kịch bản tích hợp dùng dữ liệu ngày gọn: chỉ trong test mới tìm phiên duy nhất của ngày;
// API thật không bao giờ đoán phiên theo ngày.
const { randomUUID } = require('node:crypto');
module.exports = async function contract(store?, user?, method?, url?, body?) {
  if (!body) return body;
  const route = url.replace(/^\/api/, '');
  let b: Record<string, any> = { ...body };
  if (method === 'POST' && route === '/punch') {
    b.requestId ??= randomUUID();
    if (b.type === 'out')
      b.sessionId ??= (await store.openSession(user))?.id || (await store.lastSession(user))?.id || 1;
  }
  if (method === 'PUT' && route === '/ot' && !b.sessionId) {
    const sessions = await store.listSessions({ username: b.user, date: b.date });
    if (sessions.length === 1) {
      b.sessionId = sessions[0].id;
      b.version = sessions[0].version;
    }
  }
  return b;
};
