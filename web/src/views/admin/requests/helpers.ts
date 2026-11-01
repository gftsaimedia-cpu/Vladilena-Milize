// Định dạng dùng chung cho Tổng quan, Yêu cầu, Trợ lý AI (chỉ định dạng, không tính).
import { dmy, vndc } from '@/utils/format';

/** '2026-11-10T09:00' → '09:00 10/11/2026' */
export const atLabel = (iso?) => (iso ? `${iso.slice(11, 16)} ${dmy(iso.slice(0, 10))}` : '');
/** '2026-11-10T09:00' → 'Gửi 09:00 10/11/2026' */
export const sentLabel = (iso?) => `Gửi ${atLabel(iso)}`;
/** '2026-11' → 11 */
export const monthNo = (ym?) => Number(String(ym || '').slice(5, 7));
/** "Nhân sự · chức danh" như thiết kế: 'CTV · Advanced Practitioner' */
export const roleLine = (r?) => [r.type, r.position].filter(Boolean).join(' · ');
/** Nội dung cảnh báo: thay {money} bằng số tiền */
export const warningText = (w?) => (w.money != null ? w.text.replace('{money}', vndc(w.money)) : w.text);
/** Số hoặc tiền của một dòng chỉ số/ngưỡng: { value } hoặc { money } */
export const figure = (x?) => (x.money != null ? vndc(x.money) : x.value);
