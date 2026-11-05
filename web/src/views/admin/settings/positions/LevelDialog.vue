<script setup lang="ts">
// Hộp thoại "Sửa bậc" (level là số bậc) hoặc "Thêm bậc" (level = 0: bậc kế tiếp của tháng áp dụng, không gửi số phiên bản).
// Tên bậc, lương cơ bản, lương KPI tối đa, phụ cấp đêm theo bậc; ô trống của KPI và phụ cấp đêm gửi null. Áp dụng từ
// tháng này trở đi; nút chỉ bật khi lưu được. Ca đêm của Nhân viên chọn theo từng người, không đặt theo bậc.
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
const nightByPerson = props.row.code === 'nv';
const FIELDS = nightByPerson ? ['name', 'baseSalary', 'kpiMax'] : ['name', 'baseSalary', 'kpiMax', 'nightPct'];
const period = usePeriodStore();
const months = monthOptions(period.current);
const month = ref(months[0].value);
const reason = ref('');
const saving = ref(false);
const levelOf = (pos?) => (pos.levels || []).find(l => l.level === props.level) || null;
const start = adding ? null : levelOf(props.row);
const form = reactive(Object.fromEntries(FIELDS.map(key => [key, start ? start[key] : key === 'name' ? '' : null])));
const touched = new Set<any>();
const snaps = useSnapshots(props.row.code, period.month, props.row);
const cur = ref(null); // dòng chức vụ đang hiệu lực ở tháng áp dụng; null khi đang nạp

const set = (key?, value?) => {
  form[key] = value;
  touched.add(key);
};
const fill = (pos?) => {
  const src = adding ? null : levelOf(pos);
  if (!src) return;
  for (const key of FIELDS) if (!touched.has(key)) form[key] = src[key];
};
async function load(m?) {
  try {
    const pos = await snaps.at(m);
    if (month.value !== m) return;
    cur.value = pos;
    if (pos) fill(pos);
  } catch (e) {
    if (month.value === m) toast.error(e.message);
  }
}
watch(
  month,
  m => {
    cur.value = null;
    load(m);
  },
  { immediate: true }
);

const levelAt = computed(() => (cur.value && !adding ? levelOf(cur.value) : null));
// Thêm bậc: số kế tiếp sau bậc lớn nhất đang có ở tháng áp dụng.
const levelNo = computed(() =>
  !adding ? props.level : cur.value ? Math.max(0, ...(cur.value.levels || []).map(l => l.level)) + 1 : null
);
const typed = computed(() => ({ ...form, name: String(form.name || '').trim() }));
const changes = computed(() => {
  if (!cur.value) return {};
  if (adding) return nightByPerson ? { ...typed.value, nightPct: null } : { ...typed.value };
  return levelAt.value ? levelChanges(levelAt.value, typed.value) : {};
});
const valid = computed(() => {
  if (typed.value.name === '' || form.baseSalary == null || !cur.value) return false;
  return adding || (!!levelAt.value && Object.keys(changes.value).length > 0);
});

async function submit() {
  if (!valid.value || saving.value) return;
  saving.value = true;
  const m = month.value;
  const level = levelNo.value;
  try {
    await saveLevel({
      type: props.row.code,
      level,
      adding,
      changes: { ...changes.value },
      effectiveMonth: m,
      reason: reason.value.trim(),
      expectedRev: levelAt.value ? levelAt.value.rev : undefined
    });
    toast.ok(
      `Đã ${adding ? 'thêm' : 'lưu'} bậc ${level} của ${props.row.name}, áp dụng từ ${monthLabel(m).toLowerCase()}`
    );
    emit('saved');
    emit('close');
  } catch (e) {
    if (!isStale(e)) {
      toast.error(e.message);
      return;
    }
    toast.error('Vừa có người sửa, đã tải số mới, kiểm lại rồi bấm Lưu');
    snaps.clear();
    emit('stale');
    cur.value = null;
    await load(m);
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
      <TextBox :model-value="form.name" :maxlength="60" label="Tên bậc" @update:model-value="set('name', $event)" />
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
        <template v-if="nightByPerson">
          <label>Phụ cấp đêm</label>
          <p class="byp">Theo từng người</p>
        </template>
        <template v-else>
          <label>Phụ cấp đêm <small>(%)</small></label>
          <FieldNum
            :model-value="form.nightPct"
            unit="%"
            :max="100"
            label="Phụ cấp đêm"
            @update:model-value="set('nightPct', $event)"
          />
        </template>
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

<style scoped>
.byp {
  margin: 0;
  line-height: 36px;
  color: var(--muted);
}
</style>
