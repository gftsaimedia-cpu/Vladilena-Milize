// Chữ và nút của màn Bảng lương theo từng kịch bản (?kb=): tiêu đề phụ, nút bước kỳ, ghi chú, kiểu bảng.
// Số phiếu lấy từ facts do máy chủ trả; ở đây chỉ ghép câu.
import { dmy } from '../../../utils/format';

const A = {
  formula: { key: 'formula', label: 'Cách tính lương', icon: 'sliders' },
  close: { key: 'close', label: 'Chốt công', icon: 'lock', pri: true },
  reopenHours: { key: 'reopen-hours', label: 'Mở lại công', icon: 'unlock' },
  calc: { key: 'calc', label: 'Tính lương', icon: 'play', pri: true },
  reopen: { key: 'reopen', label: 'Mở lại', icon: 'unlock' },
  approvePeriod: { key: 'approve-period', label: 'Phê duyệt kỳ lương', icon: 'lock', pri: true },
  reopenPeriod: { key: 'reopen-period', label: 'Mở lại kỳ', icon: 'unlock' },
  paid: { key: 'paid', label: 'Đánh dấu đã trả lương', icon: 'check', pri: true }
};
const print = (f?) => ({ key: 'print', label: `In ${f.approved} phiếu`, icon: 'print' });

const EST = { est: 'Số màu nâu' };
const monthNo = (month?) => Number(month.slice(5, 7));

/**
 * Mô tả giao diện của một kịch bản.
 * Trả { variant, sub, actions, note, cap, selection, extras, printInTools }.
 */
export function describeScenario(month?, kb?, f?): any {
  const n = monthNo(month);
  const base: Record<string, any> = {
    variant: 'draft10',
    note: null,
    selection: false,
    extras: false,
    printInTools: false
  };
  switch (kb) {
    case 'tam-tinh':
      return {
        ...base,
        sub: [
          `Tháng ${n} chưa tính lương · `,
          { b: `${f.calculated} phiếu` },
          ' đã có số, ',
          { b: `${f.failed} phiếu` },
          f.deadline ? ` chưa tính được · đã qua hạn chốt công ${f.deadline}` : ' chưa tính được'
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
            `Bảng công tháng ${n} đã khoá lúc ${f.closedAt}. Số dưới đây còn đổi cho tới khi bấm `,
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
          ' chưa tính được'
        ],
        actions: [A.formula, A.reopenHours],
        cap: [`Bản nháp lần tính ${f.run} · số chưa phải lương chính thức cho tới khi phê duyệt kỳ lương`]
      };
    case 'cho-phe-duyet':
    case 'chon-phieu':
      return {
        ...base,
        variant: 'review',
        sub: [{ b: `${f.pending} phiếu` }, ' chờ phê duyệt'],
        actions: [A.formula, A.reopen, A.approvePeriod],
        cap: [`Bản nháp lần tính ${f.run}`],
        selection: false
      };
    case 'da-duyet-50':
      return {
        ...base,
        variant: 'review',
        sub: [{ b: `${f.approved}/${f.total} phiếu` }, ` đã phê duyệt · còn ${f.pending} phiếu chờ phê duyệt`],
        actions: [A.formula, A.reopen, A.approvePeriod],
        cap: [`Bản nháp lần tính ${f.run}`],
        selection: false,
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
              'số trên bảng có thể chưa khớp.'
          ]
        },
        cap: [`Bản nháp lần tính ${f.run}`],
        selection: false,
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
        cap: ['Số chính thức · đã trả lương']
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
export const printLabel = (f?) => `In ${f.approved} phiếu`;
