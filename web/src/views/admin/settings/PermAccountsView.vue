<script setup lang="ts">
// Cài đặt › Phân quyền › Tài khoản: danh sách tài khoản (10 dòng một trang), đổi vai trò, đặt lại mật khẩu, khoá/mở khoá.
// Dòng của chính mình không đổi được vai trò và không khoá được (tự bỏ quyền Admin thì không còn ai mở được Cài đặt để
// đổi lại). Mỗi tài khoản là một người trong Nhân sự: "Tạo tài khoản" mở hộp Thêm nhân sự (?hop=them-nhan-su).
import { ref, watch } from 'vue';
import Icon from '@/components/ui/Icon.vue';
import { useLoad } from '@/composables/useLoad';
import PageLoadError from '@/components/shell/PageLoadError.vue';
import { getAccounts, setAccountLocked, setAccountRole } from '@/services/admin-settings';
import { initials } from '@/utils/format';
import StaffFormDialog from '../staff/StaffFormDialog.vue';
import SettingsFrame from './SettingsFrame.vue';
import { useHop } from './lib/useHop';
import PermTabs from './perm/PermTabs.vue';
import ResetPasswordDialog from './perm/ResetPasswordDialog.vue';
import SelectBox from './fields/SelectBox.vue';

const role = ref('all'); // khoá chip vai trò
const q = ref('');
const page = ref(1);
const { data, error, reload } = useLoad(
  () => getAccounts({ page: page.value, role: role.value, q: q.value }),
  () => [page.value, role.value, q.value]
);
watch([role, q], () => (page.value = 1));

const notice = ref('');
const noticeErr = ref(false);
const redraw = ref(0); // đổi số này để ô chọn vai trò vẽ lại đúng vai trò chính đang lưu
const resetting = ref(null); // tài khoản đang mở hộp đặt lại mật khẩu
let noticeTimer = 0;
function say(text?, isErr = false) {
  notice.value = text;
  noticeErr.value = isErr;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => (notice.value = ''), isErr ? 8000 : 3000);
}
const fail = (e?) => say(e && e.message ? e.message : 'Không lưu được, thử lại sau.', true);

// Hộp Thêm nhân sự (Tạo tài khoản): tạo xong thì đóng, báo và tải lại danh sách tài khoản.
const { hop, open: openHop, close: closeHop } = useHop(['them-nhan-su']);
function created(who: { name: string; username: string }) {
  closeHop();
  say(`Đã thêm ${who.name} (${who.username})`);
  reload();
}

async function changeRole(acc?, value?) {
  try {
    await setAccountRole(acc, value);
    say(`Đã đổi vai trò của ${acc.name} thành ${value}`);
  } catch (e) {
    fail(e);
  }
  await reload();
  redraw.value++;
}
async function toggleLock(acc?) {
  const lock = acc.status !== 'locked';
  try {
    await setAccountLocked(acc, lock);
    say(lock ? `Đã khoá tài khoản ${acc.username}` : `Đã mở khoá tài khoản ${acc.username}`);
  } catch (e) {
    fail(e);
  }
  reload();
}
</script>

<template>
  <SettingsFrame active="phan-quyen">
    <template #sub>
      <template v-if="data">
        {{ data.summary.total }} tài khoản · {{ data.summary.admins }} Admin · {{ data.summary.locked }} đã khoá · mỗi
        người trong Nhân sự tự có tài khoản vai trò Nhân viên
      </template>
    </template>

    <PageLoadError v-if="error && !data" what="danh sách tài khoản" :error="error" @retry="reload" />
    <section v-if="data" class="card">
      <PermTabs active="tai-khoan" />
      <div class="tools" style="padding-top: 16px">
        <button
          v-for="c in data.chips"
          :key="c.key"
          type="button"
          class="chip"
          :class="{ on: role === c.key }"
          @click="role = c.key"
        >
          {{ c.label }} <small v-if="c.count != null">{{ c.count }}</small>
        </button>
        <label class="search" style="margin-left: auto; width: 170px">
          <Icon name="search" />
          <input v-model="q" type="text" placeholder="Tìm tên" aria-label="Tìm tên" />
        </label>
      </div>
      <table class="tbl tk">
        <colgroup>
          <col style="width: 260px" />
          <col style="width: 150px" />
          <col style="width: 150px" />
          <col style="width: 100px" />
          <col />
        </colgroup>
        <thead>
          <tr>
            <th>Người</th>
            <th>Tên đăng nhập</th>
            <th>Vai trò</th>
            <th>Trạng thái</th>
            <th style="text-align: right">
              <button type="button" class="btn sm" @click="openHop('them-nhan-su')"><Icon name="plus" />Tạo tài khoản</button>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="a in data.rows" :key="a.username">
            <td>
              <div class="who">
                <span class="av">{{ initials(a.name) }}</span>
                <div>
                  <div class="t">
                    {{ a.name }}
                    <span v-if="a.me" class="pill p-draft" style="margin-left: 6px; height: 20px">Bạn</span>
                  </div>
                  <div class="s">{{ a.sub }}</div>
                </div>
              </div>
            </td>
            <td class="u">{{ a.username }}</td>
            <td>
              <SelectBox
                :key="redraw"
                :model-value="a.role"
                :options="data.roles"
                :disabled="a.me"
                style="min-width: 120px"
                :label="`Vai trò của ${a.name}`"
                @update:model-value="changeRole(a, $event)"
              />
            </td>
            <td>
              <span v-if="a.status === 'locked'" class="pill p-draft">Đã khoá</span>
              <span v-else style="color: var(--muted)">Đang dùng</span>
            </td>
            <td style="text-align: right">
              <button type="button" class="tact" @click="resetting = a">Đặt lại mật khẩu</button>
              <template v-if="!a.me">
                <button v-if="a.status === 'locked'" type="button" class="tact" @click="toggleLock(a)">Mở khoá</button>
                <button v-else type="button" class="tact" style="color: var(--err-ink)" @click="toggleLock(a)">
                  Khoá
                </button>
              </template>
            </td>
          </tr>
        </tbody>
      </table>
      <div class="foot">
        <span>{{
          data.total ? `${data.from}–${data.to} trên ${data.total} tài khoản` : 'Không có tài khoản nào'
        }}</span>
        <span v-if="notice" :class="noticeErr ? 'er-note' : 'ok-note'">{{ notice }}</span>
        <span class="pager">
          <span>Trang {{ data.page }}/{{ data.pages }}</span>
          <button
            type="button"
            class="pb"
            aria-label="Trang trước"
            :disabled="data.page <= 1"
            @click="page = data.page - 1"
          >
            <Icon name="chevl" />
          </button>
          <button
            type="button"
            class="pb"
            aria-label="Trang sau"
            :disabled="data.page >= data.pages"
            @click="page = data.page + 1"
          >
            <Icon name="chevr" />
          </button>
        </span>
      </div>
    </section>
  </SettingsFrame>

  <ResetPasswordDialog
    v-if="resetting"
    :account="resetting"
    @close="resetting = null"
    @done="say(`Đã đặt lại mật khẩu cho ${resetting.username}`)"
  />
  <StaffFormDialog v-if="hop === 'them-nhan-su'" @close="closeHop" @saved="created" />
</template>

<style scoped>
.tk td {
  height: 56px;
}
.tk td.u {
  color: var(--muted);
  font-size: 13px;
}
.ok-note {
  color: var(--done-ink);
}
.er-note {
  color: var(--err-ink);
}
.pb:disabled {
  opacity: 0.45;
  cursor: default;
}
</style>
