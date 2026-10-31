<script setup>
// Bảng trượt "chi tiết một ngày" mở từ lịch Chấm công: các lượt bấm gốc, công ngày đó, nút Khai ngày này.
import { computed } from 'vue';
import Icon from '@/components/ui/Icon.vue';
import { useLoad } from '@/composables/useLoad.js';
import { getDayDetail } from '@/services/staff-phone.js';
import { dayLong } from '@/utils/format.js';
import BottomSheet from './BottomSheet.vue';

const props = defineProps({ date: { type: String, required: true } });
const emit = defineEmits(['close', 'declare']);

const { data } = useLoad(
  () => getDayDetail(props.date),
  () => props.date
);
const title = computed(() => `${dayLong(props.date)}/${props.date.slice(0, 4)}`);
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
  </BottomSheet>
</template>
