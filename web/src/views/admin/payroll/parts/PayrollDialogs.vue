<script setup lang="ts">
// Hộp thoại các bước kỳ lương, chọn theo ?hop= của Bảng lương. Xác nhận trong hộp thì emit('finish', kịch bản kế tiếp):
// '' = ở lại kịch bản hiện tại (chỉ đóng hộp và tải lại).
import { computed } from 'vue';
import PrintAllDialog from '../payslip/PrintAllDialog.vue';
import AddExtraDialog from './AddExtraDialog.vue';
import ApproveBatchDialog from './ApproveBatchDialog.vue';
import ApprovePeriodDialog from './ApprovePeriodDialog.vue';
import CalcDialog from './CalcDialog.vue';
import ClosePeriodDialog from './ClosePeriodDialog.vue';
import PaidDialog from './PaidDialog.vue';
import ReopenDialog from './ReopenDialog.vue';
import VerifyDialog from './VerifyDialog.vue';

const props = defineProps({
  hop: { type: String, required: true },
  data: { type: Object as () => any, required: true }, // kết quả getPayroll
  selection: { type: Object as () => any, default: () => ({ usernames: [], others: 0, names: [], more: 0, total: 0 }) },
  reopenTarget: { type: Object as () => any, default: null } // bước đang mở lại: { step, kb, label }
});
const emit = defineEmits(['close', 'finish']);

const month = computed(() => props.data.month);
const facts = computed(() => props.data.facts);
</script>

<template>
  <ClosePeriodDialog
    v-if="hop === 'chot-cong'"
    :month="month"
    @close="emit('close')"
    @done="emit('finish', 'da-chot-cong')"
  />
  <CalcDialog
    v-else-if="hop === 'tinh-luong'"
    :month="month"
    :closed-at="facts.closedAt"
    @close="emit('close')"
    @done="emit('finish', '')"
  />
  <ApproveBatchDialog
    v-else-if="hop === 'phe-duyet-50'"
    :month="month"
    :run="facts.run"
    :usernames="selection.usernames"
    :others="selection.others"
    :names="selection.names"
    :more="selection.more"
    :total="selection.total"
    @close="emit('close')"
    @done="emit('finish', 'da-duyet-50')"
  />
  <ApprovePeriodDialog
    v-else-if="hop === 'phe-duyet-ky'"
    :month="month"
    :pending="facts.pending"
    :failed="data.failed"
    @close="emit('close')"
    @done="emit('finish', 'da-phe-duyet')"
  />
  <PaidDialog
    v-else-if="hop === 'da-tra-luong'"
    :month="month"
    :count="facts.approved"
    :net="data.formula.net"
    :default-date="facts.paidDate"
    @close="emit('close')"
    @done="emit('finish', 'da-tra-luong')"
  />
  <ReopenDialog
    v-else-if="hop === 'mo-lai' && reopenTarget"
    :month="month"
    :step="reopenTarget.step"
    :label="reopenTarget.label"
    @close="emit('close')"
    @done="emit('finish', reopenTarget.kb)"
  />
  <AddExtraDialog v-else-if="hop === 'them-khoan'" :month="month" @close="emit('close')" @done="emit('finish', '')" />
  <PrintAllDialog v-else-if="hop === 'in-tat-ca'" :month="month" @close="emit('close')" />
  <VerifyDialog v-else-if="hop === 'kiem-tra-lai'" :month="month" @close="emit('close')" />
</template>
