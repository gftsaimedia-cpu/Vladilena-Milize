<script setup lang="ts">
// Mục "Lịch sử thay đổi" trong hồ sơ nhân sự: các dòng nhật ký về người này, mới nhất trước, nạp khi mở mục.
import { ref } from 'vue';
import { getEmployeeTrace } from '@/services/admin-hr';

const props = defineProps({ uuid: { type: String, required: true } });

const open = ref(false);
const items = ref([]);
const loading = ref(false);
const error = ref('');

const when = (at?) =>
  String(at || '')
    .replace('T', ' ')
    .slice(0, 16);

async function toggle() {
  open.value = !open.value;
  if (!open.value || loading.value || items.value.length) return;
  loading.value = true;
  error.value = '';
  try {
    items.value = (await getEmployeeTrace(props.uuid)).items;
  } catch (e) {
    error.value = e && e.message ? e.message : 'Không tải được lịch sử.';
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="grp-t">
    <button type="button" class="link" :aria-expanded="open" @click="toggle">Lịch sử thay đổi</button>
  </div>
  <div v-if="open" class="trace">
    <div v-if="error" class="note err">{{ error }}</div>
    <div v-else-if="loading" class="muted">Đang tải…</div>
    <div v-else-if="!items.length" class="muted">Chưa có thay đổi nào</div>
    <ul v-else>
      <li v-for="it in items" :key="it.id">
        <span class="muted">{{ when(it.at) }}</span>
        <b>{{ it.actor }}</b>
        <span>{{ it.action }}</span>
        <span v-if="it.reason" class="muted">· {{ it.reason }}</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.trace {
  margin-top: 8px;
  max-height: 260px;
  overflow: auto;
  font-size: 13px;
}
.trace ul {
  list-style: none;
  margin: 0;
  padding: 0;
}
.trace li {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 6px 0;
  border-bottom: 1px solid var(--border);
}
</style>
