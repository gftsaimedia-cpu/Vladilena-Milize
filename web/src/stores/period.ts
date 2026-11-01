// Kỳ lương đang xem trên mọi màn Admin (tháng + thanh các bước). Màn có kịch bản riêng (Bảng lương) gọi setStrip();
// đổi màn thì AdminLayout gọi resetStrip() để thanh về trạng thái kỳ máy chủ trả cho tháng đó.
import { defineStore } from 'pinia';
import { api } from '@/services/http';
import { buildStrip, emptyStrip } from '@/builders/period-strip';
import { useSessionStore } from '@/stores/session';
import { addMonths } from '@/utils/format';

// Tháng hiện tại theo giờ Việt Nam (UTC+7) của đồng hồ máy chủ
function serverMonth() {
  const now = useSessionStore().serverNow;
  const t = now ? new Date(now) : new Date();
  return new Date(t.getTime() + 7 * 3600 * 1000).toISOString().slice(0, 7);
}

export const usePeriodStore = defineStore('period', {
  state: () => {
    const month = serverMonth();
    return { month, current: month, base: null, strip: emptyStrip(month) };
  },
  getters: {
    // Xem lùi tới tháng 1 của năm hiện tại, xem tới hết tháng hiện tại
    prevMonth: (s?) => (addMonths(s.month, -1) >= `${s.current.slice(0, 4)}-01` ? addMonths(s.month, -1) : null),
    nextMonth: (s?) => (addMonths(s.month, 1) <= s.current ? addMonths(s.month, 1) : null)
  },
  actions: {
    setMonth(month?) {
      if (!/^\d{4}-\d{2}$/.test(month || '') || month === this.month) return;
      this.month = month;
      this.base = null;
      this.strip = emptyStrip(month);
      this.refresh();
    },
    // Nạp trạng thái kỳ của tháng đang xem; lỗi thì giữ thanh chỉ có tên tháng
    async refresh() {
      const month = this.month;
      try {
        const period = await api('GET', `/periods/${month}`);
        if (month !== this.month) return;
        this.base = buildStrip(month, period);
        this.strip = JSON.parse(JSON.stringify(this.base));
      } catch {
        if (month === this.month) this.base = null;
      }
    },
    setStrip(patch?) {
      this.strip = { ...this.strip, ...patch };
    },
    resetStrip() {
      this.strip = this.base ? JSON.parse(JSON.stringify(this.base)) : emptyStrip(this.month);
    }
  }
});
