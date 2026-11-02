<script setup lang="ts">
// Hộp ngày của Bảng công: lượt Check-in/out chỉ để đối chiếu; form khai ngày dùng PUT /sheet.
import { computed, ref, watch } from 'vue';
import { toast } from '@/components/shell/toast';
import AppModal from '@/components/ui/AppModal.vue';
import Icon from '@/components/ui/Icon.vue';
import { useLoad } from '@/composables/useLoad';
import { getDayDetail, saveDayDeclaration } from '@/services/admin-attendance';
import { ApiError } from '@/services/http';
import { dayLong } from '@/utils/format';
import FldInput from '@/views/admin/staff/fields/FldInput.vue';
import FldSelect from '@/views/admin/staff/fields/FldSelect.vue';

const props = defineProps({
  personId: { type: String, required: true },
  date: { type: String, required: true } // 'YYYY-MM-DD'
});
const emit = defineEmits(['close', 'saved']);

const { data } = useLoad(
  () => getDayDetail(props.personId, props.date),
  () => props.personId + props.date
);
const title = computed(() =>
  data.value ? `${data.value.name} · ${dayLong(props.date).replace(', ', ' ')}/${props.date.slice(0, 4)}` : ''
);
const punches = computed(() => data.value?.punches || []);

const KIND_OPTIONS = [
  { value: 'work', label: 'Đi làm' },
  { value: 'leave', label: 'Nghỉ phép năm' },
  { value: 'unpaid', label: 'Nghỉ không lương' },
  { value: 'approved', label: 'Nghỉ được duyệt' },
  { value: 'isat', label: 'iSAT' },
  { value: 'willmakeup', label: 'Nghỉ, sẽ làm bù' }
];
const kindOptions = computed(() => [
  ...KIND_OPTIONS,
  ...(form.value.kind === 'makeup' ? [{ value: 'makeup', label: 'Làm bù cả ngày (loại cũ)' }] : [])
]);
const extraOptions = [
  { value: '', label: 'Không làm thêm' },
  { value: 'ot', label: 'OT' },
  { value: 'makeup', label: 'Làm bù theo giờ' }
];
function blankForm() {
  return {
    kind: 'work',
    shift: '',
    checkIn: '',
    checkOut: '',
    breakMin: 0,
    extraKind: '',
    extraIn: '',
    extraOut: '',
    makeupPlans: []
  };
}
const form = ref<any>(blankForm());
function formFromDay(day: any, detail: any) {
  const current = day || {};
  const kind = current.kind || (current.in && current.out ? 'work' : 'work');
  const fallbackShift = detail.shiftOptions.find((x: any) => x.value === detail.assignedShift)?.value || '';
  return {
    kind,
    shift: current.preset || fallbackShift,
    checkIn: current.in || detail.shiftOptions.find((x: any) => x.value === fallbackShift)?.in || '',
    checkOut: current.out || detail.shiftOptions.find((x: any) => x.value === fallbackShift)?.out || '',
    breakMin: current.breakMin ?? 0,
    extraKind: current.extraKind || (current.extraOut ? 'makeup' : ''),
    extraIn: current.extraIn || '',
    extraOut: current.extraOut || '',
    makeupPlans:
      kind === 'willmakeup'
        ? (current.makeupPlans || (current.makeupDate ? [{ date: current.makeupDate }] : [])).map((p: any) => ({
            date: p.date || '',
            from: p.from || '',
            to: p.to || ''
          }))
        : []
  };
}
watch(data, d => {
  if (d) form.value = formFromDay(d.days?.[props.date], d);
}, { immediate: true });

