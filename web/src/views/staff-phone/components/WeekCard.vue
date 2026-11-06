<script setup lang="ts">
// Thẻ "Tuần này" (J1 mục 4.3, K1 cột 1): bảy ô ngày và liên kết nhắc việc, đều mở ngày qua /nv/cham-cong?ngay=.
// replace: máy tính mở ngăn kéo ngay trên trang (router.replace, D2); điện thoại giữ push như trước.
//   <WeekCard :week="data.week" :alert="data.alert" replace />
import type { HomeView } from '@/mock/staff-phone';
import PhIcon from './PhIcon.vue';

withDefaults(defineProps<{ week: HomeView['week']; alert: HomeView['alert']; replace?: boolean }>(), { replace: false });
</script>

<template>
  <section class="card week" aria-label="Tuần này">
    <div class="sh"><h2>Tuần này</h2><span class="mut">{{ week.range }}</span></div>
    <div class="days">
      <div v-for="c in week.cells" :key="c.date">
        <div class="dw">{{ c.dow }}</div>
        <RouterLink
          v-if="c.open"
          :to="`/nv/cham-cong?ngay=${c.date}`"
          :replace="replace"
          class="dn"
          :class="[c.kind, { today: c.today }]"
          :aria-label="c.label"
          >{{ c.day }}</RouterLink
        >
        <span v-else class="dn" :class="[c.kind, { today: c.today }]" role="img" :aria-label="c.label">{{ c.day }}</span>
      </div>
    </div>
    <RouterLink v-if="alert" :to="`/nv/cham-cong?ngay=${alert.date}`" :replace="replace" class="att">
      <i class="dot todo" /><span class="t">{{ alert.text }}</span>
      <PhIcon name="right" :size="18" :stroke="2" />
    </RouterLink>
  </section>
</template>

<style scoped>
/* Thẻ "Tuần này" */
.week {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
}
.days {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  justify-items: center;
  gap: 6px;
}
.days > div {
  min-width: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
}
/* Ô ngày co theo cột (tối đa 40px, luôn vuông) để bảy ô vừa thẻ ở mọi bề ngang từ 320px */
.days .dn {
  width: 100%;
  max-width: 40px;
  height: auto;
  aspect-ratio: 1;
}
.dw {
  margin-bottom: 6px;
  font-size: 12px;
  line-height: 16px;
  color: var(--muted);
  text-align: center;
}
.att {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 48px;
  padding: 0 12px;
  border-radius: 12px;
  background: var(--page);
  color: var(--text);
  text-decoration: none;
}
.att .t {
  flex: 1 1 auto;
  min-width: 0;
}
</style>
