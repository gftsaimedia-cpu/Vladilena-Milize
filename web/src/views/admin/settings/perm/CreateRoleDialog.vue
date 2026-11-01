<script setup lang="ts">
// Hộp thoại "Tạo vai trò" (mở từ Phân quyền · Vai trò: nút "Tạo vai trò" hoặc "Sao chép thành vai trò mới").
import { computed, ref } from 'vue';
import AppModal from '@/components/ui/AppModal.vue';
import Icon from '@/components/ui/Icon.vue';
import { createRole } from '@/services/admin-settings';
import TextBox from '../fields/TextBox.vue';
import { REASON_MAX, REASON_MIN, reasonOk } from '../lib/rules';

const props = defineProps({
  copyFrom: { type: String, default: '' }, // khoá vai trò được sao chép quyền
  copyName: { type: String, default: '' }
});
const emit = defineEmits(['close', 'saved']);

const name = ref('');
const reason = ref('');
const saving = ref(false);
const error = ref('');
const valid = computed(() => name.value.trim() !== '' && reasonOk(reason.value));

async function submit() {
  if (!valid.value || saving.value) return;
  saving.value = true;
  error.value = '';
  try {
    const res = await createRole({ name: name.value.trim(), reason: reason.value.trim(), copyFrom: props.copyFrom });
    emit('saved', res.key);
    emit('close');
  } catch (e) {
    error.value = e && e.message ? e.message : 'Không tạo được vai trò, thử lại sau.';
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <AppModal
    title="Tạo vai trò"
    :sub="
      copyFrom
        ? `Vai trò mới sao chép quyền từ ${copyName} · chỉnh lại sau khi tạo`
        : 'Vai trò mới bắt đầu không có quyền nào · tick quyền sau khi tạo'
    "
    :width="560"
    :top="200"
    @close="emit('close')"
  >
    <div class="fld">
      <label>Tên vai trò</label><TextBox v-model="name" placeholder="Ví dụ: Trưởng nhóm C&B" label="Tên vai trò" />
    </div>
    <div class="fld">
      <label
        >Lý do <small>(bắt buộc, {{ REASON_MIN }}–{{ REASON_MAX }} ký tự)</small></label
      >
      <TextBox
        v-model="reason"
        area
        :maxlength="REASON_MAX"
        placeholder="Ví dụ: Kế toán cần xem bảng lương để đối chiếu"
        label="Lý do"
      />
    </div>
    <div v-if="error" class="note err" style="margin-top: 12px">{{ error }}</div>
    <template #footer>
      <span class="sp"></span>
      <button type="button" class="btn" @click="emit('close')">Huỷ</button>
      <button type="button" class="btn" :class="valid ? 'pri' : 'off'" :disabled="!valid || saving" @click="submit">
        <Icon name="plus" />Tạo vai trò
      </button>
    </template>
  </AppModal>
</template>
