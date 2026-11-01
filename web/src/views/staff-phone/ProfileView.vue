<script setup lang="ts">
// Tôi: "Thông tin công ty đang giữ về tôi có đúng không?" → thông tin hồ sơ trước; đổi mật khẩu và đăng xuất là các dòng.
import { useRouter } from 'vue-router';
import Icon from '@/components/ui/Icon.vue';
import { useLoad } from '@/composables/useLoad';
import { getProfile, logout } from '@/services/staff-phone';
import ChangePasswordSheet from './components/ChangePasswordSheet.vue';
import { useHop } from './useHop';

const router = useRouter();
const { data } = useLoad(() => getProfile());
const { hop, open, close } = useHop();

async function signOut() {
  await logout();
  router.push('/dang-nhap');
}
</script>

<template>
  <div v-if="data" class="toi">
    <header class="ph"><h1>Tôi</h1></header>

    <section class="sec card">
      <div class="me">
        <span class="av">{{ data.initials }}</span>
        <div>
          <b>{{ data.name }}</b
          ><span>{{ data.roleLine }}</span>
        </div>
      </div>
      <div v-for="f in data.facts" :key="f.label" class="kv">
        <span class="k">{{ f.label }}</span>
        <span class="v">{{ f.value }}</span>
      </div>
    </section>
    <p class="src">Thông tin do Admin quản lý. Thấy sai thì báo Admin để sửa.</p>

    <section class="sec card">
      <button type="button" class="more" @click="open('doi-mat-khau')">
        <span class="l"
          ><span class="ico"><Icon name="lock" :size="18" /></span>Đổi mật khẩu</span
        >
        <span class="chev"><Icon name="chevr" :size="18" /></span>
      </button>
      <button type="button" class="more out" @click="signOut">
        <span class="l"
          ><span class="ico"><Icon name="logout" :size="18" /></span>Đăng xuất</span
        >
      </button>
    </section>

    <ChangePasswordSheet v-if="hop === 'doi-mat-khau'" :username="data.username" @close="close" />
  </div>
</template>

<style scoped>
/* .me của thanh bên Admin (base.css) cùng tên: đặt lại đúng như thiết kế màn Tôi */
.ph-app .me {
  display: flex;
  gap: 14px;
  align-items: center;
  padding: 18px 16px;
  width: auto;
  cursor: default;
}
.ph-app .me .av {
  width: 56px;
  height: 56px;
  font-size: 18px;
  background: var(--gold-light);
  color: #212121;
}
.ph-app .me b {
  display: block;
  font-size: 19px;
  line-height: 26px;
  font-weight: 600;
  color: var(--text);
}
.ph-app .me span {
  color: var(--muted);
  font-size: 14px;
  line-height: 20px;
}
.src {
  padding: 0 20px;
  margin: 8px 0 0;
  color: var(--muted);
  font-size: 13px;
  line-height: 18px;
}
.ph-app .more {
  width: 100%;
  background: none;
  border: 0;
  border-top: 1px solid var(--rule);
  font-family: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.ph-app .more:first-child {
  border-top: 0;
}
.more .l .ico {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: #f1f1f1;
  display: grid;
  place-items: center;
}
.more.out {
  color: var(--err-ink);
}
.more.out .ico {
  background: var(--err-bg);
}
</style>
