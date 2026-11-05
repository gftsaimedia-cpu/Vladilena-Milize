// Kỳ lương đang xem trên mọi màn Admin (tháng + thanh các bước). Màn có kịch bản riêng (Bảng lương) gọi setStrip();
// đổi màn thì AdminLayout gọi resetStrip() để thanh về trạng thái kỳ máy chủ trả cho tháng đó.
import { defineStore } from 'pinia';
import { emptyStrip } from '@/builders/period-strip';
import { periodStripFromPeriod } from '@/builders/api/period';
import { periodStrip } from '@/mock/period';
import { api } from '@/services/http';
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
    // Nạp trạng thái kỳ của tháng đang xem. Máy chủ thật: GET /api/v2/system/periods (lỗi thì giữ thanh rỗng);
    // tháng đã đổi trong lúc chờ thì bỏ kết quả cũ.
    async refresh() {
      const month = this.month;
      this.base = __MOCK__ ? periodStrip(month) : emptyStrip(month);
      this.strip = JSON.parse(JSON.stringify(this.base));
      if (__MOCK__) return;
      try {
        const { periods = [] } = await api.get('/system/periods');
        if (this.month !== month) return;
        this.base = periodStripFromPeriod(periods.find(p => p.month === month) || null, month);
        this.strip = JSON.parse(JSON.stringify(this.base));
      } catch {
        // không đọc được kỳ: thanh chỉ có tên tháng
      }
    },
    // Chốt công tháng đang xem: POST /api/v2/system/periods/:month/lock rồi đọc lại thanh. Lỗi ném ApiError.
    async lock() {
      await api.post(`/system/periods/${encodeURIComponent(this.month)}/lock`);
      await this.refresh();
    },
    setStrip(patch?) {
      this.strip = { ...this.strip, ...patch };
    },
    resetStrip() {
      this.strip = this.base ? JSON.parse(JSON.stringify(this.base)) : emptyStrip(this.month);
    }
  }
});
