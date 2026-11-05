<script setup lang="ts">
// Hộp "Hoàn tác": đưa ô của một dòng lịch sử về số cũ bằng một lần lưu thường (máy chủ thêm dòng lịch sử mới).
// Tháng áp dụng mặc định là tháng của dòng, không trước minMonth. Các câu so số sẽ gửi với số của nhóm ở tháng đang chọn
// trong hộp (đổi tháng thì tải nhóm ở tháng đó); dòng trọng số KPI gửi đủ năm số cũ nên mọi trọng số sẽ đổi đều có câu.
// Lưu xong hoặc gặp lỗi stale (đã tải lại ở màn) thì báo `done` để màn tải lại nhóm và lịch sử.
import { computed, ref, watch } from 'vue';
import { toast } from '@/components/shell/toast';
import AppModal from '@/components/ui/AppModal.vue';
import { GROUP_PATH, type GroupKey, type HistoryItem, type Values } from '@/builders/api/settings';
import { revertLines, revertMonth, revertValues } from '@/builders/api/settings-screens';
import { getSettings, isStale, saveSettingsGroup, STALE_TEXT } from '@/services/settings-store';
import SelectBox from '../fields/SelectBox.vue';
import TextBox from '../fields/TextBox.vue';
import { REASON_MAX } from '../lib/rules';

const props = defineProps({
  group: { type: String as () => GroupKey, required: true },
  row: { type: Object as () => HistoryItem, required: true }, // dòng lịch sử cần hoàn tác
  values: { type: Object as () => Values, required: true }, // số của nhóm ở tháng mặc định (màn đã tải sẵn)
  stamp: { type: Number, required: true },
  months: { type: Array as () => { value: string; label: string }[], required: true },
  minMonth: { type: String, required: true }
});
const emit = defineEmits(['close', 'done']);

const month = ref(revertMonth(props.row, props.minMonth));
const reason = ref('');
const saving = ref(false);

// Số của nhóm ở `month`; null trong lúc tải tháng vừa chọn (khi đó chưa có câu nào, nút Hoàn tác tắt).
const at = ref<Values | null>(props.values);
let seq = 0;
watch(month, async m => {
  const mine = ++seq;
  at.value = null;
  try {
    const s = await getSettings(m);
    if (mine === seq) at.value = s.groups[props.group].values;
  } catch (e) {
    if (mine === seq) toast.error(e.message);
  }
});
const lines = computed(() => (at.value ? revertLines(props.group, props.row, at.value, month.value) : []));

async function submit() {
  if (saving.value || !lines.value.length) return;
  saving.value = true;
  try {
    await saveSettingsGroup(GROUP_PATH[props.group], {
      effectiveMonth: month.value,
      values: revertValues(props.row),
      reason: reason.value.trim() || null,
      stamp: props.stamp
    });
    toast.ok('Đã hoàn tác');
    emit('done');
  } catch (e) {
    if (isStale(e)) {
      toast.error(STALE_TEXT);
      emit('done');
    } else toast.error(e.message);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <AppModal title="Hoàn tác" :width="560" :top="120" :dismissable="!saving" @close="emit('close')">
    <div class="fld">
      <label>Các ô sẽ đổi</label>
      <ul class="chg">
        <li v-for="l in lines" :key="l">{{ l }}</li>
      </ul>
    </div>
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
      <button type="button" class="btn pri" :disabled="saving || !lines.length" @click="submit">Hoàn tác</button>
    </template>
  </AppModal>
</template>

<style scoped>
.chg {
  margin: 0;
  padding-left: 18px;
  line-height: 1.7;
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
