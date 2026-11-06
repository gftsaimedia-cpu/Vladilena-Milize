<script setup lang="ts">
// Hộp "Tuần làm việc" của một người (bảng N1): theo loại nhân sự hoặc tuần riêng T2–T7, áp dụng từ một tháng. Lưu thẳng, không hộp xác nhận thứ hai.
// Escape và trả focus về nút Sửa do AppModal lo (registerOverlayFocus): Escape chỉ đóng hộp này, không đóng ngăn kéo hồ sơ.
import { computed, ref } from 'vue';
import { toast } from '@/components/shell/toast';
import AppModal from '@/components/ui/AppModal.vue';
import { weekdaysText, type WorkWeek } from '@/builders/api/settings';
import { isStale, saveWorkWeek, STALE_TEXT } from '@/services/settings-store';
import SelectBox from '../../settings/fields/SelectBox.vue';
import TextBox from '../../settings/fields/TextBox.vue';
import { monthOptions } from '../../settings/lib/date';
import { REASON_MAX } from '../../settings/lib/rules';

const props = defineProps<{ id: string; name: string; level?: string; week: WorkWeek }>();
// reload: tuần đã đổi hoặc đã cũ, màn gọi tải lại; close: đóng hộp.
const emit = defineEmits<{ close: []; reload: [] }>();

const DAYS = [1, 2, 3, 4, 5, 6]; // T2…T7
const mode = ref<'type' | 'own'>(props.week.source);
const ticked = ref<number[]>([...props.week.weekdays]);
const month = ref(props.week.minMonth);
const reason = ref('');
const saving = ref(false);

const months = computed(() => monthOptions(props.week.minMonth, 6));
const picked = computed(() => [...ticked.value].sort((a, b) => a - b));
const workdays = computed(() => (mode.value === 'own' ? props.week.standardByDays[String(picked.value.length)] ?? 0 : props.week.typeStandardWorkdays));
const noDay = computed(() => mode.value === 'own' && !picked.value.length);
// Chỉ đổi tháng không tính là thay đổi: so cách đặt và các ngày với tuần đã tải.
const unchanged = computed(() => {
  if (mode.value !== props.week.source) return false;
  return mode.value === 'type' || JSON.stringify(picked.value) === JSON.stringify([...props.week.weekdays].sort((a, b) => a - b));
});
const canSave = computed(() => !noDay.value && !unchanged.value && !saving.value);

function toggle(d: number, on: boolean) {
  ticked.value = on ? [...ticked.value, d] : ticked.value.filter(x => x !== d);
}

async function save() {
  if (!canSave.value) return;
  saving.value = true;
  try {
    await saveWorkWeek(props.id, {
      effectiveMonth: month.value,
      weekdays: mode.value === 'own' ? picked.value : null,
      reason: reason.value.trim() || null,
      stamp: props.week.stamp
    });
    toast.ok('Đã lưu');
    emit('reload');
    emit('close');
  } catch (e) {
    if (isStale(e)) {
      toast.error(STALE_TEXT);
      emit('reload');
    } else toast.error(e.message);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <AppModal
    title="Tuần làm việc"
    :sub="level ? `${name} · ${level}` : name"
    :width="520"
    :top="120"
    panel-class="ww-dlg"
    :dismissable="!saving"
    @close="emit('close')"
  >
    <fieldset class="fld mode">
      <legend class="sr-only">Cách đặt tuần làm việc</legend>
      <label class="opt">
        <input v-model="mode" type="radio" value="type" name="ww-mode" />
        <span>Theo loại nhân sự</span>
        <small>{{ weekdaysText(week.typeWeekdays) }} · công chuẩn {{ week.typeStandardWorkdays }}</small>
      </label>
      <label class="opt">
        <input v-model="mode" type="radio" value="own" name="ww-mode" />
        <span>Tuần riêng</span>
        <small>Chọn các ngày đi làm trong tuần</small>
      </label>
      <div v-if="mode === 'own'" class="days" role="group" aria-label="Ngày đi làm">
        <label v-for="d in DAYS" :key="d" class="day" :class="{ on: ticked.includes(d) }">
          <input type="checkbox" :checked="ticked.includes(d)" @change="toggle(d, ($event.target as HTMLInputElement).checked)" />
          T{{ d + 1 }}
        </label>
      </div>
    </fieldset>
    <p class="std" role="status">Công chuẩn: <b>{{ workdays }}</b></p>
    <div class="fld">
      <label>Áp dụng từ tháng</label>
      <SelectBox v-model="month" variant="inp" :options="months" label="Áp dụng từ tháng" />
    </div>
    <div class="fld">
      <label>Lý do <small>(không bắt buộc)</small></label>
      <TextBox v-model="reason" area :maxlength="REASON_MAX" label="Lý do" />
      <small class="count">{{ reason.length }}/{{ REASON_MAX }}</small>
    </div>
    <template #footer>
      <span v-if="noDay" class="hint">Chọn ít nhất một ngày</span>
      <span class="sp"></span>
      <button type="button" class="btn" :disabled="saving" @click="emit('close')">Huỷ</button>
      <button type="button" class="btn pri" :disabled="!canSave" @click="save">Lưu</button>
    </template>
  </AppModal>
</template>

<style scoped>
/* fieldset chỉ để nhóm hai lựa chọn cho trình đọc màn hình; trông như khối .fld thường. */
.mode {
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}
.opt {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  column-gap: 10px;
  align-items: start;
  padding: 10px 0;
  cursor: pointer;
}
.opt + .opt {
  border-top: 1px solid var(--border);
}
.opt input {
  grid-row: 1 / span 2;
  width: 18px;
  height: 18px;
  margin: 1px 0 0;
  accent-color: #1c1c1c;
  cursor: pointer;
}
.opt span {
  font-size: 14px;
  font-weight: 500;
}
.opt small {
  margin-top: 2px;
  color: var(--muted);
  font-size: 12px;
  line-height: 16px;
  font-weight: 400;
}
.days {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 8px;
  margin: 2px 0 4px 28px;
}
.day {
  height: 40px;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px solid var(--control);
  border-radius: 8px;
  background: var(--surface);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}
.day.on {
  border-color: #1c1c1c;
  background: var(--ground);
}
.day input {
  width: 16px;
  height: 16px;
  margin: 0;
  accent-color: #1c1c1c;
  cursor: pointer;
}
.std {
  margin: 0;
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 12px 14px;
  border-radius: 12px;
  background: var(--ground);
  font-size: 14px;
}
.std b {
  font-weight: 600;
}
.hint {
  font-size: 13px;
  line-height: 18px;
  color: var(--muted);
}
.count {
  display: block;
  margin-top: 4px;
  text-align: right;
  font-size: 12px;
  color: var(--muted);
}
.fld :deep(.inp) {
  border-radius: 8px;
}
</style>

<!-- Hộp thoại được Teleport ra <body>, nên luật nằm ngoài phạm vi của thành phần. Theo bảng StaffWorkWeek: các khối cách nhau 16px. -->
<style>
.ww-dlg .dlg-b {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.ww-dlg .dlg-b .fld {
  margin: 0;
}
.ww-dlg .dlg-f {
  padding: 20px 24px;
}
</style>
