// Chữ và nút của màn Bảng lương theo từng kịch bản (?kb=): tiêu đề phụ, nút bước kỳ, ghi chú, dải AI, kiểu bảng.
// Số phiếu lấy từ facts do máy chủ trả; ở đây chỉ ghép câu.
import { dmy } from '@/utils/format.js';

const A = {
  formula: { key: 'formula', label: 'Cách tính lương', icon: 'sliders' },
  close: { key: 'close', label: 'Chốt công', icon: 'lock', pri: true },
  reopenHours: { key: 'reopen-hours', label: 'Mở lại công', icon: 'unlock' },
  calc: { key: 'calc', label: 'Tính lương', icon: 'play', pri: true },
  ai: { key: 'ai', label: 'Chạy AI kiểm tra', icon: 'spark', pri: true },
  reopen: { key: 'reopen', label: 'Mở lại', icon: 'unlock' },
  approvePeriod: { key: 'approve-period', label: 'Phê duyệt kỳ lương', icon: 'lock', pri: true },
  reopenPeriod: { key: 'reopen-period', label: 'Mở lại kỳ', icon: 'unlock' },
  paid: { key: 'paid', label: 'Đánh dấu đã trả lương', icon: 'check', pri: true }
};
const print = f => ({ key: 'print', label: `In ${f.approved} phiếu`, icon: 'print' });

const EST = { est: 'Số màu nâu' };
const monthNo = month => Number(month.slice(5, 7));

// Dải AI trên bảng. Khoá nút: findings xem phát hiện, rerun chạy lại AI, recalc tính lại lương, skip bỏ qua có lý do
function aiBanner(kb, f) {
  if (kb === 'ban-nhap') {
    return {
      segs: ['AI chưa kiểm tra lần tính này. Chạy AI kiểm tra để phiếu chuyển sang ', { b: 'Chờ phê duyệt' }, '.'],
      buttons: ['recalc', 'skip']
    };
  }
  const s = f.aiFindings;
  if (!s) return null;
  const head = { b: `AI kiểm tra lần tính ${f.run}: ${s.total} phát hiện` };
  const count = ` · ${s.high} cao, ${s.mid} trung bình, ${s.low} thấp. `;
  if (kb === 'da-phe-duyet' || kb === 'da-tra-luong') {
    const tail = 'Mọi cảnh báo đã được bỏ qua kèm lý do hoặc phê duyệt riêng.';
    return { segs: [head, count + tail], buttons: ['findings'] };
  }
  return {
    segs: [head, count + 'Phiếu có cảnh báo phải phê duyệt riêng, kèm ghi chú.'],
    buttons: ['findings', 'rerun', 'recalc', 'skip']
  };
}

/**
 * Mô tả giao diện của một kịch bản.
 * Trả { variant, sub, actions, note, cap, ai, selection, extras, printInTools }.
 * agents: công tắc Agents; tắt thì không có dải AI, nút Chạy AI và chữ nhắc AI.
 */
