<script setup lang="ts">
// Bảng trượt "chi tiết một ngày" mở từ lịch Chấm công: các lượt bấm gốc, công ngày đó, nút Khai ngày này.
import { computed, ref } from 'vue';
import Icon from '@/components/ui/Icon.vue';
import { useLoad } from '@/composables/useLoad';
import { getDayDetail } from '@/services/staff-phone';
import { dayLong } from '@/utils/format';
import BottomSheet from './BottomSheet.vue';
import ExplanationSheet from './ExplanationSheet.vue';

const props = defineProps({ date: { type: String, required: true } });
const emit = defineEmits(['close', 'declare']);
const explaining = ref(null);

const { data, reload } = useLoad(
  () => getDayDetail(props.date),
  () => props.date
);
const title = computed(() => `${dayLong(props.date)}/${props.date.slice(0, 4)}`);
async function explained() {
  explaining.value = null;
  await reload();
}
</script>

<template>
  <BottomSheet :title="title" :sub="data?.shift || ''" @close="emit('close')">
    <template #badge>
      <span v-if="data" class="pill" :class="data.status.cls">{{ data.status.label }}</span>
    </template>
    <template v-if="data">
      <div v-for="p in data.punches" :key="p.title" class="lu">
        <b>{{ p.title }}</b>
        <span>{{ p.note }}</span>
        <button v-if="p.explainMissing" type="button" class="explain" @click="explaining = { sessionId: p.sessionId, date, prompt: p.explainKind === 'punch-in' ? 'Giải trình quên Check-in' : 'Giải trình quên Check-out' }">Giải trình lượt này</button>
      </div>
      <div v-for="r in data.rows" :key="r.label" class="kvx">
        <span>{{ r.label }}</span>
        <b>{{ r.value }}</b>
      </div>
    </template>
    <div class="bt">
      <button type="button" @click="emit('close')">Đóng</button>
      <button type="button" class="pri" @click="emit('declare', date)">
        <Icon name="cal" :size="18" />Khai ngày này
      </button>
    </div>
    <ExplanationSheet v-if="explaining" :item="explaining" @close="explaining = null" @saved="explained" />
  </BottomSheet>
</template>

<style scoped>
.explain { margin-top: 8px; border: 0; background: none; color: var(--link, #176b5a); font: inherit; font-weight: 600; padding: 0; cursor: pointer; }
</style>
