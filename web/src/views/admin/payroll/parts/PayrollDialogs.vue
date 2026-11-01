<script setup lang="ts">
// Hộp thoại các bước kỳ lương, chọn theo ?hop= của Bảng lương. Xác nhận trong hộp thì emit('finish', kịch bản kế tiếp):
// '' = ở lại kịch bản hiện tại (chỉ đóng hộp và tải lại).
import { computed } from 'vue';
import { useSessionStore } from '@/stores/session';
import PrintAllDialog from '../payslip/PrintAllDialog.vue';
import AddExtraDialog from './AddExtraDialog.vue';
import AiFindingsDialog from './AiFindingsDialog.vue';
import AiRunDialog from './AiRunDialog.vue';
import ApproveBatchDialog from './ApproveBatchDialog.vue';
import ApproveOneDialog from './ApproveOneDialog.vue';
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
  approveRow: { type: Object as () => any, default: null }, // dòng đang phê duyệt riêng
  reopenTarget: { type: Object as () => any, default: null } // bước đang mở lại: { step, kb, label }
});
const emit = defineEmits(['close', 'finish']);

const agents = computed(() => useSessionStore().agentsEnabled);
const month = computed(() => props.data.month);
const facts = computed(() => props.data.facts);
const nextAfterAi = computed(() => (props.data.kb === 'ban-nhap' ? 'cho-phe-duyet' : ''));
</script>

<template>
  <ClosePeriodDialog
    v-if="hop === 'chot-cong'"
    :month="month"
    @close="emit('close')"
    @done="emit('finish', month === '2026-10' ? 'da-chot-cong' : '')"
  />
  <CalcDialog
    v-else-if="hop === 'tinh-luong'"
    :month="month"
    :closed-at="facts.closedAt"
    @close="emit('close')"
    @done="emit('finish', agents ? 'ban-nhap' : '')"
  />
  <AiRunDialog
    v-else-if="agents && hop === 'chay-ai'"
    :month="month"
    :run="facts.run"
    :total="facts.total"
    @close="emit('close')"
    @done="emit('finish', nextAfterAi)"
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
  <ApproveOneDialog
    v-else-if="agents && hop === 'phe-duyet-rieng' && approveRow"
    :month="month"
    :row="approveRow"
    @close="emit('close')"
    @done="emit('finish', '')"
  />
  <AiFindingsDialog
    v-else-if="agents && hop === 'bo-qua-ai'"
    :month="month"
    :run="facts.run"
    :readonly="data.kb === 'da-phe-duyet' || data.kb === 'da-tra-luong'"
    @close="emit('close')"
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
