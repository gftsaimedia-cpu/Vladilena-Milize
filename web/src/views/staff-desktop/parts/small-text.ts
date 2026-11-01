// Dòng chữ phụ dưới nhãn: mảng gồm chuỗi hoặc { label, value } (tiền), nối bằng " · ".
import { vnd } from '@/utils/format';

export const smallText = (items?) =>
  (items || []).map(i => (typeof i === 'string' ? i : `${i.label} ${vnd(i.value)}`)).join(' · ');
