import 'reflect-metadata';
import http from 'node:http';
import express from 'express';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import type { LegacyApi } from './http/legacy.controller';
import { inflight } from './http/load-control';
import { RAW_URL } from './http/api-context';
import { send, securityHeaders, serveStatic } from '../lib/http';

/**
 * Máy chủ HTTP: tiêu đề bảo mật cho mọi phản hồi, file tĩnh ngoài /api, còn /api/* do ứng dụng Nest xử lý.
 * Trả về http.Server dùng được ngay (test gọi listen(0)); ứng dụng Nest khởi tạo bất đồng bộ, yêu cầu đến sớm thì chờ.
 */
export function createServer(legacy: LegacyApi): http.Server {
  const instance = express();
  instance.disable('x-powered-by');
  instance.disable('etag');
  const ready = NestFactory.create(AppModule.register(legacy), new ExpressAdapter(instance), { bodyParser: false, logger: ['error', 'warn'] }).then(app => app.init());
  ready.catch(error => console.error('Không khởi tạo được Nest:', error));

  return http.createServer(async (req, res) => {
    securityHeaders(res);
    let url: URL;
    try {
      url = new URL(req.url as string, 'http://localhost');
    } catch {
      return send(res, 400, { error: 'Địa chỉ yêu cầu không hợp lệ' });
    }
    if (!url.pathname.startsWith('/api/')) return serveStatic(req, res, url);
    if (url.pathname !== '/api/events') {
      inflight.count++;
      res.once('close', () => inflight.count--);
    }
    try {
      await ready;
    } catch {
      return send(res, 503, { error: 'Máy chủ chưa sẵn sàng' });
    }
    // Express giải mã tham số đường dẫn và trả 400 HTML khi gặp %-mã sai; ở đây mọi chỗ giải mã/kiểm tra đầu vào do route tự làm theo đường dẫn gốc
    // (ApiGate đọc req[RAW_URL]), nên cho Express thấy bản đã mã hoá lại dấu % để nó không bao giờ lỗi giải mã.
    (req as any)[RAW_URL] = req.url;
    req.url = (req.url as string).replace(/%/g, '%25');
    instance(req, res);
  });
}
