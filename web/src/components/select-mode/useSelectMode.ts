// Chế độ chọn (06/11): bảng không có ô chọn; bấm một thao tác áp cho nhiều người thì cột ô chọn và thanh đen mới hiện.
// `mode` là thao tác đang mở (null = không chọn). Chọn giữ theo id; số đếm và danh sách gửi đi chỉ tính các id đang hiện và
// chọn được, do màn truyền vào (`ids`). Huỷ hay chạy xong thì thoát chế độ và bỏ hết lựa chọn.
import { ref } from 'vue';

export type CheckState = 'true' | 'false' | 'mixed';

export function useSelectMode<M extends string = string>() {
  const mode = ref<M | null>(null);
  const picked = ref<Set<string>>(new Set());

  const enter = (m: M) => {
    mode.value = m;
    picked.value = new Set();
  };
  const quit = () => {
    mode.value = null;
    picked.value = new Set();
  };
  const toggle = (id: string) => {
    const next = new Set(picked.value);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    picked.value = next;
  };
  /** Ô ở đầu cột: chọn hết các id chọn được đang hiện, hoặc bỏ hết nếu đã chọn đủ. */
  const toggleAll = (ids: string[]) => {
    const next = new Set(picked.value);
    const all = ids.length > 0 && ids.every(id => next.has(id));
    for (const id of ids) {
      if (all) next.delete(id);
      else next.add(id);
    }
    picked.value = next;
  };
  const isPicked = (id: string) => picked.value.has(id);
  /** Các id trong `ids` đang được chọn, giữ thứ tự của `ids`. */
  const pickedIn = (ids: string[]) => ids.filter(id => picked.value.has(id));
  const stateOf = (ids: string[]): CheckState => {
    const n = pickedIn(ids).length;
    return n === 0 ? 'false' : n === ids.length ? 'true' : 'mixed';
  };

  return { mode, picked, enter, quit, toggle, toggleAll, isPicked, pickedIn, stateOf };
}
