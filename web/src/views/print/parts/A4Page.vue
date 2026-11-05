<script setup lang="ts">
// Khung một tờ A4 của phiếu lương: hình chìm, nội dung (slot), chân trang có khẩu hiệu và "Trang n/2".
import slogan from '@/assets/img/gft-slogan.png';
import watermark from '@/assets/img/gft-watermark.png';

defineProps<{ page: 1 | 2 }>();
</script>

<template>
  <section class="pl-a4" :aria-label="`Trang ${page}/2`">
    <img class="wm" :src="watermark" alt="" />
    <slot />
    <footer class="ft">
      <span></span>
      <img :src="slogan" width="158" height="20" alt="Trao trọn niềm tin, gửi trọn giải pháp." />
      <span class="pg">Trang {{ page }}/2</span>
    </footer>
  </section>
</template>

<style scoped>
.pl-a4 {
  width: 210mm;
  height: 296mm;
  box-sizing: border-box;
  padding: 40px 48px;
  position: relative;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #fff;
  color: #212121;
  font-family: Geist, system-ui, sans-serif;
  font-size: 12px;
  line-height: 16px;
  font-variant-numeric: tabular-nums;
  -webkit-font-smoothing: antialiased;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
/* hình chìm nằm dưới chữ: mọi phần tử còn lại (cả nội dung của slot) là positioned và vẽ sau nó */
.pl-a4 > :deep(:not(.wm)) {
  position: relative;
}
.wm {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 430px;
  transform: translate(-50%, -50%);
  pointer-events: none;
}
.ft {
  margin-top: auto;
  padding-top: 8px;
  border-top: 1px solid #bdbdbd;
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #616161;
}
.ft > span {
  width: 96px;
}
.ft > .pg {
  text-align: right;
}
.ft img {
  display: block;
  width: 158px;
  height: 20px;
}
</style>
