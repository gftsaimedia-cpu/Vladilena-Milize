<script setup lang="ts">
// J5 · Hộp trượt một yêu cầu (spec 7.2): đầu hộp là tiêu đề + loại + nhãn trạng thái, thân RequestBody, "Huỷ đơn" khi đơn đang
// chờ duyệt (RequestCancel, spec staff-requests 4.6), nút "Đóng". Huỷ xong phát `changed` (id đơn) để màn đọc lại đơn và danh sách.
// Mở bằng <RequestSheet :request="detail" @close="…" @changed="…" />.
import type { RequestDetail } from '@/mock/staff-phone';
import BottomSheet from './BottomSheet.vue';
import RequestBody from './RequestBody.vue';
import RequestCancel from './RequestCancel.vue';

defineProps<{ request: RequestDetail }>();
defineEmits<{ close: []; changed: [id: string] }>();
</script>

<template>
  <BottomSheet :title="request.title" :sub="request.kindLabel" @close="$emit('close')">
    <template #badge>
      <span class="st"><i class="dot" :class="request.status" />{{ request.statusText }}</span>
    </template>
    <RequestBody :request="request" />
    <RequestCancel :request="request" @changed="$emit('changed', $event)" />
    <button type="button" class="b2" @click="$emit('close')">Đóng</button>
  </BottomSheet>
</template>
