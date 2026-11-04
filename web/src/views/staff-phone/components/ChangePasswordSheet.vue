<script setup lang="ts">
// Bảng trượt "Đổi mật khẩu" mở từ màn Tôi: mật khẩu hiện tại, mật khẩu mới (≥ 6 ký tự), nhập lại.
import { computed, reactive, ref } from 'vue';
import Icon from '@/components/ui/Icon.vue';
import { changePassword } from '@/services/staff-phone';
import BottomSheet from './BottomSheet.vue';

const props = defineProps({ username: { type: String, default: '' } });
const emit = defineEmits(['close']);

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
const sub = computed(() => (props.username ? `Tài khoản ${props.username}` : ''));

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
    emit('close');
  } catch (e) {
    error.value = e && e.message ? e.message : 'Chưa đổi được mật khẩu. Bạn thử lại sau ít phút.';
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <BottomSheet title="Đổi mật khẩu" :sub="sub" @close="emit('close')">
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
        <button type="button" @click="emit('close')">Huỷ</button>
        <button type="submit" class="pri" :disabled="busy">Đổi mật khẩu</button>
      </div>
    </form>
  </BottomSheet>
</template>

<style scoped>
.ph-sheet .inp .show {
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
