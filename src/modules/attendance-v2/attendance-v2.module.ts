import { Module } from '@nestjs/common';
import { STORE } from '../../core/tokens';
import { AttendanceV2Repository } from '../../data/attendance-v2.repository';
import { AttendanceV2Controller } from './attendance-v2.controller';
import { AttendanceV2Service } from './attendance-v2.service';

@Module({
  controllers: [AttendanceV2Controller],
  providers: [
    AttendanceV2Service,
    {
      provide: AttendanceV2Repository,
      useFactory: (store: any) => new AttendanceV2Repository(store.queryBuilder),
      inject: [STORE]
    }
  ],
  exports: [AttendanceV2Service, AttendanceV2Repository]
})
export class AttendanceV2Module {}
