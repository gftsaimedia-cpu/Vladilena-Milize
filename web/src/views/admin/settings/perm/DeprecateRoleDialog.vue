<script setup lang="ts">
// Hộp thoại "Ngừng dùng" một vai trò tuỳ chỉnh: gửi số phiên bản của vai trò kèm lý do; tài khoản đang giữ vai trò vẫn giữ dòng gán.
import { computed, ref } from 'vue';
import AppModal from '@/components/ui/AppModal.vue';
import { deprecateRole } from '@/services/admin-perm';
import TextBox from '../fields/TextBox.vue';
import { REASON_MAX, REASON_MIN, reasonOk } from '../lib/rules';

const props = defineProps({ role: { type: Object as () => any, required: true } });
const emit = defineEmits(['close', 'saved']);

const reason = ref('');
const saving = ref(false);
const error = ref('');
const valid = computed(() => reasonOk(reason.value));

async function submit() {
  if (!valid.value || saving.value) return;
  saving.value = true;
  error.value = '';
  try {
    await deprecateRole(props.role, reason.value.trim());
    emit('saved');
    emit('close');
  } catch (e) {
    error.value = e && e.message ? e.message : 'Không ngừng dùng được vai trò, thử lại sau.';
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <AppModal :title="`Ngừng dùng ${role.name}`" :width="560" :top="200" @close="emit('close')">
    <div class="fld">
      <label
        >Lý do <small>(bắt buộc, {{ REASON_MIN }}–{{ REASON_MAX }} ký tự)</small></label
      >
      <TextBox v-model="reason" area :maxlength="REASON_MAX" label="Lý do" />
    </div>
    <div v-if="error" class="note err" style="margin-top: 12px">{{ error }}</div>
    <template #footer>
      <span class="sp"></span>
      <button type="button" class="btn" @click="emit('close')">Huỷ</button>
      <button type="button" class="btn" :class="valid ? 'pri' : 'off'" :disabled="!valid || saving" @click="submit">
        Ngừng dùng
      </button>
    </template>
  </AppModal>
</template>
