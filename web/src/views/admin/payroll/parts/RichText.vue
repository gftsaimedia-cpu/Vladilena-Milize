<script setup lang="ts">
// Một dòng chữ có phần đậm / phần màu nâu (số chưa chốt): chuỗi thường, { b: 'đậm' } hoặc { est: 'màu nâu' }.
defineProps({ segs: { type: Array as () => any[], default: () => [] } });
</script>

<template>
  <template v-for="(s, i) in segs" :key="i">
    <b v-if="s && s.b != null">{{ s.b }}</b>
    <span v-else-if="s && s.est != null" class="cap-est">{{ s.est }}</span>
    <template v-else>{{ s }}</template>
  </template>
</template>

<style scoped>
.cap-est {
  color: var(--est);
  font-weight: 500;
}
</style>
