// Phía khách có hạn chờ và tự thử lại; mã một lần bấm sống qua lần tải lại trang.
// (a) public/nhan-vien/core.js → NV.api dùng AbortController với hạn TIMEOUT_MS;
// (b) public/nhan-vien/punch.js lưu S.attempt (requestId) qua NV.store và đọc lại khi nạp trang;
// (c) đúng MỘT lần tự thử lại khi lỗi mạng cho POST /punch, giữ nguyên requestId;
// (d) xoá mục đã lưu khi máy chủ đã trả lời dứt khoát.
// Nạp tệp trình duyệt vào vm với window/document/localStorage giả, không cần trình duyệt thật.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ROOT = path.join(__dirname, '../..');
const read = file => fs.readFileSync(path.join(ROOT, file), 'utf8');

// Thư viện nhỏ của localStorage giả, cùng khoá mà NV.store dùng: 'aicb-nv-' + key
function fakeStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    api: {
      getItem: k => (map.has(k) ? map.get(k) : null),
      setItem: (k, v) => map.set(k, String(v)),
      removeItem: k => map.delete(k)
    }
  };
}

/* ---------- (a) NV.api: hạn chờ và AbortController ---------- */
test('NV.api gắn AbortController với hạn TIMEOUT_MS: quá hạn thì báo lỗi mạng thay vì treo nút Check-in', async () => {
  const declared = Number(/const TIMEOUT_MS = (\d+);/.exec(read('public/nhan-vien/core.js'))?.[1]);
  assert.ok(declared > 0, 'core.js phải có hằng có tên TIMEOUT_MS');
  const timers = [];
  const fetchCalls = [];
  const fetchStub = (url, opts) =>
    new Promise((resolve, reject) => {
      fetchCalls.push({ url, opts });
      opts.signal.addEventListener('abort', () => {
        const e = new Error('aborted');
        e.name = 'AbortError';
        reject(e);
      });
    });
  const NV = {};
  const context = vm.createContext({
    window: { NV },
    document: { addEventListener() {} },
    localStorage: fakeStorage().api,
    crypto: { randomUUID: () => 'x'.repeat(20) },
    fetch: fetchStub,
    AbortController,
    setTimeout: (fn, ms) => {
      timers.push({ fn, ms });
      return timers.length;
    },
    clearTimeout: () => {},
    location: { replace() {} },
    navigator: {}
  });
  vm.runInContext(read('public/nhan-vien/core.js'), context);
  const pending = NV.api('GET', '/me');
  assert.equal(fetchCalls.length, 1);
  assert.ok(fetchCalls[0].opts.signal, 'fetch phải nhận signal của AbortController');
  assert.equal(timers.length, 1, 'phải đặt một hạn chờ');
  assert.equal(timers[0].ms, declared, 'hạn chờ dùng đúng hằng TIMEOUT_MS');
  timers[0].fn(); // đồng hồ chạy hết hạn
  await assert.rejects(pending, err => {
    assert.equal(err.status, 0, 'quá hạn được coi là lỗi mạng (status 0) để người dùng bấm lại');
    assert.match(err.message, /máy chủ/);
    return true;
  });
});

test('NV.store có remove để xoá mục đã lưu (đệm trình duyệt)', () => {
  const storage = fakeStorage({ 'aicb-nv-thu': '1' });
  const NV = {};
  const context = vm.createContext({
    window: { NV },
    document: { addEventListener() {} },
    localStorage: storage.api,
    setTimeout: () => 0,
    clearTimeout: () => {},
    location: { replace() {} },
    navigator: {},
    fetch: () => Promise.resolve({ ok: true, status: 200, json: async () => ({}) })
  });
  vm.runInContext(read('public/nhan-vien/core.js'), context);
  assert.equal(NV.store.get('thu'), '1');
  NV.store.remove('thu');
  assert.equal(NV.store.get('thu'), null);
  assert.equal(storage.map.size, 0);
});

/* ---------- (b)(c)(d) punch.js: nhớ requestId qua lần tải lại trang, thử lại một lần ---------- */
function loadPunch({ stored, api, uuid = () => 'ma-moi-0001' }) {
  const storage = fakeStorage(stored ? { 'aicb-nv-punch-attempt': stored } : {});
  const calls = [];
  const state = { punch: { openSession: { id: 7 } }, busy: false, punchMsg: null, attempt: undefined };
  const NV = {
    esc: v => String(v ?? ''),
    ic: () => '',
    actions: {},
    S: state,
    L: {
      GEO_TEXT: {},
      vnTime: () => '17:00',
      vnDate: () => '2026-10-07',
      dmy: v => v,
      dm: v => v,
      fmtMin: m => String(m),
      shiftInfo: () => null,
      geoServerError: () => ''
    },
    store: {
      get: k => storage.api.getItem('aicb-nv-' + k),
      set: (k, v) => storage.api.setItem('aicb-nv-' + k, v),
      remove: k => storage.api.removeItem('aicb-nv-' + k)
    },
    uuid,
    api: async (method, route, body) => {
      calls.push({ method, route, body });
      return api(calls.length, body);
    },
    warnList: () => [],
    syncClock() {},
    nowIso: () => '2026-10-07T10:00:00.000Z',
    today: () => '2026-10-07',
    punchView: () => ({ mode: 'closed' }),
    render() {},
    loadPunch: async () => {},
    loadMonth: async () => {},
    curMonth: () => '2026-10',
    model: () => null,
    showWarnings() {},
    openSheet() {},
    noteBox: () => '',
    soon: () => ''
  };
  const context = vm.createContext({ window: { NV }, console });
  vm.runInContext(read('public/nhan-vien/punch.js'), context);
  return { NV, state, calls, storage };
}
const saved = requestId => JSON.stringify({ type: 'out', sessionId: 7, requestId, at: Date.now() });

