// Giao diện AiCB v2 (Vue 3 + Vite + Pinia + Vue Router), dựng theo bộ thiết kế 22/10/2026.
import { createPinia } from 'pinia';
import { createApp } from 'vue';
import App from './App.vue';
import { toast } from './components/shell/toast';
import router from './router/index';
import { onUnauthorized, onWarnings } from './services/http';
import { LOGIN_PATH, useSessionStore } from './stores/session';
import './styles/base.css';
import './styles/overlay.css';
import './styles/settings.css';
import './styles/phone.css';

const pinia = createPinia();
const app = createApp(App).use(pinia);
const session = useSessionStore();

// Cảnh báo của máy chủ (phản hồi 2xx có warnings) gộp thành một thông báo.
onWarnings(list => toast.warnings(list));

// 401 giữa chừng (phiên hết hạn hoặc bị thu hồi): xoá phiên và về đăng nhập đúng một lần.
let leaving = false;
onUnauthorized(() => {
  if (leaving || !session.isLoggedIn) return;
  leaving = true;
  session.clear();
  const from = router.currentRoute.value.fullPath;
  router
    .replace({ path: LOGIN_PATH, query: from && from !== '/' && !from.startsWith(LOGIN_PATH) ? { tiep: from } : {} })
    .finally(() => {
      leaving = false;
    });
});

// Biết phiên (GET /me, công khai) trước khi gắn app để route guard quyết định đúng ngay lần vào đầu tiên.
session
  .load()
  .catch(() => session.clear())
  .finally(() => {
    app.use(router).mount('#app');
  });
