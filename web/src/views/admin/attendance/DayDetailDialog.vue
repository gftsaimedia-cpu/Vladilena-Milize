<script setup lang="ts">
// Hộp ngày của Bảng công: lượt Check-in/out chỉ để đối chiếu; form khai ngày dùng PUT /sheet.
import { computed, ref, watch } from 'vue';
import { toast } from '@/components/shell/toast';
import AppModal from '@/components/ui/AppModal.vue';
import Icon from '@/components/ui/Icon.vue';
import { useLoad } from '@/composables/useLoad';
import {
  approveDayRequest,
  decideOvertime,
  getDayDetail,
  rejectDayRequest,
  saveDayDeclaration
} from '@/services/admin-attendance';
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

const acting = ref(false);

async function onApproveRequest() {
  if (acting.value || !data.value?.approval) return;
  acting.value = true;
  try {
    const res: any = await approveDayRequest(props.personId, props.date);
    if (res && res.ok === false) {
      toast.error(res.message || 'Lỗi khi duyệt yêu cầu');
      return;
    }
    toast.ok(`Đã duyệt yêu cầu ${data.value.approval.title || ''} của ${data.value.name || props.personId}`);
    emit('saved');
  } catch (e: any) {
    toast.error(e.message);
  } finally {
    acting.value = false;
  }
}

async function onRejectRequest() {
  if (acting.value || !data.value?.approval) return;
  const reason = window.prompt(`Lý do từ chối yêu cầu của ${data.value.name || props.personId}:`);
  if (reason === null) return;
  if (!reason.trim()) {
    toast.error('Cần ghi lý do từ chối');
    return;
  }
  acting.value = true;
  try {
    const res: any = await rejectDayRequest(props.personId, props.date, reason.trim());
    if (res && res.ok === false) {
      toast.error(res.message || 'Lỗi khi từ chối yêu cầu');
      return;
    }
    toast.ok(`Đã từ chối yêu cầu của ${data.value.name || props.personId}`);
    emit('saved');
  } catch (e: any) {
    toast.error(e.message);
  } finally {
    acting.value = false;
  }
}

async function onApproveOt(p: any) {
  if (acting.value) return;
  acting.value = true;
  try {
    await decideOvertime({
      sessionId: p.sessionId,
      version: p.version,
      action: 'approve'
    });
    toast.ok(`Đã đồng ý OT cho ${data.value?.name || props.personId}`);
    emit('saved');
  } catch (e: any) {
    toast.error(e.message);
  } finally {
    acting.value = false;
  }
}

async function onRejectOt(p: any) {
  if (acting.value) return;
  const reason = window.prompt(`Lý do từ chối OT của ${data.value?.name || props.personId}:`);
  if (reason === null) return;
  if (!reason.trim()) {
    toast.error('Cần ghi lý do từ chối');
    return;
  }
  acting.value = true;
  try {
    await decideOvertime({
      sessionId: p.sessionId,
      version: p.version,
      action: 'reject',
      reason: reason.trim()
    });
    toast.ok(`Đã từ chối OT của ${data.value?.name || props.personId}`);
    emit('saved');
  } catch (e: any) {
    toast.error(e.message);
  } finally {
    acting.value = false;
  }
}
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
      <!-- Khối yêu cầu chờ duyệt / đã duyệt / bị từ chối -->
      <div v-if="data.approval" class="approval-card" :class="data.approval.status">
        <div class="approval-h">
          <div class="approval-title-wrap">
            <span class="approval-badge">
              {{
                data.approval.status === 'pending'
                  ? 'Yêu cầu chờ duyệt'
                  : data.approval.status === 'approved'
                  ? 'Yêu cầu đã được duyệt'
                  : 'Yêu cầu đã bị từ chối'
              }}
            </span>
            <span
              class="pill"
              :class="
                data.approval.status === 'pending'
                  ? 'p-pend'
                  : data.approval.status === 'approved'
                  ? 'p-done'
                  : 'p-err'
              "
            >
              {{
                data.approval.status === 'pending'
                  ? 'Chờ xử lý'
                  : data.approval.status === 'approved'
                  ? 'Đã duyệt'
                  : 'Bị từ chối'
              }}
            </span>
          </div>
          <div v-if="data.approval.status === 'pending'" class="approval-acts">
            <button
              type="button"
              class="btn pri sm"
              :disabled="acting"
              @click="onApproveRequest"
            >
              <Icon name="check" />Phê duyệt
            </button>
            <button
              type="button"
              class="btn sm"
              :disabled="acting"
              @click="onRejectRequest"
            >
              Từ chối
            </button>
          </div>
        </div>
        <div class="approval-body">
          <div class="req-name">{{ data.approval.title }}</div>
          <div v-if="data.approval.note" class="req-note">
            <span class="label">Ghi chú:</span> {{ data.approval.note }}
          </div>
          <div v-else-if="data.approval.status === 'pending'" class="req-note empty-note">(Không có ghi chú)</div>
          <div v-if="data.approval.status === 'approved'" class="req-meta">
            Đã duyệt bởi {{ data.approval.decidedBy || 'Admin' }}
            <span v-if="data.approval.decidedAt"> lúc {{ data.approval.decidedAt }}</span>
          </div>
          <div v-else-if="data.approval.status === 'rejected'" class="req-meta">
            Đã từ chối bởi {{ data.approval.decidedBy || 'Admin' }}
            <span v-if="data.approval.decidedAt"> lúc {{ data.approval.decidedAt }}</span>
          </div>
        </div>
      </div>

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
        <div v-if="p.canDecideOt" class="ot-acts">
          <span class="ot-label">Lượt OT này đang chờ duyệt:</span>
          <button type="button" class="btn pri sm" :disabled="acting" @click="onApproveOt(p)">
            <Icon name="check" />Duyệt OT
          </button>
          <button type="button" class="btn sm" :disabled="acting" @click="onRejectOt(p)">
            Từ chối OT
          </button>
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
.approval-card {
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 14px 16px;
  margin-bottom: 16px;
  transition: all 0.2s ease;
}
.approval-card.pending {
  background: #fffbeb;
  border-color: #fde68a;
}
:root[data-side='dark'] .approval-card.pending {
  background: rgba(245, 158, 11, 0.1);
  border-color: rgba(245, 158, 11, 0.3);
}
.approval-card.approved {
  background: #f0fdf4;
  border-color: #bbf7d0;
}
:root[data-side='dark'] .approval-card.approved {
  background: rgba(16, 185, 129, 0.1);
  border-color: rgba(16, 185, 129, 0.3);
}
.approval-card.rejected {
  background: #fef2f2;
  border-color: #fecaca;
}
:root[data-side='dark'] .approval-card.rejected {
  background: rgba(239, 68, 68, 0.1);
  border-color: rgba(239, 68, 68, 0.3);
}
.approval-h {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.approval-title-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}
.approval-badge {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--muted);
}
.approval-acts {
  display: flex;
  gap: 8px;
}
.approval-body {
  margin-top: 10px;
}
.req-name {
  font-size: 15px;
  font-weight: 700;
  color: var(--text);
}
.req-note {
  font-size: 13px;
  color: var(--muted);
  margin-top: 4px;
  line-height: 1.4;
}
.req-note .label {
  font-weight: 500;
  color: var(--text);
}
.req-note.empty-note {
  font-style: italic;
}
.req-meta {
  font-size: 12px;
  color: var(--muted);
  margin-top: 4px;
}
.ot-acts {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed var(--rule);
}
.ot-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--pend-ink);
  margin-right: auto;
}
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
