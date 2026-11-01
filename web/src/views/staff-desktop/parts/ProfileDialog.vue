<script setup lang="ts">
// Hộp "Hồ sơ của tôi" (nvpc-linh-ho-so): thông tin do Admin quản lý và phần đổi mật khẩu.
import { computed, reactive, ref } from 'vue';
import AppModal from '@/components/ui/AppModal.vue';
import Icon from '@/components/ui/Icon.vue';
import { useLoad } from '@/composables/useLoad';
import { changeMyPassword, getStaffProfile } from '@/services/staff-desktop';
import { dmy } from '@/utils/format';

const props = defineProps({ kb: { type: String, default: 'linh' } });
const emit = defineEmits(['close']);

const { data: profile } = useLoad(() => getStaffProfile());
const facts = computed(() => {
  const p = profile.value;
  if (!p) return [];
  return [
    ['Họ tên', p.fullName],
    ['Tên đăng nhập', p.username],
    ['Loại · bậc', p.roleLine],
    ['Ca cố định', p.shiftName],
    ['Lịch làm việc', p.schedule],
    ['Ngày bắt đầu làm', dmy(p.startDate)],
    ['Phép năm còn', p.leaveLeft == null ? '—' : `${p.leaveLeft} ngày`],
    ['Tài khoản', p.account]
  ];
});

const form = reactive({ current: '', next: '', again: '' });
const shown = reactive({ current: false, next: false, again: false });
const error = ref('');
const saving = ref(false);

async function submit() {
  error.value = '';
  if (!form.current) error.value = 'Nhập mật khẩu hiện tại.';
  else if (form.next.length < 6) error.value = 'Mật khẩu mới cần ít nhất 6 ký tự.';
  else if (form.next !== form.again) error.value = 'Hai mật khẩu mới chưa giống nhau.';
  if (error.value) return;
  saving.value = true;
  const res = await changeMyPassword({ current: form.current, next: form.next });
  saving.value = false;
  if (res.ok) emit('close');
  else error.value = res.message || 'Chưa đổi được mật khẩu.';
}
</script>

<template>
  <AppModal
    title="Hồ sơ của tôi"
    sub="Thông tin do Admin quản lý · thấy sai thì báo Admin để sửa"
    :width="640"
    :top="90"
    @close="emit('close')"
  >
    <div class="pf2">
      <div v-for="f in facts" :key="f[0]">
        <span>{{ f[0] }}</span
        ><b>{{ f[1] }}</b>
      </div>
    </div>
    <div class="ttl">Đổi mật khẩu</div>
    <form @submit.prevent="submit" @keydown.enter.prevent="submit">
      <div class="fld">
        <label for="pf-current">Mật khẩu hiện tại</label>
        <div class="inp">
          <input
            id="pf-current"
            v-model="form.current"
            :type="shown.current ? 'text' : 'password'"
            autocomplete="current-password"
            autofocus
          />
          <button type="button" class="end" @click="shown.current = !shown.current">
            {{ shown.current ? 'Ẩn' : 'Hiện' }}
          </button>
        </div>
      </div>
      <div class="g2">
        <div class="fld">
          <label for="pf-next">Mật khẩu mới <small>(ít nhất 6 ký tự)</small></label>
          <div class="inp">
            <input
              id="pf-next"
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
          <label for="pf-again">Nhập lại mật khẩu mới</label>
          <div class="inp">
            <input
              id="pf-again"
              v-model="form.again"
              :type="shown.again ? 'text' : 'password'"
              autocomplete="new-password"
            />
            <button type="button" class="end" @click="shown.again = !shown.again">
              {{ shown.again ? 'Ẩn' : 'Hiện' }}
            </button>
          </div>
        </div>
      </div>
      <div v-if="error" class="note err msg" role="alert">
        <Icon name="alert" />
        <div>{{ error }}</div>
      </div>
    </form>
    <template #footer>
      <span class="sp" />
      <button type="button" class="btn" @click="emit('close')">Đóng</button>
      <button type="button" class="btn pri" :disabled="saving" @click="submit"><Icon name="key" />Đổi mật khẩu</button>
    </template>
  </AppModal>
</template>

<style scoped>
.pf2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  border: 1px solid var(--border);
  border-radius: 14px;
  overflow: hidden;
}
.pf2 div {
  padding: 10px 14px;
  border-top: 1px solid var(--rule);
}
.pf2 div:nth-child(-n + 2) {
  border-top: 0;
}
.pf2 div:nth-child(even) {
  border-left: 1px solid var(--rule);
}
.pf2 span {
  display: block;
  font-size: 12px;
  color: var(--muted);
}
.pf2 b {
  font-size: 14px;
  font-weight: 500;
}
.ttl {
  font-weight: 600;
  font-size: 14px;
  margin-top: 20px;
}
.inp input {
  flex: 1;
  min-width: 0;
  height: 38px;
  border: 0;
  background: transparent;
  font: inherit;
  color: inherit;
  outline: none;
  padding: 0;
}
.inp .end {
  border: 0;
  background: none;
  padding: 0 0 0 8px;
  font: inherit;
  cursor: pointer;
}
.inp:focus-within {
  border-color: var(--text);
  box-shadow: 0 0 0 3px #e9e9e9;
}
.msg {
  margin-top: 14px;
}
</style>
