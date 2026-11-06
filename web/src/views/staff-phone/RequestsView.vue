<script setup lang="ts">
// J4 · Yêu cầu của tôi (spec 7.1): h1 + nút "Tạo yêu cầu", thanh lọc trạng thái, danh sách nhóm theo tháng gửi (RequestList).
// Bấm dòng mở J5 theo ?yc=<id> (router.replace); id lạ thì bỏ khỏi URL, không mở gì (spec 3.8).
// Tab đang chọn chỉ nằm trong RequestList, không lên URL: đổi ?yc không tải lại danh sách và không dựng lại dòng.
// "Tạo yêu cầu" mở ?tao=chon (spec staff-requests 4.1): hộp trượt chứa NewRequestBody khi có ?tao=; đóng thì bỏ tao và ngay.
// Gửi xong thì tải lại danh sách: đơn mới ở đầu, Chờ duyệt. Huỷ đơn trong J5 xong thì đọc lại đơn (hộp ghi "Đã huỷ") và danh sách.
// Chỉ một hộp mở một lúc: có ?tao= thì luồng thắng, ?yc= bị bỏ khỏi URL và không mở J5.
import { nextTick, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { toast } from '@/components/shell/toast';
import { useLoad } from '@/composables/useLoad';
import { useStaffLive } from '@/composables/useStaffLive';
import { useRetry } from '@/composables/useRetry';
import type { RequestDetail } from '@/mock/staff-phone';
import { ApiError } from '@/services/http';
import { getRequest, getRequests } from '@/services/staff-phone';
import NewRequestBody from '@/views/staff-requests/NewRequestBody.vue';
import { TAO_MENU, useTaoParam, withoutFlow } from '@/views/staff-requests/useNewRequest';
import BottomSheet from './components/BottomSheet.vue';
import LoadError from './components/LoadError.vue';
import LoadingLine from './components/LoadingLine.vue';
import PhIcon from './components/PhIcon.vue';
import RequestList from './components/RequestList.vue';
import RequestSheet from './components/RequestSheet.vue';

const route = useRoute();
const router = useRouter();
// Tải lỗi thì hiện LoadError với nút Thử lại (không để lời hứa bị từ chối trôi ra ngoài); tải lại sau khi gửi / huỷ giữ danh sách cũ tới khi có bản mới.
const loader = useLoad(() => getRequests());
useStaffLive(loader.refresh, ['request.decided']);
const { data, error, loading } = loader;
const load = loader.reload;
const head = ref<HTMLElement | null>(null);
const { errBox, retry } = useRetry(loader, head);

const root = ref<HTMLElement | null>(null);
const tao = useTaoParam();

// Hộp J5: mở theo ?yc= (khi không có ?tao=). Kết quả của lần đọc cũ bị bỏ nếu ?yc đã đổi trong lúc chờ.
const detail = ref<RequestDetail | null>(null);
const dropYc = () => {
  const { yc: _yc, ...rest } = route.query;
  router.replace({ query: rest });
};
watch(
  [tao, () => route.query.yc],
  ([t, yc]) => {
    if (t && yc) dropYc();
  },
  { immediate: true }
);
watch(
  () => (tao.value ? undefined : route.query.yc),
  async yc => {
    if (!yc) {
      detail.value = null;
      return;
    }
    const id = String(yc);
    let found: RequestDetail | null;
    try {
      found = await getRequest(id);
    } catch (e) {
      // Mạng rớt / máy chủ lỗi lúc mở đơn: báo bằng thông báo, bỏ ?yc để mở lại được, không để lời hứa lỗi trôi ra ngoài.
      if (!tao.value && String(route.query.yc ?? '') === id) {
        toast.error(e instanceof ApiError && e.message ? e.message : 'Không mở được yêu cầu này, thử lại sau.');
        detail.value = null;
        dropYc();
      }
      return;
    }
    if (tao.value || String(route.query.yc ?? '') !== id) return;
    if (found) detail.value = found;
    else {
      detail.value = null;
      dropYc();
    }
  },
  { immediate: true }
);
// Hộp mở từ màn khác (J1) thì dòng mở hộp đã không còn để trả focus: đóng xong mà focus rơi xuống <body> thì đưa về dòng của yêu cầu đó.
async function closeSheet() {
  const id = detail.value?.id;
  detail.value = null;
  if (route.query.yc) dropYc();
  await nextTick();
  const a = document.activeElement;
  if (id && (!a || a === document.body)) root.value?.querySelector<HTMLElement>(`a.ro[data-yc="${id}"]`)?.focus();
}

// Huỷ đơn xong (hay server từ chối huỷ): đọc lại đơn đang mở và danh sách.
async function onRequestChanged(id: string) {
  load();
  try {
    const found = await getRequest(id);
    if (found && detail.value?.id === id) detail.value = found;
  } catch {
    /* đọc lại đơn lỗi: giữ hộp như cũ, danh sách phía sau đã có khối báo lỗi riêng */
  }
}

// Luồng Tạo yêu cầu: mở bằng push (nút Quay lại của máy đóng hộp), đóng bằng replace.
const flowTitle = ref('Tạo yêu cầu');
const openFlow = () => router.push({ query: { ...withoutFlow(route.query), tao: TAO_MENU } });
const closeFlow = () => router.replace({ query: withoutFlow(route.query) });
function onSent() {
  load();
  closeFlow();
}
</script>

<template>
  <div ref="root" class="ph rq">
    <header class="sh">
      <h1 ref="head" tabindex="-1">Yêu cầu</h1>
      <button type="button" class="rq-add" @click="openFlow">
        <PhIcon name="plus" :size="18" :stroke="2" />Tạo yêu cầu
      </button>
    </header>
    <LoadError v-if="error" ref="errBox" :error="error" @retry="retry" />
    <template v-else-if="data">
      <RequestList :view="data" tablist-label="Lọc theo trạng thái" replace />
    </template>
    <LoadingLine v-else-if="loading" />
    <RequestSheet v-if="detail" :request="detail" @close="closeSheet" @changed="onRequestChanged" />
    <BottomSheet v-if="tao" :title="flowTitle" bare @close="closeFlow">
      <NewRequestBody @title="flowTitle = $event" @close="closeFlow" @sent="onSent" />
    </BottomSheet>
  </div>
</template>

<style scoped>
.rq-add {
  height: 40px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 14px 0 10px;
  border-radius: 8px;
  border: 0;
  background: var(--surface-dark);
  color: #ffffff;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
</style>
