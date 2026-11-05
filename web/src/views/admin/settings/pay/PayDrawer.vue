<script setup lang="ts">
// Ngăn kéo của một khoản trong công thức lương (rộng 560). Khoản có ô sửa lưu qua kho cài đặt theo tháng (useSettingsDraft):
// Lưu mở hộp xác nhận liệt kê các ô đổi. Khoản chỉ xem không có ô nào, chân chỉ có "Đóng".
import { computed, ref } from 'vue';
import AppDrawer from '@/components/ui/AppDrawer.vue';
import { fieldText } from '@/builders/api/settings';
import { payDrawerView } from '@/builders/api/settings-screens';
import { useLoad } from '@/composables/useLoad';
import { catalogRows } from '@/services/admin-catalog';
import { getSettings } from '@/services/settings-store';
import FieldNum from '../fields/FieldNum.vue';
import SaveConfirmDialog from '../fields/SaveConfirmDialog.vue';
import SelectBox from '../fields/SelectBox.vue';
import TextBox from '../fields/TextBox.vue';
import { PATHS } from '../nav';
import { REASON_MAX } from '../lib/rules';
import { useSettingsDraft } from '../lib/useSettingsDraft';

const props = defineProps({ name: { type: String, required: true } });
const emit = defineEmits(['close', 'saved']);

// Nhóm và ô sửa được chỉ phụ thuộc vào tên ngăn kéo; danh mục chức vụ (phần chỉ xem) tải riêng.
const head = payDrawerView(props.name, [], '');
const sd = head.group ? useSettingsDraft(head.group, head.fields.map(f => f.field)) : null;
const { data: extra } = useLoad(async () => {
  const [rows, settings] = await Promise.all([catalogRows(), getSettings()]);
  return { rows, month: settings.month };
});
const view = computed(() => (extra.value ? payDrawerView(props.name, extra.value.rows, extra.value.month) : null));
const shown = computed(() => !!view.value && (!sd || sd.ready.value));

const maxOf = (field: string) => sd?.state.value?.limits[field]?.max ?? null;
const saved = (field: string) => sd?.state.value?.values[field] as number;
const edited = (field: string) => !!sd?.state.value && sd.draft.value[field] !== saved(field);

// Trọng số KPI: chân luôn có tổng đang nhập; lỗi "Tổng N/100" đã nằm ở đó nên không lặp lại trong chữ trạng thái.
const isKpi = head.group === 'kpiWeights';
const kpiTotal = computed(() =>
  sd ? head.fields.reduce((n, f) => n + (Number(sd.draft.value[f.field]) || 0), 0) : 0
);
const statusErrors = computed(() =>
  Object.entries(sd?.errors.value ?? {})
    .filter(([k]) => k !== '_sum')
    .map(([, v]) => v)
);
const foot = computed(() => {
  if (!sd) return '';
  const first = statusErrors.value[0];
  if (first) return first;
  const n = sd.changed.value.length;
  return n ? `Có ${n} thay đổi chưa lưu` : 'Chưa có thay đổi';
});

const confirming = ref(false);
async function confirm() {
  const ok = await sd.save();
  confirming.value = false;
  if (ok) {
    emit('saved');
    emit('close');
  }
}
function cancel() {
  sd?.reset();
  emit('close');
}
</script>

