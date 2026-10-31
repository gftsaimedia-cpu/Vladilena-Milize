<script setup>
// Hộp Thêm nhân sự (dlg-ns-them): tạo hồ sơ và tài khoản đăng nhập vai trò Nhân viên.
import { computed, ref } from 'vue';
import AppModal from '@/components/ui/AppModal.vue';
import Icon from '@/components/ui/Icon.vue';
import { useLoad } from '@/composables/useLoad.js';
import { toast } from '@/components/shell/toast.js';
import { createStaff, getStaffOptions } from '@/services/admin-hr.js';
import { normalizeUsername } from '@/builders/admin-hr/staff.js';
import FldInput from './fields/FldInput.vue';
import FldSelect from './fields/FldSelect.vue';

const emit = defineEmits(['close', 'saved']);
const { data: opts } = useLoad(() => getStaffOptions());

const form = ref({
  username: '',
  password: '',
  name: '',
  title: '',
  type: 'tts',
  level: '1',
  shift: '',
  start: '',
  birth: '',
  leaveAdjust: 0
});
const levels = computed(() => opts.value?.levels[form.value.type] || []);
function onType(type) {
  form.value.type = type;
  form.value.level = opts.value.levels[type]?.[0]?.value || '';
}

// Tên đăng nhập kiểm theo dạng đã chuẩn hoá (bỏ khoảng trắng đầu cuối, chữ thường) và theo độ dài máy chủ nhận (2–40 ký tự)
const USERNAME_RE = /^[a-z0-9._-]{2,40}$/;
const problem = () => {
  if (!USERNAME_RE.test(normalizeUsername(form.value.username)))
    return 'Tên đăng nhập 2–40 ký tự: chữ thường không dấu, số, dấu . _ -';
  if (form.value.password.length < 6) return 'Mật khẩu đầu tiên ít nhất 6 ký tự';
  if (!form.value.name.trim()) return 'Nhập họ tên';
  return '';
};
const saving = ref(false);
async function save() {
  if (saving.value) return;
  const msg = problem();
  if (msg) return toast.error(msg);
  saving.value = true;
  try {
    await createStaff({
      ...form.value,
      name: form.value.name.trim(),
      leaveAdjust: Number(form.value.leaveAdjust) || 0
    });
    emit('saved');
  } catch (e) {
    toast.error(e && e.message);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <AppModal
    title="Thêm nhân sự"
    sub="Tạo hồ sơ và tài khoản đăng nhập vai trò Nhân viên"
    :width="820"
    :top="120"
    @close="emit('close')"
  >
    <div v-if="opts" class="g2">
      <FldInput v-model="form.username" label="Tên đăng nhập" placeholder="chữ thường, số, dấu . _ -" autofocus />
      <FldInput v-model="form.password" label="Mật khẩu đầu tiên" small="ít nhất 6 ký tự" kind="password" />
      <FldInput v-model="form.name" label="Họ tên" />
      <FldInput v-model="form.title" label="Chức danh" small="in trên phiếu lương" placeholder="Chưa có" />
      <FldSelect :model-value="form.type" label="Loại nhân sự" :options="opts.types" @update:model-value="onType" />
      <FldSelect v-model="form.level" label="Bậc" :options="levels" />
      <FldSelect v-model="form.shift" label="Ca cố định" :options="opts.shifts" />
      <FldInput v-model="form.start" label="Ngày bắt đầu làm" kind="date" icon="cal" />
      <FldInput v-model="form.birth" label="Ngày sinh" kind="date" icon="cal" />
      <FldInput
        v-model="form.leaveAdjust"
        label="Điều chỉnh phép"
        small="+/− ngày, bước 0,5"
        kind="number"
        step="0.5"
      />
    </div>
    <div style="height: 14px" />
    <div class="note">
      <Icon name="info" />
      <div>Hợp đồng, bảo hiểm và thuế lấy theo mặc định của loại nhân sự; sửa sau trong hồ sơ.</div>
    </div>
    <template #footer>
      <span class="sp" />
      <button type="button" class="btn" @click="emit('close')">Huỷ</button>
      <button type="button" class="btn pri" :disabled="saving" @click="save"><Icon name="plus" />Tạo nhân sự</button>
    </template>
  </AppModal>
</template>

<style scoped>
.btn:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
