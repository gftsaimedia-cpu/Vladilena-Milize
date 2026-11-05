<script setup lang="ts">
// Dòng nhắc giải trình ở đầu J1 và cột Hôm nay của K1 (spec staff-requests 4.3, brief FE mục 9): mỗi ngày Admin nhắc một dòng
// nền vàng nhạt, chữ đậm, mũi tên; bấm mở form Giải trình điền sẵn ngày đó (/nv/yeu-cau?tao=giai-trinh&ngay=…, push).
// RouterLink custom như RequestRow: RouterLink tính "đang mở" theo route mà bỏ qua query, nên trên /nv/yeu-cau (máy tính vẫn
// thấy cột Hôm nay) dòng sẽ mang aria-current="page". Không có lời nhắc thì không vẽ gì.
//   <ReminderLines :reminders="home.reminders" />
import type { HomeView } from '@/mock/staff-phone';
import { REQUESTS_PATH, TAO_SLUG } from '@/views/staff-requests/useNewRequest';
import PhIcon from './PhIcon.vue';

defineProps<{ reminders: HomeView['reminders'] }>();
const to = (date: string) => ({ path: REQUESTS_PATH, query: { tao: TAO_SLUG.explanation, ngay: date } });
</script>

<template>
  <div v-if="reminders.length" class="rm-list">
    <RouterLink v-for="r in reminders" :key="r.date" v-slot="{ href, navigate }" :to="to(r.date)" custom>
      <a class="rm-line" :href="href" @click="navigate">
        <span class="rm-t">{{ r.text }}</span>
        <PhIcon name="right" :size="18" :stroke="2" />
      </a>
    </RouterLink>
  </div>
</template>

<style scoped>
.rm-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
/* Như dòng nhắc việc của thẻ "Tuần này" (.att), nổi hơn: nền --gold-light, chữ --text đậm, bo 8px, không bóng. */
.rm-line {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 48px;
  padding: 0 12px 0 16px;
  border-radius: 8px;
  background: var(--gold-light);
  color: var(--text);
  font-weight: 600;
  text-decoration: none;
}
.rm-t {
  flex: 1 1 auto;
  min-width: 0;
}
</style>
