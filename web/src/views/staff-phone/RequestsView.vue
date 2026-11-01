<script setup lang="ts">
// Yêu cầu: "Tôi muốn xin nghỉ hoặc khai OT, và đơn của tôi tới đâu rồi?" → hành động, đơn của tôi, phép năm.
// ?hop=xin-nghi | khai-ot | ngay-khac mở sẵn bảng "Khai ngày".
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import { toast } from '@/components/shell/toast';
import Icon from '@/components/ui/Icon.vue';
import { useLoad } from '@/composables/useLoad';
import { cancelDayRequest, getExplanations, getRequests } from '@/services/staff-phone';
import { dayLong, dm } from '@/utils/format';
import AdvanceSheet from './components/AdvanceSheet.vue';
import DayRequestSheet from './components/DayRequestSheet.vue';
import ExplanationSheet from './components/ExplanationSheet.vue';
import { useHop } from './useHop';

const route = useRoute();
const kb = computed(() => String(route.query.kb || 'mac-dinh'));
const { data, reload } = useLoad(
  () => getRequests(),
  () => kb.value
);
const { data: explanations, reload: reloadExplanations } = useLoad(() => getExplanations());
const answering = ref(null); // giải trình đang trả lời
const { hop, open, close } = useHop();

const ACTIONS = [
  {
    hop: 'xin-nghi',
    icon: 'cal',
    title: 'Xin nghỉ phép năm',
    hint: (left?) => (left === null ? '' : `Còn ${left} ngày phép`)
  },
  { hop: 'khai-ot', icon: 'clock', title: 'Khai OT hoặc làm bù', hint: () => 'Theo giờ, ngoài giờ ca' },
  {
    hop: 'ngay-khac',
    icon: 'edit',
    title: 'Khai một ngày khác',
    hint: () => 'Nghỉ không lương, nghỉ sẽ làm bù, nghỉ được duyệt'
  },
  { hop: 'tam-ung', icon: 'cash', title: 'Xin tạm ứng', hint: () => '' }
];

const monthNo = computed(() => Number(data.value.month.slice(5, 7)));
const pending = computed(() => data.value.items.filter(i => i.status === 'pend').length);
const preset = computed(() => data.value.presets[hop.value] || null);
const dateText = (item?) =>
  `${dayLong(item.date)}/${item.date.slice(0, 4)}${item.range ? ` · ${item.range}` : ''}${item.reason ? ` · Lý do: ${item.reason}` : ''}`;
const onSaved = () => reload();
// Huỷ yêu cầu đang chờ: bỏ khai báo ngày đó
async function cancel(item?) {
  try {
    await cancelDayRequest(item.date);
    await reload();
  } catch (e) {
    toast.error(e && e.message);
  }
}
</script>

