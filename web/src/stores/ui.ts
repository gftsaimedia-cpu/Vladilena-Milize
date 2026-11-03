// Tuỳ chọn hiển thị của người dùng (menu tài khoản): thanh bên sáng/tối, nền trắng/kem, mật độ thường/gọn.
// Lưu ở trình duyệt; ghi lên <html data-side, data-ground, data-density> để CSS (base.css) đổi theo.
import { defineStore } from 'pinia';

const KEY = 'aicb.v2.ui';
const read = () => {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
};
const apply = (s?) => {
  const el = document.documentElement;
  el.dataset.side = s.side;
  if (s.ground) el.dataset.ground = s.ground;
  else delete el.dataset.ground;
  if (s.density) el.dataset.density = s.density;
  else delete el.dataset.density;
};

export const useUiStore = defineStore('ui', {
  state: () => ({ side: 'dark', ground: '', density: 'gon', ...read() }),
  actions: {
    set(patch?) {
      Object.assign(this.$state, patch);
      apply(this.$state);
      try {
        localStorage.setItem(KEY, JSON.stringify(this.$state));
      } catch {
        /* trình duyệt chặn lưu: vẫn áp dụng cho phiên này */
      }
    },
    init() {
      apply(this.$state);
    }
  }
});
