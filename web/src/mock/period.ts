// Thanh các bước kỳ lương giả: tháng hiện tại đang chờ phê duyệt, các tháng trước đã trả lương.
import { monthTitle } from '@/builders/period-strip';
import { MOCK_MONTH } from './clock';

const LABELS = ['Chấm công', 'Chốt công', 'Chấm KPI', 'Tính lương', 'Phê duyệt', 'Trả lương'];

export type MockStrip = { month: string; state: string; stateCls: string; steps: [string, string][] };

export function periodStrip(month: string): MockStrip {
  if (month === MOCK_MONTH) {
    const states = ['done', 'done', 'done', 'done', 'cur', ''];
    return {
      month: monthTitle(month),
      state: 'Chờ phê duyệt',
      stateCls: 'draft',
      steps: LABELS.map((label, i) => [states[i], label])
    };
  }
  return {
    month: monthTitle(month),
    state: 'Đã trả lương',
    stateCls: 'ok',
    steps: LABELS.map(label => ['done', label])
  };
}