const canSave = computed(
  () =>
    form.value.kind &&
    (!['work', 'makeup'].includes(form.value.kind) || (form.value.checkIn && form.value.checkOut))
);
const saving = ref(false);
async function save() {
  if (!canSave.value || saving.value) return;
  saving.value = true;
  try {
    const f = form.value;
    const day =
      f.kind === 'willmakeup'
        ? { kind: f.kind, makeupPlans: f.makeupPlans }
        : f.kind === 'makeup'
          ? { ...data.value.days[props.date] }
          : f.kind === 'work'
          ? {
              kind: f.kind,
              in: f.checkIn,
              out: f.checkOut,
              ...(f.shift ? { preset: f.shift } : {}),
              breakMin: Number(f.breakMin) || 0,
              ...(f.kind === 'work' && f.extraKind
                ? {
                    extraKind: f.extraKind,
                    ...(f.extraIn ? { extraIn: f.extraIn } : {}),
                    ...(f.extraOut ? { extraOut: f.extraOut } : {})
                  }
                : {})
            }
          : { kind: f.kind };
    const result = await saveDayDeclaration({
      personId: props.personId,
      date: props.date,
      day,
      expectedRev: data.value.rev,
      originalDay: data.value.days?.[props.date]
    });
    if (result.warnings?.length) toast.warnings(result.warnings);
    const autoApproved = Number(result.autoApproved) || 0;
    toast.ok(
      autoApproved
        ? `Đã lưu khai báo ngày công; ${autoApproved} khoản được duyệt tự động.`
        : 'Đã lưu khai báo ngày công.'
    );
    emit('saved');
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
    toast.error(e.status === 409 ? `${e.message}. Tải lại dữ liệu ngày rồi lưu lại.` : e.message);
  } finally {
    saving.value = false;
  }
}
function chooseShift(value: any) {
  form.value.shift = value;
  const selected = data.value?.shiftOptions?.find((x: any) => x.value === value);
  if (selected?.in && selected?.out) {
    form.value.checkIn = selected.in;
    form.value.checkOut = selected.out;
  }
}
function chooseKind(value: string) {
  form.value.kind = value;
  if (value === 'willmakeup' && !form.value.makeupPlans.length) addMakeupPlan();
}
function setTime(field: 'checkIn' | 'checkOut', value: string) {
  form.value[field] = value;
  const selected = data.value?.shiftOptions?.find((x: any) => x.value === form.value.shift);
  if (form.value.shift && (selected?.[field === 'checkIn' ? 'in' : 'out'] !== value)) form.value.shift = '';
}
function onTimeInput(field: 'checkIn' | 'checkOut', event: Event) {
  setTime(field, (event.target as HTMLInputElement).value);
}
function showTimePicker(event: MouseEvent) {
  try {
    (event.currentTarget as HTMLInputElement).showPicker?.();
  } catch {
    // Nếu trình duyệt không mở picker, input giờ vẫn dùng được bằng bàn phím.
  }
}
function addMakeupPlan() { form.value.makeupPlans.push({ date: '', from: '', to: '' }); }
function removeMakeupPlan(index: number) { form.value.makeupPlans.splice(index, 1); }
</script>

