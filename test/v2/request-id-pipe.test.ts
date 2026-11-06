import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RequestIdPipe } from '../../src/modules/requests/request-id.pipe';

// Đường dẫn có :id không phải UUID là "không tìm thấy đơn" (404), không để lọt xuống SQL rồi lộ câu lỗi của PostgreSQL.
test('RequestIdPipe lets a uuid through and turns anything else into 404 REQUEST_NOT_FOUND', () => {
  const pipe = new RequestIdPipe();
  const id = '3f2b8a0e-1c4d-4e6f-9a7b-5d8c0e1f2a3b';
  assert.equal(pipe.transform(id), id);
  for (const bad of ['abc', '', '1', 'not-a-uuid', `${id}x`, "' or 1=1 --"]) {
    assert.throws(
      () => pipe.transform(bad),
      (e: any) => e.status === 404 && e.details?.code === 'REQUEST_NOT_FOUND',
      `id ${JSON.stringify(bad)}`
    );
  }
});
