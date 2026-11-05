<script setup lang="ts">
// Dòng "Đang tải…" ở chỗ nội dung của một khối nhân viên khi dữ liệu chưa về lần nào: lần đầu, hay Thử lại khi chưa từng
// có dữ liệu. Không khung xương, không vòng xoay. Đổi tháng thì khối vẫn giữ nội dung tháng cũ nên không có dòng này.
//   <LoadError v-if="error" … />  <template v-else-if="data">…</template>  <LoadingLine v-else-if="loading" />
</script>

<template>
  <p class="mut lding" role="status">Đang tải…</p>
</template>

<style scoped>
.lding {
  margin: 0;
  padding: 16px 0;
}
</style>
