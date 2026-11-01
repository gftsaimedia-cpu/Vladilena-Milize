'use strict';
// Gửi yêu cầu tạm ứng trong cửa sổ ngày 16: đặt đồng hồ giả về ngày 16 của chính `month` (ngày 16 đã qua ngày advance.untilDay nên số theo quy tắc
// đã chốt), gọi POST /api/advance-approvals/request rồi đặt đồng hồ về giá trị trước đó.
// F: test/helpers/api-fixture.ts. Trả { status, data } của yêu cầu.
const WINDOW_DAY = 16;

const nextMonthOf = (month?) => {
  const year = Number(month.slice(0, 4));
  const m = Number(month.slice(5));
  return m === 12 ? `${year + 1}-01` : `${year}-${String(m + 1).padStart(2, '0')}`;
};

async function requestInWindow(F?, month?, who?, extra: any = {}) {
  const saved = F.now();
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) await F.at(`${month}-${WINDOW_DAY}T12:00:00`);
  try {
    return await F.call('POST', '/advance-approvals/request', { who, body: { month, ...extra } });
  } finally {
    await F.at(saved);
  }
}

module.exports = { WINDOW_DAY, nextMonthOf, requestInWindow };
