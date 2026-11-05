<script setup lang="ts">
// Dải bước kỳ lương: trạng thái kỳ và các bước. AdminLayout đặt dải dưới thanh trên ở Chấm công;
// Bảng lương tự đặt dải dạng thẻ (card) dưới tiêu đề trang.
// Máy chủ thật: người có năng lực attendance.lock thấy nút "Chốt công" khi tháng chưa chốt công.
import { computed, ref } from 'vue';
import { toast } from '@/components/shell/toast';
import Icon from '@/components/ui/Icon.vue';
import { usePeriodStore } from '@/stores/period';
import { useSessionStore } from '@/stores/session';

withDefaults(defineProps<{ card?: boolean }>(), { card: false });
const period = usePeriodStore();
const session = useSessionStore();

const canLock = computed(
  () =>
    !__MOCK__ &&
    session.caps.includes('attendance.lock') &&
    period.strip.steps.length > 1 &&
    period.strip.steps[1][0] !== 'done'
);
const locking = ref(false);
async function lock() {
  if (locking.value) return;
  if (!window.confirm(`Chốt công ${period.strip.month.toLowerCase()}? Kỳ lương chuyển sang bước tính lương.`)) return;
  locking.value = true;
  try {
    await period.lock();
    toast.ok(`Đã chốt công ${period.strip.month.toLowerCase()}.`);
  } catch (e) {
    toast.error(e.message);
  } finally {
    locking.value = false;
  }
}
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
    <button v-if="canLock" type="button" class="btn sm" :disabled="locking" @click="lock">
      {{ locking ? 'Đang chốt…' : 'Chốt công' }}
    </button>
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
  color: var(--on-primary);
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
/* Vùng cuộn tự cắt vòng tiêu điểm nên vòng nằm lùi vào trong. */
.period.card .steps:focus-visible {
  outline: 2px solid var(--text);
  outline-offset: -2px;
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
