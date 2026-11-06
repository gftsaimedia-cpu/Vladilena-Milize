<script setup lang="ts">
// Hộp "Cho nghỉ việc": hỏi lại trước khi ghi nghỉ việc từ hôm nay (DELETE /api/v2/employees/:username). BE khoá tài khoản
// và giữ nguyên hồ sơ, chấm công, phiếu lương cũ; không có xoá hẳn. Xong thì phát done(ngày nghỉ, dd/mm/yyyy).
//   <StaffEndDialog id="le-hoang-nam" name="Lê Hoàng Nam" @close="…" @done="…" />
import { ref } from 'vue';
import AppModal from '@/components/ui/AppModal.vue';
import { endEmployment, staffToday } from '@/services/admin-hr';
import { dmy } from '@/utils/format';

const props = defineProps<{ id: string; name: string }>();
const emit = defineEmits<{ close: []; done: [day: string] }>();

const day = dmy(staffToday());
const running = ref(false);
const error = ref('');
async function run() {
  if (running.value) return;
  running.value = true;
  error.value = '';
  try {
    await endEmployment(props.id);
    emit('done', day);
  } catch (e) {
    error.value = e instanceof Error && e.message ? e.message : 'Chưa cho nghỉ việc được, thử lại sau.';
  } finally {
    running.value = false;
  }
}
</script>

<template>
  <AppModal title="Cho nghỉ việc" :width="480" :top="160" :dismissable="!running" @close="emit('close')">
    <p class="tx">
      <b>{{ name }}</b> nghỉ việc từ hôm nay, {{ day }}. Tài khoản bị khoá ngay nên người này không đăng nhập được nữa.
    </p>
    <p class="tx mu">Hồ sơ, chấm công và phiếu lương cũ vẫn giữ.</p>
    <div v-if="error" class="note err" role="alert" style="margin-top: 12px">{{ error }}</div>
    <template #footer>
      <span class="sp" />
      <button type="button" class="btn" :disabled="running" @click="emit('close')">Huỷ</button>
      <button type="button" class="btn pri" :disabled="running" @click="run">Cho nghỉ việc</button>
    </template>
  </AppModal>
</template>

<style scoped>
.tx {
  margin: 0;
  font-size: 14px;
  line-height: 20px;
}
.tx + .tx {
  margin-top: 8px;
}
.mu {
  color: var(--muted);
}
</style>
