'use strict';
// Xem trước đổi insurance.coverage.<hợp đồng> phải liệt kê đúng những người cột "đóng bảo hiểm" còn NULL của hợp đồng đó, với số bảo hiểm và
// thực lĩnh mới: payrollPeople tính `insured` theo tham số đang xem trước, không theo tham số đang lưu.
const P = require('../helpers/position-api');
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { F, store } = P;
before(F.start);
after(F.stop);

test('GĐ2: xem trước insurance.coverage.short Không → Có liệt kê người hợp đồng ngắn có cột NULL (qa_tts1) với bảo hiểm và thực lĩnh mới; không đổi gì thì 0 người', async () => {
  const M = await P.setupMonth();
  // hợp đồng suy từ thâm niên: TTS vào làm đầu tháng M chưa đủ 3 tháng nên là hợp đồng ngắn; ba người còn lại vào làm từ 05/01/2026 là hợp đồng dài
  await store.db.prepare('UPDATE staff SET start_date = ? WHERE username = ?').run(`${M}-01`, 'qa_tts1');
  const row = await store.db.prepare('SELECT insured, contract FROM staff WHERE username = ?').get('qa_tts1');
  assert.equal(row.insured, null, 'điều kiện của bài: cột đóng bảo hiểm của TTS còn NULL');
  const res = await P.preview({ changes: [{ key: 'insurance.coverage.short', value: true }], effectiveMonth: M });
  assert.equal(res.status, 200, JSON.stringify(res.data).slice(0, 300));
  assert.equal(res.data.ok, true, JSON.stringify(res.data.errors));
  const impact = res.data.impact;
  const hit = impact.people.find(p => p.username === 'qa_tts1');
  assert.ok(hit, 'TTS hợp đồng ngắn nằm trong danh sách người bị ảnh hưởng');
  assert.ok(hit.diff.net < 0, 'đóng bảo hiểm thì thực lĩnh giảm');
  assert.ok(impact.ripple.components.find(c => c.key === 'insurance').delta > 0, 'bảo hiểm tăng');
  assert.equal(
    impact.people.filter(p => ['qa_ctv1', 'qa_nv1', 'qa_nv2'].includes(p.username)).length,
    0,
    'người hợp đồng dài không đổi'
  );
  // đặt giá trị bằng đang dùng: 0 người
  const same = await P.preview({ changes: [{ key: 'insurance.coverage.short', value: false }], effectiveMonth: M });
  assert.equal(same.data.impact === null || same.data.impact.people.length === 0, true);
});
