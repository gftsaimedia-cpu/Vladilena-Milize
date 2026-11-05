<script setup lang="ts">
// Hộp thoại "Sửa chức vụ": tên, ngày công chuẩn và bốn phụ cấp theo %, áp dụng từ một tháng (tháng này trở đi).
// Ô chưa gõ mang số đang hiệu lực ở tháng áp dụng; chỉ trường khác số đó mới được gửi, nên nút Lưu chỉ bật khi có trường
// khác. Ca đêm của Nhân viên chọn theo từng người trong hồ sơ, không sửa ở đây.
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

const nightByPerson = props.row.code === 'nv';
const byPerson = (key?) => nightByPerson && key === 'nightPct';
const FIELDS = ['name', 'workdays', ...PCT_FIELDS.map(([key]: any) => key).filter(key => !byPerson(key))];
const period = usePeriodStore();
const months = monthOptions(period.current);
const month = ref(months[0].value);
const reason = ref('');
const saving = ref(false);
const form = reactive(Object.fromEntries(FIELDS.map(key => [key, props.row[key]])));
const touched = new Set<any>();
const snaps = useSnapshots(props.row.code, period.month, props.row);
const cur = ref(null); // dòng đang hiệu lực ở tháng áp dụng; null khi đang nạp

const set = (key?, value?) => {
  form[key] = value;
  touched.add(key);
};
const fill = (src?) => {
  for (const key of FIELDS) if (!touched.has(key)) form[key] = src[key];
};
async function load(m?) {
  try {
    const row = await snaps.at(m);
    if (month.value !== m) return;
    cur.value = row;
    if (row) fill(row);
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

const name = computed(() => String(form.name || '').trim());
const changes = computed(() => (cur.value ? positionChanges(cur.value, { ...form, name: name.value }) : {}));
const valid = computed(
  () =>
    name.value !== '' &&
    Number(form.workdays) >= 1 &&
    FIELDS.every(key => form[key] != null) &&
    !!cur.value &&
    Object.keys(changes.value).length > 0
);

async function submit() {
  if (!valid.value || saving.value) return;
  saving.value = true;
  const m = month.value;
  try {
    await savePosition({
      code: props.row.code,
      changes: { ...changes.value },
      effectiveMonth: m,
      reason: reason.value.trim(),
      expectedRev: cur.value.rev
    });
    toast.ok(`Đã lưu chức vụ ${name.value}, áp dụng từ ${monthLabel(m).toLowerCase()}`);
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
  <AppModal title="Sửa chức vụ" :sub="row.name" :width="560" :top="80" :dismissable="!saving" @close="emit('close')">
    <div class="fld">
      <label>Tên chức vụ</label>
      <TextBox
        :model-value="form.name"
        :maxlength="60"
        label="Tên chức vụ"
        @update:model-value="set('name', $event)"
      />
    </div>
    <div class="g2">
      <div class="fld">
        <label>Ngày công chuẩn</label>
        <FieldNum
          :model-value="form.workdays"
          :max="31"
          integer
          label="Ngày công chuẩn"
          @update:model-value="set('workdays', $event)"
        />
      </div>
      <div v-for="[key, label] in PCT_FIELDS" :key="key" class="fld">
        <template v-if="byPerson(key)">
          <label>{{ label }}</label>
          <p class="byp">Theo từng người</p>
        </template>
        <template v-else>
          <label>{{ label }} <small>(%)</small></label>
          <FieldNum
            :model-value="form[key]"
            unit="%"
            :max="100"
            :label="label"
            @update:model-value="set(key, $event)"
          />
        </template>
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

<style scoped>
.byp {
  margin: 0;
  line-height: 36px;
  color: var(--muted);
}
</style>
