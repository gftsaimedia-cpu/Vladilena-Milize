import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import type { RealtimeEvent } from './realtime-event';

export type RealtimeListener = (event: RealtimeEvent) => void;

/**
 * Cổng phát/nhận sự kiện. Nơi phát chỉ biết lớp này; muốn chạy nhiều instance thì viết bản dùng
 * PostgreSQL LISTEN/NOTIFY (publish = NOTIFY, subscribe = LISTEN rồi gọi listener) và đổi provider trong RealtimeModule.
 */
export abstract class RealtimeBus {
  /** Không ném lỗi và không chờ listener: một listener hỏng không được ảnh hưởng nơi phát. */
  abstract publish(event: RealtimeEvent): void;
  /** Trả hàm huỷ đăng ký. */
  abstract subscribe(listener: RealtimeListener): () => void;
  abstract listenerCount(): number;
}

const CHANNEL = 'event';

/** Bản trong tiến trình (một instance). */
@Injectable()
export class InProcessRealtimeBus extends RealtimeBus {
  private readonly emitter = new EventEmitter();

  constructor() {
    super();
    this.emitter.setMaxListeners(0); // mỗi kết nối SSE là một listener
  }

  publish(event: RealtimeEvent): void {
    for (const listener of this.emitter.listeners(CHANNEL) as RealtimeListener[]) {
      try {
        listener(event);
      } catch (err) {
        console.error('Listener realtime lỗi:', err);
      }
    }
  }

  subscribe(listener: RealtimeListener): () => void {
    this.emitter.on(CHANNEL, listener);
    return () => {
      this.emitter.off(CHANNEL, listener);
    };
  }

  listenerCount(): number {
    return this.emitter.listenerCount(CHANNEL);
  }
}
