<script setup lang="ts">
// Hộp "Thêm nhân sự" (không có id) và "Sửa hồ sơ" (có id). Thêm: tạo hồ sơ kèm tài khoản vai trò Nhân viên, mở từ Nhân sự và
// từ Phân quyền › Tài khoản (Tạo tài khoản). Sửa: mở từ ngăn kéo hồ sơ, điền sẵn hồ sơ đang lưu; tên đăng nhập chỉ xem, không có
// mật khẩu (đặt lại ở Phân quyền › Tài khoản). Nút Tạo / Lưu chỉ bật khi biểu mẫu đúng (Lưu còn cần có thay đổi); câu báo duy
// nhất trước khi bấm là tên đăng nhập đã có người dùng. Xong thì phát saved({ name, username }).
//   <StaffFormDialog @close="…" @saved="…" />            <StaffFormDialog id="le-hoang-nam" @close="…" @saved="…" />
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
  editProblem,
  editStaffBody,
  emptyStaffForm,
  levelOptions,
  newStaffBody,
  suggestUsername,
  typeOptions,
  type StaffForm
} from '@/builders/admin-hr/staff-form';
import { createEmployee, getStaffForm, getStaffFormOptions, updateEmployee } from '@/services/admin-hr';
import FieldDate from '../settings/fields/FieldDate.vue';
import SelectBox from '../settings/fields/SelectBox.vue';
import TextBox from '../settings/fields/TextBox.vue';

const props = defineProps<{ id?: string }>();
const emit = defineEmits<{ close: []; saved: [who: { name: string; username: string }] }>();

const editing = !!props.id;
const { data: loaded, error: loadError } = useLoad(async () => {
  const [opts, seed] = await Promise.all([getStaffFormOptions(), props.id ? getStaffForm(props.id) : null]);
  return { opts, seed };
});
const opts = computed(() => loaded.value?.opts ?? null);
const form = reactive<StaffForm>(emptyStaffForm(''));
const original = ref('');
const ready0 = ref(false); // biểu mẫu đã điền (Thêm: hôm nay; Sửa: hồ sơ đang lưu)
watch(loaded, l => {
  if (!l || ready0.value) return;
  Object.assign(form, l.seed ?? emptyStaffForm(l.opts.today));
  original.value = JSON.stringify(form);
  ready0.value = true;
});
const shiftChanged = computed(() => {
  if (!editing || !original.value) return false;
  const o = JSON.parse(original.value) as StaffForm;
  return o.shift !== form.shift || o.nightPct !== form.nightPct;
});
watch(shiftChanged, c => {
  if (c && !form.shiftFrom) form.shiftFrom = opts.value?.today ?? '';
  if (!c) form.shiftFrom = '';
});
const missing = computed(() => editing && !!loaded.value && !loaded.value.seed);

const month = computed(() => (opts.value?.today || '').slice(0, 7));
const types = computed(() => (opts.value ? typeOptions(opts.value.catalog, month.value) : []));
const levels = computed(() => (opts.value ? levelOptions(opts.value.catalog, form.type, month.value) : []));
const depts = computed(() => [
  { value: '', label: 'Chưa xếp phòng' },
  ...(opts.value?.depts ?? []).map(d => ({ value: String(d.id), label: d.name }))
]);
const isNv = computed(() => form.type === 'nv');
const nightNv = computed(() => isNv.value && form.shift === 'NIGHT');
const placeholder = (label: string) => [{ value: '', label }];

// Thêm: tên đăng nhập theo họ tên cho tới khi Admin tự gõ. Xoá trắng thì ô để trống (nút Tạo mờ); sửa họ tên sau đó thì
// lại gợi ý theo họ tên. Sửa: tên đăng nhập không đổi.
const typedUsername = ref(false);
watch(
  () => form.name,
  name => {
    if (!editing && ready0.value && !typedUsername.value) form.username = suggestUsername(name);
  }
);
function onUsername(e: Event) {
  const input = e.target as HTMLInputElement;
  const clean = cleanUsername(input.value);
  input.value = clean; // Vue không vẽ lại khi giá trị sau khi lọc trùng giá trị cũ
  form.username = clean;
  typedUsername.value = clean !== '';
}

function onType(code: string) {
  form.type = code;
  form.level = '';
  form.status = '';
  form.nightPct = '';
}

