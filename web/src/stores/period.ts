// Kỳ lương đang xem trên mọi màn Admin (tháng + thanh các bước). Màn có kịch bản riêng (Bảng lương) gọi setStrip();
// đổi màn thì AdminLayout gọi resetStrip() để thanh về trạng thái kỳ máy chủ trả cho tháng đó.
import { defineStore } from 'pinia';
import { emptyStrip } from '@/builders/period-strip';
import { periodStripFromView, type PeriodAction, type PeriodView } from '@/builders/api/period';
import { initialStatus, periodView, type MockStatus } from '@/mock/period';
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
    // view: trạng thái kỳ của máy chủ (status, actions, payday); mockStatus: bước kỳ giả của từng tháng, đổi khi bấm nút.
    return {
      month,
      current: month,
      base: null,
      strip: emptyStrip(month),
      view: null as PeriodView | null,
      mockStatus: {} as Record<string, MockStatus>
    };
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
      this.view = null;
      this.strip = emptyStrip(month);
      this.refresh();
    },
    // Dựng lại thanh từ trạng thái kỳ vừa nhận.
    apply(view: PeriodView | null, month: string) {
      this.view = view;
      this.base = periodStripFromView(view, month);
      this.strip = JSON.parse(JSON.stringify(this.base));
    },
    // Nạp trạng thái kỳ của tháng đang xem. Máy chủ thật: GET /api/v2/system/periods/:month (lỗi thì giữ thanh rỗng);
    // tháng đã đổi trong lúc chờ thì bỏ kết quả cũ.
    async refresh() {
      const month = this.month;
      if (__MOCK__) return this.apply(periodView(month, this.mockStatus[month]), month);
      // Đọc lại cùng tháng (sau khi duyệt phiếu, tính lương) thì giữ thanh cũ tới khi có kết quả, không chớp.
      if (!this.view || this.view.month !== month) {
        this.view = null;
        this.base = emptyStrip(month);
        this.strip = JSON.parse(JSON.stringify(this.base));
      }
      try {
        const view = await api.get(`/system/periods/${encodeURIComponent(month)}`);
        if (this.month === month) this.apply(view, month);
      } catch {
        // không đọc được kỳ: thanh chỉ có tên tháng
      }
    },
    // Chốt công / mở lại công / phê duyệt / huỷ phê duyệt / đã trả lương tháng đang xem:
    // POST /api/v2/system/periods/:month/<action> (mở lại và huỷ phê duyệt kèm { reason }). Trả về kỳ mới; lỗi ném ApiError
    // (409 với câu tiếng Việt của máy chủ), khi đó đọc lại kỳ để nút khớp trạng thái thật.
    async act(action: PeriodAction, reason?: string) {
      const month = this.month;
      if (__MOCK__) {
        const view = periodView(month, this.mockStatus[month] ?? initialStatus(month));
        const state = view.actions[action];
        if (!state?.enabled) throw new Error(state?.reason || 'Kỳ lương đang ở bước khác, không làm được thao tác này');
        const next = { unlock: 'open', approve: 'approved', unapprove: 'calculated' }[action] as MockStatus;
        this.mockStatus = { ...this.mockStatus, [month]: next };
        return this.refresh();
      }
      try {
        const view = await api.post(`/system/periods/${encodeURIComponent(month)}/${action}`, reason === undefined ? undefined : { reason });
        if (this.month === month) this.apply(view, month);
      } catch (e) {
        await this.refresh();
        throw e;
      }
    },
    // Chốt công tháng đang xem (giữ tên cũ cho nơi đã gọi).
    lock() {
      return this.act('lock');
    },
    setStrip(patch?) {
      this.strip = { ...this.strip, ...patch };
    },
    resetStrip() {
      this.strip = this.base ? JSON.parse(JSON.stringify(this.base)) : emptyStrip(this.month);
    }
  }
});
