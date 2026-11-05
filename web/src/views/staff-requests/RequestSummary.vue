<script setup lang="ts">
// Hộp tóm tắt của form tạo yêu cầu (board J9 `.sum`): mỗi form đặt hộp ở chỗ board vẽ (Đơn nghỉ: giữa hai ô ngày và Lý do).
// lines: dòng do máy đếm từ builder (dòng đầu đậm tới dấu hai chấm, các dòng sau chữ phụ). preview: kết quả xem trước gần
// nhất đã về (useNewRequest.shownPreview) — ok thì thêm cảnh báo, không ok thì thêm câu nói vì sao chưa gửi được.
// Không có dòng nào thì không vẽ hộp.
//   <RequestSummary :lines="[leaveSummary(…), leaveBalance(…)]" :preview="preview" />
import { computed } from 'vue';
import type { PreviewResult } from '@/mock/staff-requests-types';

const props = defineProps<{ lines: string[]; preview?: PreviewResult | null }>();

const rows = computed(() => {
  const p = props.preview;
  const extra = !p ? [] : p.ok ? p.warnings : [p.message];
  return [...props.lines, ...extra].filter(Boolean);
});
// '2 ngày làm việc: 02 và 03/11' → ['2 ngày làm việc:', ' 02 và 03/11']
const head = computed(() => {
  const line = rows.value[0] ?? '';
  const i = line.indexOf(': ');
  return i > 0 ? [line.slice(0, i + 1), line.slice(i + 1)] : ['', line];
});
</script>

<template>
  <div v-if="rows.length" class="nr-sum" aria-live="polite">
    <div>
      <b v-if="head[0]">{{ head[0] }}</b>{{ head[1] }}
    </div>
    <div v-for="(line, i) in rows.slice(1)" :key="i" class="mut">{{ line }}</div>
  </div>
</template>
