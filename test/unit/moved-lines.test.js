'use strict';
// Công cụ test/tools/moved-lines.js (so dòng chuyển khi chia server.js) phải coi việc cắt dán nguyên văn là sạch
// và bắt được mọi dòng bị sửa, bị mất hay bị nhân đôi. Đây là test của công cụ, không phải của mã sản phẩm.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { compare, stripGlue } = require('../tools/moved-lines');

const OLD = `// Lương Nhân Sự
const http = require('node:http');
const store = require('./lib/db');

function validMonth(m) {
  return /^\\d{4}-\\d{2}$/.test(m);
}

async function api(req, res, url, me) {
  const seg = url.pathname.split('/').filter(Boolean);
  const route = \`\${req.method} /\${seg.slice(1, 3).join('/')}\`;
  if (route === 'GET /kpi/scores') {
    needAdmin();
    const month = url.searchParams.get('month');
    if (!validMonth(month)) throw new HttpError(400, 'month phải dạng YYYY-MM');
    return send(res, 200, { month, items: store.listKpiScores(month) });
  }
  if (route === 'GET /approvals/count') {
    needAdmin();
    return send(res, 200, { pending: tallyApprovals(listApprovals({ status: 'pending' })).pending });
  }
  throw new HttpError(404, 'Không có API này');
}
`;

const SERVER_AFTER = `// Lương Nhân Sự
const http = require('node:http');
const store = require('./lib/db');
const routes = require('./lib/routes');

function validMonth(m) {
  return /^\\d{4}-\\d{2}$/.test(m);
}

async function api(req, res, url, me) {
  const seg = url.pathname.split('/').filter(Boolean);
  const route = \`\${req.method} /\${seg.slice(1, 3).join('/')}\`;
  throw new HttpError(404, 'Không có API này');
}
`;

const ROUTES_AFTER = `'use strict';
const store = require('../db');
const {
  readJson,
  send,
  HttpError
} = require('../http');
module.exports = {
  routes: {
    'GET /kpi/scores': async ({ req, res, url, needAdmin }) => {
      needAdmin();
      const month = url.searchParams.get('month');
      if (!validMonth(month)) throw new HttpError(400, 'month phải dạng YYYY-MM');
      return send(res, 200, { month, items: store.listKpiScores(month) });
    },
    'GET /approvals/count': async ({
      res,
      needAdmin
    }) => {
      needAdmin();
      return send(res, 200, { pending: tallyApprovals(listApprovals({ status: 'pending' })).pending });
    }
  }
};
`;

const run = (oldText, files) => compare([{ file: 'server.js', text: oldText }], files);

test('moved-lines: cắt dán nguyên văn (kèm require, module.exports, đầu mục bảng) không còn dòng lạ', () => {
  const result = run(OLD, [
    { file: 'server.js', text: SERVER_AFTER },
    { file: 'lib/routes/kpi.js', text: ROUTES_AFTER }
  ]);
  assert.deepEqual(result.removed, [], 'dòng cũ mất');
  assert.deepEqual(result.added, [], 'dòng mới lạ');
  assert.equal(result.gates.length, 2, 'hai cổng if (route === …) đã đổi thành mục bảng');
  assert.ok(result.glue.require.length >= 3 && result.glue['đầu mục'].length >= 2);
});

test('moved-lines: bắt dòng bị sửa một chữ, dòng bị mất và dòng bị nhân đôi', () => {
  const edited = ROUTES_AFTER.replace('YYYY-MM', 'YYYY/MM');
  let result = run(OLD, [
    { file: 'server.js', text: SERVER_AFTER },
    { file: 'lib/routes/kpi.js', text: edited }
  ]);
  assert.equal(result.removed.length, 1);
  assert.equal(result.added.length, 1);
  assert.match(result.removed[0].text, /YYYY-MM/);
  assert.match(result.added[0].text, /YYYY\/MM/);

  const dropped = ROUTES_AFTER.replace(
    '      needAdmin();\n      return send(res, 200, { pending',
    '      return send(res, 200, { pending'
  );
  result = run(OLD, [
    { file: 'server.js', text: SERVER_AFTER },
    { file: 'lib/routes/kpi.js', text: dropped }
  ]);
  assert.deepEqual(
    result.removed.map(entry => entry.text.trim()),
    ['needAdmin();'],
    'thiếu một bản needAdmin(); phải được báo (đếm theo số lần lặp)'
  );
  assert.equal(result.added.length, 0);

  const doubled = ROUTES_AFTER.replace(
    '      return send(res, 200, { pending',
    '      audit.log();\n      return send(res, 200, { pending'
  );
  result = run(OLD, [
    { file: 'server.js', text: SERVER_AFTER },
    { file: 'lib/routes/kpi.js', text: doubled }
  ]);
  assert.deepEqual(
    result.added.map(entry => entry.text.trim()),
    ['audit.log();']
  );
});

test('moved-lines: nhận ra dòng Prettier ngắt lại (nối lại thì trùng) nhưng vẫn in ra để người duyệt xem', () => {
  const wrapped = ROUTES_AFTER.replace(
    "return send(res, 200, { pending: tallyApprovals(listApprovals({ status: 'pending' })).pending });",
    "return send(res, 200, {\n        pending: tallyApprovals(listApprovals({ status: 'pending' })).pending\n      });"
  );
  const result = run(OLD, [
    { file: 'server.js', text: SERVER_AFTER },
    { file: 'lib/routes/kpi.js', text: wrapped }
  ]);
  assert.deepEqual(result.removed, []);
  assert.deepEqual(result.added, []);
  assert.ok(result.reflowed.removed.length >= 1 && result.reflowed.added.length >= 1);
});

test('moved-lines: không coi khoảng trắng và kết thúc dòng CRLF là khác biệt', () => {
  const result = run(OLD, [
    { file: 'server.js', text: SERVER_AFTER.replace(/^ {2}/gm, '\t\t') },
    { file: 'lib/routes/kpi.js', text: ROUTES_AFTER.replace(/^ {6}/gm, '        ') }
  ]);
  assert.deepEqual([result.removed, result.added], [[], []]);
});

test('moved-lines: stripGlue tách require nhiều dòng, ctx và danh sách tên của module.exports', () => {
  const { kept, glue } = stripGlue(
    'x.js',
    "const {\n  a,\n  b\n} = require('./a');\nconst { req, res } = ctx;\nfunction f() {}\nmodule.exports = {\n  f,\n  g: h\n};\n"
  );
  assert.deepEqual(
    kept.map(entry => entry.text),
    ['function f() {}']
  );
  assert.deepEqual(Object.keys(glue).sort(), ['ctx', 'module.exports', 'require']);
});