<template>
  <AppModal
    :title="title"
    :sub="data ? `${data.role} · ${data.shiftLabel}` : ''"
    :width="720"
    :top="56"
    @close="emit('close')"
  >
    <template v-if="data">
      <div v-for="p in punches" :key="p.id" class="lu">
        <div class="h">
          <b>Lượt #{{ p.id }}</b>
          <span class="pill" :class="p.closed ? 'p-done' : 'p-pend'">{{ p.status }}</span>
        </div>
        <div class="kv4">
          <div>
            <span>Check-in – Check-out</span><b>{{ p.checkIn }} – {{ p.checkOut || '…' }}</b>
          </div>
          <div>
            <span>Vào muộn</span><b>{{ p.lateMin }} phút</b>
          </div>
          <div>
            <span>OT đã khai</span><b>{{ p.ot }}</b>
          </div>
          <div>
            <span>Ngày công</span><b>{{ p.result }}</b>
          </div>
        </div>
        <div class="pun">
          <span
            ><b>{{ p.checkIn }}</b> Check-in</span
          >
          <span v-if="p.checkOut"
            ><b>{{ p.checkOut }}</b> Check-out</span
          >
          <span class="raw">giờ bấm gốc, luôn được giữ nguyên</span>
        </div>
      </div>
      <p v-if="!punches.length" class="none">Ngày này chưa có lượt Check-in nào.</p>

      <div class="hd2">Khai báo ngày công</div>
      <div class="g2">
        <FldSelect :model-value="form.kind" label="Loại ngày" :options="kindOptions" @update:model-value="chooseKind" />
        <p v-if="form.kind === 'makeup'" class="hint">
          Đây là loại làm bù cả ngày cũ. Giữ nguyên hoặc chọn loại ngày mới để chuyển đổi; loại cũ không cho sửa giờ.
        </p>
        <template v-if="form.kind === 'work'">
          <FldSelect
            :model-value="form.shift"
            label="Ca đối chiếu"
            :options="data.shiftOptions"
            @update:model-value="chooseShift"
          />
          <div class="fld">
            <label for="day-check-in">Giờ vào</label>
            <div class="inp native-time">
              <input
                id="day-check-in"
                type="time"
                step="60"
                :value="form.checkIn"
                @input="onTimeInput('checkIn', $event)"
                @click="showTimePicker"
              />
            </div>
          </div>
          <div class="fld">
            <label for="day-check-out">Giờ ra</label>
            <div class="inp native-time">
              <input
                id="day-check-out"
                type="time"
                step="60"
                :value="form.checkOut"
                @input="onTimeInput('checkOut', $event)"
                @click="showTimePicker"
              />
            </div>
          </div>
          <FldInput v-model="form.breakMin" label="Ra ngoài giữa giờ (phút)" kind="number" />
        </template>
        <template v-if="form.kind === 'work'">
          <FldSelect v-model="form.extraKind" label="Làm thêm" :options="extraOptions" />
          <template v-if="form.extraKind">
            <div class="fld">
              <label for="day-extra-in">Giờ bắt đầu (trước ca)</label>
              <div class="inp native-time">
                <input
                  id="day-extra-in"
                  v-model="form.extraIn"
                  type="time"
                  step="60"
                  @click="showTimePicker"
                />
              </div>
            </div>
            <div class="fld">
              <label for="day-extra-out">Giờ kết thúc (sau ca)</label>
              <div class="inp native-time">
                <input
                  id="day-extra-out"
                  v-model="form.extraOut"
                  type="time"
                  step="60"
                  @click="showTimePicker"
                />
              </div>
            </div>
          </template>
        </template>
      </div>
      <div v-if="form.kind === 'willmakeup'" class="plans">
        <div v-for="(plan, index) in form.makeupPlans" :key="index" class="plan">
          <FldInput
            v-model="plan.date"
            :label="`Ngày làm bù${form.makeupPlans.length > 1 ? ` ${Number(index) + 1}` : ''}`"
            kind="date"
          />
          <div class="fld">
            <label :for="`makeup-from-${index}`">Giờ bắt đầu</label>
            <div class="inp native-time">
              <input
                :id="`makeup-from-${index}`"
                v-model="plan.from"
                type="time"
                step="60"
                @click="showTimePicker"
              />
            </div>
          </div>
          <div class="fld">
            <label :for="`makeup-to-${index}`">Giờ kết thúc</label>
            <div class="inp native-time">
              <input
                :id="`makeup-to-${index}`"
                v-model="plan.to"
                type="time"
                step="60"
                @click="showTimePicker"
              />
            </div>
          </div>
          <button
            v-if="form.makeupPlans.length > 1"
            type="button"
            class="btn sm ghost"
            @click="removeMakeupPlan(Number(index))"
            >Bỏ ngày</button
          >
        </div>
        <button type="button" class="btn sm ghost" @click="addMakeupPlan">Thêm ngày làm bù</button>
      </div>
      <p class="hint">Ngày, ca, quyền lợi và giới hạn được kiểm tra theo quy tắc hiện hành của máy chủ. Các cảnh báo và tác động duyệt sẽ theo phản hồi của máy chủ.</p>
    </template>
    <template #footer>
      <span class="sp" />
      <button type="button" class="btn" @click="emit('close')">Đóng</button>
      <button type="button" class="btn pri" :disabled="!canSave || saving" @click="save">
        <Icon name="check" />{{ saving ? 'Đang lưu…' : 'Lưu khai báo' }}
      </button>
    </template>
  </AppModal>
</template>

<style scoped>
.lu {
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 14px 16px;
}
.lu + .lu {
  margin-top: 12px;
}
.lu .h {
  display: flex;
  align-items: center;
  gap: 10px;
}
.lu .h b {
  font-size: 15px;
}
.lu .h .pill {
  margin-left: auto;
}
.kv4 {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-top: 12px;
}
.kv4 span {
  display: block;
  font-size: 12px;
  color: var(--muted);
}
.kv4 b {
  font-size: 14px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}
.pun {
  display: flex;
  gap: 8px;
  margin-top: 12px;
  flex-wrap: wrap;
}
.pun span {
  display: inline-flex;
  gap: 8px;
  align-items: center;
  height: 30px;
  padding: 0 12px;
  border-radius: 8px;
  background: var(--raised);
  border: 1px solid var(--border);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
}
.pun span b {
  font-weight: 600;
}
.pun span.raw {
  background: none;
  border: 0;
  color: var(--muted);
  padding: 0;
}
.hd2 {
  margin: 20px 0 0;
  font-size: 14px;
  font-weight: 600;
}
.plans {
  display: grid;
  gap: 10px;
  margin-top: 14px;
}
.plan {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr auto;
  align-items: end;
  gap: 10px;
}
.hint {
  color: var(--muted);
  font-size: 12px;
  margin: 12px 0 0;
}
.native-time:focus-within {
  border-color: var(--text);
  box-shadow: 0 0 0 3px #e9e9e9;
}
.native-time input[type='time'] {
  flex: 1;
  min-width: 0;
  width: 100%;
  height: 38px;
  padding: 0;
  border: 0;
  outline: 0;
  background: transparent;
  color: inherit;
  font: inherit;
}
.btn.sm { min-height: 36px; }
.none {
  margin: 0;
  color: var(--muted);
}
.btn:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
