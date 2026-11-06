<script setup lang="ts">
// J18 · Tạm ứng (spec staff-requests 2.5, 4.4, brief FE mục 7): không có ô nào. Chỉ hiện số tiền server tính và cách tính
// (builder advanceLines): "Số tiền được ứng: 2.215.385 ₫", "80% lương ngày công 01–15/10 · 12 ngày". Không có ô lý do.
// Khối số tiền như board: nhãn nhỏ, số lớn, dòng phụ; dấu hai chấm của câu chỉ dành cho trình đọc màn hình.
// Thêm dòng "Tên đơn", "Hạn nộp" (hôm nay và ngày cuối `windowEnd`), "Số đơn trong tháng" (`ordersThisMonth`) và câu giải thích như board.
// Hợp đồng form như LeaveForm: nhận ctx, ngay, preview; có số tiền thì phát ngay bản nháp rỗng, không thì null.
import { computed, watch } from 'vue';
import { advanceLines } from '@/builders/api/staff-requests';
import { dm } from '@/utils/format';
import type { AdvanceDraft, PreviewResult, RequestContext } from '@/mock/staff-requests-types';
import RequestSummary from './RequestSummary.vue';

const props = defineProps<{ ctx: RequestContext; ngay?: string | null; preview?: PreviewResult<'advance'> | null }>();
const emit = defineEmits<{ draft: [draft: AdvanceDraft | null] }>();

// Hôm nay 16/10 còn hạn tới 17/10 → 'Hôm nay 16/10 và 17/10'; hôm nay đã là ngày cuối → 'Hôm nay 17/10, ngày cuối'.
const deadlineOf = (today: string, end: string) =>
  today >= end ? `Hôm nay ${dm(today)}, ngày cuối` : `Hôm nay ${dm(today)} và ${dm(end)}`;

// 'Số tiền được ứng: 2.215.385 ₫' → nhãn 'Số tiền được ứng' và số '2.215.385 ₫'.
const amount = computed(() => {
  if (!props.ctx.advance) return null;
  const [line, how] = advanceLines(props.ctx.advance);
  const cut = line.indexOf(': ');
  return { label: line.slice(0, cut), value: line.slice(cut + 2), how, name: `Tạm ứng lương tháng ${Number(props.ctx.advance.from.slice(5, 7))}`, deadline: deadlineOf(props.ctx.today, props.ctx.advance.windowEnd), orders: `${props.ctx.advance.ordersThisMonth} đơn` };
});

watch(amount, a => emit('draft', a ? {} : null), { immediate: true });
</script>

<template>
  <div v-if="amount" class="nr-amt">
    <span class="nr-amt-l">{{ amount.label }}<span class="sr-only">: </span></span>
    <span class="nr-amt-v">{{ amount.value }}</span>
    <span class="mut">{{ amount.how }}</span>
  </div>
  <div v-if="amount" class="kv"><span class="k">Tên đơn</span><span class="v">{{ amount.name }}</span></div>
  <div v-if="amount" class="kv"><span class="k">Hạn nộp</span><span class="v">{{ amount.deadline }}</span></div>
  <div v-if="amount" class="kv"><span class="k">Số đơn trong tháng</span><span class="v">{{ amount.orders }}</span></div>
  <p v-if="amount" class="mut">Số tiền do máy tính lúc bạn gửi. Admin chỉ duyệt hoặc từ chối, không sửa số tiền.</p>
  <RequestSummary :lines="[]" :preview="preview" />
</template>
