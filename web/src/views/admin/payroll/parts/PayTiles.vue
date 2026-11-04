<script setup lang="ts">
// Bốn ô số của Bảng lương. Ô đầu (nền vàng) là ô vàng duy nhất của màn; ô cuối có thanh chia đoạn theo số đếm phiếu.
import { computed } from 'vue';
import type { PayrollScreen, SlipCounts } from '@/mock/payroll';
import { billions } from '@/utils/format';
import { monthNo } from '@/views/admin/requests/helpers';

type Board = Extract<PayrollScreen, { empty: false }>;
const props = defineProps<{ month: string; growth: string; totals: Board['totals']; counts: SlipCounts }>();

const BAR = [
  { key: 'done', color: 'var(--status-done)' },
  { key: 'pending', color: 'var(--status-pending)' },
  { key: 'draft', color: 'var(--status-draft)' },
  { key: 'rejected', color: 'var(--status-rejected)' }
] as const;
const bar = computed(() => BAR.map(b => ({ ...b, count: props.counts[b.key] })));
</script>

<template>
  <section class="tiles" aria-label="Chỉ số kỳ lương">
    <article class="tile gold" :aria-label="`Tổng thu nhập tháng ${monthNo(month)}`">
      <span class="l">Tổng thu nhập tháng {{ monthNo(month) }}</span>
      <span class="v">{{ billions(totals.gross) }} <span class="u">tỷ ₫</span></span>
      <span class="n">{{ growth }}</span>
    </article>
    <article class="tile" aria-label="Thực nhận">
      <span class="l">Thực nhận</span>
      <span class="v">{{ billions(totals.net) }} <span class="u">tỷ ₫</span></span>
      <span class="n">{{ totals.netShare }}% tổng thu nhập</span>
    </article>
    <article class="tile" aria-label="Khấu trừ">
      <span class="l">Khấu trừ</span>
      <span class="v">{{ billions(totals.deductions) }} <span class="u">tỷ ₫</span></span>
      <span class="n"
        >Bảo hiểm {{ billions(totals.insurance) }} · Thuế {{ billions(totals.tax) }} · Tạm ứng
        {{ billions(totals.advance) }}</span
      >
    </article>
    <article class="tile" aria-label="Phiếu đã duyệt">
      <span class="l">Phiếu đã duyệt</span>
      <span class="v">{{ counts.done }}<span class="u"> / {{ counts.all }}</span></span>
      <span class="bar" aria-hidden="true">
        <i
          v-for="b in bar"
          :key="b.key"
          :style="{ flex: b.count, background: b.color, minWidth: b.key === 'rejected' && b.count > 0 ? '4px' : undefined }"
        />
      </span>
    </article>
  </section>
</template>

<style scoped>
.tiles {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 200px), 1fr));
  gap: 16px;
  margin-bottom: 24px;
}
.tile {
  min-height: 120px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 8px;
  padding: 16px 20px;
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  background: var(--surface);
  color: var(--text);
}
.tile.gold {
  background: var(--gold);
  border-color: var(--gold);
}
.l {
  font-size: 12px;
  line-height: 16px;
  font-weight: 500;
  color: var(--muted);
}
.v {
  font-size: 28px;
  line-height: 32px;
  font-weight: 500;
  letter-spacing: -0.56px;
  font-variant-numeric: tabular-nums;
}
.u {
  font-size: 18px;
  letter-spacing: 0;
  color: var(--muted);
}
.n {
  font-size: 12px;
  line-height: 16px;
  color: var(--muted);
}
.gold .l,
.gold .u,
.gold .n {
  color: var(--text);
}
.bar {
  display: flex;
  gap: 2px;
  height: 6px;
}
.bar i {
  border-radius: 3px;
}
</style>
