<script setup lang="ts">
// Thân của một yêu cầu (J5 trên điện thoại, K3b trên máy tính): các dòng khoá–giá trị và các bước nối nhau bằng đường dọc;
// bước có ghi chú của người duyệt (vd. "Lý do từ chối") hiện hộp ghi chú ngay dưới thời điểm. Không có đầu hộp, không có nút Đóng.
//   <RequestBody :request="detail" />
import type { RequestDetail } from '@/mock/staff-phone';

defineProps<{ request: RequestDetail }>();
</script>

<template>
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
        <div v-if="s.note" class="rq-note">
          <span class="mut sm">{{ s.note.label }}</span>
          <span>{{ s.note.text }}</span>
        </div>
      </span>
    </li>
  </ol>
</template>

<style scoped>
/* Tên lớp riêng (rq-*) để không đụng .steps, .sp của CSS chung. */
.rq-steps {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}
.rq-step {
  display: flex;
  gap: 12px;
}
.rq-rail {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 12px;
  flex: none;
}
.rq-rail i {
  width: 12px;
  height: 12px;
  margin-top: 4px;
  border-radius: 50px;
  background: var(--status-done);
}
.rq-rail i.pend {
  background: var(--status-pending);
}
.rq-rail i.rej {
  background: var(--status-rejected);
}
.rq-rail i.cancel {
  background: var(--muted);
}
.rq-rail b {
  flex: 1 1 auto;
  width: 2px;
  margin: 4px 0;
  background: var(--border);
}
.rq-tx {
  display: flex;
  flex-direction: column;
  padding-bottom: 14px;
}
.rq-step:last-child .rq-tx {
  padding-bottom: 0;
}
.rq-lb {
  font-weight: 600;
}
/* Hộp ghi chú của người duyệt (spec 6, K3b): nền --page, bo 12px, đệm 12px 14px, cách trên 8px; nhãn 12px --muted, dưới là nội dung */
.rq-note {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 8px;
  padding: 12px 14px;
  border-radius: 12px;
  background: var(--page);
}
</style>
