<script setup lang="ts">
// Hộp thoại "Thêm chức vụ": sao chép chế độ từ một chức vụ có sẵn. Mở từ Tất cả cài đặt (?hop=them-chuc-vu)
// và từ nút "Thêm chức vụ" trong ngăn kéo Lương theo ngày công.
import { computed, ref } from 'vue';
import { toast } from '@/components/shell/toast';
import AppModal from '@/components/ui/AppModal.vue';
import Icon from '@/components/ui/Icon.vue';
import { useLoad } from '@/composables/useLoad';
import { addPosition, getPositionTypes } from '@/services/admin-settings';
import { usePeriodStore } from '@/stores/period';
import SelectBox from '../fields/SelectBox.vue';
import TextBox from '../fields/TextBox.vue';
import { monthOptions } from '../lib/date';
import { REASON_MAX, REASON_MIN, reasonOk } from '../lib/rules';

const emit = defineEmits(['close', 'saved']);

const period = usePeriodStore();
const months = monthOptions(period.month);
const { data: types } = useLoad(() => getPositionTypes());

const name = ref('');
const copyFrom = ref('');
const month = ref(months[0].value);
const reason = ref('');
const saving = ref(false);

const source = computed(() => copyFrom.value || (types.value && types.value[0] ? types.value[0].value : ''));
const valid = computed(() => name.value.trim() !== '' && reasonOk(reason.value));

async function submit() {
  if (!valid.value || saving.value) return;
  saving.value = true;
  try {
    await addPosition({
      name: name.value.trim(),
      copyFrom: source.value,
      fromMonth: month.value,
      reason: reason.value.trim()
    });
    emit('saved');
    emit('close');
  } catch (e) {
    toast.error(e.message);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <AppModal
    title="Thêm chức vụ"
    sub="Sao chép từ một chức vụ có sẵn rồi sửa chế độ"
    :width="560"
    :top="120"
    @close="emit('close')"
  >
    <div class="fld">
      <label>Tên chức vụ</label><TextBox v-model="name" placeholder="Ví dụ: Trưởng nhóm" label="Tên chức vụ" />
    </div>
    <div class="fld">
      <label>Sao chép chế độ từ</label>
      <SelectBox
        v-if="types"
        :model-value="source"
        variant="inp"
        :options="types"
        label="Sao chép chế độ từ"
        @update:model-value="copyFrom = $event"
      />
    </div>
    <div style="font-size: 12px; color: var(--muted); margin-top: 6px">
      Chức vụ mới có cùng bậc, lương và chế độ với chức vụ này; sửa sau trong bảng Chế độ theo loại nhân sự.
    </div>
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
      <button type="button" class="btn" :class="valid ? 'pri' : 'off'" :disabled="!valid || saving" @click="submit">
        <Icon name="plus" />Thêm chức vụ
      </button>
    </template>
  </AppModal>
</template>
