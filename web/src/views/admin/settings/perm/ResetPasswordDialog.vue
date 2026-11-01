<script setup lang="ts">
// Hộp thoại "Đặt lại mật khẩu" (mở từ Phân quyền · Tài khoản): Admin nhập mật khẩu mới cho tài khoản khác.
import { computed, ref } from 'vue';
import AppModal from '@/components/ui/AppModal.vue';
import Icon from '@/components/ui/Icon.vue';
import { resetAccountPassword } from '@/services/admin-settings';
import TextBox from '../fields/TextBox.vue';
import { REASON_MAX } from '../lib/rules';

const props = defineProps({
  account: { type: Object as () => any, required: true } // dòng tài khoản của danh sách
});
const emit = defineEmits(['close', 'done']);

const password = ref('');
const reason = ref('');
const saving = ref(false);
const error = ref('');
const valid = computed(() => password.value !== '');

async function submit() {
  if (!valid.value || saving.value) return;
  saving.value = true;
  error.value = '';
  try {
    await resetAccountPassword(props.account, { password: password.value, reason: reason.value.trim() });
    emit('done');
    emit('close');
  } catch (e) {
    error.value = e && e.message ? e.message : 'Không đặt lại được mật khẩu, thử lại sau.';
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <AppModal
    title="Đặt lại mật khẩu"
    :sub="`${account.name} · ${account.username}`"
    :width="560"
    :top="200"
    :dismissable="!saving"
    @close="emit('close')"
  >
    <div class="fld"><label>Mật khẩu mới</label><TextBox v-model="password" label="Mật khẩu mới" /></div>
    <div class="fld">
      <label>Lý do</label>
      <TextBox v-model="reason" area :maxlength="REASON_MAX" label="Lý do" />
    </div>
    <div v-if="error" class="note err" style="margin-top: 12px">{{ error }}</div>
    <template #footer>
      <span class="sp"></span>
      <button type="button" class="btn" @click="emit('close')">Huỷ</button>
      <button type="button" class="btn" :class="valid ? 'pri' : 'off'" :disabled="!valid || saving" @click="submit">
        <Icon name="lock" />Đặt lại mật khẩu
      </button>
    </template>
  </AppModal>
</template>
