<script setup lang="ts">
// Dải bước kỳ lương: trạng thái kỳ và các bước. AdminLayout đặt dải dưới thanh trên ở Chấm công và KPI;
// Bảng lương tự đặt dải dạng thẻ (card) dưới tiêu đề trang.
import Icon from '@/components/ui/Icon.vue';
import { usePeriodStore } from '@/stores/period';

withDefaults(defineProps<{ card?: boolean }>(), { card: false });
const period = usePeriodStore();
</script>

<template>
  <div class="period" :class="{ card }">
    <span v-if="card" class="lead">
      <b>{{ period.strip.month }}</b>
      <span class="state" :class="period.strip.stateCls">{{ period.strip.state }}</span>
    </span>
    <span v-else class="state" :class="period.strip.stateCls">{{ period.strip.state }}</span>
    <div class="steps" role="region" aria-label="Các bước kỳ lương" tabindex="0">
      <template v-for="([st, label, small], i) in period.strip.steps" :key="label">
        <span
          v-if="i"
          class="sep"
          :class="{ ok: st === 'done' && period.strip.steps[i - 1][0] === 'done' }"
        />
        <span class="step" :class="st">
          <span class="d">
            <Icon v-if="st === 'done'" name="check" :size="11" :stroke="3" />
            <template v-else-if="card">{{ i + 1 }}</template>
          </span>
          {{ label }}
          <small v-if="small">{{ small }}</small>
        </span>
      </template>
    </div>
  </div>
</template>

<style scoped>
/* Hình thẻ: nền surface, viền border, bo 16px; vòng đánh số, đường nối co giãn giữa các bước. */
.period.card {
  display: flex;
  flex-wrap: wrap;
  gap: 16px 24px;
  min-height: 0;
  padding: 16px 24px;
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  background: var(--surface);
}
.lead {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.lead b {
  font-weight: 600;
}
.period.card .state {
  display: inline-flex;
  align-items: center;
  height: 24px;
  padding: 0 10px;
  border-radius: var(--r-pill);
  font-size: 12px;
  line-height: 16px;
  font-weight: 500;
  white-space: nowrap;
}
.period.card .state.draft {
  background: var(--status-pending);
  color: var(--text);
}
.period.card .state.ok {
  background: var(--status-done);
  color: #fff;
}
.period.card .steps {
  flex: 1 1 560px;
  width: auto;
  min-width: 0;
  margin: 0;
  gap: 8px;
  padding: 4px 2px;
  overflow-x: auto;
  scrollbar-width: thin;
}
.period.card .step {
  flex: none;
  gap: 8px;
}
.period.card .step .d {
  width: 22px;
  height: 22px;
  border: 1.5px solid var(--status-draft);
  font-size: 11px;
  font-style: normal;
  color: var(--muted);
}
.period.card .step.done .d {
  background: var(--surface-dark);
  border-color: var(--surface-dark);
  color: var(--gold);
}
.period.card .step.cur .d {
  border: 2px solid var(--status-pending);
  background: var(--surface);
  color: var(--text);
  font-weight: 600;
}
.period.card .sep {
  flex: 1 1 24px;
  min-width: 16px;
  height: 2px;
  border-radius: 2px;
  background: var(--status-draft);
}
.period.card .sep.ok {
  background: var(--surface-dark);
}
</style>
