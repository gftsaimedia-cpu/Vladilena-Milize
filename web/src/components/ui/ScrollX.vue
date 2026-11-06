<script setup lang="ts">
// Bọc một bảng rộng: màn hẹp (điện thoại) thì cuộn ngang trong khung này thay vì làm cả trang tràn ngang.
// Có tabindex để người dùng bàn phím cuộn được. Màn rộng không đổi gì.
defineProps<{ label: string }>();
</script>

<template>
  <div class="sx" role="region" :aria-label="label" tabindex="0">
    <slot />
  </div>
</template>

<style scoped>
.sx {
  overflow-x: auto;
  max-width: 100%;
}
</style>
