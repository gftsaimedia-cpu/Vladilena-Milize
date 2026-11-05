import 'reflect-metadata';
import http from 'node:http';
import express from 'express';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { securityHeaders, serveStatic, ApiExceptionFilter } from './common';
import { jsonBodyErrors, requireJsonBody } from './common/http-guards';

export function createServer(): http.Server {
  const instance = express();
  instance.disable('x-powered-by');
  instance.disable('etag');
  // Số lớp proxy đứng trước app (Caddy = 1), để req.ip là địa chỉ thật của khách cho giới hạn đăng nhập.
  instance.set('trust proxy', Number(process.env.TRUST_PROXY) || 0);
  instance.use('/api', requireJsonBody);
  instance.use(express.json({ limit: '1mb' })); // khớp request_body 1MB của Caddyfile
  instance.use(jsonBodyErrors);

  const ready = NestFactory.create(AppModule, new ExpressAdapter(instance), {
    logger: ['error', 'warn'],
  }).then((app) => {
    app.useGlobalFilters(new ApiExceptionFilter());
    return app.init();
  });

  ready.catch((err) => console.error('Lỗi khởi tạo NestJS:', err));

  const server = http.createServer(async (req, res) => {
    securityHeaders(res);
    let url: URL;
    try {
      url = new URL(req.url as string, 'http://localhost');
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Địa chỉ yêu cầu không hợp lệ' }));
      return;
    }

    if (!url.pathname.startsWith('/api/')) {
      return serveStatic(req, res, url);
    }

    try {
      await ready;
    } catch {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Máy chủ chưa sẵn sàng' }));
      return;
    }

    instance(req, res);
  });

  server.keepAliveTimeout = 65000;
  server.headersTimeout = 66000;
  return server;
}
