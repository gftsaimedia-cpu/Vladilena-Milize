<script setup lang="ts">
// Dòng yêu cầu dùng ở J1 và J4 (spec 3.7): liên kết tới /nv/yeu-cau?yc=<id> (R5), cao tối thiểu 56px.
// Ô biểu tượng, tiêu đề một dòng (cắt dấu ba chấm), nhãn trạng thái chấm + chữ. Tên truy cập "<tiêu đề>, <trạng thái>".
// replace: mở hộp ngay trên màn (J4) — RouterLink dùng replace và giữ các tham số khác của URL.
// RouterLink custom: tự dựng <a>, vì RouterLink tính "đang mở" theo route mà bỏ qua query, nên trên /nv/yeu-cau
// mọi dòng sẽ mang aria-current="page". Dòng là một mục để mở, không phải trang hiện tại.
//   <div class="card ls"><RequestRow v-for="r in rows" :key="r.id" :row="r" replace /></div>
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import type { RequestRowData } from '@/mock/staff-phone';
import PhIcon from './PhIcon.vue';

const props = withDefaults(defineProps<{ row: RequestRowData; replace?: boolean }>(), { replace: false });
const route = useRoute();
const to = computed(() => ({
  path: '/nv/yeu-cau',
  query: props.replace ? { ...route.query, yc: props.row.id } : { yc: props.row.id }
}));
</script>

<template>
  <RouterLink v-slot="{ href, navigate }" :to="to" :replace="replace" custom>
    <a class="ro" :href="href" :data-yc="row.id" :aria-label="`${row.title}, ${row.statusText}`" @click="navigate">
      <span class="ti"><PhIcon :name="row.icon" /></span>
      <span class="t">{{ row.title }}</span>
      <span class="st"><i class="dot" :class="row.status" />{{ row.statusText }}</span>
    </a>
  </RouterLink>
</template>
