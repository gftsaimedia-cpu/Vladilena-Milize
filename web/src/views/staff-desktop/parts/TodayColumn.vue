<script setup lang="ts">
// Cột 1 · Hôm nay + Yêu cầu (spec 4.1): đầu cột có h1 tên, thẻ ca (kể cả Check-out), thẻ "Tuần này", khối "Yêu cầu" với ô danh sách cuộn.
// Ô ngày, liên kết nhắc việc và dòng yêu cầu là RouterLink replace tới URL của điện thoại; trang đọc URL rồi mở ngăn kéo (spec 3.3).
// Check-in / Check-out xong phát checkedOut để trang báo cột 2 tải lại "Gần đây" (R7).
// "Tạo yêu cầu" mở /nv/yeu-cau?tao=chon (ngăn kéo K3); requestsStamp đổi (gửi yêu cầu xong) thì tải lại danh sách yêu cầu.
import { ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import type { HomeView, RequestsView } from '@/mock/staff-phone';
import { getHome, getRequests } from '@/services/staff-phone';
import PhIcon from '@/views/staff-phone/components/PhIcon.vue';
import RequestList from '@/views/staff-phone/components/RequestList.vue';
import ShiftCard from '@/views/staff-phone/components/ShiftCard.vue';
import WeekCard from '@/views/staff-phone/components/WeekCard.vue';
import { REQUESTS_PATH, TAO_MENU } from '@/views/staff-requests/useNewRequest';

const props = defineProps<{ requestsStamp?: number }>();
const emit = defineEmits<{ checkedOut: [] }>();
const router = useRouter();

const home = ref<HomeView | null>(null);
const requests = ref<RequestsView | null>(null);
getHome().then(v => (home.value = v));
const loadRequests = () => getRequests().then(v => (requests.value = v));
loadRequests();
watch(() => props.requestsStamp, loadRequests);
const openFlow = () => router.push({ path: REQUESTS_PATH, query: { tao: TAO_MENU } });

function onPunch(v: HomeView) {
  home.value = v;
  emit('checkedOut');
}
</script>

<template>
  <section class="sd-col">
    <template v-if="home">
      <header class="sd-hello">
        <div>
          <div class="mut">{{ home.greeting }}</div>
          <h1 class="sd-title">{{ home.name }}</h1>
        </div>
        <span class="mut sd-date">{{ home.weekday }}<br />{{ home.date }}</span>
      </header>
      <ShiftCard :home="home" @checked-in="onPunch" @checked-out="onPunch" />
      <WeekCard :week="home.week" :alert="home.alert" replace />
    </template>
    <section class="sd-grow" aria-label="Yêu cầu">
      <div class="sh">
        <h2 class="sd-title">Yêu cầu</h2>
        <button type="button" class="sd-add" @click="openFlow">
          <PhIcon name="plus" :size="18" :stroke="2" />Tạo yêu cầu
        </button>
      </div>
      <RequestList
        v-if="requests"
        :view="requests"
        tablist-label="Lọc yêu cầu theo trạng thái"
        scroll-label="Danh sách yêu cầu, cuộn để xem thêm"
        replace
      />
    </section>
  </section>
</template>

<style scoped>
.sd-hello {
  min-height: 52px;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
}
.sd-date {
  text-align: right;
}
.sd-add {
  height: 40px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 14px 0 10px;
  border: 0;
  border-radius: 8px;
  background: var(--surface-dark);
  color: #ffffff;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
</style>
