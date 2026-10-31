// Dòng chữ phụ dưới nhãn: mảng gồm chuỗi hoặc { label, value } (tiền), nối bằng " · ".
import { vnd } from '@/utils/format.js';

export const smallText = items =>
  (items || []).map(i => (typeof i === 'string' ? i : `${i.label} ${vnd(i.value)}`)).join(' · ');
