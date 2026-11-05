<script setup lang="ts">
// Hộp "Lưu thay đổi" dùng chung của các màn cài đặt theo tháng: liệt kê các ô sẽ đổi và lý do (nếu có), bấm Lưu để xác nhận.
// Tháng áp dụng và lý do nằm ở màn gọi; hộp chỉ hiện lại để người dùng soát.
import AppModal from '@/components/ui/AppModal.vue';

defineProps({
  lines: { type: Array as () => string[], default: () => [] },
  reason: { type: String, default: '' },
  saving: { type: Boolean, default: false }
});
const emit = defineEmits(['confirm', 'close']);
</script>

<template>
  <AppModal title="Lưu thay đổi" :width="560" :top="120" :dismissable="!saving" @close="emit('close')">
    <div class="fld">
      <label>Các ô sẽ đổi</label>
      <ul class="chg">
        <li v-for="l in lines" :key="l">{{ l }}</li>
      </ul>
    </div>
    <div v-if="reason" class="fld">
      <label>Lý do</label>
      <p class="why">“{{ reason }}”</p>
    </div>
    <template #footer>
      <span class="sp"></span>
      <button type="button" class="btn" :disabled="saving" @click="emit('close')">Huỷ</button>
      <button type="button" class="btn pri" :disabled="saving" @click="emit('confirm')">Lưu</button>
    </template>
  </AppModal>
</template>

<style scoped>
.chg {
  margin: 0;
  padding-left: 18px;
  line-height: 1.7;
}
.why {
  margin: 0;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
</style>
