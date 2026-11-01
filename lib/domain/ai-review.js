const { AsyncList } = require('../shared/async-list');
const store = require('../db');
const paramsStore = require('../params/store');
const payrollService = require('../payroll-service'); // nạp đầu vào một tháng, chạy bộ máy dùng chung
const { nowIso } = require('../request-rules');
const { advanceApprovals } = require('./advance');
const sharedCache = require('../ops/shared-cache');

/* ---------- soát dữ liệu trước khi chốt lương (chỉ đọc) ---------- */
// Bộ máy lương của AI dựng theo tham số hiệu lực của tháng (paramsStore.resolve → lib/ai/payroll-loader.js), nhớ theo paramsHash để không dựng lại
// mỗi lần; lỗi nạp không được nhớ để lần sau thử lại.
const aiPayrollByHash = new Map();
function aiPayrollOnce(resolved) {
  if (aiPayrollByHash.has(resolved.hash)) return aiPayrollByHash.get(resolved.hash);
  try {
    const payroll = require('../ai/payroll-loader').loadPayroll(resolved.params);
    aiPayrollByHash.set(resolved.hash, payroll);
    return payroll;
  } catch {
    console.error('[ai-review] không nạp được công thức lương, các luật cần tiền sẽ bị bỏ qua');
    return null;
  }
}
// Dựng đầu vào cho review() chỉ bằng các hàm đọc của store; không ghi gì, không gọi closeStale().
async function aiReviewResult(month, includeImpacts) {
  const { review } = require('../ai/review');
  const { resolveThresholds } = require('../ai/thresholds');
  const resolved = await paramsStore.resolve(month); // tham số hiệu lực của đúng tháng này (chế độ 'defaults-only' thì là DEFAULTS)
  const staff = await store.listStaff();
  const people = staff.filter(s => s.payrollSubject);
  const sheets = await AsyncList.flatMap(people, async s =>
    AsyncList.map(await store.listSheets(s.username), async ({ month: sheetMonth }) => ({
      username: s.username,
      month: sheetMonth,
      ...(await store.getSheet(s.username, sheetMonth))
    }))
  );
  const slipOverrides = (
    await AsyncList.map(people, async s => ({
      username: s.username,
      month,
      values: (await store.getSlipOverride(s.username, month)).values
    }))
  ).filter(o => Object.keys(o.values).length);
  const viewer = { role: 'admin' };
  const kpiScores = await AsyncList.map(
    (await store.listKpiScores(month)).filter(row => people.some(s => s.username === row.username)),
    async row => ({
      username: row.username,
      month,
      parts: await require('./container').container.kpi.partsView(row, month, viewer)
    })
  );
  const result = review({
    asOf: nowIso(),
    month,
    staff,
    insuredUnset: await store.repos.staff.usernamesWithUnsetInsured(), // đóng bảo hiểm theo mặc định của hợp đồng
    sheets,
    approvals: await store.approvals.list({ status: 'all' }),
    sessions: await store.listSessions(),
    holidays: await store.getSetting('holidays', []),
    kpiScores,
    slipOverrides,
    // người được Admin duyệt tạm ứng của tháng soát, để số tính lại khớp phiếu
    advances: Object.fromEntries([...(await advanceApprovals.approvedSet(month))].map(username => [username, true])),
    params: resolved.params,
    payroll: aiPayrollOnce(resolved),
    // Tham số có hiệu lực từ đúng tháng này (chỉ khoá, tháng hiệu lực, giờ lưu: không giá trị, không lý do) và bộ máy lương của tháng trước, để AI so sánh
    paramChanges: (await store.repos.params.inMonth(month)).map(r => ({
      key: r.key,
      effectiveMonth: r.effective_month,
      createdAt: r.created_at
    })),
    payrollBefore: aiPayrollOnce(await paramsStore.resolve(payrollService.previousMonth(month))),
    includeImpacts
  });
  // review() không bao giờ cầm tên: route thêm tên hiển thị, chỉ cho các tài khoản có trong phát hiện
  const nameOf = new Map(people.map(s => [s.username, s.name]));
  const names = {};
  for (const finding of result.findings) names[finding.username] = nameOf.get(finding.username) || finding.username;
  const { checked, summary } = result;
  // Chỉ đếm, không ghi tên, số tiền hay nội dung phát hiện
  console.log(
    `[ai-review] month=${month} rules=${checked.rules} staff=${checked.staff} days=${checked.days} findings=${summary.total} high=${summary.bySeverity.high} skipped=${checked.skipped.length}`
  );
  return { ...result, thresholds: resolveThresholds(undefined, resolved.params), names };
}

// Bản dùng chung cho các nơi chỉ đọc kết quả (màn AI của Admin, chặn duyệt): nhiều Admin cùng mở thì chỉ tính một lần giữa hai lần DB đổi.
// Luồng chốt lương (periods.aiReview) vẫn gọi bản tính mới để phiếu chốt không dính kết quả cũ.
// Kết quả dùng chung chỉ được đọc, không sửa.
async function aiReviewResultCached(month, includeImpacts) {
  return await sharedCache.compute.get(
    `ai-review|${month}|${includeImpacts ? 1 : 0}`,
    async () => await aiReviewResult(month, includeImpacts)
  );
}

module.exports = { aiReviewResult, aiReviewResultCached };
