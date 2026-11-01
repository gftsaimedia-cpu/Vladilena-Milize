<script setup lang="ts">
// Hộp "Kiểm tra lại" kỳ đã khoá: tính lại từng phiếu từ đầu vào hiện có và so với bản đã chụp; nêu số phiếu khớp và các tài khoản lệch.
import { computed } from 'vue';
import AppModal from '@/components/ui/AppModal.vue';
import Icon from '@/components/ui/Icon.vue';
import { useLoad } from '@/composables/useLoad';
import { verifyPeriod } from '@/services/admin-payroll';
import { monthShort } from '@/utils/format';

const props = defineProps({ month: { type: String, required: true } });
const emit = defineEmits(['close']);

const { data, error } = useLoad(() => verifyPeriod(props.month));
const bad = computed(() => data.value?.mismatched || []);
</script>

<template>
  <AppModal
    title="Kiểm tra lại"
    :sub="`Kỳ lương tháng ${monthShort(month)}`"
    :width="560"
    :top="200"
    @close="emit('close')"
  >
    <div v-if="error" class="note err">
      <Icon name="alert" />
      <div>{{ error.message || error }}</div>
    </div>
    <div v-else-if="!data" class="note"><div>Đang kiểm tra…</div></div>
    <div v-else-if="!data.runId" class="note"><div>Kỳ chưa có lần tính lương.</div></div>
    <template v-else>
      <div class="note" :class="bad.length ? 'err' : 'ok'">
        <Icon :name="bad.length ? 'alert' : 'check'" />
        <div v-if="bad.length">
          Lần tính {{ data.runNo }}: {{ data.checked - bad.length }}/{{ data.checked }} phiếu khớp,
          {{ bad.length }} phiếu lệch.
        </div>
        <div v-else>Lần tính {{ data.runNo }}: {{ data.checked }}/{{ data.checked }} phiếu khớp.</div>
      </div>
      <div v-if="data.engineChanged" class="note" style="margin-top: 12px">
        <Icon name="info" />
        <div>Bộ máy tính lương đã đổi phiên bản kể từ lần tính này.</div>
      </div>
      <ul v-if="bad.length" class="bad">
        <li v-for="u in bad" :key="u">{{ u }}</li>
      </ul>
    </template>
    <template #footer>
      <span class="sp" />
      <button type="button" class="btn pri" @click="emit('close')">Đóng</button>
    </template>
  </AppModal>
</template>

<style scoped>
.bad {
  margin: 12px 0 0;
  padding-left: 18px;
  font-size: 13px;
}
</style>