const taken = computed(() => opts.value?.taken || []);
const usernameTaken = computed(() => !editing && !!form.username && taken.value.includes(form.username));
const changed = computed(() => JSON.stringify(form) !== original.value);
const ready = computed(() => {
  if (!ready0.value) return false;
  if (editing) return changed.value && editProblem(form, levels.value) === '';
  return createProblem(form, taken.value, levels.value) === '';
});

const saving = ref(false);
const error = ref('');
async function save() {
  if (!ready.value || saving.value) return;
  saving.value = true;
  error.value = '';
  try {
    if (editing) await updateEmployee(props.id!, editStaffBody(form));
    else await createEmployee(newStaffBody(form));
    emit('saved', { name: form.name.trim().replace(/\s+/g, ' '), username: form.username });
  } catch (e) {
    error.value = e instanceof Error && e.message ? e.message : 'Chưa lưu được, thử lại sau.';
  } finally {
    saving.value = false;
  }
}

const title = editing ? 'Sửa hồ sơ' : 'Thêm nhân sự';
const sub = computed(() =>
  editing
    ? loaded.value?.seed
      ? `${loaded.value.seed.name} · ${loaded.value.seed.username}`
      : ''
    : 'Tạo hồ sơ và tài khoản đăng nhập vai trò Nhân viên'
);
</script>

<template>
  <AppModal :title="title" :sub="sub" :width="720" :top="96" :dismissable="!saving" @close="emit('close')">
    <div v-if="loadError" class="note err">Không tải được danh mục chức vụ, thử lại sau.</div>
    <div v-else-if="missing" class="note err">Không tìm thấy hồ sơ này.</div>
    <div v-else-if="ready0" class="g2">
      <div class="fld"><label>Họ tên</label><TextBox v-model="form.name" label="Họ tên" /></div>
      <div class="fld">
        <label>Tên đăng nhập</label>
        <div class="inp" :class="{ ro: editing }">
          <input
            type="text"
            autocomplete="off"
            spellcheck="false"
            aria-label="Tên đăng nhập"
            :readonly="editing"
            :value="form.username"
            @input="onUsername"
          />
        </div>
        <div v-if="usernameTaken" class="taken">Tên đăng nhập {{ form.username }} đã có người dùng.</div>
      </div>
      <div v-if="!editing" class="fld">
        <label>Mật khẩu ban đầu <small>(ít nhất {{ PASSWORD_MIN }} ký tự)</small></label>
        <TextBox v-model="form.password" label="Mật khẩu ban đầu" />
      </div>
      <div class="fld">
        <label>Chức danh</label>
        <TextBox v-model="form.job" label="Chức danh" placeholder="Không bắt buộc" />
      </div>
      <div class="fld">
        <label>Phòng ban</label>
        <SelectBox v-model="form.dept" variant="inp" :options="depts" label="Phòng ban" />
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
      <div v-if="shiftChanged" class="fld">
        <label>Áp dụng ca mới từ ngày</label>
        <FieldDate v-model="form.shiftFrom" boxed label="Áp dụng ca mới từ ngày" />
      </div>
      <div class="fld"><label>Ngày vào làm</label><FieldDate v-model="form.start" boxed label="Ngày vào làm" /></div>
      <div class="fld"><label>Ngày sinh</label><FieldDate v-model="form.birthday" boxed label="Ngày sinh" /></div>
    </div>
    <div v-if="!editing && ready0" class="note" style="margin-top: 16px">
      <Icon name="info" />
      <div>Loại hợp đồng, bảo hiểm và người phụ thuộc lấy theo mặc định của loại nhân sự. Báo mật khẩu ban đầu cho người này.</div>
    </div>
    <div v-if="error" class="note err" role="alert" style="margin-top: 12px">{{ error }}</div>
    <template #footer>
      <span class="sp" />
      <button type="button" class="btn" :disabled="saving" @click="emit('close')">Huỷ</button>
      <button type="button" class="btn" :class="ready ? 'pri' : 'off'" :disabled="!ready || saving" @click="save">
        <template v-if="editing">Lưu thay đổi</template>
        <template v-else><Icon name="plus" />Tạo nhân sự</template>
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
.inp.ro {
  background: var(--raised);
}
.inp.ro input {
  color: var(--muted);
}
</style>
