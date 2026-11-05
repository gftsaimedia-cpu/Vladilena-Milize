<script setup lang="ts">
// Thẻ của một nhóm trong Tất cả cài đặt: các mục, vùng "Áp dụng từ tháng" + lý do (chỉ hiện khi đã đổi gì đó),
// thanh lưu (Huỷ, Lưu) và hộp xác nhận. Mỗi nhóm của máy chủ dùng một useSettingsDraft; đổi nhóm là dựng thẻ mới.
// Báo lên trang qua `dirty` để trang hỏi trước khi bỏ chỗ sửa dở. `setting` là mục cần cuộn tới và focus.
import { computed, nextTick, ref, watch } from 'vue';
import type { SettingGroup } from '@/builders/api/settings-screens';
import SaveConfirmDialog from '../fields/SaveConfirmDialog.vue';
import SelectBox from '../fields/SelectBox.vue';
import TextBox from '../fields/TextBox.vue';
import { REASON_MAX } from '../lib/rules';
import { useSettingsDraft } from '../lib/useSettingsDraft';
import SettingItem from './SettingItem.vue';

const props = defineProps({
  group: { type: Object as () => SettingGroup, required: true },
  setting: { type: String, default: '' }
});
const emit = defineEmits(['dirty']);

// Các ô của nhóm: biểu thuế là một ô `brackets`.
const fields = props.group.items.flatMap(i => (i.brackets ? ['brackets'] : i.fields.map(f => f.field)));
const sd = props.group.group ? useSettingsDraft(props.group.group, fields) : null;
const shown = computed(() => !sd || sd.ready.value);
const changes = computed(() => sd?.changed.value.length ?? 0);

watch(changes, n => emit('dirty', n > 0), { immediate: true });

// Chữ trạng thái: tổng KPI sai thì nêu tổng; ô khác sai thì nhắc chung (gợi ý đã nằm dưới từng ô).
const status = computed(() => {
  const errors = sd?.errors.value ?? {};
  if (errors._sum) return errors._sum;
  if (Object.keys(errors).length) return 'Có ô nhập chưa hợp lệ';
  return changes.value ? `Có ${changes.value} thay đổi chưa lưu` : 'Chưa có thay đổi';
});
const bad = computed(() => Object.keys(sd?.errors.value ?? {}).length > 0);

const confirming = ref(false);
async function confirm() {
  await sd!.save();
  confirming.value = false;
}

const card = ref<HTMLElement | null>(null);
async function focusSetting() {
  if (!props.setting || !shown.value) return;
  await nextTick();
  const el = card.value?.querySelector<HTMLElement>(`[data-setting-key="${CSS.escape(props.setting)}"]`);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  (el.querySelector<HTMLElement>('input:not(:disabled), button:not(:disabled)') ?? el).focus({ preventScroll: true });
}
watch([shown, () => props.setting], focusSetting, { immediate: true });
</script>

<template>
  <section ref="card" class="card">
    <div class="card-h">
      <h2>{{ group.name }}</h2>
      <span class="cap">{{ group.items.length }} mục</span>
    </div>

    <p v-if="!shown" class="load-state" role="status">Đang tải cài đặt…</p>
    <template v-else>
      <SettingItem
        v-for="entry in group.items"
        :key="entry.key"
        :entry="entry"
        :draft="sd?.draft.value"
        :errors="sd?.errors.value"
        :state="sd?.state.value"
      />

      <template v-if="sd">
        <div v-if="changes" class="apply">
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
