<script setup lang="ts">
// Đăng nhập (dang-nhap, dang-nhap-sai). ?kb=sai mở sẵn trạng thái báo sai tên đăng nhập hoặc mật khẩu.
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import logo from '@/assets/img/gft-logo-light.png';
import Icon from '@/components/ui/Icon.vue';
import { login } from '@/services/session';

const route = useRoute();
const router = useRouter();
const showError = route.query.kb === 'sai';

const username = ref(showError ? 'demo_nv4' : '');
const password = ref(showError ? '0000000000' : '');
const revealed = ref(false);
const failed = ref(showError);
const errorText = ref(showError ? 'Sai tên đăng nhập hoặc mật khẩu' : '');
const busy = ref(false);
const userInput = ref(null);
onMounted(() => {
  if (!showError) userInput.value?.focus();
});
const passwordType = computed(() => (revealed.value ? 'text' : 'password'));

async function submit() {
  if (busy.value) return;
  busy.value = true;
  try {
    const session = await login({ username: username.value, password: password.value });
    failed.value = false;
    errorText.value = '';
    // Quay lại trang đang dở khi phiên hết hạn (?tiep=); cổng route đưa về trang chủ đúng vai trò nếu không được vào.
    const next = route.query.tiep;
    router.push(typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') ? next : session.home);
  } catch (e) {
    failed.value = true;
    errorText.value = e && e.message ? e.message : String(e);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="lg">
    <section class="brandp">
      <img :src="logo" alt="GFT" />
      <div class="mid">
        <h2>AiCB</h2>
        <p>Lương, chấm công và phúc lợi của GFT, ở một nơi.</p>
        <div class="list">
          <span><Icon name="clock" :size="18" />Check-in, Check-out và xem ngày công</span>
          <span><Icon name="inbox" :size="18" />Xin nghỉ, khai OT, làm bù</span>
          <span><Icon name="cash" :size="18" />Xem thu nhập trong tháng</span>
        </div>
      </div>
      <div class="fine">Dành cho nhân sự GFT</div>
    </section>
    <section class="formp">
      <form class="form" novalidate @submit.prevent="submit">
        <h1>Đăng nhập</h1>
        <div class="sub">Dùng tài khoản Admin đã cấp cho bạn.</div>
        <div class="fld">
          <label for="lg-user">Tên đăng nhập</label>
          <div class="inp">
            <input id="lg-user" ref="userInput" v-model="username" type="text" autocomplete="username" />
          </div>
        </div>
        <div class="fld">
          <label for="lg-pass">Mật khẩu</label>
          <div class="inp" :class="{ err: failed }">
            <input id="lg-pass" v-model="password" :type="passwordType" autocomplete="current-password" />
            <button type="button" class="show" @click="revealed = !revealed">{{ revealed ? 'Ẩn' : 'Hiện' }}</button>
          </div>
        </div>
        <div v-if="failed" class="msg" role="alert">
          {{ errorText }}
        </div>
        <button type="submit" class="go" :disabled="busy">Đăng nhập</button>
        <p class="hint">Bản mockup: mật khẩu bất kỳ. Tên admin vào khu quản trị, tên khác vào khu nhân viên.</p>
        <div class="help"><b>Quên mật khẩu?</b> Nhờ Admin đặt lại, bạn sẽ đăng nhập lại bằng mật khẩu mới.</div>
      </form>
    </section>
  </div>
</template>

<style scoped>
/* Đăng nhập không nạp ui.css: trả .fld và .inp về đúng dáng của trang đăng nhập (overlay.css có luật cùng tên). */
.lg {
  font-size: 16px;
  line-height: 24px;
  display: grid;
  grid-template-columns: 560px 1fr;
  min-height: 100vh;
}
.brandp {
  background: #1c1c1c;
  color: #fff;
  padding: 40px 48px;
  display: flex;
  flex-direction: column;
}
.brandp img {
  width: 72px;
}
.brandp .mid {
  margin-top: auto;
  margin-bottom: auto;
}
.brandp h2 {
  margin: 0;
  font-family: var(--display);
  font-weight: 600;
  font-size: 64px;
  line-height: 64px;
  color: var(--gold);
  letter-spacing: -0.5px;
}
.brandp p {
  margin: 16px 0 0;
  font-size: 18px;
  line-height: 28px;
  color: #d6d6d6;
  max-width: 360px;
}
.brandp .list {
  margin-top: 32px;
  display: grid;
  gap: 10px;
  color: #bdbdbd;
  font-size: 15px;
}
.brandp .list span {
  display: flex;
  align-items: center;
  gap: 10px;
}
.brandp .list svg {
  color: var(--gold);
}
.brandp .fine {
  font-size: 13px;
  color: #8a8a8a;
}
.formp {
  display: grid;
  place-items: center;
  padding: 40px 24px;
}
.form {
  width: 380px;
}
.form h1 {
  margin: 0;
  font-family: var(--display);
  font-weight: 600;
  font-size: 32px;
  line-height: 36px;
  letter-spacing: -0.3px;
}
.form .sub {
  color: var(--muted);
  font-size: 15px;
  line-height: 22px;
  margin-top: 8px;
}
.fld {
  margin-top: 20px;
}
.fld label {
  display: block;
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 6px;
}
.inp {
  height: 48px;
  min-height: 48px;
  border: 1px solid var(--control);
  border-radius: 10px;
  background: #fff;
  display: flex;
  align-items: center;
  padding: 0 14px;
  font-size: 16px;
  color: var(--text);
}
.inp:focus-within {
  border-color: var(--text);
  box-shadow: 0 0 0 3px #e8e8e8;
}
.inp input {
  flex: 1;
  min-width: 0;
  height: 46px;
  border: 0;
  background: transparent;
  font: inherit;
  color: inherit;
  outline: none;
  padding: 0;
}
.inp .show {
  margin-left: auto;
  padding: 0 0 0 8px;
  border: 0;
  background: none;
  font: inherit;
  font-size: 14px;
  font-weight: 500;
  color: var(--muted);
  cursor: pointer;
}
.inp.err {
  border-color: var(--err-ink);
  box-shadow: 0 0 0 3px var(--err-bg);
}
.msg {
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--err-bg);
  color: var(--err-ink);
  font-size: 14px;
  line-height: 20px;
}
.go {
  width: 100%;
  border: 0;
  cursor: pointer;
  font: inherit;
  margin-top: 28px;
  height: 48px;
  border-radius: 10px;
  background: var(--primary);
  color: #fff;
  display: grid;
  place-items: center;
  font-weight: 600;
}
.go:disabled {
  opacity: 0.7;
  cursor: default;
}
.hint {
  margin: 12px 0 0;
  font-size: 12px;
  line-height: 16px;
  color: var(--muted);
}
.help {
  margin-top: 16px;
  color: var(--muted);
  font-size: 14px;
  line-height: 20px;
}
.help b {
  color: var(--text);
  font-weight: 500;
}
@media (max-width: 600px) {
  .lg {
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr;
  }
  .brandp {
    padding: 28px 20px 32px;
  }
  .brandp img {
    width: 56px;
  }
  .brandp .mid {
    margin: 28px 0 0;
  }
  .brandp h2 {
    font-size: 44px;
    line-height: 46px;
  }
  .brandp p {
    font-size: 16px;
    line-height: 24px;
    margin-top: 10px;
  }
  .brandp .list,
  .brandp .fine {
    display: none;
  }
  .formp {
    place-items: start stretch;
    padding: 28px 20px 32px;
  }
  .form {
    width: auto;
  }
  .form h1 {
    font-size: 28px;
    line-height: 32px;
  }
}
</style>
