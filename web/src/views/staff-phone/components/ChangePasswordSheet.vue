<script setup lang="ts">
// Bảng trượt "Đổi mật khẩu" mở từ màn Tôi: đầu hộp + biểu mẫu PasswordForm (mật khẩu hiện tại, mật khẩu mới ≥ 6 ký tự, nhập lại).
import { computed } from 'vue';
import BottomSheet from './BottomSheet.vue';
import PasswordForm from './PasswordForm.vue';

const props = defineProps({ username: { type: String, default: '' } });
const emit = defineEmits(['close']);

const sub = computed(() => (props.username ? `Tài khoản ${props.username}` : ''));
</script>

<template>
  <BottomSheet title="Đổi mật khẩu" :sub="sub" @close="emit('close')">
    <PasswordForm @done="emit('close')" @cancel="emit('close')" />
  </BottomSheet>
</template>
