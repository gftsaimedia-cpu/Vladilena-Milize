'use strict';
// Một lần Admin sửa danh mục (chức vụ, bậc, ca) đi qua đúng một đường: kiểm khoá kỳ của tháng áp dụng, ghi trong MỘT giao dịch
// (thay đổi + catalog_rev + config_rev + nhật ký mức 'pay'), rồi báo các màn nạp lại (params.changed, sau khi giao dịch xong).
// Dùng chung cho src/domain/position/routes.js và src/domain/shift/routes.js.
const store = require('../../platform/db');
const audit = require('../../platform/audit');
const events = require('../../platform/events');
const configRev = require('../../params/config-rev');
const { container } = require('../container');

// run(at) thực hiện thay đổi và trả { before, after } (dạng xem); entity: { action, entityKind, entityId }
async function applyCatalogChange(me, actx, { effectiveMonth, reason, entity, run }: any) {
  if (effectiveMonth) await store.assertPeriodOpen(effectiveMonth, 'params'); // chỉ thêm cảnh báo vào actx
  const at = new Date(Date.now()).toISOString();
  const result = await store.transaction(async () => {
    const changed = await run(at);
    await container.bumpCatalogRev();
    const rev = await configRev.bump();
    await audit.write(actx, {
      ...entity,
      month: effectiveMonth || null,
      before: changed.before,
      after: changed.after,
      reason: reason || null,
      sensitivity: 'pay'
    });
    return { ...changed, configRev: rev };
  });
  events.emit.paramsChanged({
    configRev: result.configRev,
    fromMonth: effectiveMonth || null,
    kind: 'catalog',
    groups: [entity.entityKind],
    by: me.username
  });
  return result;
}

export = { applyCatalogChange };
