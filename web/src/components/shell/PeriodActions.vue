<script setup lang="ts">
// Nút hành động của kỳ lương (Chốt công, Mở lại công, Phê duyệt…) và hộp xác nhận. Đặt trong dải bước (Chấm công)
// hoặc trên tiêu đề trang Bảng lương (theo board G); cùng một logic ở cả hai chỗ.
// Nút theo `actions` của kỳ (máy chủ trả theo trạng thái, FE ẩn thêm theo năng lực): Chốt công, Mở lại công (attendance.lock);
// Phê duyệt kỳ (khoá kèm lý do khi còn vướng), Huỷ phê duyệt, Đã trả lương (payroll.approve).
import { computed, ref } from 'vue';
import { toast } from '@/components/shell/toast';
import Icon from '@/components/ui/Icon.vue';
import type { PeriodAction } from '@/builders/api/period';
import { usePeriodStore } from '@/stores/period';
import { useSessionStore } from '@/stores/session';
import PeriodActionDialog from './PeriodActionDialog.vue';

// only: 'approve' = chỉ nút Phê duyệt kỳ lương (tiêu đề Bảng lương, cỡ 40px); 'rest' = các nút còn lại (dải bước dạng thẻ); bỏ trống = tất cả.
const props = withDefaults(defineProps<{ only?: '' | 'approve' | 'rest' }>(), { only: '' });
const big = computed(() => props.only === 'approve');
const showRest = computed(() => props.only !== 'approve');
const showApprove = computed(() => props.only !== 'rest');
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
  <span class="acts" :class="{ inTitle: big }">
    <button v-if="showRest && canLock" type="button" class="btn" :class="{ sm: !big }" :disabled="busy" @click="lock">Chốt công</button>
    <button v-if="showRest && canUnlock" type="button" class="btn" :class="{ sm: !big }" :disabled="busy" @click="ask('unlock')">Mở lại công</button>
    <button v-if="showRest && canUnapprove" type="button" class="btn" :class="{ sm: !big }" :disabled="busy" @click="ask('unapprove')">Huỷ phê duyệt</button>
    <button v-if="showRest && canPay" type="button" class="btn pri" :class="{ sm: !big }" :disabled="busy" @click="ask('pay')">Đã trả lương</button>
    <span v-if="showApprove && canApprove && !approve?.enabled && approve?.reason" class="why">{{ approve.reason }}</span>
    <button
      v-if="showApprove && canApprove"
      type="button"
      class="btn pri"
      :class="{ sm: !big }"
      :disabled="busy || !approve?.enabled"
      :title="approve?.enabled ? undefined : approve?.reason"
      @click="ask('approve')"
    >
      <Icon name="check" :size="big ? 16 : 14" />Phê duyệt kỳ lương
    </button>
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
  </span>
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
/* Ở tiêu đề trang: lý do nằm dưới nút, trong khoảng 24px giữa tiêu đề và dải bước, nên không đẩy bố cục. */
.acts.inTitle {
  position: relative;
  flex-wrap: nowrap;
}
.acts.inTitle .why {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 4px;
  line-height: 16px;
  white-space: nowrap;
}
</style>
