<script setup lang="ts">
// Trang chính của nhân viên trên máy tính: một trang ba cột (hôm nay | chấm công tháng | thu nhập và yêu cầu).
// ?kb=linh|ca-dem|ctv|tts|quen-checkout|yeu-cau-cho  kịch bản   ?thang=YYYY-MM  tháng đang xem
// ?hop=cach-tinh mở sẵn bảng cách tính   ?hop=chi-tiet-ngay chọn sẵn ngày 25/11   (menu, ho-so do khung trang xử lý)
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { punchExplanationItem } from '@/builders/staff-requests/punch-explanation';
import { toast } from '@/components/shell/toast';
import { useLoad } from '@/composables/useLoad';
import {
  cancelStaffDayRequest,
  getStaffExplanations,
  getStaffHome,
  getStaffMonth,
  staffCheck
} from '@/services/staff-desktop';
import AttendanceCard from './parts/AttendanceCard.vue';
import AdvanceDialog from './parts/AdvanceDialog.vue';
import DayRequestDialog from './parts/DayRequestDialog.vue';
import ExplanationDialog from './parts/ExplanationDialog.vue';
import IncomeCard from './parts/IncomeCard.vue';
import KpiCard from './parts/KpiCard.vue';
import KpiSelfCard from './parts/KpiSelfCard.vue';
import RequestsCard from './parts/RequestsCard.vue';
import TodayHero from './parts/TodayHero.vue';

const route = useRoute();
const router = useRouter();
const queryText = (key?) => (typeof route.query[key] === 'string' ? route.query[key] : '');
const kb = computed(() => queryText('kb') || 'linh');
const thang = computed(() => queryText('thang'));
const openedBox = queryText('hop'); // chỉ đọc lúc vào trang

const { data: home, reload: reloadHome } = useLoad(
  () => getStaffHome(),
  () => kb.value
);
const { data: month, reload: reloadMonth } = useLoad(
  () => getStaffMonth(kb.value, thang.value),
  () => `${kb.value}|${thang.value}`
);

// Hộp gửi yêu cầu: preset = { date, type } của nút đã bấm; gửi xong tải lại tháng để thấy yêu cầu mới
const requestPreset = ref(null);
const advanceOpen = ref(false);
const { data: explanations, reload: reloadExplanations } = useLoad(() => getStaffExplanations());
const answering = ref(null);
const sessionExplaining = ref(null);
// Huỷ yêu cầu đang chờ: bỏ khai báo ngày đó
async function cancelRequest(r?) {
  try {
    await cancelStaffDayRequest(r.date);
    await reloadMonth();
  } catch (e) {
    toast.error(e && e.message);
  }
}
const openRequest = (a?) => (a.dialog === 'advance' ? (advanceOpen.value = true) : (requestPreset.value = a.preset));
const goMonth = (m?) => router.replace({ query: { ...route.query, thang: m } });
const punchExplaining = ref(null); // lần bấm đang chờ giải trình: hộp nhập lý do
async function check(kind?) {
  try {
    const res = await staffCheck(kind);
    toast.warnings(res && res.warnings);
  } catch (e) {
    const item = punchExplanationItem(e, text => staffCheck(kind, text));
    if (item) punchExplaining.value = item;
    else toast.error(e && e.message);
  }
  await reloadHome();
}
async function punchExplained() {
  toast.ok('Đã gửi giải trình');
  await Promise.all([reloadHome(), reloadMonth(), reloadExplanations()]);
}
async function missingPunchExplained() {
  sessionExplaining.value = null;
  toast.ok('Đã gửi giải trình');
  await Promise.all([reloadMonth(), reloadExplanations()]);
}
</script>

<template>
  <main v-if="home && month" class="pg">
    <div class="col">
      <TodayHero :home="home" @check="check" />
    </div>
    <div class="col">
      <AttendanceCard
        :key="kb + month.month"
        :data="month.attendance"
        :prev="month.prev"
        :next="month.next"
        :kb="kb"
        :initial-date="openedBox === 'chi-tiet-ngay' ? '2026-11-25' : null"
        @month="goMonth"
        @explain-session="sessionExplaining = $event"
      />
    </div>
    <div class="col">
      <IncomeCard
        :key="kb + month.month"
        :data="month.income"
        :month="month.month"
        :staff="home.me"
        :initial-expanded="openedBox === 'cach-tinh'"
      />
      <KpiSelfCard :month="month.month" />
      <KpiCard v-if="month.kpi" :data="month.kpi" />
      <RequestsCard
        v-if="month.requests"
        :data="month.requests"
        :explanations="explanations"
        @open="openRequest"
        @answer="answering = $event"
        @cancel="cancelRequest"
      />
    </div>
    <DayRequestDialog v-if="requestPreset" :preset="requestPreset" @close="requestPreset = null" @saved="reloadMonth" />
    <AdvanceDialog v-if="advanceOpen" @close="advanceOpen = false" />
    <ExplanationDialog
      v-if="punchExplaining"
      :item="punchExplaining"
      @close="punchExplaining = null"
      @saved="punchExplained"
    />
    <ExplanationDialog v-if="answering" :item="answering" @close="answering = null" @saved="reloadExplanations" />
    <ExplanationDialog v-if="sessionExplaining" :item="sessionExplaining" @close="sessionExplaining = null" @saved="missingPunchExplained" />
  </main>
</template>

<style scoped>
.pg {
  display: grid;
  grid-template-columns: 360px 608px 360px;
  gap: 24px;
  padding: 24px 32px 40px;
  align-items: start;
}
.col {
  display: flex;
  flex-direction: column;
  gap: 24px;
}
</style>
