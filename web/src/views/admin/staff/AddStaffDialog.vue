<script setup lang="ts">
// Hộp "Thêm nhân sự": tạo hồ sơ kèm tài khoản vai trò Nhân viên (POST /api/v2/employees). Mở từ Nhân sự và từ
// Phân quyền › Tài khoản (nút Tạo tài khoản). Nút Tạo chỉ bật khi biểu mẫu đủ và đúng; câu báo duy nhất trước khi
// bấm là tên đăng nhập đã có người dùng. Tạo xong phát saved({ name, username }); vỏ đóng hộp và tải lại danh sách.
//   <AddStaffDialog @close="…" @saved="…" />
import { computed, reactive, ref, watch } from 'vue';
import AppModal from '@/components/ui/AppModal.vue';
import Icon from '@/components/ui/Icon.vue';
import { useLoad } from '@/composables/useLoad';
import {
  NIGHT_PCTS,
  NV_STATUS_OPTIONS,
  PASSWORD_MIN,
  SHIFT_OPTIONS,
  cleanUsername,
  createProblem,
  emptyNewStaff,
  levelOptions,
  newStaffBody,
  suggestUsername,
  typeOptions
} from '@/builders/admin-hr/new-staff';
import { createEmployee, getNewStaffOptions } from '@/services/admin-hr';
import FieldDate from '../settings/fields/FieldDate.vue';
import SelectBox from '../settings/fields/SelectBox.vue';
import TextBox from '../settings/fields/TextBox.vue';

const emit = defineEmits<{ close: []; saved: [who: { name: string; username: string }] }>();

const { data: opts, error: loadError } = useLoad(() => getNewStaffOptions());
const form = reactive(emptyNewStaff(''));
watch(opts, o => {
  if (o && !form.start) form.start = o.today;
});

const month = computed(() => (opts.value?.today || '').slice(0, 7));
const types = computed(() => (opts.value ? typeOptions(opts.value.catalog, month.value) : []));
const levels = computed(() => (opts.value ? levelOptions(opts.value.catalog, form.type, month.value) : []));
const isNv = computed(() => form.type === 'nv');
const nightNv = computed(() => isNv.value && form.shift === 'NIGHT');
const placeholder = (label: string) => [{ value: '', label }];

// Tên đăng nhập theo họ tên cho tới khi Admin tự gõ (xoá trắng thì lại gợi ý theo họ tên).
const typedUsername = ref(false);
watch(
  () => form.name,
  name => {
    if (!typedUsername.value) form.username = suggestUsername(name);
  }
);
function onUsername(e: Event) {
  const input = e.target as HTMLInputElement;
  const clean = cleanUsername(input.value);
  input.value = clean;
  form.username = clean;
  typedUsername.value = clean !== '';
  if (!clean) form.username = suggestUsername(form.name);
}

function onType(code: string) {
  form.type = code;
  form.level = '';
  form.status = '';
  form.nightPct = '';
}

const taken = computed(() => opts.value?.taken || []);
const usernameTaken = computed(() => !!form.username && taken.value.includes(form.username));
const ready = computed(() => !!opts.value && createProblem(form, taken.value, levels.value) === '');

const saving = ref(false);
const error = ref('');
async function save() {
  if (!ready.value || saving.value) return;
  saving.value = true;
  error.value = '';
  try {
    await createEmployee(newStaffBody(form));
    emit('saved', { name: form.name.trim().replace(/\s+/g, ' '), username: form.username });
  } catch (e) {
    error.value = e && e.message ? e.message : 'Chưa thêm được nhân sự, thử lại sau.';
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <AppModal
    title="Thêm nhân sự"
    sub="Tạo hồ sơ và tài khoản đăng nhập vai trò Nhân viên"
    :width="720"
    :top="96"
    :dismissable="!saving"
    @close="emit('close')"
  >
    <div v-if="loadError" class="note err">Không tải được danh mục chức vụ, thử lại sau.</div>
    <div v-else class="g2">
      <div class="fld"><label>Họ tên</label><TextBox v-model="form.name" label="Họ tên" /></div>
      <div class="fld">
        <label>Tên đăng nhập</label>
        <div class="inp">
          <input
            type="text"
            autocomplete="off"
            spellcheck="false"
            aria-label="Tên đăng nhập"
            :value="form.username"
            @input="onUsername"
          />
        </div>
        <div v-if="usernameTaken" class="taken">Tên đăng nhập {{ form.username }} đã có người dùng.</div>
      </div>
      <div class="fld">
        <label>Mật khẩu ban đầu <small>(ít nhất {{ PASSWORD_MIN }} ký tự)</small></label>
        <TextBox v-model="form.password" label="Mật khẩu ban đầu" />
      </div>
      <div class="fld">
        <label>Chức danh</label>
        <TextBox v-model="form.job" label="Chức danh" placeholder="Không bắt buộc" />
      </div>
      <div class="fld">
        <label>Loại nhân sự</label>
        <SelectBox
          variant="inp"
          :model-value="form.type"
          :options="[...placeholder('Chọn loại'), ...types]"
          label="Loại nhân sự"
          @update:model-value="onType"
        />
      </div>
      <div class="fld">
        <label>Bậc</label>
        <SelectBox
          v-model="form.level"
          variant="inp"
          :options="[...placeholder(form.type ? 'Chọn bậc' : 'Chọn loại trước'), ...levels]"
          :disabled="!form.type"
          label="Bậc"
        />
      </div>
      <div v-if="isNv" class="fld">
        <label>Trạng thái</label>
        <SelectBox
          v-model="form.status"
          variant="inp"
          :options="[...placeholder('Chọn trạng thái'), ...NV_STATUS_OPTIONS]"
          label="Trạng thái"
        />
      </div>
      <div class="fld">
        <label>Ca làm việc</label>
        <SelectBox v-model="form.shift" variant="inp" :options="SHIFT_OPTIONS" label="Ca làm việc" />
      </div>
      <div v-if="nightNv" class="fld">
        <label>Phụ cấp ca đêm</label>
        <SelectBox
          v-model="form.nightPct"
          variant="inp"
          :options="[...placeholder('Chọn mức'), ...NIGHT_PCTS.map(p => ({ value: p, label: `${p}%` }))]"
          label="Phụ cấp ca đêm"
        />
      </div>
      <div class="fld"><label>Ngày vào làm</label><FieldDate v-model="form.start" boxed label="Ngày vào làm" /></div>
      <div class="fld"><label>Ngày sinh</label><FieldDate v-model="form.birthday" boxed label="Ngày sinh" /></div>
    </div>
    <div class="note" style="margin-top: 16px">
      <Icon name="info" />
      <div>Loại hợp đồng, bảo hiểm và người phụ thuộc lấy theo mặc định của loại nhân sự. Báo mật khẩu ban đầu cho người này.</div>
    </div>
    <div v-if="error" class="note err" role="alert" style="margin-top: 12px">{{ error }}</div>
    <template #footer>
      <span class="sp" />
      <button type="button" class="btn" :disabled="saving" @click="emit('close')">Huỷ</button>
      <button type="button" class="btn" :class="ready ? 'pri' : 'off'" :disabled="!ready || saving" @click="save">
        <Icon name="plus" />Tạo nhân sự
      </button>
    </template>
  </AppModal>
</template>

<style scoped>
.taken {
  margin-top: 6px;
  font-size: 13px;
  line-height: 18px;
  color: var(--err-ink);
}
</style>
