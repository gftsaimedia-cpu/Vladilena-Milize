<script setup lang="ts">
// Thẻ Kỳ lương: trạng thái, thông tin kỳ, biểu đồ vòng thực nhận / khấu trừ, thanh chia trạng thái phiếu.
import { computed } from 'vue';
import type { OverviewView } from '@/mock/overview';

const props = defineProps<{ period: OverviewView['period'] }>();

const R = 48;
const CIRC = 2 * Math.PI * R;
const dash = computed(() => `${(CIRC * props.period.netShare) / 100} ${CIRC}`);

const SLIPS = [
  { key: 'done', label: 'Đã duyệt' },
  { key: 'pending', label: 'Chờ duyệt' },
  { key: 'draft', label: 'Nháp' },
  { key: 'rejected', label: 'Từ chối' }
] as const;
const slips = computed(() =>
  SLIPS.map(s => ({
    ...s,
    count: props.period.slips[s.key],
    width: `${(props.period.slips[s.key] / (props.period.slips.total || 1)) * 100}%`
  }))
);
</script>

<template>
  <section class="card pd" aria-labelledby="ov-pd-h">
    <div class="head">
      <h2 id="ov-pd-h">{{ period.title }}</h2>
      <span class="pill st-pending">{{ period.statusLabel }}</span>
    </div>

    <dl class="info">
      <div>
        <dt>Kỳ công</dt>
        <dd>{{ period.range }}</dd>
      </div>
      <div>
        <dt>Ngày trả lương</dt>
        <dd>{{ period.payday }}</dd>
      </div>
    </dl>

    <div class="donut-row">
      <div class="donut">
        <svg viewBox="0 0 120 120" width="120" height="120" aria-hidden="true">
          <circle cx="60" cy="60" :r="R" fill="none" stroke="var(--gold)" stroke-width="16" />
          <circle
            cx="60"
            cy="60"
            :r="R"
            fill="none"
            stroke="var(--surface-dark)"
            stroke-width="16"
            :stroke-dasharray="dash"
            transform="rotate(-90 60 60)"
          />
        </svg>
        <span class="pct">{{ period.netShare }}%</span>
      </div>
      <ul class="split">
        <li>
          <i class="sw net" /><span>Thực nhận</span><b>{{ period.net }}</b>
        </li>
        <li>
          <i class="sw ded" /><span>Khấu trừ (BHXH, thuế, tạm ứng)</span><b>{{ period.deductions }}</b>
        </li>
      </ul>
    </div>

    <div class="slips">
      <div class="bar" aria-hidden="true">
        <span v-for="s in slips" :key="s.key" class="seg" :class="`st-${s.key}`" :style="{ width: s.width }" />
      </div>
      <ul class="counts" aria-label="Phiếu lương theo trạng thái">
        <li v-for="s in slips" :key="s.key">
          <i class="dot" :class="`st-${s.key}`" /><b>{{ s.count }}</b> <span>{{ s.label }}</span>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.pd {
  padding: 24px;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.head {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 12px;
}
h2 {
  margin: 0;
  font-size: 18px;
  line-height: 24px;
  font-weight: 600;
}
.st-pending {
  background: var(--status-pending);
  color: var(--text);
}
.st-done {
  background: var(--status-done);
  color: #fff;
}
.st-draft {
  background: var(--status-draft);
  color: var(--text);
}
.st-rejected {
  background: var(--status-rejected);
  color: #fff;
}
.info {
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 8px 24px;
  font-size: 14px;
}
.info dt {
  font-size: 12px;
  color: var(--muted);
}
.info dd {
  margin: 2px 0 0;
  font-weight: 500;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.donut-row {
  display: flex;
  align-items: center;
  gap: 16px;
}
.donut {
  position: relative;
  width: 120px;
  height: 120px;
  flex: none;
}
.pct {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  font-size: 18px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
ul {
  list-style: none;
  margin: 0;
  padding: 0;
}
.split {
  display: grid;
  gap: 8px;
  font-size: 12px;
  line-height: 16px;
  min-width: 0;
}
.split li {
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 2px 6px;
  color: var(--muted);
}
.split b {
  grid-column: 2;
  font-size: 14px;
  line-height: 20px;
  color: var(--text);
  font-variant-numeric: tabular-nums;
}
.sw {
  width: 10px;
  height: 10px;
  border-radius: 3px;
  display: inline-block;
  flex: none;
}
.sw.net {
  background: var(--surface-dark);
}
.sw.ded {
  background: var(--gold);
}
.slips {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.bar {
  display: flex;
  gap: 2px;
  height: 12px;
  border-radius: var(--r-pill);
  overflow: hidden;
}
.seg {
  height: 100%;
  min-width: 4px;
}
/* Chú thích: 4 mục luôn một hàng, mục đầu sát mép trái thanh, mục cuối sát mép phải.
   Mỗi mục: chấm màu + số ở trên, nhãn ở dưới, nên thẻ hẹp (3 cột ở ~1300px) vẫn đủ chỗ. */
.counts {
  display: grid;
  grid-template-columns: repeat(4, max-content);
  justify-content: space-between;
  column-gap: 12px;
  font-size: 12px;
  line-height: 16px;
  color: var(--muted);
}
.counts li {
  display: grid;
  /* Cột chấm cố định 8px: nhãn dài phía dưới chỉ nới cột số, chấm luôn sát số. */
  grid-template-columns: 8px auto;
  justify-content: start;
  align-items: center;
  column-gap: 6px;
}
.counts .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.counts b {
  font-size: 14px;
  line-height: 20px;
  font-weight: 600;
  color: var(--text);
  font-variant-numeric: tabular-nums;
}
.counts span {
  grid-column: 1 / -1;
  white-space: nowrap;
}
@media (max-width: 480px) {
  .pd {
    padding: 20px 16px;
  }
}
</style>
