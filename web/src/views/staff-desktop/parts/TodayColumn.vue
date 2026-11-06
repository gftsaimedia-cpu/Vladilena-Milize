<script setup lang="ts">
// Cột 1 · Hôm nay + Yêu cầu (spec 4.1): đầu cột có h1 tên, dòng nhắc giải trình (spec staff-requests 4.3), thẻ ca (kể cả
// Check-out), thẻ "Tuần này", khối "Yêu cầu" với ô danh sách cuộn.
// Ô ngày, liên kết nhắc việc và dòng yêu cầu là RouterLink replace tới URL của điện thoại; trang đọc URL rồi mở ngăn kéo (spec 3.3).
// Check-in / Check-out xong phát checkedOut để trang báo cột 2 tải lại "Gần đây" (R7).
// "Tạo yêu cầu" mở /nv/yeu-cau?tao=chon (ngăn kéo K3); requestsStamp đổi (gửi hay huỷ yêu cầu xong) thì tải lại danh sách yêu cầu
// và phần Hôm nay (dòng nhắc mất khi đã gửi giải trình cho ngày đó, hiện lại khi đơn đó bị huỷ).
// Thẻ ca và danh sách yêu cầu tải riêng; phần nào tải lỗi thì hiện LoadError với nút Thử lại ở chỗ của phần đó (tải xong thì
// focus về h1 tên / h2 "Yêu cầu", vẫn lỗi thì về nút Thử lại mới); phần nào chưa có dữ liệu thì hiện "Đang tải…".
import { ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useLoad } from '@/composables/useLoad';
import { useStaffLive } from '@/composables/useStaffLive';
import { useRetry } from '@/composables/useRetry';
import type { HomeView } from '@/mock/staff-phone';
import { getHome, getRequests } from '@/services/staff-phone';
import LoadError from '@/views/staff-phone/components/LoadError.vue';
import LoadingLine from '@/views/staff-phone/components/LoadingLine.vue';
import PhIcon from '@/views/staff-phone/components/PhIcon.vue';
import ReminderLines from '@/views/staff-phone/components/ReminderLines.vue';
import RequestList from '@/views/staff-phone/components/RequestList.vue';
import ShiftCard from '@/views/staff-phone/components/ShiftCard.vue';
import WeekCard from '@/views/staff-phone/components/WeekCard.vue';
import { REQUESTS_PATH, TAO_MENU } from '@/views/staff-requests/useNewRequest';

const props = defineProps<{ requestsStamp?: number }>();
const emit = defineEmits<{ checkedOut: [] }>();
const router = useRouter();

const homeLoad = useLoad(() => getHome());
useStaffLive(homeLoad.refresh);
const { data: home, error: homeError, loading: homeLoading } = homeLoad;
const homeHead = ref<HTMLElement | null>(null);
const { errBox: homeErrBox, retry: retryHome } = useRetry(homeLoad, homeHead);

const requestsLoad = useLoad(() => getRequests());
useStaffLive(requestsLoad.refresh, ['request.decided']);
const { data: requests, error: requestsError, loading: requestsLoading } = requestsLoad;
const requestsHead = ref<HTMLElement | null>(null);
const { errBox: requestsErrBox, retry: retryRequests } = useRetry(requestsLoad, requestsHead);
watch(
  () => props.requestsStamp,
  () => {
    homeLoad.reload();
    requestsLoad.reload();
  }
);
const openFlow = () => router.push({ path: REQUESTS_PATH, query: { tao: TAO_MENU } });

// Đã chấm mà chưa tải lại được thẻ ca (null) thì tải lại; vẫn lỗi thì phần đó hiện LoadError.
function onPunch(v: HomeView | null) {
  if (v) home.value = v;
  else retryHome();
  emit('checkedOut');
}
</script>

<template>
  <section class="sd-col">
    <LoadError v-if="homeError" ref="homeErrBox" :error="homeError" @retry="retryHome" />
    <template v-else-if="home">
      <header class="sd-hello">
        <div>
          <div class="mut">{{ home.greeting }}</div>
          <h1 ref="homeHead" class="sd-title" tabindex="-1">{{ home.name }}</h1>
        </div>
        <span class="mut sd-date">{{ home.weekday }}<br />{{ home.date }}</span>
      </header>
      <ReminderLines :reminders="home.reminders" />
      <ShiftCard :home="home" @checked-in="onPunch" @checked-out="onPunch" />
      <WeekCard :week="home.week" :alert="home.alert" replace />
    </template>
    <LoadingLine v-else-if="homeLoading" />
    <section class="sd-grow" aria-label="Yêu cầu">
      <div class="sh">
        <h2 ref="requestsHead" class="sd-title" tabindex="-1">Yêu cầu</h2>
        <button type="button" class="sd-add" @click="openFlow">
          <PhIcon name="plus" :size="18" :stroke="2" />Tạo yêu cầu
        </button>
      </div>
      <LoadError v-if="requestsError" ref="requestsErrBox" :error="requestsError" @retry="retryRequests" />
      <RequestList
        v-else-if="requests"
        :view="requests"
        tablist-label="Lọc yêu cầu theo trạng thái"
        scroll-label="Danh sách yêu cầu, cuộn để xem thêm"
        replace
      />
      <LoadingLine v-else-if="requestsLoading" />
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
