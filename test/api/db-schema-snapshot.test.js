'use strict';
// Lược đồ DB do lib/db.js và lib/store/* dựng phải khớp bản chụp đã ghi.
// Ba kiểm: (1) bản chụp bảng/cột/chỉ mục/trigger của DB mới khớp file đã ghi; (2) mọi khoá của đối tượng store đã ghi vẫn còn đúng kiểu;
// (3) nâng cấp: DB đã dựng bị bớt các cột addColumn rồi nạp lại phải ra cùng tập cột và chỉ mục, và nạp lần hai không đổi gì.
// Đổi lược đồ có chủ đích: chạy node test/tools/record-schema.js --write để ghi lại bản chụp.
process.env.DB_PATH = ':memory:';
process.env.SESSION_SECRET = 'qa-schema-snapshot';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
const store = require('../../lib/db');
const { capture, columnSets, indexSets, describeStore, SNAPSHOT, ROOT } = require('../tools/record-schema');

const golden = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8'));
const fresh = JSON.parse(JSON.stringify(capture(store.db, store)));

// Khoá store được kiểm riêng (thêm khoá không phải lỗi), nên bỏ khỏi so sánh lược đồ
const withoutStore = snap => {
  const copy = { ...snap };
  delete copy.store;
  return copy;
};

function firstDifference(expected, actual, where = '') {
  if (JSON.stringify(expected) === JSON.stringify(actual)) return null;
  if (expected && actual && typeof expected === 'object' && typeof actual === 'object' && !Array.isArray(expected)) {
    for (const key of new Set([...Object.keys(expected), ...Object.keys(actual)])) {
      const found = firstDifference(expected[key], actual[key], `${where}.${key}`);
      if (found) return found;
    }
  }
  return `${where}: ghi ${JSON.stringify(expected)?.slice(0, 200)} / nay ${JSON.stringify(actual)?.slice(0, 200)}`;
}

test('lược đồ DB: bảng, cột, chỉ mục, khoá ngoại, trigger và khoá settings gieo sẵn khớp bản chụp đã ghi', () => {
  assert.ok(Object.keys(golden.tables).length >= 15, 'bản chụp quá nhỏ');
  const diff = firstDifference(withoutStore(golden), withoutStore(fresh));
  assert.equal(diff, null, `lược đồ đổi (đổi có chủ đích thì chạy node test/tools/record-schema.js --write): ${diff}`);
});

test('lược đồ DB: mọi bảng của bản chụp tồn tại và không bảng nào bị thêm hay mất', () => {
  assert.deepEqual(Object.keys(fresh.tables).sort(), Object.keys(golden.tables).sort());
});

test('lược đồ DB: mọi khoá đã ghi của đối tượng lib/db.js xuất ra (store) vẫn còn và cùng kiểu; khoá mới chỉ được báo', t => {
  const now = describeStore(store);
  const lost = Object.entries(golden.store)
    .filter(([key, kind]) => now[key] !== kind)
    .map(([key, kind]) => `${key}: ${kind} -> ${now[key] ?? 'mất'}`);
  assert.deepEqual(lost, [], 'tách lib/db.js làm mất hay đổi kiểu một khoá của store');
  const added = Object.keys(now).filter(key => !(key in golden.store));
  if (added.length)
    t.diagnostic(`khoá store mới chưa có trong bản chụp (không lỗi; ghi lại khi tiện): ${added.join(', ')}`);
});

// Danh sách (bảng, cột) do addColumn thêm, đọc từ mã lược đồ: lib/db.js và lib/store/*.js
function addedColumns() {
  const files = ['lib/db.js'];
  const dir = path.join(ROOT, 'lib/store');
  if (fs.existsSync(dir))
    for (const name of fs.readdirSync(dir)) if (name.endsWith('.js')) files.push(`lib/store/${name}`);
  const out = [];
  for (const rel of files) {
    const source = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    for (const m of source.matchAll(/addColumn\(\s*'(\w+)'\s*,\s*'(\w+)'/g)) out.push([m[1], m[2]]);
    for (const m of source.matchAll(/for \(const column of \[([^\]]+)\]\)\s*addColumn\(\s*'(\w+)'\s*,\s*column/g))
      for (const column of m[1].match(/'(\w+)'/g)) out.push([m[2], column.slice(1, -1)]);
  }
  return out;
}

function bootOn(file, outFile) {
  execFileSync(
    process.execPath,
    [
      '--no-warnings=ExperimentalWarning',
      path.join(ROOT, 'test/tools/record-schema.js'),
      '--capture',
      file,
      '--out',
      outFile
    ],
    {
      cwd: ROOT,
      env: { ...process.env, DB_PATH: file },
      stdio: ['ignore', 'ignore', 'pipe']
    }
  );
  return JSON.parse(fs.readFileSync(outFile, 'utf8'));
}

test('lược đồ DB: nạp lại trên cùng file không đổi lược đồ, và DB bị bớt các cột addColumn được nâng lên đúng tập cột / chỉ mục', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aicb-schema-'));
  try {
    const file = path.join(dir, 'upgrade.sqlite'),
      out = path.join(dir, 'out.json');
    const first = bootOn(file, out);
    const second = bootOn(file, out);
    assert.equal(firstDifference(first, second), null, 'nạp lần hai làm đổi lược đồ hay số dòng gieo sẵn');
    assert.equal(firstDifference(columnSets(golden), columnSets(first)), null, 'DB file dựng mới khác bản chụp');

    // Mô phỏng DB cũ: bỏ các cột do addColumn thêm (cột có chỉ mục hay ràng buộc thì SQLite từ chối, bỏ qua)
    const raw = new DatabaseSync(file);
    let dropped = 0;
    for (const [table, column] of addedColumns()) {
      try {
        raw.exec(`ALTER TABLE ${table} DROP COLUMN ${column}`);
        dropped += 1;
      } catch {
        /* cột có chỉ mục hay ràng buộc */
      }
    }
    raw.close();
    t.diagnostic(`đã bớt ${dropped}/${addedColumns().length} cột addColumn để mô phỏng DB cũ`);
    assert.ok(dropped >= 10, `chỉ bớt được ${dropped} cột addColumn: kiểm tra lại cách đọc danh sách`);
    const upgraded = bootOn(file, out);
    assert.equal(
      firstDifference(columnSets(golden), columnSets(upgraded)),
      null,
      'nâng cấp từ DB cũ ra tập cột khác DB dựng mới'
    );
    assert.equal(
      firstDifference(indexSets(golden), indexSets(upgraded)),
      null,
      'nâng cấp từ DB cũ ra tập chỉ mục khác DB dựng mới'
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
