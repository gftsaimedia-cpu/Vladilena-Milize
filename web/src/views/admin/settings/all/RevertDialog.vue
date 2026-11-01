<script setup lang="ts">
// Hộp thoại "Hoàn tác" một ô về phiên bản cũ: chọn tháng áp dụng, ghi lý do; máy chủ thêm một dòng mới mang giá trị đó.
import { ref } from 'vue';
import { toast } from '@/components/shell/toast';
import AppModal from '@/components/ui/AppModal.vue';
import { revertSetting } from '@/services/admin-config';
import { usePeriodStore } from '@/stores/period';
import SelectBox from '../fields/SelectBox.vue';
import TextBox from '../fields/TextBox.vue';
import { monthOptions } from '../lib/date';
import { REASON_MAX, REASON_MIN, reasonOk } from '../lib/rules';

const props = defineProps({
  name: { type: String, required: true },
  row: { type: Object as () => any, required: true }
});
const emit = defineEmits(['close', 'saved']);

const period = usePeriodStore();
const months = monthOptions(period.month);
const month = ref(months[0].value);
const reason = ref('');
const saving = ref(false);
const error = ref('');

async function submit() {
  if (!reasonOk(reason.value) || saving.value) return;
  saving.value = true;
  error.value = '';
  try {
    await revertSetting({
      key: props.row.key,
      toVersion: props.row.version,
      effectiveMonth: month.value,
      reason: reason.value.trim()
    });
    toast.ok('Đã hoàn tác');
    emit('saved');
    emit('close');
  } catch (e) {
    error.value = e && e.message ? e.message : 'Không hoàn tác được.';
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <AppModal
    :title="'Hoàn tác ' + name"
    :sub="(row.label ? row.label + ': ' : '') + row.value"
    :width="520"
    :top="140"
    @close="emit('close')"
  >
    <div v-if="error" class="note err" style="margin-bottom: 8px">{{ error }}</div>
    <div class="g2">
      <div class="fld">
        <label>Áp dụng từ tháng</label
        ><SelectBox v-model="month" variant="inp" :options="months" label="Áp dụng từ tháng" />
      </div>
      <div></div>
    </div>
    <div class="fld">
      <label
        >Lý do <small>(bắt buộc, {{ REASON_MIN }}–{{ REASON_MAX }} ký tự)</small></label
      >
      <TextBox
        v-model="reason"
        area
        :maxlength="REASON_MAX"
        placeholder="Ghi rõ lý do để lưu vào nhật ký"
        label="Lý do"
      />
    </div>
    <template #footer>
      <span class="sp"></span>
      <button type="button" class="btn" @click="emit('close')">Huỷ</button>
      <button
        type="button"
        class="btn"
        :class="reasonOk(reason) ? 'pri' : 'off'"
        :disabled="!reasonOk(reason) || saving"
        @click="submit"
      >
        Hoàn tác
      </button>
    </template>
  </AppModal>
</template>
