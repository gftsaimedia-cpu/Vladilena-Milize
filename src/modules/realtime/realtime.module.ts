import { Global, Module } from '@nestjs/common';
import { InProcessRealtimeBus, RealtimeBus } from './realtime-bus';
import { RealtimeController } from './realtime.controller';

// Toàn cục để mọi module nghiệp vụ phát sự kiện mà không phải import. Đổi sang LISTEN/NOTIFY: đổi useClass.
@Global()
@Module({
  controllers: [RealtimeController],
  providers: [{ provide: RealtimeBus, useClass: InProcessRealtimeBus }],
  exports: [RealtimeBus],
})
export class RealtimeModule {}
