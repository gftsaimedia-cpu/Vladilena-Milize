// Dữ liệu giả của thanh kỳ lương (thiết kế 22/10): mỗi tháng một trạng thái mặc định.
// steps: [trạng thái 'done' | 'cur' | '', nhãn, chữ nhỏ]
export const DEFAULT_MONTH = '2026-11';

export const PERIODS = {
  '2026-10': {
    month: 'Tháng 10/2026',
    state: 'Đã trả lương',
    stateCls: 'ok',
    steps: [
      ['done', 'Chấm công'],
      ['done', 'Chốt công'],
      ['done', 'Tính lương'],
      ['done', 'AI kiểm tra'],
      ['done', 'Phê duyệt'],
      ['done', 'Trả lương', '26/11']
    ]
  },
  '2026-11': {
    month: 'Tháng 11/2026',
    state: 'Chưa tính lương',
    stateCls: '',
    steps: [
      ['done', 'Chấm công'],
      ['cur', 'Chốt công', 'hạn 03/12'],
      ['', 'Tính lương'],
      ['', 'AI kiểm tra'],
      ['', 'Phê duyệt'],
      ['', 'Trả lương', '10/12']
    ]
  }
};
