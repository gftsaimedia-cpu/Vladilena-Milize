import { Module } from '@nestjs/common';
import { STORE } from '../../core/tokens';
import { RequestV2Repository } from '../../data/request-v2.repository';
import { RequestV2Controller } from './request-v2.controller';
import { RequestV2Service } from './request-v2.service';

@Module({
  controllers: [RequestV2Controller],
  providers: [
    RequestV2Service,
    {
      provide: RequestV2Repository,
      useFactory: (store: any) => new RequestV2Repository(store.queryBuilder),
      inject: [STORE]
    }
  ],
  exports: [RequestV2Service, RequestV2Repository]
})
export class RequestV2Module {}
