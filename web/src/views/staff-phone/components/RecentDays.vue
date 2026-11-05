<script setup lang="ts">
// Thẻ danh sách "Gần đây" (J2 mục 5, K1 cột 2): mỗi dòng một ngày, bấm phát open(date). Tiêu đề do màn cha đặt.
//   <RecentDays :recent="data.recent" @open="openDay" />
import type { AttendanceView } from '@/mock/staff-phone';

defineProps<{ recent: AttendanceView['recent'] }>();
const emit = defineEmits<{ open: [date: string] }>();
</script>

<template>
  <div class="card ls">
    <button
      v-for="r in recent"
      :key="r.date"
      type="button"
      class="ro"
      :aria-label="`${r.day} ${r.times}, ${r.statusText}`"
      @click="emit('open', r.date)"
    >
      <i class="dot" :class="r.kind" /><span class="t">{{ r.day }}</span><span class="v">{{ r.times }}</span>
    </button>
  </div>
</template>
