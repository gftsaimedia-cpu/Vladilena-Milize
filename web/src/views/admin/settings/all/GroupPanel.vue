<script setup lang="ts">
// Thẻ của một nhóm trong Tất cả cài đặt: các mục, vùng "Áp dụng từ tháng" + lý do (hiện khi đã đổi gì đó hoặc đang chọn tháng khác),
// thanh lưu (Huỷ, Lưu), hộp xác nhận, lịch sử từng mục và Hoàn tác. Mỗi nhóm của máy chủ dùng một useSettingsDraft; đổi nhóm là dựng thẻ mới.
// Báo lên trang qua `dirty` để trang hỏi trước khi bỏ chỗ sửa dở. `setting` là mục cần cuộn tới và focus.
import { computed, nextTick, ref, watch } from 'vue';
import { GROUP_PATH, historyFields, historyRow, type HistoryItem, type Values } from '@/builders/api/settings';
import {
  revertLines,
  revertMonth,
  type HistoryRowView,
  type SettingEntry,
  type SettingGroup
} from '@/builders/api/settings-screens';
import { toast } from '@/components/shell/toast';
import { getSettings, getSettingsHistory } from '@/services/settings-store';
import LoadFail from '../fields/LoadFail.vue';
import SaveConfirmDialog from '../fields/SaveConfirmDialog.vue';
import SelectBox from '../fields/SelectBox.vue';
import TextBox from '../fields/TextBox.vue';
import { REASON_MAX } from '../lib/rules';
import { useSettingsDraft } from '../lib/useSettingsDraft';
import RevertDialog from './RevertDialog.vue';
import SettingItem from './SettingItem.vue';

const props = defineProps({
  group: { type: Object as () => SettingGroup, required: true },
  setting: { type: String, default: '' }
});
const emit = defineEmits(['dirty']);

// Các ô của nhóm: biểu thuế là một ô `brackets`.
const fields = props.group.items.flatMap(i => (i.brackets ? ['brackets'] : i.fields.map(f => f.field)));
// Lưu xong hoặc Huỷ thì thẻ về tháng đang mở (Ruling R16).
const sd = props.group.group ? useSettingsDraft(props.group.group, fields, { backToMinMonth: true }) : null;
const shown = computed(() => !sd || sd.ready.value);
const changes = computed(() => sd?.changed.value.length ?? 0);
// Ô tháng hiện khi đã đổi gì đó, và cả khi đang chọn tháng khác tháng đang mở (để còn chọn lại được).
const showApply = computed(() => !!sd && (changes.value > 0 || sd.month.value !== sd.minMonth.value));

watch(changes, n => emit('dirty', n > 0), { immediate: true });

// Chữ trạng thái: tổng KPI sai thì nêu tổng; ô khác sai thì nhắc chung (gợi ý đã nằm dưới từng ô).
const status = computed(() => {
  const errors = sd?.errors.value ?? {};
  if (errors._sum) return errors._sum;
  if (Object.keys(errors).length) return 'Có ô nhập chưa hợp lệ';
  return changes.value ? `Có ${changes.value} thay đổi chưa lưu` : 'Chưa có thay đổi';
});
const bad = computed(() => Object.keys(sd?.errors.value ?? {}).length > 0);

// Lịch sử của cả nhóm máy chủ (mới nhất trước); mỗi mục lọc ra các dòng thuộc ô của mình.
// Kèm số của nhóm ở tháng hoàn tác mặc định của từng dòng (revertMonth), để chỉ bật Hoàn tác ở dòng còn gì để đổi.
// Cần minMonth nên tải sau khi useSettingsDraft tải xong lần đầu; lượt tải cũ về muộn bị bỏ.
const history = ref<HistoryItem[]>([]);
const valuesAt = ref<Record<string, Values>>({});
let historySeq = 0;
async function loadHistory() {
  const g = props.group.group;
  if (!g || !sd?.minMonth.value) return;
  const mine = ++historySeq;
  try {
    const items = (await getSettingsHistory(GROUP_PATH[g])).items;
    const months = [...new Set(items.map(h => revertMonth(h, sd.minMonth.value)))];
    const at = await Promise.all(months.map(m => getSettings(m)));
    if (mine !== historySeq) return;
    valuesAt.value = Object.fromEntries(months.map((m, i) => [m, at[i].groups[g].values]));
    history.value = items;
  } catch (e) {
    if (mine === historySeq) toast.error(e.message);
  }
}
watch(() => sd?.ready.value, ready => ready && loadHistory(), { immediate: true });