test('sau khi tải lại trang, bấm lại Check-out dùng ĐÚNG requestId đã lưu (không sinh mã mới)', async () => {
  const hug = loadPunch({ stored: saved('ma-cu-0123456'), api: () => ({}) });
  assert.equal(hug.state.attempt?.requestId, 'ma-cu-0123456', 'đọc lại lần bấm dở khi nạp trang');
  await hug.NV.actions.punch({ dataset: { type: 'out' } });
  assert.equal(hug.calls.length, 1);
  assert.equal(hug.calls[0].body.requestId, 'ma-cu-0123456');
  assert.equal(hug.calls[0].body.sessionId, 7);
  assert.equal(hug.storage.map.size, 0, 'máy chủ đã trả lời: xoá mục đã lưu');
});

test('mục đã lưu quá hạn (quá ATTEMPT_TTL_MS) bị bỏ: lần bấm sau dùng mã mới', async () => {
  const cu = JSON.stringify({
    type: 'out',
    sessionId: 7,
    requestId: 'ma-cu-0123456',
    at: Date.now() - 3 * 60 * 60 * 1000
  });
  const hug = loadPunch({ stored: cu, api: () => ({}) });
  assert.equal(hug.state.attempt, null);
  await hug.NV.actions.punch({ dataset: { type: 'out' } });
  assert.equal(hug.calls[0].body.requestId, 'ma-moi-0001');
});

test('lỗi mạng (status 0): tự thử lại ĐÚNG một lần với cùng requestId; thành công thì xoá mục đã lưu', async () => {
  const hug = loadPunch({
    api: callNo => {
      if (callNo === 1) throw Object.assign(new Error('Không kết nối được máy chủ.'), { status: 0 });
      return {};
    }
  });
  await hug.NV.actions.punch({ dataset: { type: 'out' } });
  assert.equal(hug.calls.length, 2, 'đúng một lần thử lại');
  assert.equal(hug.calls[0].body.requestId, hug.calls[1].body.requestId, 'thử lại giữ nguyên requestId');
  assert.equal(hug.storage.map.size, 0);
  assert.equal(hug.state.punchStatus, 'ok');
});

test('lỗi mạng hai lần thì dừng, GIỮ mục đã lưu để lần bấm sau (kể cả sau khi tải lại trang) vẫn dùng cùng requestId', async () => {
  const hug = loadPunch({
    api: () => {
      throw Object.assign(new Error('Không kết nối được máy chủ.'), { status: 0 });
    }
  });
  await hug.NV.actions.punch({ dataset: { type: 'out' } });
  assert.equal(hug.calls.length, 2, 'không thử lại quá một lần');
  const kept = JSON.parse(hug.storage.map.get('aicb-nv-punch-attempt'));
  assert.equal(kept.requestId, hug.calls[0].body.requestId, 'mục đã lưu còn nguyên để bấm lại không chấm hai lần');
  assert.equal(hug.state.attempt.requestId, kept.requestId);
});

test('máy chủ trả lời dứt khoát (409) thì không thử lại và xoá mục đã lưu', async () => {
  const hug = loadPunch({
    api: () => {
      throw Object.assign(new Error('Lượt này đã Check-out'), { status: 409 });
    }
  });
  await hug.NV.actions.punch({ dataset: { type: 'out' } });
  assert.equal(hug.calls.length, 1, '409 là câu trả lời dứt khoát: không thử lại');
  assert.equal(hug.state.attempt, null);
  assert.equal(hug.storage.map.size, 0);
});

test('requestId đã lưu sai dạng (máy chủ không nhận) bị bỏ, không gửi lên', async () => {
  const hug = loadPunch({ stored: saved('có dấu cách!'), api: () => ({}) });
  assert.equal(hug.state.attempt, null, 'requestId sai dạng không được dùng lại');
  await hug.NV.actions.punch({ dataset: { type: 'out' } });
  assert.equal(hug.calls[0].body.requestId, 'ma-moi-0001');
});
