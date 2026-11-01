<script setup lang="ts">
// Hộp "Sửa số trên phiếu": Admin nhập số thay cho số tự tính của từng ô tiền; ô để trống là dùng số tự tính.
// Máy chủ tính lại Tổng thu nhập, thuế và Thực nhận từ các ô đã sửa; lỗi của máy chủ hiện nguyên văn.
import { onMounted, reactive, ref } from 'vue';
import AppModal from '@/components/ui/AppModal.vue';
import Icon from '@/components/ui/Icon.vue';
import { getSlipOverride, saveSlipOverride } from '@/services/payslip';
import { monthShort, vnd } from '@/utils/format';
import DlgField from '../parts/DlgField.vue';

const props = defineProps({
  month: { type: String, required: true },
  username: { type: String, required: true },
  name: { type: String, default: '' },
  auto: { type: Object as () => any, required: true } // ô tiền tự tính của phiếu (cells)
});
const emit = defineEmits(['close', 'done']);

const FIELDS = [
  ['workBase', 'Lương cơ bản theo ngày công'],
  ['leavePay', 'Tiền nghỉ phép'],
  ['settlePay', 'Tiền quyết toán phép dư'],
  ['isatPay', 'Tiền nghỉ thứ 7 · iSAT'],
  ['holidayPay', 'Tiền nghỉ lễ'],
  ['otPay', 'Tiền OT'],
  ['attendance', 'Phụ cấp chuyên cần'],
  ['travel', 'Phụ cấp đi lại'],
  ['flexPay', 'Phụ cấp linh hoạt'],
  ['nightPay', 'Thưởng ca đêm'],
  ['breakPay', 'Off Paid (ca đêm)'],
  ['kpiPay', 'Lương KPI'],
  ['lateCut', 'Tiền trừ đi muộn, về sớm'],
  ['insurance', 'Bảo hiểm bắt buộc (BHXH, BHYT, BHTN)'],
  ['tax', 'Thuế TNCN'],
  ['advance', 'Tạm ứng']
];

const text = reactive({});
const reason = ref('');
const rev = ref(0);
const error = ref('');
const busy = ref(false);

onMounted(async () => {
  try {
    const cur = await getSlipOverride(props.month, props.username);
    rev.value = cur.rev;
    for (const [key] of FIELDS) if (cur.values && cur.values[key] !== undefined) text[key] = String(cur.values[key]);
  } catch (e) {
    error.value = e.message;
  }
});

async function submit() {
  busy.value = true;
  error.value = '';
  try {
    const values: Record<string, any> = {};
    for (const [key] of FIELDS) {
      const raw = String(text[key] ?? '').replace(/\D/g, '');
      if (raw === '') continue;
      const n = Number(raw);
      if (n !== Number(props.auto[key] || 0)) values[key] = n;
    }
    await saveSlipOverride(props.month, props.username, { values, reason: reason.value, expectedRev: rev.value });
    emit('done');
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <AppModal
    title="Sửa số trên phiếu"
    :sub="`${name || username} · kỳ lương tháng ${monthShort(month)}`"
    :width="860"
    :top="64"
    :dismissable="false"
    @close="emit('close')"
  >
    <div class="g2">
      <DlgField
        v-for="[key, label] in FIELDS"
        :key="key"
        v-model="text[key]"
        :label="label"
        inputmode="numeric"
        :placeholder="vnd(auto[key] || 0)"
        :maxlength="15"
      >
        <template #end>₫</template>
      </DlgField>
    </div>
    <DlgField v-model="reason" label="Lý do" area :maxlength="300" />
    <div v-if="error" class="note err" style="margin-top: 12px">
      <Icon name="alert" />
      <div>{{ error }}</div>
    </div>
    <template #footer>
      <span class="sp" />
      <button type="button" class="btn" @click="emit('close')">Huỷ</button>
      <button type="button" class="btn pri" :disabled="busy" @click="submit"><Icon name="check" />Lưu</button>
    </template>
  </AppModal>
</template>