<template>
  <div v-if="data" class="req">
    <header class="ph">
      <h1>Yêu cầu</h1>
      <p>Xin nghỉ, khai OT hoặc làm bù. Admin đồng ý rồi mới tính vào lương.</p>
    </header>
    <section class="sec card">
      <button v-for="a in ACTIONS" :key="a.hop" type="button" class="more" @click="open(a.hop)">
        <span class="l">
          <span class="ico"><Icon :name="a.icon" :size="18" /></span>
          <span
            >{{ a.title }}<small v-if="a.hint(data.leaveLeft)">{{ a.hint(data.leaveLeft) }}</small></span
          >
        </span>
        <span class="chev"><Icon name="chevr" :size="18" /></span>
      </button>
    </section>

    <section class="sec">
      <div v-if="pending" class="note pend-note">
        <Icon name="info" :size="16" />
        <span
          ><b>{{ pending }} yêu cầu chờ xử lý</b> chưa tính vào thu nhập. Khi Admin đồng ý, thu nhập sẽ thay đổi.</span
        >
      </div>
      <div class="h2">
        Yêu cầu của tôi
        <small
          >Tháng {{ monthNo }}<template v-if="pending"> · {{ pending }} chờ xử lý</template></small
        >
      </div>
      <div class="card">
        <div v-if="!data.items.length" class="empty">
          <span class="ico"><Icon name="inbox" :size="18" /></span>
          <div>
            <div class="t">Bạn chưa gửi yêu cầu nào trong tháng {{ monthNo }}</div>
            <div class="s">
              Đơn nghỉ, OT, làm bù bạn gửi sẽ hiện ở đây cùng trạng thái: Chờ xử lý, Đã đồng ý hoặc Đã từ chối.
            </div>
          </div>
        </div>
        <div v-for="i in data.items" :key="i.id" class="rq">
          <span class="dt"
            ><b>{{ i.date.slice(8, 10) }}</b
            >T{{ Number(i.date.slice(5, 7)) }}</span
          >
          <div>
            <div class="t">{{ i.title }}</div>
            <div class="s">{{ dateText(i) }}</div>
            <button v-if="i.canCancel" type="button" class="cancel" @click="cancel(i)">Huỷ yêu cầu</button>
          </div>
          <span class="pill" :class="'p-' + i.status">{{ i.statusLabel }}</span>
        </div>
      </div>
    </section>

    <section v-if="explanations && (explanations.absent.length || explanations.items.length)" class="sec">
      <div class="h2">Giải trình</div>
      <div class="card">
        <div v-for="x in explanations.absent" :key="x.id" class="rq ex">
          <span class="dt"
            ><b>{{ x.date.slice(8, 10) }}</b
            >T{{ Number(x.date.slice(5, 7)) }}</span
          >
          <div>
            <div class="t">{{ x.prompt }}</div>
            <button type="button" class="cancel" @click="answering = x">Giải trình</button>
          </div>
        </div>
        <div v-for="x in explanations.items" :key="x.id" class="rq ex">
          <span class="dt"
            ><b>{{ x.date.slice(8, 10) }}</b
            >T{{ Number(x.date.slice(5, 7)) }}</span
          >
          <div>
            <div class="t">{{ x.prompt }}</div>
            <div v-if="x.decisionNote" class="s">{{ x.decisionNote }}</div>
            <button v-if="x.canAnswer || x.canResubmit" type="button" class="cancel" @click="answering = x">
              {{ x.canAnswer ? 'Trả lời' : 'Giải trình lại' }}
            </button>
          </div>
          <span class="pill" :class="'p-' + x.status">{{ x.statusLabel }}</span>
        </div>
      </div>
    </section>

    <section v-if="data.balance" class="sec">
      <div class="h2">Phép năm</div>
      <div class="card">
        <div class="bal">
          <b>{{ data.balance.left }} <small>ngày còn lại</small></b>
        </div>
        <div class="kv">
          <span class="k">Được cộng</span><span class="v">{{ data.balance.granted }} ngày</span>
        </div>
        <div class="kv">
          <span class="k">Đã dùng</span><span class="v">{{ data.balance.used }} ngày</span>
        </div>
        <div class="kv">
          <span class="k asof">Tính đến {{ dm(data.asOf) }}/{{ data.asOf.slice(0, 4) }}</span>
        </div>
      </div>
    </section>

    <DayRequestSheet v-if="preset" :preset="preset" @close="close" @saved="onSaved" />
    <AdvanceSheet v-if="hop === 'tam-ung'" @close="close" />
    <ExplanationSheet v-if="answering" :item="answering" @close="answering = null" @saved="reloadExplanations" />
  </div>
</template>

<style scoped>
.ico {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: #f1f1f1;
  display: grid;
  place-items: center;
  flex: none;
}
.ph-app .more {
  min-height: 64px;
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
.empty {
  display: flex;
  gap: 12px;
  padding: 16px;
  align-items: flex-start;
}
.empty .t {
  font-weight: 600;
  font-size: 15px;
  line-height: 22px;
}
.empty .s {
  color: var(--muted);
  font-size: 14px;
  line-height: 20px;
  margin-top: 2px;
}
.bal {
  padding: 16px;
  display: flex;
  align-items: center;
  gap: 16px;
}
.bal b {
  font-size: 30px;
  line-height: 34px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.bal b small {
  font-size: 16px;
  font-weight: 500;
}
.asof {
  color: var(--muted);
  font-size: 14px;
}
.rq {
  display: grid;
  grid-template-columns: 48px 1fr auto;
  gap: 12px;
  align-items: center;
  padding: 12px 16px;
}
.rq + .rq {
  border-top: 1px solid var(--rule);
}
.rq .dt {
  width: 48px;
  height: 52px;
  border-radius: 12px;
  background: #f1f1f1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  color: var(--muted);
  line-height: 14px;
}
.rq .dt b {
  font-size: 18px;
  line-height: 22px;
  color: var(--text);
}
.rq .t {
  font-weight: 600;
  font-size: 15px;
}
.rq .cancel {
  margin-top: 4px;
  padding: 0;
  border: 0;
  background: none;
  font: inherit;
  font-size: 13px;
  color: var(--muted);
  text-decoration: underline;
  cursor: pointer;
}
.rq .s {
  color: var(--muted);
  font-size: 13px;
  line-height: 18px;
  margin-top: 2px;
}
.ph-app .pend-note {
  margin: 0 0 10px;
  background: var(--pend-bg);
  border-radius: 14px;
  color: #5e3407;
}
</style>
