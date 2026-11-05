<script setup lang="ts">
// Biểu mẫu đổi mật khẩu dùng chung cho hộp trượt (điện thoại) và ngăn kéo (máy tính): mật khẩu hiện tại, mật khẩu mới
// (≥ 6 ký tự), nhập lại. Đổi xong phát `done`, bấm Huỷ phát `cancel`; vỏ quyết định đóng thế nào.
//   <PasswordForm @done="…" @cancel="…" />
import { reactive, ref } from 'vue';
import Icon from '@/components/ui/Icon.vue';
import { changePassword } from '@/services/staff-phone';

const emit = defineEmits<{ done: []; cancel: [] }>();

const MIN_LENGTH = 6;
const FIELDS = [
  { key: 'current', label: 'Mật khẩu hiện tại', hint: '', auto: 'current-password' },
  { key: 'next', label: 'Mật khẩu mới', hint: `(ít nhất ${MIN_LENGTH} ký tự)`, auto: 'new-password' },
  { key: 'again', label: 'Nhập lại mật khẩu mới', hint: '', auto: 'new-password' }
];
const form = reactive({ current: '', next: '', again: '' });
const shown = reactive({ current: false, next: false, again: false });
const error = ref('');
const busy = ref(false);

function validate() {
  if (!form.current) return 'Nhập mật khẩu hiện tại.';
  if (form.next.length < MIN_LENGTH) return `Mật khẩu mới cần ít nhất ${MIN_LENGTH} ký tự.`;
  if (form.next !== form.again) return 'Hai lần nhập mật khẩu mới chưa giống nhau.';
  return '';
}

async function submit() {
  error.value = validate();
  if (error.value || busy.value) return;
  busy.value = true;
  try {
    await changePassword({ current: form.current, next: form.next });
    emit('done');
  } catch (e) {
    error.value = e && e.message ? e.message : 'Chưa đổi được mật khẩu. Bạn thử lại sau ít phút.';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <form novalidate @submit.prevent="submit">
    <div v-for="f in FIELDS" :key="f.key" class="fld">
      <label :for="'pw-' + f.key"
        >{{ f.label }} <small v-if="f.hint">{{ f.hint }}</small></label
      >
      <div class="inp">
        <input
          :id="'pw-' + f.key"
          v-model="form[f.key]"
          :type="shown[f.key] ? 'text' : 'password'"
          :autocomplete="f.auto"
        />
        <button type="button" class="end show" @click="shown[f.key] = !shown[f.key]">
          {{ shown[f.key] ? 'Ẩn' : 'Hiện' }}
        </button>
      </div>
    </div>

    <div v-if="error" class="note err" role="alert">
      <Icon name="alert" />
      <div>{{ error }}</div>
    </div>

    <div class="bt">
      <button type="button" @click="emit('cancel')">Huỷ</button>
      <button type="submit" class="pri" :disabled="busy">Đổi mật khẩu</button>
    </div>
  </form>
</template>

<style scoped>
.inp .show {
  align-items: center; /* .inp .end (overlay.css) là inline-flex: chữ "Hiện" nằm giữa ô */
  border: 0;
  background: none;
  padding: 0 0 0 12px;
  height: 46px;
  font: inherit;
  font-size: 14px;
  color: var(--muted);
  cursor: pointer;
}
</style>
