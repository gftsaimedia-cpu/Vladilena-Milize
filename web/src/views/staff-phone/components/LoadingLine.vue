<script setup lang="ts">
// Dòng "Đang tải…" ở chỗ nội dung khi chưa có dữ liệu và chưa lỗi (lần tải đầu, hay đang Thử lại). Không khung xương, không
// vòng xoay. Đổi tháng thì màn giữ nội dung tháng cũ tới khi tháng mới về, không hiện dòng này.
//   <LoadError v-if="error" … /> <template v-else-if="data">…</template> <LoadingLine v-else />
</script>

<template>
  <p class="mut lload" role="status">Đang tải…</p>
</template>

<style scoped>
.lload {
  margin: 0;
  padding: 16px 0;
}
</style>
