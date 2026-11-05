<script setup lang="ts">
// J5 · Hộp trượt một yêu cầu (spec 7.2): đầu hộp là tiêu đề + loại + nhãn trạng thái, thân RequestBody, nút "Đóng".
// Mở bằng <RequestSheet :request="detail" @close="…" />.
import type { RequestDetail } from '@/mock/staff-phone';
import BottomSheet from './BottomSheet.vue';
import RequestBody from './RequestBody.vue';

defineProps<{ request: RequestDetail }>();
defineEmits<{ close: [] }>();
</script>

<template>
  <BottomSheet :title="request.title" :sub="request.kindLabel" @close="$emit('close')">
    <template #badge>
      <span class="st"><i class="dot" :class="request.status" />{{ request.statusText }}</span>
    </template>
    <RequestBody :request="request" />
    <button type="button" class="b2" @click="$emit('close')">Đóng</button>
  </BottomSheet>
</template>
