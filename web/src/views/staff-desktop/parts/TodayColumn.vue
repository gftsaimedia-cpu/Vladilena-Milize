<script setup lang="ts">
// Cột 1 · Hôm nay + Yêu cầu (spec 4.1): đầu cột có h1 tên, thẻ ca (kể cả Check-out), thẻ "Tuần này", khối "Yêu cầu" với ô danh sách cuộn.
// Ô ngày, liên kết nhắc việc và dòng yêu cầu là RouterLink replace tới URL của điện thoại; trang đọc URL rồi mở ngăn kéo (spec 3.3).
// Check-in / Check-out xong phát checkedOut để trang báo cột 2 tải lại "Gần đây" (R7).
// Thẻ ca và danh sách yêu cầu tải riêng; phần nào tải lỗi thì hiện LoadError với nút Thử lại ở chỗ của phần đó.
import { ref } from 'vue';
import { toast } from '@/components/shell/toast';
import { useLoad } from '@/composables/useLoad';
import type { HomeView } from '@/mock/staff-phone';
import { getHome, getRequests } from '@/services/staff-phone';
import LoadError from '@/views/staff-phone/components/LoadError.vue';
import LoadingLine from '@/views/staff-phone/components/LoadingLine.vue';
import PhIcon from '@/views/staff-phone/components/PhIcon.vue';
import RequestList from '@/views/staff-phone/components/RequestList.vue';
import ShiftCard from '@/views/staff-phone/components/ShiftCard.vue';
import WeekCard from '@/views/staff-phone/components/WeekCard.vue';
import { focusAfterLoad } from '@/views/staff-phone/focusAfterLoad';

const emit = defineEmits<{ checkedOut: [] }>();

const col = ref<HTMLElement | null>(null);
const reqBox = ref<HTMLElement | null>(null);
const { data: home, loading: homeLoading, error: homeError, reload: reloadHome } = useLoad(() => getHome());
const { data: requests, loading: requestsLoading, error: requestsError, reload: reloadRequests } = useLoad(() => getRequests());
function retryHome() {
  reloadHome();
  focusAfterLoad(col, homeLoading);
}
function retryRequests() {
  reloadRequests();
  focusAfterLoad(reqBox, requestsLoading);
}

// Lượt chấm đã ghi mà tải lại lỗi (v = null): bỏ thẻ ca cũ (còn nút Check-out) rồi tải lại phần Hôm nay.
function onPunch(v: HomeView | null) {
  if (v) home.value = v;
  else {
    home.value = null;
    retryHome();
  }
  emit('checkedOut');
}
</script>

<template>
  <section ref="col" class="sd-col">
    <LoadError v-if="homeError" :error="homeError" @retry="retryHome" />
    <template v-else-if="home">
      <header class="sd-hello">
        <div>
          <div class="mut">{{ home.greeting }}</div>
          <h1 class="sd-title" data-load-focus>{{ home.name }}</h1>
        </div>
        <span class="mut sd-date">{{ home.weekday }}<br />{{ home.date }}</span>
      </header>
      <ShiftCard :home="home" @checked-in="onPunch" @checked-out="onPunch" />
      <WeekCard :week="home.week" :alert="home.alert" replace />
    </template>
    <LoadingLine v-else />
    <section ref="reqBox" class="sd-grow" aria-label="Yêu cầu">
      <div class="sh">
        <h2 class="sd-title" data-load-focus>Yêu cầu</h2>
        <button type="button" class="sd-add" @click="toast.warnings(['Chưa có luồng tạo yêu cầu trong bản mockup.'])">
          <PhIcon name="plus" :size="18" :stroke="2" />Tạo yêu cầu
        </button>
      </div>
      <LoadError v-if="requestsError" :error="requestsError" @retry="retryRequests" />
      <RequestList
        v-else-if="requests"
        :view="requests"
        tablist-label="Lọc yêu cầu theo trạng thái"
        scroll-label="Danh sách yêu cầu, cuộn để xem thêm"
        replace
      />
      <LoadingLine v-else />
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
