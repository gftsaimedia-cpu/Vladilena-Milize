<script setup lang="ts">
// Hộp "Tuần làm việc" của một người (bảng N1): theo loại nhân sự hoặc tuần riêng T2–T7, áp dụng từ một tháng. Lưu thẳng, không hộp xác nhận thứ hai.
// Escape và trả focus về nút Sửa do AppModal lo (registerOverlayFocus): Escape chỉ đóng hộp này, không đóng ngăn kéo hồ sơ.
import { computed, ref } from 'vue';
import { toast } from '@/components/shell/toast';
import AppModal from '@/components/ui/AppModal.vue';
import { standardWorkdays, weekdaysText, type WorkWeek } from '@/builders/api/settings';
import { isStale, saveWorkWeek, STALE_TEXT } from '@/services/settings-store';
import SelectBox from '../../settings/fields/SelectBox.vue';
import TextBox from '../../settings/fields/TextBox.vue';
import { monthOptions } from '../../settings/lib/date';
import { REASON_MAX } from '../../settings/lib/rules';

const props = defineProps<{ id: string; name: string; week: WorkWeek }>();
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
const workdays = computed(() => (mode.value === 'own' ? standardWorkdays(picked.value.length) : props.week.typeStandardWorkdays));
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
  <AppModal title="Tuần làm việc" :sub="name" :width="480" :dismissable="!saving" @close="emit('close')">
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
      <div class="days">
        <label v-for="d in DAYS" :key="d" class="day">
          <input
            type="checkbox"
            :checked="ticked.includes(d)"
            :disabled="mode !== 'own'"
            @change="toggle(d, ($event.target as HTMLInputElement).checked)"
          />
          T{{ d + 1 }}
        </label>
      </div>
      <p class="std" :class="{ bad: noDay }">{{ noDay ? 'Chọn ít nhất một ngày' : `Công chuẩn: ${workdays}` }}</p>
    </fieldset>
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
  margin-left: 0;
  margin-right: 0;
  margin-bottom: 0;
  padding: 0;
  border: 0;
}
.opt {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 6px 0;
  font-size: 14px;
  font-weight: 500;
}
.opt small {
  color: var(--muted);
  font-size: 13px;
  font-weight: 400;
}
.days {
  display: flex;
  gap: 8px;
  margin: 4px 0 0 24px;
}
.day {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
}
.std {
  margin: 8px 0 0 24px;
  font-size: 13px;
  color: var(--muted);
}
.std.bad {
  color: var(--status-rejected);
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
