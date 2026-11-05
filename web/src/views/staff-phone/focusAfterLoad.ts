// Bấm "Thử lại" (hay "Quay về tháng…") thì nút biến mất ngay, vì useLoad xoá lỗi lúc bắt đầu tải; focus rơi xuống <body>.
// Gọi ngay sau khi bắt đầu tải lại: chờ tải xong rồi đưa focus về nút Thử lại mới của khối (còn lỗi) hay chỗ có data-load-focus
// (tải được; không có thì chính khối). Người dùng đã tự đi chỗ khác thì thôi. Không sửa useLoad vì màn Admin dùng chung.
//   function retry() { reload(); focusAfterLoad(root, loading); }
import { nextTick, watch, type Ref } from 'vue';

function idle(loading: Ref<boolean>): Promise<void> {
  if (!loading.value) return Promise.resolve();
  return new Promise(done => {
    const stop = watch(loading, busy => {
      if (busy) return;
      stop();
      done();
    });
  });
}

export async function focusAfterLoad(box: Ref<HTMLElement | null>, loading: Ref<boolean>) {
  await nextTick(); // đổi tháng thì watch của useLoad chỉ bắt đầu tải trong lượt cập nhật kế tiếp
  await idle(loading);
  await nextTick();
  const el = box.value;
  const active = document.activeElement;
  if (!el || (active && active !== document.body)) return;
  // Chỉ nút Thử lại của chính khối (LoadError là con trực tiếp), không lấy nhầm nút của khối con.
  const target =
    el.querySelector<HTMLElement>(':scope > .lerr [data-retry]') ?? el.querySelector<HTMLElement>('[data-load-focus]') ?? el;
  if (!target.matches('button, a, input, select, textarea, [tabindex]')) target.setAttribute('tabindex', '-1');
  target.focus();
}
