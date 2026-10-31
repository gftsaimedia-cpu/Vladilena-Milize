<script setup>
// Hộp "Phê duyệt riêng phiếu có cảnh báo AI" (dlg-t10-phe-duyet-rieng): bỏ qua từng cảnh báo rồi phê duyệt kèm ghi chú.
import { computed, ref } from 'vue';
import AppModal from '@/components/ui/AppModal.vue';
import Icon from '@/components/ui/Icon.vue';
import { useLoad } from '@/composables/useLoad.js';
import { approveOne, getFindings } from '@/services/admin-payroll.js';
import { vndc } from '@/utils/format.js';
import DlgField from './DlgField.vue';
import FindingRow from './FindingRow.vue';

const props = defineProps({
  month: { type: String, required: true },
  row: { type: Object, required: true }
});
const emit = defineEmits(['close', 'done']);

const { data } = useLoad(() => getFindings(props.month, props.row.username));
const items = computed(() => data.value?.[0]?.items || []);
const note = ref('');
const error = ref('');
const busy = ref(false);

async function submit() {
  if (items.value.some(i => !i.skipped)) {
    error.value = 'Còn cảnh báo AI chưa bỏ qua: bỏ qua từng cảnh báo kèm lý do rồi phê duyệt.';
    return;
  }
  busy.value = true;
  error.value = '';
  try {
    await approveOne(props.month, props.row.username, note.value);
    emit('done');
  } catch (e) {
    error.value = e.message;
  } finally {
    busy.value = false;
  }
}
const onSkipped = id => {
  const it = items.value.find(i => i.id === id);
  if (it) it.skipped = true;
  error.value = '';
};
</script>

<template>
  <AppModal
    title="Phê duyệt riêng phiếu có cảnh báo AI"
    :sub="`${row.name} · ${row.sub} · thực nhận ${vndc(row.net)}`"
    :width="640"
    :top="150"
    :dismissable="false"
    @close="emit('close')"
  >
    <div class="note">
      <Icon name="info" />
      <div>
        Phiếu còn cảnh báo AI: bỏ qua từng cảnh báo kèm lý do, rồi phê duyệt kèm ghi chú từ 10 ký tự. Cảnh báo chưa bỏ
        qua thì hệ thống sẽ từ chối.
      </div>
    </div>
    <div style="height: 8px" />
    <FindingRow v-for="it in items" :key="it.id" :month="month" :finding="it" @skipped="onSkipped" />
    <DlgField
      v-model="note"
      label="Ghi chú phê duyệt"
      hint="(bắt buộc, từ 10 ký tự)"
      area
      placeholder="Ghi rõ lý do để lưu vào nhật ký"
      :maxlength="300"
    />
    <div v-if="error" class="note err" style="margin-top: 12px">
      <Icon name="alert" />
      <div>{{ error }}</div>
    </div>
    <template #footer>
      <span class="sp" />
      <button type="button" class="btn" @click="emit('close')">Huỷ</button>
      <button type="button" class="btn pri" :disabled="busy" @click="submit"><Icon name="check" />Phê duyệt</button>
    </template>
  </AppModal>
</template>
