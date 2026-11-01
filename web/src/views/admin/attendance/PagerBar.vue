<script setup lang="ts">
// Chân thẻ: dòng "1–20 trên 71 …" và nút chuyển trang. Không truyền `pages` thì chỉ hiện dòng chữ.
import Icon from '@/components/ui/Icon.vue';

defineProps({
  text: { type: String, default: '' },
  page: { type: Number, default: 1 },
  pages: { type: Number, default: 0 }
});
defineEmits(['page']);
</script>

<template>
  <div class="foot">
    <span>{{ text }}</span>
    <span v-if="pages" class="pager">
      <span>Trang {{ page }}/{{ pages }}</span>
      <button type="button" class="pb" aria-label="Trang trước" :disabled="page <= 1" @click="$emit('page', page - 1)">
        <Icon name="chevl" />
      </button>
      <button
        type="button"
        class="pb"
        aria-label="Trang sau"
        :disabled="page >= pages"
        @click="$emit('page', page + 1)"
      >
        <Icon name="chevr" />
      </button>
    </span>
  </div>
</template>

<style scoped>
.pb:disabled {
  opacity: 0.4;
  cursor: default;
}
.pb:not(:disabled) {
  cursor: pointer;
}
</style>
