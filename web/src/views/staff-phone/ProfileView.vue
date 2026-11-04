<script setup lang="ts">
// J7 · Tôi (spec 8.2): dải vàng đầu màn, khối định danh của Lê Hoàng Nam, thẻ "Công việc", hai thao tác.
// Đổi mật khẩu mở hộp trượt theo ?hop=doi-mat-khau (mở bằng router.replace); Đăng xuất về /dang-nhap.
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { ProfileView } from '@/mock/staff-phone';
import { getProfile, logout } from '@/services/staff-phone';
import { useSessionStore } from '@/stores/session';
import ChangePasswordSheet from './components/ChangePasswordSheet.vue';
import PhIcon from './components/PhIcon.vue';
import { useHop } from './useHop';

const PASSWORD = 'doi-mat-khau';
const route = useRoute();
const router = useRouter();
const session = useSessionStore();
const { hop, close } = useHop();
const data = ref<ProfileView | null>(null);
getProfile().then(v => (data.value = v));
// Dòng phụ của hộp: tên đăng nhập của phiên (hồ sơ trên màn luôn là Nam, R2).
const username = computed(() => (session.user ? String(session.user.username) : ''));

// ?hop= lạ thì bỏ khỏi URL, không mở gì (spec 3.8).
watch(
  hop,
  name => {
    if (name && name !== PASSWORD) close();
  },
  { immediate: true }
);

function openPassword() {
  router.replace({ query: { ...route.query, hop: PASSWORD } });
}

async function signOut() {
  await logout();
  router.push('/dang-nhap');
}
</script>

<template>
  <div class="ph toi">
    <div class="band"><h1>Tôi</h1></div>
    <template v-if="data">
      <div class="ident">
        <span class="big-av" aria-hidden="true">{{ data.initials }}</span>
        <div class="nm">{{ data.name }}</div>
        <div class="mut">{{ data.email }}</div>
        <span class="st"><i class="dot work" />{{ data.contract }}</span>
      </div>
      <section class="job">
        <h2>Công việc</h2>
        <div class="card blk">
          <div v-for="[k, v] in data.facts" :key="k" class="kv">
            <span class="k">{{ k }}</span><span class="v">{{ v }}</span>
          </div>
        </div>
        <p class="mut sm">{{ data.note }}</p>
      </section>
      <section class="card blk">
        <button type="button" class="mi" @click="openPassword">
          <span class="ti"><PhIcon name="lock" /></span><span class="t">Đổi mật khẩu</span>
          <PhIcon name="right" :size="18" :stroke="2" />
        </button>
        <button type="button" class="mi out" @click="signOut">
          <span class="ti"><PhIcon name="out" /></span><span class="t">Đăng xuất</span>
        </button>
      </section>
    </template>
    <ChangePasswordSheet v-if="data && hop === PASSWORD" :username="username" @close="close" />
  </div>
</template>

<style scoped>
/* Màn này gốc .ph không có đệm trên: dải vàng chạm mép trên. */
.ph.toi {
  padding-top: 0;
}
/* Dải vàng 150px tràn hết bề ngang cột, bo dưới 32px; h1 22px/28px (R10) */
.band {
  margin: 0 -16px;
  height: 150px;
  display: flex;
  justify-content: center;
  padding-top: 20px;
  border-radius: 0 0 32px 32px;
  background: var(--gold);
}
.ph .band h1 {
  font-size: 22px;
  line-height: 28px;
}
/* Khối định danh chồng lên dải */
.ident {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  margin-top: -76px;
  text-align: center;
}
.big-av {
  width: 96px;
  height: 96px;
  display: grid;
  place-items: center;
  border-radius: 50px;
  border: 4px solid var(--page);
  background: var(--gold-light);
  font-size: 28px;
  font-weight: 600;
}
.nm {
  margin-top: 6px;
  font-size: 20px;
  line-height: 28px;
  font-weight: 600;
}
.ident .st {
  margin-top: 2px;
}
.job {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.job h2,
.job p {
  margin: 0;
  padding: 0 4px;
}
.blk {
  padding: 4px 16px;
}
/* Hai thao tác: dòng cao 56px */
.mi {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 56px;
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.mi + .mi {
  border-top: 1px solid var(--border);
}
.mi .t {
  flex: 1 1 auto;
  font-weight: 500;
}
.mi.out,
.mi.out .ti {
  color: var(--status-rejected);
}
</style>
