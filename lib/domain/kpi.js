'use strict';
// Mặt tiền giữ tên hàm xuất cũ; logic nằm ở class KpiScoring (lib/domain/kpi/kpi-scoring.js), phụ thuộc nối thật ở đây.
const store = require('../db');
const KpiRules = require('../../public/kpi-score.js'); // KPI 5 thành phần: điểm, trọng số, ngưỡng
const { rulesFor, monthParams, typeParam } = require('../request-rules');
const { KpiScoring } = require('./kpi/kpi-scoring');

const kpi = new KpiScoring({
  sheetOf: (username, month) => store.getSheet(username, month), // đọc store mỗi lần: test mở DB khác vẫn đúng
  monthParams,
  rulesFor,
  typeParam,
  KpiRules
});

module.exports = {
  kpiMaxOf: (staff, params) => kpi.maxOf(staff, params),
  hasKpi: (staff, params) => kpi.has(staff, params),
  cleanKpi: KpiScoring.cleanScore,
  cleanKpiAmt: (v, staff, month) => kpi.cleanAmount(v, staff, month),
  kpiScoresOut: KpiScoring.scoresOut,
  kpiScoreItem: (staff, month, row, params) => kpi.scoreItem(staff, month, row, params),
  kpiPartsView: (row, month, viewer) => kpi.partsView(row, month, viewer),
  kpiHttpError: KpiScoring.httpError,
  selfScoreOnly: KpiScoring.selfScoreOnly
};