// Các câu của Hoàn tác ở tháng mặc định của dòng; trống = số cũ đã đang áp dụng ở tháng đó.
function revertLinesOf(row: HistoryItem): string[] {
  const g = props.group.group;
  if (!g || !sd) return [];
  const month = revertMonth(row, sd.minMonth.value);
  const values = valuesAt.value[month];
  return values ? revertLines(g, row, values, month) : [];
}

// Hoàn tác chỉ bật khi nhóm không còn chỗ sửa dở và ở tháng mặc định có ít nhất một ô sẽ đổi.
// Dòng `weights` (một lần lưu trọng số KPI) hiện ở mục của từng trọng số đã đổi, với số cũ → số mới của trọng số đó.
function historyOf(entry: SettingEntry): HistoryRowView[] | null {
  if (!sd) return null;
  const own = new Set(entry.brackets ? ['brackets'] : entry.fields.map(f => f.field));
  return history.value.flatMap(h =>
    historyFields(h)
      .filter(f => own.has(f))
      .map(f => ({ ...historyRow(h, f), raw: h, canRevert: changes.value === 0 && revertLinesOf(h).length > 0 }))
  );
}

// Tải lại lịch sử sau mọi lần lưu, kể cả khi gặp 409 (stamp đã mới thì lịch sử cũng phải mới).
const confirming = ref(false);
async function confirm() {
  await sd!.save();
  confirming.value = false;
  await loadHistory();
}

const reverting = ref<HistoryItem | null>(null);
function askRevert(row: HistoryItem) {
  reverting.value = row;
}
async function reverted() {
  reverting.value = null;
  sd!.reset();
  await Promise.all([sd!.reload(), loadHistory()]);
}

const card = ref<HTMLElement | null>(null);
async function focusSetting() {
  if (!props.setting || !shown.value) return;
  await nextTick();
  const el = card.value?.querySelector<HTMLElement>(`[data-setting-key="${CSS.escape(props.setting)}"]`);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  (el.querySelector<HTMLElement>('input:not(:disabled)') ?? el).focus({ preventScroll: true });
}
watch([shown, () => props.setting], focusSetting, { immediate: true });
</script>

<template>
  <section ref="card" class="card">
    <div class="card-h">
      <h2>{{ group.name }}</h2>
      <span class="cap">{{ group.items.length }} mục</span>
    </div>

    <LoadFail v-if="!shown && sd?.error.value" :what="`nhóm ${group.name}`" @retry="sd.retry" />
    <p v-else-if="!shown" class="load-state" role="status">Đang tải cài đặt…</p>
    <template v-else>
      <SettingItem
        v-for="entry in group.items"
        :key="entry.key"
        :entry="entry"
        :draft="sd?.draft.value"
        :errors="sd?.errors.value"
        :state="sd?.state.value"
        :history="historyOf(entry)"
        @revert="askRevert"
      />

      <template v-if="sd">
        <div v-if="showApply" class="apply">
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
        </div>
        <div class="savebar">
          <span :class="{ bad }">{{ status }}</span>
          <span class="r">
            <button
              type="button"
              class="btn sm"
              :class="{ off: !changes }"
              :disabled="!changes || sd.saving.value"
              @click="sd.reset()"
            >
              Huỷ
            </button>
            <button
              type="button"
              class="btn sm"
              :class="sd.canSave.value ? 'pri' : 'off'"
              :disabled="!sd.canSave.value"
              @click="confirming = true"
            >
              Lưu
            </button>
          </span>
        </div>
      </template>
    </template>
  </section>

  <SaveConfirmDialog
    v-if="sd && confirming"
    :lines="sd.lines.value"
    :reason="sd.reason.value.trim()"
    :saving="sd.saving.value"
    @confirm="confirm"
    @close="confirming = false"
  />
  <RevertDialog
    v-if="sd?.state.value && group.group && reverting"
    :group="group.group"
    :row="reverting"
    :values="valuesAt[revertMonth(reverting, sd.minMonth.value)]"
    :stamp="sd.state.value.stamp"
    :months="sd.months.value"
    :min-month="sd.minMonth.value"
    @close="reverting = null"
    @done="reverted"
  />
</template>

<style scoped>
.load-state {
  margin: 0;
  padding: 16px 24px;
  color: var(--muted);
}
.apply {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  padding: 16px 24px 4px;
  border-top: 1px solid var(--rule);
}
.apply :deep(.inp) {
  border-radius: 8px;
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
.savebar .bad {
  color: var(--status-rejected);
}
@media (max-width: 1200px) {
  .apply {
    grid-template-columns: minmax(0, 1fr);
    padding-left: 14px;
    padding-right: 14px;
  }
}
</style>
