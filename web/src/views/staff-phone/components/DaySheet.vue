<script setup lang="ts">
// J3 · Hộp trượt một ngày (spec 6): đầu hộp (ngày, ca, nhãn trạng thái), thân DayBody và nút Đóng.
// Mở trên J2; ngày nghỉ không có thanh giờ.
//   <DaySheet :day="day" @close="…" />
import { computed } from 'vue';
import type { DayDetail } from '@/mock/staff-phone';
import BottomSheet from './BottomSheet.vue';
import DayBody from './DayBody.vue';

const props = defineProps<{ day: DayDetail }>();
defineEmits<{ close: [] }>();

// Chấm của nhãn trạng thái theo nhóm ngày (hôm nay đang làm cũng là nhóm Đi làm).
const dotClass = computed(() => props.day.kind);
</script>

<template>
  <BottomSheet :title="day.title" :sub="day.shiftLine" @close="$emit('close')">
    <template #badge>
      <span class="st"><i class="dot" :class="dotClass" />{{ day.statusText }}</span>
    </template>
    <DayBody :day="day" />
    <button type="button" class="b2" @click="$emit('close')">Đóng</button>
  </BottomSheet>
</template>
