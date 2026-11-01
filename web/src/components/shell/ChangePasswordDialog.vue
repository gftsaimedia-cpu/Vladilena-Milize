<script setup lang="ts">
// Hộp đổi mật khẩu của người đang đăng nhập (dlg-doi-mat-khau.html). Hợp đồng: emit('close').
import { onMounted, reactive, ref } from 'vue';
import AppModal from '@/components/ui/AppModal.vue';
import Icon from '@/components/ui/Icon.vue';
import { changePassword } from '@/services/session';
import { useSessionStore } from '@/stores/session';

const emit = defineEmits(['close']);
const me = useSessionStore().shellMe;

const MIN_LENGTH = 6;
const form = reactive({ current: '', next: '', again: '' });
const shown = reactive({ current: false, next: false, again: false });
const error = ref('');
const done = ref(false);
const busy = ref(false);
const first = ref(null);
onMounted(() => first.value?.focus());

function validate() {
  if (!form.current) return 'Nhập mật khẩu hiện tại.';
  if (form.next.length < MIN_LENGTH) return `Mật khẩu mới cần ít nhất ${MIN_LENGTH} ký tự.`;
  if (form.next !== form.again) return 'Hai mật khẩu mới chưa khớp.';
  return '';
}
async function submit() {
  error.value = validate();
  if (error.value || busy.value) return;
  busy.value = true;
  try {
    await changePassword(form.current, form.next);
    done.value = true;
  } catch (e) {
    error.value = e && e.message ? e.message : String(e);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <AppModal
    title="Đổi mật khẩu"
    :sub="`Tài khoản ${me.name || ''} · ${me.username || ''}`"
    :width="520"
    :top="180"
    @close="emit('close')"
  >
    <form id="pw-form" @submit.prevent="submit">
      <div v-if="done" class="note ok">
        <Icon name="check" />
        <div>Đã đổi mật khẩu. Lần đăng nhập sau dùng mật khẩu mới.</div>
      </div>
      <template v-else>
        <div class="fld">
          <label for="pw-current">Mật khẩu hiện tại</label>
          <div class="inp">
            <input
              id="pw-current"
              ref="first"
              v-model="form.current"
              :type="shown.current ? 'text' : 'password'"
              autocomplete="current-password"
            />
            <button type="button" class="end" @click="shown.current = !shown.current">
              {{ shown.current ? 'Ẩn' : 'Hiện' }}
            </button>
          </div>
        </div>
        <div class="fld">
          <label for="pw-next"
            >Mật khẩu mới <small>(ít nhất {{ MIN_LENGTH }} ký tự)</small></label
          >
          <div class="inp">
            <input
              id="pw-next"
              v-model="form.next"
              :type="shown.next ? 'text' : 'password'"
              autocomplete="new-password"
            />
            <button type="button" class="end" @click="shown.next = !shown.next">
              {{ shown.next ? 'Ẩn' : 'Hiện' }}
            </button>
          </div>
        </div>
        <div class="fld">
          <label for="pw-again">Nhập lại mật khẩu mới</label>
          <div class="inp">
            <input
              id="pw-again"
              v-model="form.again"
              :type="shown.again ? 'text' : 'password'"
              autocomplete="new-password"
            />
            <button type="button" class="end" @click="shown.again = !shown.again">
              {{ shown.again ? 'Ẩn' : 'Hiện' }}
            </button>
          </div>
        </div>
        <div v-if="error" class="note err" style="margin-top: 14px">
          <Icon name="alert" />
          <div>{{ error }}</div>
        </div>
      </template>
    </form>
    <template #footer>
      <span class="sp" />
      <template v-if="done">
        <button type="button" class="btn pri" @click="emit('close')">Đóng</button>
      </template>
      <template v-else>
        <button type="button" class="btn" @click="emit('close')">Huỷ</button>
        <button type="submit" form="pw-form" class="btn pri" :disabled="busy">
          <Icon name="key" />
          Đổi mật khẩu
        </button>
      </template>
    </template>
  </AppModal>
</template>

<style scoped>
.inp:focus-within {
  border-color: var(--text);
  box-shadow: 0 0 0 3px #e9e9e9;
}
.inp input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: 0;
  background: transparent;
  font: inherit;
  color: inherit;
  height: 38px;
}
.inp .end {
  border: 0;
  background: none;
  font: inherit;
  font-size: 13px;
  cursor: pointer;
  padding: 0 0 0 8px;
}
.btn:disabled {
  opacity: 0.45;
}
</style>
