<script setup lang="ts">
// Bảng việc cần xử lý mở từ chuông trên thanh kỳ lương (pop-chuong.html).
// Hợp đồng: không props; emit('close') khi đóng (bấm ra ngoài, Esc, hoặc đi tới màn khác).
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import Icon from '@/components/ui/Icon.vue';
import { useLoad } from '@/composables/useLoad';
import { getBell } from '@/services/admin-main';
import { getOvertimeRequests } from '@/services/admin-attendance';
import { usePeriodStore } from '@/stores/period';
import { dm, monthShort } from '@/utils/format';

const emit = defineEmits(['close']);
const period = usePeriodStore();
const { data } = useLoad(() => getBell());
const root = ref(null);
const otCount = ref(0);

watch(
  () => period.month,
  async m => {
    try {
      const res = await getOvertimeRequests(m, { status: 'pending' });
      otCount.value = res?.counts?.pending ?? (res?.rows?.length || 0);
    } catch {
      otCount.value = 0;
    }
  },
  { immediate: true }
);

// Bấm lên chính nút chuông thì để nút tự đóng/mở, không đóng ở đây
const onDown = (e?) => {
  if (root.value && !root.value.contains(e.target) && !e.target.closest('.bell')) emit('close');
};
const onKey = (e?) => {
  if (e.key === 'Escape') emit('close');
};
onMounted(() => {
  document.addEventListener('pointerdown', onDown);
  document.addEventListener('keydown', onKey);
});
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDown);
  document.removeEventListener('keydown', onKey);
});
</script>

<template>
  <div ref="root" class="pop" role="dialog" aria-label="Việc cần xử lý">
    <template v-if="data">
      <div class="ph">
        Việc cần xử lý <small>tháng {{ monthShort(data.month) }} · {{ data.total }} việc</small>
      </div>
      <RouterLink to="/admin/yeu-cau/moi-thang" class="nb" @click="emit('close')">
        <Icon name="inbox" />
        Yêu cầu chờ xử lý <small style="color: var(--muted); font-weight: 400">mọi tháng</small>
        <span class="c">{{ data.requests }}</span>
      </RouterLink>
      <RouterLink to="/admin/yeu-cau?nhom=giai-trinh" class="nb" @click="emit('close')">
        <Icon name="inbox" />
        Giải trình chờ xử lý <small style="color: var(--muted); font-weight: 400">mọi tháng</small>
        <span class="c">{{ data.explanations }}</span>
      </RouterLink>
      <RouterLink :to="{ path: '/admin/cham-cong', query: { hop: 'duyet-ot' } }" class="nb" @click="emit('close')">
        <Icon name="clock" />
        Giờ OT chờ đối chiếu
        <span class="c">{{ otCount }}</span>
      </RouterLink>
      <RouterLink :to="{ path: '/admin/cham-cong', query: { filter: 'pending' } }" class="nb" @click="emit('close')">
        <Icon name="clock" />
        Quên Check-in/out trong tháng
        <span class="c">{{ data.forgotten.count }}</span>
      </RouterLink>
      <div v-for="f in data.forgotten.items" :key="f.date + f.text" class="nl">
        <b>{{ dm(f.date) }}</b>
        {{ f.text }}
      </div>
      <div class="pf">
        <RouterLink to="/admin/yeu-cau" class="link" @click="emit('close')">Mở Yêu cầu</RouterLink>
        ·
        <RouterLink to="/admin/cham-cong" class="link" @click="emit('close')">Mở Bảng công</RouterLink>
      </div>
    </template>
  </div>
</template>

<style scoped>
.pop {
  position: fixed;
  top: 72px;
  right: 32px;
  width: 380px;
  z-index: 60;
  background: #fff;
  border: 1px solid var(--border);
  border-radius: 16px;
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.16);
}
.ph {
  padding: 14px 16px 8px;
  font-size: 14px;
  font-weight: 600;
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.ph small {
  font-weight: 400;
  color: var(--muted);
  font-size: 12px;
}
.nb {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 6px 12px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 12px;
  font-size: 14px;
  font-weight: 500;
}
.nb .c {
  margin-left: auto;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.nb svg {
  color: var(--muted);
}
.nl {
  padding: 2px 16px 0 44px;
  font-size: 13px;
  color: var(--muted);
  line-height: 24px;
}
.nl b {
  color: var(--text);
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  margin-right: 8px;
}
.pf {
  padding: 10px 16px 14px;
  border-top: 1px solid var(--rule);
  margin-top: 10px;
  font-size: 13px;
}
</style>
