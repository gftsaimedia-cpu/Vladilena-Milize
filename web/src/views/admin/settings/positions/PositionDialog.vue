<script setup lang="ts">
// Hộp thoại "Sửa chức vụ": tên, ngày công chuẩn và bốn phụ cấp theo %, áp dụng từ một tháng.
// Ô chưa gõ mang số đang hiệu lực ở tháng áp dụng; chỉ trường khác số đó mới được gửi.
import { computed, reactive, ref, watch } from 'vue';
import { toast } from '@/components/shell/toast';
import AppModal from '@/components/ui/AppModal.vue';
import Icon from '@/components/ui/Icon.vue';
import { PCT_FIELDS, positionChanges } from '@/builders/admin-catalog/positions';
import { savePosition } from '@/services/admin-catalog';
import { usePeriodStore } from '@/stores/period';
import { monthLabel } from '@/utils/format';
import FieldNum from '../fields/FieldNum.vue';
import SelectBox from '../fields/SelectBox.vue';
import TextBox from '../fields/TextBox.vue';
import { monthOptions } from '../lib/date';
import { REASON_MAX } from '../lib/rules';
import { isStale, useSnapshots } from './useSnapshots';

const props = defineProps({
  row: { type: Object as () => any, required: true } // dòng chức vụ đang hiện (kèm rev)
});
const emit = defineEmits(['close', 'saved', 'stale']);

const FIELDS = ['name', 'workdays', ...PCT_FIELDS.map(([key]: any) => key)];
const period = usePeriodStore();
const months = monthOptions(period.month);
const month = ref(months[0].value);
const reason = ref('');
const saving = ref(false);
const form = reactive(Object.fromEntries(FIELDS.map(key => [key, props.row[key]])));
const touched = new Set<any>();
const snaps = useSnapshots(props.row.code, period.month, props.row);

const set = (key?, value?) => {
  form[key] = value;
  touched.add(key);
};
const fill = (src?) => {
  for (const key of FIELDS) if (!touched.has(key)) form[key] = src[key];
};
watch(month, async m => {
  try {
    const cur = await snaps.at(m);
    if (cur && month.value === m) fill(cur);
  } catch {
    // lỗi mạng: lúc bấm Lưu sẽ hỏi lại
  }
});

const valid = computed(() => String(form.name || '').trim() !== '' && FIELDS.slice(1).every(key => form[key] != null));

async function submit() {
  if (!valid.value || saving.value) return;
  saving.value = true;
  const m = month.value;
  try {
    const cur = await snaps.at(m);
    if (!cur) {
      toast.error(`Chức vụ này chưa có ở ${monthLabel(m).toLowerCase()}`);
      return;
    }
    fill(cur);
    const changes = positionChanges(cur, { ...form, name: String(form.name).trim() });
    if (!Object.keys(changes).length) {
      toast.error('Chưa có thay đổi');
      return;
    }
    await savePosition({
      code: props.row.code,
      changes,
      effectiveMonth: m,
      reason: reason.value.trim(),
      expectedRev: cur.rev
    });
    toast.ok(`Đã lưu chức vụ ${String(form.name).trim()}, áp dụng từ ${monthLabel(m).toLowerCase()}`);
    emit('saved');
    emit('close');
  } catch (e) {
    toast.error(e.message);
    if (isStale(e)) {
      snaps.clear();
      emit('stale');
      try {
        const cur = await snaps.at(m);
        if (cur) fill(cur);
      } catch {
        // lần bấm Lưu sau sẽ hỏi lại
      }
    }
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <AppModal title="Sửa chức vụ" :sub="row.name" :width="560" :top="80" :dismissable="!saving" @close="emit('close')">
    <div class="fld">
      <label>Tên chức vụ</label>
      <TextBox :model-value="form.name" label="Tên chức vụ" @update:model-value="set('name', $event)" />
    </div>
    <div class="g2">
      <div class="fld">
        <label>Ngày công chuẩn</label>
        <FieldNum :model-value="form.workdays" label="Ngày công chuẩn" @update:model-value="set('workdays', $event)" />
      </div>
      <div v-for="[key, label] in PCT_FIELDS" :key="key" class="fld">
        <label>{{ label }} <small>(%)</small></label>
        <FieldNum :model-value="form[key]" unit="%" :label="label" @update:model-value="set(key, $event)" />
      </div>
    </div>
    <div class="g2">
      <div class="fld">
        <label>Áp dụng từ tháng</label>
        <SelectBox v-model="month" variant="inp" :options="months" label="Áp dụng từ tháng" />
      </div>
      <div></div>
    </div>
    <div class="fld">
      <label>Lý do <small>(không bắt buộc)</small></label>
      <TextBox v-model="reason" area :maxlength="REASON_MAX" label="Lý do" />
    </div>
    <template #footer>
      <span class="sp"></span>
      <button type="button" class="btn" @click="emit('close')">Huỷ</button>
      <button type="button" class="btn" :class="valid ? 'pri' : 'off'" :disabled="!valid || saving" @click="submit">
        <Icon name="check" />Lưu
      </button>
    </template>
  </AppModal>
</template>
