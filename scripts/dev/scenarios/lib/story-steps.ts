'use strict';
// Dựng các mục kiểm của cốt truyện: dòng phiếu, dòng ngày, phép, phản hồi HTTP, nhãn chấm công, kỳ lương, các điểm đọc và quan sát.
const slip = (u?, month?, fields?, now?) => ({ type: 'slip', u, month, fields, ...(now ? { now } : {}) });
const row = (u?, date?, fields?, now?) => ({ type: 'row', u, date, fields, ...(now ? { now } : {}) });
const lv = (key?, fields?, now?) => ({ type: 'leave', key, fields, ...(now ? { now } : {}) });
const http = (ref?, fields?, now?) => ({ type: 'http', ref, fields, ...(now ? { now } : {}) });
const label = (u?, date?, value?, now?) => ({ type: 'label', u, date, label: value, ...(now ? { now } : {}) });
const labelAt = (key?, value?, now?) => ({ type: 'labelProbe', key, label: value, ...(now ? { now } : {}) });
const period = (month?, status?) => ({ type: 'period', month, fields: { status } });
const slipAt = (key?, fields?) => ({ type: 'slipProbe', key, fields });
const rowAt = (key?, date?, fields?) => ({ type: 'rowProbe', key, date, fields });
const observe = (what?) => ({ type: 'observe', what });
const settle = (u?, days?, pay?) => slip(u, '2027-02', { quyetToanNgay: days, quyetToanPhep: pay });

module.exports = { slip, row, lv, http, label, labelAt, period, slipAt, rowAt, observe, settle };
