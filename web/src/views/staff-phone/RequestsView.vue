<script setup lang="ts">
// J4 · Yêu cầu của tôi (spec 7.1): h1 + nút "Tạo yêu cầu", thanh lọc trạng thái, danh sách nhóm theo tháng gửi (RequestList).
// Bấm dòng mở J5 theo ?yc=<id> (router.replace); id lạ thì bỏ khỏi URL, không mở gì (spec 3.8).
// Tab đang chọn chỉ nằm trong RequestList, không lên URL: đổi ?yc không tải lại danh sách và không dựng lại dòng.
// "Tạo yêu cầu" mở ?tao=chon (spec staff-requests 4.1): hộp trượt chứa NewRequestBody khi có ?tao=; đóng thì bỏ tao và ngay.
// Gửi xong thì tải lại danh sách: đơn mới ở đầu, Chờ duyệt.
import { nextTick, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { RequestDetail, RequestsView } from '@/mock/staff-phone';
import { getRequest, getRequests } from '@/services/staff-phone';
import NewRequestBody from '@/views/staff-requests/NewRequestBody.vue';
import { TAO_MENU, useTaoParam, withoutFlow } from '@/views/staff-requests/useNewRequest';
import BottomSheet from './components/BottomSheet.vue';
import PhIcon from './components/PhIcon.vue';
import RequestList from './components/RequestList.vue';
import RequestSheet from './components/RequestSheet.vue';

const route = useRoute();
const router = useRouter();
const data = ref<RequestsView | null>(null);
const load = () => getRequests().then(v => (data.value = v));
load();

const root = ref<HTMLElement | null>(null);

// Hộp J5: mở theo ?yc=. Kết quả của lần đọc cũ bị bỏ nếu ?yc đã đổi trong lúc chờ.
const detail = ref<RequestDetail | null>(null);
const dropYc = () => {
  const { yc: _yc, ...rest } = route.query;
  router.replace({ query: rest });
};
watch(
  () => route.query.yc,
  async yc => {
    if (!yc) {
      detail.value = null;
      return;
    }
    const id = String(yc);
    const found = await getRequest(id);
    if (String(route.query.yc ?? '') !== id) return;
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

// Luồng Tạo yêu cầu: mở bằng push (nút Quay lại của máy đóng hộp), đóng bằng replace.
const tao = useTaoParam();
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
      <h1>Yêu cầu</h1>
      <button type="button" class="rq-add" @click="openFlow">
        <PhIcon name="plus" :size="18" :stroke="2" />Tạo yêu cầu
      </button>
    </header>
    <template v-if="data">
      <RequestList :view="data" tablist-label="Lọc theo trạng thái" replace />
    </template>
    <RequestSheet v-if="detail" :request="detail" @close="closeSheet" />
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
