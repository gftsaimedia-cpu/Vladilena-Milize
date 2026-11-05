<script setup lang="ts">
// Dải bước kỳ lương: trạng thái kỳ và các bước. AdminLayout đặt dải dưới thanh trên ở Chấm công;
// Bảng lương tự đặt dải dạng thẻ (card) dưới tiêu đề trang.
// Nút theo `actions` của kỳ (máy chủ trả theo trạng thái, FE ẩn thêm theo năng lực): Chốt công, Mở lại công (attendance.lock);
// Phê duyệt kỳ (khoá kèm lý do khi còn vướng), Huỷ phê duyệt, Đã trả lương (payroll.approve).
import { computed, ref } from 'vue';
import { toast } from '@/components/shell/toast';
import Icon from '@/components/ui/Icon.vue';
import type { PeriodAction } from '@/builders/api/period';
import { usePeriodStore } from '@/stores/period';
import { useSessionStore } from '@/stores/session';
import PeriodActionDialog from './PeriodActionDialog.vue';

withDefaults(defineProps<{ card?: boolean }>(), { card: false });
const period = usePeriodStore();
const session = useSessionStore();

const CAP: Record<PeriodAction, string> = {
  lock: 'attendance.lock',
  unlock: 'attendance.lock',
  approve: 'payroll.approve',
  unapprove: 'payroll.approve',
  pay: 'payroll.approve'
};
const allowed = (a: PeriodAction) => !!period.view?.actions[a] && session.caps.includes(CAP[a]);
const canLock = computed(() => allowed('lock'));
const canUnlock = computed(() => allowed('unlock'));
const canApprove = computed(() => allowed('approve'));
const canUnapprove = computed(() => allowed('unapprove'));
const canPay = computed(() => allowed('pay'));
const approve = computed(() => period.view?.actions.approve);
const monthLabel = computed(() => period.strip.month.toLowerCase());

const busy = ref(false);
const asking = ref<PeriodAction | null>(null);
const askError = ref('');
const DONE: Record<PeriodAction, string> = {
  lock: 'Đã chốt công',
  unlock: 'Đã mở lại công',
  approve: 'Đã phê duyệt kỳ lương',
  unapprove: 'Đã huỷ phê duyệt kỳ lương',
  pay: 'Đã ghi nhận trả lương'
};

async function run(action: PeriodAction, reason?: string) {
  if (busy.value) return false;
  busy.value = true;
  try {
    await period.act(action, reason);
    toast.ok(`${DONE[action]} ${monthLabel.value}.`);
    return true;
  } catch (e) {
    return e.message || 'Không thực hiện được, thử lại sau.';
  } finally {
    busy.value = false;
  }
}
async function lock() {
  if (!window.confirm(`Chốt công ${monthLabel.value}? Kỳ lương chuyển sang bước tính lương.`)) return;
  const res = await run('lock');
  if (res !== true) toast.error(res);
}
function ask(action: PeriodAction) {
  askError.value = '';
  asking.value = action;
}
async function confirmAsk(reason?: string) {
  const res = await run(asking.value!, reason);
  if (res === true) asking.value = null;
  else askError.value = res;
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
    <span class="acts">
      <button v-if="canLock" type="button" class="btn sm" :disabled="busy" @click="lock">Chốt công</button>
      <button v-if="canUnlock" type="button" class="btn sm" :disabled="busy" @click="ask('unlock')">Mở lại công</button>
      <button v-if="canUnapprove" type="button" class="btn sm" :disabled="busy" @click="ask('unapprove')">Huỷ phê duyệt</button>
      <button v-if="canPay" type="button" class="btn sm pri" :disabled="busy" @click="ask('pay')">Đã trả lương</button>
      <span v-if="canApprove && !approve?.enabled && approve?.reason" class="why">{{ approve.reason }}</span>
      <button
        v-if="canApprove"
        type="button"
        class="btn sm pri"
        :disabled="busy || !approve?.enabled"
        :title="approve?.enabled ? undefined : approve?.reason"
        @click="ask('approve')"
      >
        <Icon name="check" :size="14" />Phê duyệt kỳ lương
      </button>
    </span>
    <PeriodActionDialog
      v-if="asking"
      :action="asking"
      :month="monthLabel"
      :payday="period.view?.payday"
      :saving="busy"
      :error="askError"
      @close="asking = null"
      @confirm="confirmAsk"
    />
  </div>
</template>

<style scoped>
.acts {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.why {
  font-size: 12px;
  color: var(--muted);
}
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
