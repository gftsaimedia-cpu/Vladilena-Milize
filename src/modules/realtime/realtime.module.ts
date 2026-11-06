import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { InProcessRealtimeBus, RealtimeBus } from './realtime-bus';
import { RealtimeController } from './realtime.controller';

// Toàn cục để mọi module nghiệp vụ phát sự kiện mà không phải import. Đổi sang LISTEN/NOTIFY: đổi useClass.
@Global()
@Module({
  imports: [AuthModule],
  controllers: [RealtimeController],
  providers: [{ provide: RealtimeBus, useClass: InProcessRealtimeBus }],
  exports: [RealtimeBus],
})
export class RealtimeModule {}
