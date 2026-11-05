import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { jsonBodyErrors, requireJsonBody } from '../../src/common/http-guards';

function fakeRes() {
  const res: any = { statusCode: 200, body: undefined };
  res.status = (code: number) => ((res.statusCode = code), res);
  res.json = (body: unknown) => ((res.body = body), res);
  return res;
}

function run(fn: (req: any, res: any, next: (err?: unknown) => void) => void, req: any) {
  const res = fakeRes();
  let nextCalled = false;
  fn(req, res, () => (nextCalled = true));
  return { res, nextCalled };
}

describe('requireJsonBody', () => {
  it('refuses a POST without Content-Type as 415', () => {
    const { res, nextCalled } = run(requireJsonBody, { method: 'POST', headers: {} });
    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 415);
    assert.equal(res.body.code, 'UNSUPPORTED_MEDIA_TYPE');
  });

  it('refuses a form post', () => {
    const { res } = run(requireJsonBody, { method: 'PUT', headers: { 'content-type': 'application/x-www-form-urlencoded' } });
    assert.equal(res.statusCode, 415);
  });

  it('accepts JSON with a charset', () => {
    const { nextCalled } = run(requireJsonBody, { method: 'PATCH', headers: { 'content-type': 'application/json; charset=utf-8' } });
    assert.equal(nextCalled, true);
  });

  it('lets reads through without a body type', () => {
    assert.equal(run(requireJsonBody, { method: 'GET', headers: {} }).nextCalled, true);
    assert.equal(run(requireJsonBody, { method: 'HEAD', headers: {} }).nextCalled, true);
  });
});

describe('jsonBodyErrors', () => {
  const runErr = (err: unknown) => {
    const res = fakeRes();
    let passed: unknown = 'not-called';
    jsonBodyErrors(err, {}, res, (e?: unknown) => (passed = e));
    return { res, passed };
  };

  it('maps a too large body to 413', () => {
    const { res } = runErr(Object.assign(new Error('x'), { type: 'entity.too.large' }));
    assert.equal(res.statusCode, 413);
    assert.equal(res.body.code, 'PAYLOAD_TOO_LARGE');
  });

  it('maps broken JSON to 400', () => {
    const { res } = runErr(Object.assign(new Error('x'), { type: 'entity.parse.failed' }));
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.code, 'INVALID_JSON');
  });

  it('passes other errors on', () => {
    const err = new Error('other');
    assert.equal(runErr(err).passed, err);
  });
});
