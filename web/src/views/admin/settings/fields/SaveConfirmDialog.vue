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
  <AppModal title="Lưu thay đổi" :width="480" :top="200" panel-class="cfm-dlg" :dismissable="!saving" @close="emit('close')">
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
      <button type="button" class="btn" :disabled="saving" @click="emit('close')">Huỷ</button>
      <button type="button" class="btn pri" :disabled="saving" @click="emit('confirm')">Lưu</button>
    </template>
  </AppModal>
</template>

<style scoped>
.chg {
  margin: 0;
  padding-left: 18px;
  line-height: 24px;
}
.why {
  margin: 0;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
</style>

<!-- Hộp thoại được Teleport ra <body>, nên luật nằm ngoài phạm vi của thành phần. Theo bảng SettingsPayConfirm:
     rộng 480, bo 24, đầu 20/24, nút Huỷ và Lưu chia đôi hàng. -->
<style>
.dlg.cfm-dlg {
  border-radius: 24px;
  box-shadow: none;
}
.cfm-dlg .dlg-h {
  align-items: center;
  padding: 20px 24px 0;
}
.cfm-dlg .dlg-b {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 20px 24px 0;
}
.cfm-dlg .dlg-b .fld {
  margin: 0;
}
.cfm-dlg .dlg-b .fld label {
  margin: 0 0 8px;
  font-weight: 600;
}
.cfm-dlg .dlg-f {
  padding: 24px 24px 24px;
}
.cfm-dlg .dlg-f .btn {
  flex: 1 1 0;
  justify-content: center;
  height: 40px;
}
</style>
