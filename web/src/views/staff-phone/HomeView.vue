<script setup lang="ts">
// J1 · Hôm nay (spec 4): lời chào, thẻ ca hôm nay có vòng cung và nút Check-out, thẻ "Tuần này", thu nhập, hai yêu cầu mới nhất.
// Dữ liệu từ services/staff-phone; bấm Check-in hay Check-out (trong ShiftCard) thay cả dữ liệu màn bằng kết quả trả về (R7);
// đã chấm mà chưa tải lại được màn (null) thì tải lại, vẫn lỗi thì hiện LoadError.
// Tải lỗi thì hiện LoadError với nút Thử lại (tải xong thì focus về khối lời chào, vẫn lỗi thì về nút Thử lại mới);
// chưa có dữ liệu thì hiện "Đang tải…".
import { ref } from 'vue';
import { useLoad } from '@/composables/useLoad';
import { useRetry } from '@/composables/useRetry';
import type { HomeView } from '@/mock/staff-phone';
import { dm } from '@/utils/format';
import { getHome } from '@/services/staff-phone';
import LoadError from './components/LoadError.vue';
import LoadingLine from './components/LoadingLine.vue';
import PhIcon from './components/PhIcon.vue';
import RequestRow from './components/RequestRow.vue';
import ShiftCard from './components/ShiftCard.vue';
import WeekCard from './components/WeekCard.vue';

const load = useLoad(() => getHome());
const { data, error, loading } = load;
const head = ref<HTMLElement | null>(null);
const { errBox, retry } = useRetry(load, head);
const onPunch = (v: HomeView | null) => (v ? (data.value = v) : retry());
</script>

<template>
  <div class="ph home">
    <LoadError v-if="error" ref="errBox" :error="error" @retry="retry" />
    <template v-else-if="data">
      <header ref="head" class="hello" tabindex="-1">
        <span class="avatar" aria-hidden="true">{{ data.initials }}</span>
        <div class="who-col">
          <div class="mut">{{ data.greeting }}</div>
          <div class="name">{{ data.name }}</div>
        </div>
        <span class="mut sm date">{{ data.weekday }}<br />{{ data.date }}</span>
      </header>

      <ShiftCard :home="data" @checked-in="onPunch" @checked-out="onPunch" />

      <WeekCard :week="data.week" :alert="data.alert" />

      <RouterLink to="/nv/thu-nhap" class="card pay">
        <div class="pay-text">
          <div class="mut">{{ data.income.label }}</div>
          <div class="amt">{{ data.income.net }} <span>₫</span></div>
          <div v-if="data.income.payDate" class="mut sm">trả ngày {{ dm(data.income.payDate) }}</div>
        </div>
        <PhIcon name="right" :size="20" :stroke="2" />
      </RouterLink>

      <section class="reqs">
        <div class="sh">
          <h2>Yêu cầu của tôi</h2>
          <RouterLink to="/nv/yeu-cau" class="lk">Xem tất cả</RouterLink>
        </div>
        <div class="card ls">
          <RequestRow v-for="r in data.requests" :key="r.id" :row="r" />
        </div>
      </section>
    </template>
    <LoadingLine v-else-if="loading" />
  </div>
</template>

<style scoped>
.hello {
  display: flex;
  align-items: center;
  gap: 12px;
}
.avatar {
  width: 48px;
  height: 48px;
  flex: none;
  display: grid;
  place-items: center;
  border-radius: 50px;
  background: var(--gold-light);
  font-weight: 600;
}
.who-col {
  flex: 1 1 auto;
  min-width: 0;
}
.name {
  font-size: 18px;
  line-height: 24px;
  font-weight: 600;
}
.date {
  text-align: right;
}

/* Thẻ thu nhập */
.pay {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 16px 16px 20px;
  color: inherit;
  text-decoration: none;
}
.pay-text {
  flex: 1 1 auto;
}
.amt {
  margin-top: 2px;
  font-size: 24px;
  line-height: 32px;
  font-weight: 600;
}
.amt span {
  font-size: 16px;
  color: var(--muted);
  font-weight: 500;
}

.reqs {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.reqs .sh {
  padding: 0 4px;
}
</style>
