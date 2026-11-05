<script setup lang="ts">
// Trang nhân viên trên máy tính (spec 3): thanh trên + lưới ba cột + ngăn kéo phải mở theo URL (ngày, yêu cầu, đổi mật khẩu,
// Tạo yêu cầu K3 theo /nv/yeu-cau?tao=). Gửi yêu cầu xong thì cột 1 tải lại danh sách yêu cầu. Ngăn kéo yêu cầu có "Huỷ đơn"
// khi đơn đang chờ duyệt (spec staff-requests 4.6): huỷ xong đọc lại đơn và cột 1 tải lại.
import { computed, ref } from 'vue';
import { useSessionStore } from '@/stores/session';
import DayBody from '@/views/staff-phone/components/DayBody.vue';
import PasswordForm from '@/views/staff-phone/components/PasswordForm.vue';
import RequestBody from '@/views/staff-phone/components/RequestBody.vue';
import RequestCancel from '@/views/staff-phone/components/RequestCancel.vue';
import NewRequestBody from '@/views/staff-requests/NewRequestBody.vue';
import AttendanceColumn from './parts/AttendanceColumn.vue';
import DesktopBar from './parts/DesktopBar.vue';
import IncomeColumn from './parts/IncomeColumn.vue';
import SideDrawer from './parts/SideDrawer.vue';
import TodayColumn from './parts/TodayColumn.vue';
import { useDesktopDetail } from './useDesktopDetail';

const session = useSessionStore();
const { day, request, password, tao, closeDetail, reloadRequest } = useDesktopDetail();
// Dòng phụ của ngăn kéo đổi mật khẩu: tên đăng nhập của phiên.
const username = computed(() => (session.user ? String(session.user.username) : ''));
// Tăng sau mỗi Check-out ở cột 1; cột 2 nhận làm :stamp để tải lại "Gần đây" (R7, P3).
const stamp = ref(0);
// Tăng sau mỗi lần gửi yêu cầu ở K3 hay huỷ đơn; cột 1 nhận làm :requests-stamp để tải lại danh sách yêu cầu và phần Hôm nay.
const requestsStamp = ref(0);
const flowTitle = ref('Tạo yêu cầu');
function onSent() {
  requestsStamp.value++;
  closeDetail();
}
function onRequestChanged(id: string) {
  requestsStamp.value++;
  reloadRequest(id);
}
</script>

<template>
  <div class="sd-app">
    <DesktopBar />
    <main class="sd-pg">
      <TodayColumn :requests-stamp="requestsStamp" @checked-out="stamp++" />
      <AttendanceColumn :stamp="stamp" />
      <IncomeColumn />
    </main>
    <SideDrawer v-if="day" :title="day.title" :sub="day.shiftLine" @close="closeDetail">
      <template #badge>
        <span class="st"><i class="dot" :class="day.kind" />{{ day.statusText }}</span>
      </template>
      <DayBody :day="day" />
      <button type="button" class="b2" @click="closeDetail">Đóng</button>
    </SideDrawer>
    <SideDrawer v-if="request" :title="request.title" :sub="request.kindLabel" @close="closeDetail">
      <template #badge>
        <span class="st"><i class="dot" :class="request.status" />{{ request.statusText }}</span>
      </template>
      <RequestBody :request="request" />
      <RequestCancel :request="request" @changed="onRequestChanged" />
      <button type="button" class="b2" @click="closeDetail">Đóng</button>
    </SideDrawer>
    <SideDrawer
      v-if="password"
      title="Đổi mật khẩu"
      :sub="username ? `Tài khoản ${username}` : ''"
      @close="closeDetail"
    >
      <PasswordForm @done="closeDetail" @cancel="closeDetail" />
    </SideDrawer>
    <SideDrawer v-if="tao" :title="flowTitle" bare @close="closeDetail">
      <NewRequestBody @title="flowTitle = $event" @close="closeDetail" @sent="onSent" />
    </SideDrawer>
  </div>
</template>
