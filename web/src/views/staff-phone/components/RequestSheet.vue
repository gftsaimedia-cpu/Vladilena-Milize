<script setup lang="ts">
// J5 · Hộp trượt một yêu cầu (spec 7.2): đầu hộp là tiêu đề + loại + nhãn trạng thái, các dòng khoá–giá trị,
// các bước nối nhau bằng đường dọc, nút "Đóng". Mở bằng <RequestSheet :request="detail" @close="…" />.
import type { RequestDetail } from '@/mock/staff-phone';
import BottomSheet from './BottomSheet.vue';

defineProps<{ request: RequestDetail }>();
defineEmits<{ close: [] }>();
</script>

<template>
  <BottomSheet :title="request.title" :sub="request.kindLabel" @close="$emit('close')">
    <template #badge>
      <span class="st"><i class="dot" :class="request.status" />{{ request.statusText }}</span>
    </template>
    <div class="rq-facts">
      <div v-for="[k, v] in request.facts" :key="k" class="kv">
        <span class="k">{{ k }}</span><span class="v">{{ v }}</span>
      </div>
    </div>
    <ol class="rq-steps" aria-label="Các bước">
      <li v-for="(s, i) in request.steps" :key="i" class="rq-step">
        <span class="rq-rail">
          <i :class="s.state" />
          <b v-if="i < request.steps.length - 1" />
        </span>
        <span class="rq-tx">
          <span class="rq-lb">{{ s.label }}</span>
          <span v-if="s.at" class="mut">{{ s.at }}</span>
        </span>
      </li>
    </ol>
    <button type="button" class="b2" @click="$emit('close')">Đóng</button>
  </BottomSheet>
</template>

<style>
/* Không scoped: hộp được teleport ra body. Tên lớp riêng (rq-*) để không đụng .steps, .sp của CSS chung. */
.ph-sheet .rq-steps {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}
.ph-sheet .rq-step {
  display: flex;
  gap: 12px;
}
.ph-sheet .rq-rail {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 12px;
  flex: none;
}
.ph-sheet .rq-rail i {
  width: 12px;
  height: 12px;
  margin-top: 4px;
  border-radius: 50px;
  background: var(--status-done);
}
.ph-sheet .rq-rail i.pend {
  background: var(--status-pending);
}
.ph-sheet .rq-rail i.rej {
  background: var(--status-rejected);
}
.ph-sheet .rq-rail b {
  flex: 1 1 auto;
  width: 2px;
  margin: 4px 0;
  background: var(--border);
}
.ph-sheet .rq-tx {
  display: flex;
  flex-direction: column;
  padding-bottom: 14px;
}
.ph-sheet .rq-step:last-child .rq-tx {
  padding-bottom: 0;
}
.ph-sheet .rq-lb {
  font-weight: 600;
}
</style>
