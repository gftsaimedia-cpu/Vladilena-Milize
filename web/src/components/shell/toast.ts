// Thông báo nổi dùng chung: lỗi của máy chủ và cảnh báo (warnings) gộp thành một thông báo.
// Dùng: import { toast } from '@/components/shell/toast'; toast.error(e.message); toast.warnings(list); toast.ok('...').
import { reactive } from 'vue';

const LIFE = { error: 7000, warn: 9000, ok: 3500 };
let seq = 0;

export const toasts = reactive([]);

function push(kind?, text?) {
  const message = String(text || '').trim();
  if (!message) return null;
  const old = toasts.findIndex(t => t.kind === kind && t.text === message);
  if (old >= 0) toasts.splice(old, 1);
  const item = { id: ++seq, kind, text: message };
  toasts.push(item);
  setTimeout(() => dismiss(item.id), LIFE[kind] || 6000);
  return item.id;
}

export function dismiss(id?) {
  const i = toasts.findIndex(t => t.id === id);
  if (i >= 0) toasts.splice(i, 1);
}

export const toast = {
  error: (text?) => push('error', text),
  ok: (text?) => push('ok', text),
  // list: mảng { message } (hoặc chuỗi) từ phản hồi 2xx; gộp thành một thông báo, mỗi cảnh báo một dòng.
  warnings(list?) {
    const lines = (Array.isArray(list) ? list : [])
      .map(w => (typeof w === 'string' ? w : w && w.message))
      .filter(Boolean);
    return push('warn', lines.join('\n'));
  }
};
