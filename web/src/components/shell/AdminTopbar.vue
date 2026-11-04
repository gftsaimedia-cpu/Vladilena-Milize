<script setup lang="ts">
// Thanh trên mọi màn Admin: nút ngăn kéo (điện thoại, slot start), tìm nhân viên, chọn tháng, chuông thông báo.
// Đổi tháng = đổi ?thang= trên đường dẫn (AdminLayout đọc và cập nhật store kỳ lương).
// Tìm nhân viên: Enter mở danh sách Nhân sự với ?q=.
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Icon from '@/components/ui/Icon.vue';
import { usePeriodStore } from '@/stores/period';

defineProps({ bell: { type: Number, default: 0 } });
defineEmits(['open-bell']);
const period = usePeriodStore();
const route = useRoute();
const router = useRouter();
const go = (month?) => month && router.replace({ query: { ...route.query, thang: month } });

const text = ref('');
function search() {
  const q = text.value.trim();
  if (!q) return;
  const thang = route.query.thang;
  router.push({ path: '/admin/nhan-su', query: { q, ...(thang ? { thang } : {}) } });
}
</script>

<template>
  <header class="topbar">
    <slot name="start" />
    <label class="tsearch">
      <Icon name="search" :size="16" />
      <input
        v-model="text"
        type="text"
        placeholder="Tìm nhân viên…"
        aria-label="Tìm nhân viên"
        @keydown.enter.prevent="search"
      />
    </label>
    <div class="mpick">
      <button type="button" aria-label="Tháng trước" :disabled="!period.prevMonth" @click="go(period.prevMonth)">
        <Icon name="chevl" />
      </button>
      <span>{{ period.strip.month }}</span>
      <button type="button" aria-label="Tháng sau" :disabled="!period.nextMonth" @click="go(period.nextMonth)">
        <Icon name="chevr" />
      </button>
    </div>
    <button type="button" class="bell" :aria-label="`Thông báo, ${bell} việc cần xử lý`" @click="$emit('open-bell')">
      <Icon name="bell" :size="18" />
      <i v-if="bell">{{ bell }}</i>
    </button>
  </header>
</template>

<style scoped>
.mpick button:disabled {
  opacity: 0.35;
  cursor: default;
}
.mpick button {
  cursor: pointer;
}
</style>
