<script setup lang="ts">
// Hộp thoại "Sửa bậc" (level là số bậc) hoặc "Thêm bậc" (level = 0: bậc kế tiếp, không gửi số phiên bản).
// Tên bậc, lương cơ bản, lương KPI tối đa, phụ cấp đêm theo bậc; ô trống của KPI và phụ cấp đêm gửi null.
import { computed, reactive, ref, watch } from 'vue';
import { toast } from '@/components/shell/toast';
import AppModal from '@/components/ui/AppModal.vue';
import Icon from '@/components/ui/Icon.vue';
import { levelChanges } from '@/builders/admin-catalog/positions';
import { saveLevel } from '@/services/admin-catalog';
import { usePeriodStore } from '@/stores/period';
import { monthLabel } from '@/utils/format';
import FieldNum from '../fields/FieldNum.vue';
import SelectBox from '../fields/SelectBox.vue';
import TextBox from '../fields/TextBox.vue';
import { monthOptions } from '../lib/date';
import { REASON_MAX } from '../lib/rules';
import { isStale, useSnapshots } from './useSnapshots';

const props = defineProps({
  row: { type: Object as () => any, required: true }, // dòng chức vụ đang hiện (kèm levels)
  level: { type: Number, default: 0 }
});
const emit = defineEmits(['close', 'saved', 'stale']);

const adding = props.level === 0;
const FIELDS = ['name', 'baseSalary', 'kpiMax', 'nightPct'];
const period = usePeriodStore();
const months = monthOptions(period.month);
const month = ref(months[0].value);
const reason = ref('');
const saving = ref(false);
const levelOf = (pos?) => (pos.levels || []).find(l => l.level === props.level) || null;
const start = adding ? null : levelOf(props.row);
const form = reactive(Object.fromEntries(FIELDS.map(key => [key, start ? start[key] : key === 'name' ? '' : null])));
const touched = new Set<any>();
const snaps = useSnapshots(props.row.code, period.month, props.row);

const set = (key?, value?) => {
  form[key] = value;
  touched.add(key);
};
const fill = (pos?) => {
  const src = levelOf(pos);
  if (!src) return;
  for (const key of FIELDS) if (!touched.has(key)) form[key] = src[key];
};
watch(month, async m => {
  if (adding) return;
  try {
    const cur = await snaps.at(m);
    if (cur && month.value === m) fill(cur);
  } catch {
    // lỗi mạng: lúc bấm Lưu sẽ hỏi lại
  }
});

const valid = computed(() => String(form.name || '').trim() !== '' && form.baseSalary != null);

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
    const level = adding ? (cur.levels || []).length + 1 : props.level;
    const old = adding ? null : levelOf(cur);
    if (!adding && !old) {
      toast.error(`Bậc ${level} chưa có ở ${monthLabel(m).toLowerCase()}`);
      return;
    }
    fill(cur);
    const changes = levelChanges(old, { ...form, name: String(form.name).trim() });
    if (!Object.keys(changes).length) {
      toast.error('Chưa có thay đổi');
      return;
    }
    await saveLevel({
      type: props.row.code,
      level,
      changes,
      effectiveMonth: m,
      reason: reason.value.trim(),
      expectedRev: old ? old.rev : undefined
    });
    toast.ok(
      `Đã ${adding ? 'thêm' : 'lưu'} bậc ${level} của ${props.row.name}, áp dụng từ ${monthLabel(m).toLowerCase()}`
    );
    emit('saved');
    emit('close');
  } catch (e) {
    toast.error(e.message);
    if (isStale(e) || (e && e.code === 'CATALOG_REV_REQUIRED')) {
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
  <AppModal
    :title="adding ? 'Thêm bậc' : `Sửa bậc ${level}`"
    :sub="row.name"
    :width="560"
    :top="80"
    :dismissable="!saving"
    @close="emit('close')"
  >
    <div class="fld">
      <label>Tên bậc</label>
      <TextBox :model-value="form.name" label="Tên bậc" @update:model-value="set('name', $event)" />
    </div>
    <div class="g2">
      <div class="fld">
        <label>Lương cơ bản <small>(₫)</small></label>
        <FieldNum
          :model-value="form.baseSalary"
          money
          unit="₫"
          label="Lương cơ bản"
          @update:model-value="set('baseSalary', $event)"
        />
      </div>
      <div class="fld">
        <label>Lương KPI tối đa <small>(₫)</small></label>
        <FieldNum
          :model-value="form.kpiMax"
          money
          unit="₫"
          label="Lương KPI tối đa"
          @update:model-value="set('kpiMax', $event)"
        />
      </div>
      <div class="fld">
        <label>Phụ cấp đêm <small>(%)</small></label>
        <FieldNum
          :model-value="form.nightPct"
          unit="%"
          label="Phụ cấp đêm"
          @update:model-value="set('nightPct', $event)"
        />
      </div>
      <div class="fld">
        <label>Áp dụng từ tháng</label>
        <SelectBox v-model="month" variant="inp" :options="months" label="Áp dụng từ tháng" />
      </div>
    </div>
    <div class="fld">
      <label>Lý do <small>(không bắt buộc)</small></label>
      <TextBox v-model="reason" area :maxlength="REASON_MAX" label="Lý do" />
    </div>
    <template #footer>
      <span class="sp"></span>
      <button type="button" class="btn" @click="emit('close')">Huỷ</button>
      <button type="button" class="btn" :class="valid ? 'pri' : 'off'" :disabled="!valid || saving" @click="submit">
        <Icon :name="adding ? 'plus' : 'check'" />{{ adding ? 'Thêm bậc' : 'Lưu' }}
      </button>
    </template>
  </AppModal>
</template>
