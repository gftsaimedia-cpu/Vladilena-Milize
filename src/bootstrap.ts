import 'reflect-metadata';
import http from 'node:http';
import express from 'express';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { securityHeaders, serveStatic, ApiExceptionFilter } from './common';

export function createServer(): http.Server {
  const instance = express();
  instance.disable('x-powered-by');
  instance.disable('etag');
  instance.use(express.json());

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
