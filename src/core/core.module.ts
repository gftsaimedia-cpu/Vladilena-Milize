import { Global, Module } from '@nestjs/common';
import { AUDIT, AUTH, AUTHZ, DOMAIN, EVENTS, RULES, STORE } from './tokens';

/**
 * Cung cấp các dịch vụ dùng chung cho mọi module qua bộ chứa phụ thuộc của Nest: controller và lớp hỗ trợ nhận chúng
 * bằng `@Inject(TOKEN)` ở constructor thay vì `require` thẳng. Mỗi provider là factory dựng lười, trả về đối tượng
 * duy nhất của tầng platform / domain (không tạo bản sao), nên test và tiến trình sandbox vẫn mở lại DB như trước.
 */
const lazy = (token: string, load: () => unknown) => ({ provide: token, useFactory: load });

const PROVIDERS = [
  lazy(STORE, () => require('../platform/db')),
  lazy(AUTH, () => require('../platform/auth')),
  lazy(AUTHZ, () => require('../platform/authz')),
  lazy(AUDIT, () => require('../platform/audit')),
  lazy(EVENTS, () => require('../platform/events')),
  lazy(RULES, () => require('../platform/request-rules')),
  lazy(DOMAIN, () => require('../domain/container').container)
];

@Global()
@Module({ providers: PROVIDERS, exports: PROVIDERS.map(p => p.provide) })
export class CoreModule {}