<template>
  <AppDrawer v-if="shown" :title="view.title" :sub="view.sub" :width="560" @close="emit('close')">
    <div class="sec">
      <template v-if="sd">
        <div class="dg">
          <b>{{ view.section }}</b>
        </div>
        <div v-for="f in view.fields" :key="f.field" class="dr">
          <span class="l">
            {{ f.label }}
            <small v-if="edited(f.field)">Đang áp dụng {{ fieldText(f.field, saved(f.field)) }}</small>
          </span>
          <FieldNum
            v-model="sd.draft.value[f.field]"
            :label="f.label"
            :prefix="f.prefix"
            :unit="f.unit"
            :integer="f.integer"
            :decimals="f.decimals"
            :money="f.money"
            :max="maxOf(f.field)"
          />
          <small v-if="sd.errors.value[f.field]" class="err">{{ sd.errors.value[f.field] }}</small>
        </div>

        <div class="fld">
          <label>Áp dụng từ tháng</label>
          <SelectBox v-model="sd.month.value" variant="inp" :options="sd.months.value" label="Áp dụng từ tháng" />
          <small class="hint">Áp dụng cho tháng này và các tháng sau. Tháng nào đã đặt số khác thì giữ số đó.</small>
        </div>
        <div class="fld">
          <label>Lý do <small>(không bắt buộc)</small></label>
          <TextBox v-model="sd.reason.value" area :maxlength="REASON_MAX" label="Lý do" />
          <small class="count">{{ sd.reason.value.length }}/{{ REASON_MAX }}</small>
        </div>
      </template>

      <template v-if="view.text">
        <p class="txt">{{ view.text }}</p>
      </template>

      <section v-for="s in view.readonly" :key="s.title" class="ro">
        <div class="dg">
          <b>{{ s.title }}</b>
        </div>
        <div v-for="r in s.rows" :key="r.label" class="dr">
          <span class="l">{{ r.label }}</span>
          <span class="v">{{ r.value }}</span>
        </div>
      </section>
      <p v-if="view.link" class="lk">
        <RouterLink :to="PATHS.chucVu" class="link">Sửa ở Chức vụ &amp; bậc</RouterLink>
      </p>
      <div style="height: 16px"></div>
    </div>

    <template #footer>
      <template v-if="sd">
        <span class="status" :class="{ bad: statusErrors.length }">{{ foot }}</span>
        <span class="sp"></span>
        <span v-if="isKpi" class="status total" :class="{ bad: kpiTotal !== 100 }">Tổng {{ kpiTotal }}/100</span>
        <button type="button" class="btn" @click="cancel">Huỷ</button>
        <button
          type="button"
          class="btn"
          :class="sd.canSave.value ? 'pri' : 'off'"
          :disabled="!sd.canSave.value"
          @click="confirming = true"
        >
          Lưu
        </button>
      </template>
      <template v-else>
        <span class="sp"></span>
        <button type="button" class="btn" @click="emit('close')">Đóng</button>
      </template>
    </template>
  </AppDrawer>

  <SaveConfirmDialog
    v-if="sd && confirming"
    :lines="sd.lines.value"
    :reason="sd.reason.value.trim()"
    :saving="sd.saving.value"
    @confirm="confirm"
    @close="confirming = false"
  />
</template>

<style scoped>
.sec {
  padding: 4px 28px 0;
}
.dg {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 18px 0 8px;
  border-top: 1px solid var(--rule);
  margin-top: 6px;
}
.sec > .dg:first-child,
.sec > .ro:first-child > .dg {
  border-top: 0;
  margin-top: 0;
}
.dg b {
  font-size: 14px;
  font-weight: 600;
}
.dr {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 4px 10px;
  align-items: center;
  min-height: 44px;
  font-size: 14px;
}
.dr .l small {
  display: block;
  color: var(--muted);
  font-size: 12px;
  line-height: 16px;
}
.dr .v {
  font-variant-numeric: tabular-nums;
  text-align: right;
}
.dr .err {
  grid-column: 1 / -1;
  color: var(--status-rejected);
  font-size: 12px;
  line-height: 16px;
}
.dr :deep(.fi) {
  height: 34px;
  justify-content: flex-end;
}
.fld small.hint,
.fld small.count {
  display: block;
  margin-top: 4px;
  font-size: 12px;
  color: var(--muted);
}
.fld small.count {
  text-align: right;
}
.sec :deep(.inp) {
  border-radius: 8px;
}
.txt {
  margin: 14px 0 0;
  font-size: 14px;
}
.lk {
  margin: 14px 0 0;
  font-size: 13px;
}
.status {
  color: var(--muted);
  font-size: 13px;
}
.status.total {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.status.bad {
  color: var(--status-rejected);
}
</style>
