<script setup lang="ts">
// Hộp thao tác trên một khoản điền thêm: sửa, duyệt, từ chối, huỷ, xác nhận cờ thuế và bảo hiểm. Lỗi của máy chủ hiện nguyên văn.
import { computed, reactive, ref } from 'vue';
import AppModal from '@/components/ui/AppModal.vue';
import Icon from '@/components/ui/Icon.vue';
import { confirmPayEntryFlags, decidePayEntry, editPayEntry, voidPayEntry } from '@/services/admin-payroll';
import DlgField from './DlgField.vue';

const props = defineProps({
  kind: { type: String, required: true }, // 'edit' | 'approve' | 'reject' | 'void' | 'confirm'
  item: { type: Object as () => any, required: true }
});
const emit = defineEmits(['close', 'done']);

const TITLES = {
  edit: 'Sửa khoản',
  approve: 'Duyệt khoản',
  reject: 'Từ chối khoản',
  void: 'Huỷ khoản',
  confirm: 'Xác nhận cờ thuế và bảo hiểm'
};
const form = reactive({
  label: props.item.rawLabel || props.item.label,
  amount: String(props.item.amount),
  text: props.kind === 'edit' ? props.item.reason || '' : ''
});
const error = ref('');
const busy = ref(false);
const noteLabel = computed(() =>
  props.kind === 'confirm' ? 'Căn cứ' : props.kind === 'void' ? 'Lý do huỷ' : 'Ghi chú'
);

async function submit() {
  if (busy.value) return;
  busy.value = true;
  error.value = '';
  const rev = props.item.rev;
  try {
    if (props.kind === 'edit')
      await editPayEntry(props.item.id, {
        rev,
        label: form.label,
        amount: Number(String(form.amount).replace(/\D/g, '')),
        reason: form.text
      });
    else if (props.kind === 'approve')
      await decidePayEntry(props.item.id, { rev, decision: 'approved', note: form.text });
    else if (props.kind === 'reject')
      await decidePayEntry(props.item.id, { rev, decision: 'rejected', note: form.text });
    else if (props.kind === 'void') await voidPayEntry(props.item.id, { rev, reason: form.text });
    else await confirmPayEntryFlags(props.item.id, { rev, basis: form.text });
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
    :title="TITLES[kind]"
    :sub="`${item.name} · ${item.label}`"
    :width="560"
    :top="200"
    :dismissable="false"
    @close="emit('close')"
  >
    <template v-if="kind === 'edit'">
      <DlgField v-model="form.label" label="Tên khoản" :maxlength="120" />
      <DlgField v-model="form.amount" label="Số tiền" inputmode="numeric" />
      <DlgField v-model="form.text" label="Lý do" area :maxlength="300" />
    </template>
    <DlgField v-else v-model="form.text" :label="noteLabel" area :maxlength="300" />
    <div v-if="error" class="note err" style="margin-top: 12px">
      <Icon name="alert" />
      <div>{{ error }}</div>
    </div>
    <template #footer>
      <span class="sp" />
      <button type="button" class="btn" @click="emit('close')">Đóng</button>
      <button type="button" class="btn pri" :disabled="busy" @click="submit">
        <Icon name="check" />{{ TITLES[kind] }}
      </button>
    </template>
  </AppModal>
</template>
