<script setup lang="ts">
// Hộp thoại "Thêm ngày lễ" (mở từ Lịch, ca & chấm công: nút "Thêm ngày lễ" hoặc bấm một ngày trên lịch).
import { computed, ref } from 'vue';
import { toast } from '@/components/shell/toast';
import AppModal from '@/components/ui/AppModal.vue';
import Icon from '@/components/ui/Icon.vue';
import { addHoliday } from '@/services/admin-settings';
import FieldDate from '../fields/FieldDate.vue';
import TextBox from '../fields/TextBox.vue';

const props = defineProps({
  year: { type: Number, required: true },
  from: { type: String, default: '' } // ngày điền sẵn khi bấm từ lịch
});
const emit = defineEmits(['close', 'saved']);

const dateFrom = ref(props.from);
const dateTo = ref('');
const title = ref('');
const saving = ref(false);
const valid = computed(
  () => dateFrom.value !== '' && title.value.trim() !== '' && (!dateTo.value || dateTo.value >= dateFrom.value)
);

async function submit() {
  if (!valid.value || saving.value) return;
  saving.value = true;
  try {
    await addHoliday({ from: dateFrom.value, to: dateTo.value || dateFrom.value, name: title.value.trim() });
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
  <AppModal title="Thêm ngày lễ" :sub="`Năm ${year}`" :width="560" :top="200" @close="emit('close')">
    <div class="g2">
      <div class="fld"><label>Từ ngày</label><FieldDate v-model="dateFrom" boxed label="Từ ngày" /></div>
      <div class="fld">
        <label>Đến ngày <small>(nếu nghỉ nhiều ngày)</small></label
        ><FieldDate v-model="dateTo" boxed label="Đến ngày" />
      </div>
    </div>
    <div class="fld">
      <label>Tên ngày lễ</label><TextBox v-model="title" placeholder="Ví dụ: Giỗ Tổ Hùng Vương" label="Tên ngày lễ" />
    </div>
    <template #footer>
      <span class="sp"></span>
      <button type="button" class="btn" @click="emit('close')">Huỷ</button>
      <button type="button" class="btn" :class="valid ? 'pri' : 'off'" :disabled="!valid || saving" @click="submit">
        <Icon name="plus" />Thêm ngày lễ
      </button>
    </template>
  </AppModal>
</template>