export function describeScenario(month, kb, f, agents = false) {
  const n = monthNo(month);
  const aiOf = k => (agents ? aiBanner(k, f) : null);
  if (month === '2026-11') {
    const wide = kb === 'du-cot';
    return {
      variant: 'draft11',
      sub: [
        `Tháng ${n} chưa tính lương · `,
        { b: `${f.calculated} phiếu` },
        ' đã có số, ',
        { b: `${f.failed} phiếu` },
        ' chưa tính được vì hồ sơ thiếu thông tin'
      ],
      actions: [A.formula, { ...A.close, pri: false, off: true, small: `· mở từ ${f.openFrom}` }],
      note: null,
      cap: wide
        ? [EST, ' thành số chính thức sau bước Tính lương · Tiền ngày công đã gồm nghỉ lễ hưởng lương và đã trừ đi muộn, về sớm']
        : [EST, ' thành số chính thức sau bước Tính lương'],
      ai: null,
      selection: false,
      extras: false,
      printInTools: false
    };
  }
  const base = { variant: 'draft10', note: null, ai: null, selection: false, extras: false, printInTools: false };
  switch (kb) {
    case 'tam-tinh':
      return {
        ...base,
        sub: [
          `Tháng ${n} chưa tính lương · `,
          { b: `${f.calculated} phiếu` },
          ' đã có số, ',
          { b: `${f.failed} phiếu` },
          ` chưa tính được · đã qua hạn chốt công ${f.deadline}`
        ],
        actions: [A.formula, A.close],
        cap: [EST, ' thành số chính thức sau khi phê duyệt kỳ lương'],
        extras: true
      };
    case 'da-chot-cong':
      return {
        ...base,
        sub: [`Đã chốt công tháng ${n} lúc ${f.closedAt} · bước tiếp theo: tính lương ra bản nháp`],
        actions: [A.formula, A.reopenHours, A.calc],
        note: {
          cls: 'ok',
          icon: 'lock',
          segs: [
            `Bảng công tháng ${n} đã khoá lúc ${f.closedAt}/2026. Số dưới đây còn đổi cho tới khi bấm `,
            { b: 'Tính lương' },
            '.'
          ]
        },
        cap: [EST, ' thành số chính thức sau bước Tính lương']
      };
    case 'ban-nhap':
      return {
        ...base,
        sub: [
          `Bản nháp lần tính ${f.run} · `,
          { b: `${f.calculated} phiếu` },
          ' có số, ',
          { b: `${f.failed} phiếu` },
          agents ? ' chưa tính được · chờ AI kiểm tra' : ' chưa tính được'
        ],
        actions: agents ? [A.formula, A.reopenHours, A.ai] : [A.formula, A.reopenHours],
        cap: [`Bản nháp lần tính ${f.run} · số chưa phải lương chính thức cho tới khi phê duyệt kỳ lương`],
        ai: aiOf(kb)
      };
    case 'cho-phe-duyet':
    case 'chon-phieu':
      return {
        ...base,
        variant: 'review',
        sub: [
          { b: `${f.pending} phiếu` },
          agents ? ` chờ phê duyệt · ${f.aiCards} phiếu có cảnh báo AI phải phê duyệt riêng` : ' chờ phê duyệt'
        ],
        actions: [A.formula, A.reopen, A.approvePeriod],
        cap: [`Bản nháp lần tính ${f.run}`],
        ai: aiOf(kb),
        selection: true
      };
    case 'da-duyet-50':
      return {
        ...base,
        variant: 'review',
        sub: [
          { b: `${f.approved}/${f.total} phiếu` },
          agents
            ? ` đã phê duyệt · còn ${f.pending} phiếu có cảnh báo AI chờ phê duyệt riêng`
            : ` đã phê duyệt · còn ${f.pending} phiếu chờ phê duyệt`
        ],
        actions: [A.formula, A.reopen, A.approvePeriod],
        cap: [`Bản nháp lần tính ${f.run}`],
        ai: aiOf(kb),
        selection: true,
        printInTools: true
      };
    case 'can-tinh-lai':
      return {
        ...base,
        variant: 'review',
        sub: [
          { b: `${f.approved}/${f.total} phiếu` },
          ` đã phê duyệt · ${f.pending} phiếu chờ phê duyệt · ${f.failed} phiếu chưa tính được`
        ],
        actions: [A.formula, A.reopen, A.approvePeriod],
        note: {
          cls: 'warn',
          icon: 'alert',
          segs: [
            { b: 'Cần tính lại:' },
            ' dữ liệu đầu vào (điểm KPI, số sửa trên phiếu, hồ sơ, ngày lễ) đã đổi sau lần tính 1, ' +
              'số trên bảng có thể chưa khớp. Tạm ứng của 1 phiếu đã được sửa về 0.'
          ]
        },
        cap: [`Bản nháp lần tính ${f.run}`],
        ai: aiOf(kb),
        selection: true,
        printInTools: true
      };
    case 'da-phe-duyet':
      return {
        ...base,
        variant: 'final',
        sub: [
          `Đã phê duyệt kỳ lương lúc ${f.approvedAt} · `,
          { b: `${f.approved} phiếu` },
          ` chính thức, ${f.failed} phiếu loại khỏi kỳ`
        ],
        actions: [A.formula, A.reopenPeriod, A.paid],
        note: {
          cls: 'ok',
          icon: 'lock',
          segs: [
            `Đây là số chính thức của lần tính ${f.run}, đã khoá lúc ${f.approvedAt}/2026. ` +
              'Muốn đổi phải mở lại kỳ.'
          ]
        },
        cap: ['Số chính thức'],
        ai: aiOf(kb),
        printInTools: true
      };
    default:
      return {
        ...base,
        variant: 'final',
        sub: [`Đã trả lương ngày ${dmy(f.paidDate)} · kỳ đã khoá, điều chỉnh làm ở kỳ sau`],
        actions: [A.formula, print(f)],
        note: {
          cls: '',
          icon: 'lock',
          segs: ['Kỳ đã trả lương nên không mở lại được. Muốn điều chỉnh thì làm ở kỳ sau (truy thu hoặc truy lĩnh).']
        },
        cap: ['Số chính thức · đã trả lương'],
        ai: aiOf('da-tra-luong')
      };
  }
}

export const AI_BUTTONS = {
  findings: 'Xem các phát hiện',
  rerun: 'Chạy lại AI',
  recalc: 'Tính lại lương',
  skip: 'Bỏ qua có lý do'
};

/** Nút In ở thanh công cụ của bảng (cùng nhãn với nút In ở tiêu đề). */
export const printLabel = f => `In ${f.approved} phiếu`;
