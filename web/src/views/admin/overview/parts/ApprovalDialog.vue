<script setup lang="ts">
// Cửa sổ phê duyệt của Tổng quan (bảng thiết kế L1): hộp thoại giữa màn, cùng nội dung thẻ chi tiết của chuông.
// AppModal lo nền mờ, Esc, bẫy focus, trả focus và khoá cuộn; BellDetail (embedded) lo nội dung và tự gọi decide.
// emit('decided') mang câu kết quả; emit('leave') khi bấm liên kết sang hồ sơ chấm công.
// focusNote: mở bằng nút Từ chối nên đưa focus vào ô ghi chú (nếu việc này có ô ghi chú).
import { nextTick, onMounted } from 'vue';
import BellDetail from '@/components/shell/BellDetail.vue';
import AppModal from '@/components/ui/AppModal.vue';
import type { InboxItem } from '@/mock/inbox';

const props = defineProps<{ item: InboxItem; focusNote?: boolean }>();
const emit = defineEmits<{
  decided: [result: { id: string; ok: boolean; text: string }];
  close: [];
  leave: [];
}>();

onMounted(() => {
  if (props.focusNote) nextTick(() => document.getElementById('bell-note')?.focus());
});
</script>

<template>
  <AppModal title="Duyệt yêu cầu" :width="480" panel-class="apv-dlg" @close="emit('close')">
    <template #head>
      <span class="apv-grp">{{ item.groupLabel }}</span>
    </template>
    <BellDetail
      embedded
      :item="item"
      :group="item.groupLabel"
      @decided="emit('decided', $event)"
      @leave="emit('leave')"
    />
  </AppModal>
</template>

<!-- Hộp thoại được Teleport ra <body>, nên luật nằm ngoài phạm vi của thành phần. -->
<style>
.dlg.apv-dlg {
  border-radius: 24px;
  box-shadow: none;
}
.apv-dlg .dlg-h {
  align-items: center;
  padding: 20px 24px 0;
}
.apv-dlg .dlg-b {
  padding: 16px 24px 24px;
}
.apv-dlg .apv-grp {
  font-size: 12px;
  line-height: 16px;
  font-weight: 600;
  color: var(--muted);
}
</style>
