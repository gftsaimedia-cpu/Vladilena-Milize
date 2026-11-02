<script setup lang="ts">
import { computed, ref } from 'vue';
import AppModal from '@/components/ui/AppModal.vue';
import Icon from '@/components/ui/Icon.vue';
import { useLoad } from '@/composables/useLoad';
import { toast } from '@/components/shell/toast';
import { createStaff, getStaffOptions } from '@/services/admin-hr';
import { CONTRACT_STATUS_OPTIONS } from '@/builders/admin-hr/staff';
import FldInput from './fields/FldInput.vue';
import FldSelect from './fields/FldSelect.vue';

const emit = defineEmits(['close', 'saved']);
const { data: opts } = useLoad(() => getStaffOptions());
const form = ref({ name: '', title: '', type: 'tts', level: '1', shift: '', start: '', birth: '', contractStatus: '' });
const levels = computed(() => opts.value?.levels[form.value.type] || []);
const saving = ref(false);
const createdSuccessfully = ref(false);
const credentials = ref(null);
const leaveBalance = ref(null);
const leaveLookupFailed = ref(false);

function onType(type?) {
  form.value.type = type;
  form.value.level = opts.value.levels[type]?.[0]?.value || '';
}

function close() {
  if (saving.value) return;
  if (createdSuccessfully.value) emit('saved');
  else emit('close');
}

async function copyCredentials() {
  try {
    await navigator.clipboard.writeText(
      `Tài khoản: ${credentials.value.username}\nMật khẩu: ${credentials.value.password}`
    );
    toast.ok('Đã sao chép thông tin đăng nhập');
  } catch {
    toast.error('Không thể sao chép. Hãy ghi lại thông tin đăng nhập đang hiển thị.');
  }
}

async function save() {
  if (saving.value || createdSuccessfully.value) return;
  if (!form.value.name.trim()) return toast.error('Nhập họ tên');
  saving.value = true;
  try {
    const result = await createStaff({ ...form.value, name: form.value.name.trim() });
    createdSuccessfully.value = true;
    credentials.value = result.credentials;
    leaveBalance.value = typeof result.staff?.leave?.balance === 'number' ? result.staff.leave.balance : null;
    leaveLookupFailed.value = result.leaveLookupFailed;
    if (!credentials.value) throw new Error('Máy chủ không trả thông tin đăng nhập mới.');
  } catch (e) {
    toast.error(e && e.message);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <AppModal
    :title="credentials ? 'Thông tin đăng nhập nhân sự mới' : 'Thêm nhân sự'"
    :sub="
      credentials
        ? 'Hãy lưu thông tin này trước khi đóng.'
        : 'Tạo hồ sơ nhân sự và tài khoản đăng nhập vai trò Nhân viên'
    "
    :width="820"
    :top="120"
    :dismissable="!saving && !credentials"
    @close="close"
  >
    <template v-if="credentials">
      <div class="credentials">
        <div>
          <span>Tên đăng nhập</span><b>{{ credentials.username }}</b>
        </div>
        <div>
          <span>Mật khẩu ban đầu</span><b>{{ credentials.password }}</b>
        </div>
        <button type="button" class="btn" @click="copyCredentials">
          <Icon name="copy" />Sao chép thông tin đăng nhập
        </button>
      </div>
      <div class="note">
        <Icon name="info" />
        <div>
          Phép năm còn lại:
          <b>{{ leaveBalance ?? (leaveLookupFailed ? 'Chưa tải được số ngày phép' : 'Chưa có số dư phép năm') }}</b>
        </div>
      </div>
    </template>
    <template v-else>
      <div v-if="opts" class="g2">
        <FldInput v-model="form.name" label="Họ tên" autofocus />
        <FldInput v-model="form.title" label="Chức danh" placeholder="Chưa có" />
        <FldSelect :model-value="form.type" label="Loại nhân sự" :options="opts.types" @update:model-value="onType" />
        <FldSelect v-model="form.level" label="Bậc" :options="levels" />
        <FldSelect v-model="form.shift" label="Ca cố định" :options="opts.shifts" />
        <FldSelect v-model="form.contractStatus" label="Trạng thái nhân sự" :options="CONTRACT_STATUS_OPTIONS" />
        <FldInput v-model="form.start" label="Ngày bắt đầu làm" kind="date" icon="cal" />
        <FldInput v-model="form.birth" label="Ngày sinh" kind="date" icon="cal" />
      </div>
      <div class="note">
        <Icon name="info" />
        <div>Phép năm còn lại: <b>Được tính sau khi lưu</b></div>
      </div>
      <div style="height: 14px" />
      <div class="note">
        <Icon name="info" />
        <div>Hợp đồng, bảo hiểm và thuế lấy theo mặc định của loại nhân sự; sửa sau trong hồ sơ.</div>
      </div>
    </template>
    <template #footer>
      <span class="sp" />
      <button v-if="credentials" type="button" class="btn pri" @click="close">Đã lưu, đóng</button>
      <template v-else>
        <button type="button" class="btn" :disabled="saving" @click="close">Huỷ</button>
        <button
          type="button"
          class="btn pri"
          :disabled="saving || createdSuccessfully || !form.name.trim()"
          @click="save"
        >
          <Icon name="plus" />{{ saving ? 'Đang tạo…' : 'Tạo nhân sự' }}
        </button>
      </template>
    </template>
  </AppModal>
</template>

<style scoped>
.credentials {
  display: grid;
  gap: 12px;
  padding: 8px 0 20px;
}
.credentials div {
  display: grid;
  gap: 4px;
}
.credentials span {
  color: var(--muted);
  font-size: 12px;
}
.credentials b {
  font-size: 16px;
  user-select: all;
}
.credentials button {
  justify-self: start;
}
.btn:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
