<script setup lang="ts">
// Trang nhân viên trên máy tính (spec 3): thanh trên + lưới ba cột + ba ngăn kéo phải mở theo URL (ngày, yêu cầu, đổi mật khẩu).
// Ba cột (Task 4–6) thêm vào sau.
import { computed } from 'vue';
import { useSessionStore } from '@/stores/session';
import DayBody from '@/views/staff-phone/components/DayBody.vue';
import PasswordForm from '@/views/staff-phone/components/PasswordForm.vue';
import RequestBody from '@/views/staff-phone/components/RequestBody.vue';
import DesktopBar from './parts/DesktopBar.vue';
import SideDrawer from './parts/SideDrawer.vue';
import { useDesktopDetail } from './useDesktopDetail';

const session = useSessionStore();
const { day, request, password, closeDetail } = useDesktopDetail();
// Dòng phụ của ngăn kéo đổi mật khẩu: tên đăng nhập của phiên.
const username = computed(() => (session.user ? String(session.user.username) : ''));
</script>

<template>
  <div class="sd-app">
    <DesktopBar />
    <main class="sd-pg"></main>
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
  </div>
</template>
