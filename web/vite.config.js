import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

// Máy chủ Node của luong-app (npm start ở thư mục gốc, cổng 3000; đổi bằng biến BACKEND_ORIGIN). Các hàm trong src/services gọi /api
// qua proxy này nên cùng nguồn gốc với trình duyệt: cookie phiên đi theo, không cần CORS. npm run build ghi vào web/dist
// (máy chủ phục vụ thư mục này ở "/", không cần proxy).
const BACKEND_ORIGIN = process.env.BACKEND_ORIGIN || 'http://127.0.0.1:3000';

const apiProxy = {
  '/api': {
    target: BACKEND_ORIGIN,
    changeOrigin: false, // giữ Host của trình duyệt để cookie phiên đi theo
    ws: false
  }
};

export default defineConfig({
  plugins: [vue()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { host: '127.0.0.1', port: 5173, strictPort: true, proxy: apiProxy },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true, proxy: apiProxy }
});
