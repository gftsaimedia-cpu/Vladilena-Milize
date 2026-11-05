// Thử lại / Quay về của một khối tải dữ liệu ở app nhân viên. Bấm nút thì LoadError (cùng nút đang có focus) biến mất ngay,
// focus rơi xuống <body>; after(start) chờ lượt tải xong rồi mới đặt focus: còn lỗi thì vào nút Thử lại mới (errBox), tải được
// thì vào tiêu đề của khối (head, cần tabindex="-1"). Chỉ chuyển khi focus vẫn ở <body> (người dùng chưa đi chỗ khác).
//   const load = useLoad(() => getX(month.value), () => month.value);
//   const head = ref(null); const { errBox, retry, after } = useRetry(load, head);
//   <LoadError v-if="error" ref="errBox" :error="error" @retry="retry" />  …  <h1 ref="head" tabindex="-1">…</h1>
import { nextTick, ref, watch, type Ref } from 'vue';

type Focusable = { focus(): void };
type Load = { loading: Ref<boolean>; error: Ref<unknown>; reload: () => Promise<unknown> };

export function useRetry(load: Load, head: Ref<Focusable | null>) {
  const errBox = ref<Focusable | null>(null);

  // start: việc làm khối tải lại (reload(), hay đổi tháng để useLoad tự tải).
  async function after(start: () => unknown) {
    start();
    await nextTick();
    if (load.loading.value) {
      await new Promise<void>(done => {
        const stop = watch(load.loading, busy => {
          if (busy) return;
          stop();
          done();
        });
      });
    }
    await nextTick();
    const active = document.activeElement;
    if (active && active !== document.body) return;
    (load.error.value ? errBox.value : head.value)?.focus();
  }

  return { errBox, retry: () => after(load.reload), after };
}

// Nút "Quay về tháng 10/2026" của LoadError: chỉ có khi lỗi xảy ra lúc đổi tháng, tức còn dữ liệu của một tháng khác tháng
// đang xin (asked). Lần tải đầu lỗi (chưa có dữ liệu) hay tải lại chính tháng đang xem thì không có (null).
export function backTo(view: { month: string; label: string } | null, asked: string | null) {
  if (!view || !asked || view.month === asked) return null;
  return { month: view.month, text: `Quay về ${view.label.charAt(0).toLowerCase()}${view.label.slice(1)}` };
}
