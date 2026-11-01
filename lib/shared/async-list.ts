'use strict';
// Duyệt mảng với bước bất đồng bộ, TUẦN TỰ theo thứ tự phần tử (Array.prototype.filter/find/some/every/reduce/forEach không chờ
// Promise nên không dùng được khi bước kiểm gọi DB). Mọi hàm nhận fn(item, index) và trả Promise.
class AsyncList {
  static async filter(items?, fn?) {
    const out: any[] = [];
    for (let i = 0; i < items.length; i++) if (await fn(items[i], i)) out.push(items[i]);
    return out;
  }

  static async find(items?, fn?) {
    for (let i = 0; i < items.length; i++) if (await fn(items[i], i)) return items[i];
    return undefined;
  }

  static async some(items?, fn?) {
    for (let i = 0; i < items.length; i++) if (await fn(items[i], i)) return true;
    return false;
  }

  static async every(items?, fn?) {
    for (let i = 0; i < items.length; i++) if (!(await fn(items[i], i))) return false;
    return true;
  }

  static async forEach(items?, fn?) {
    for (let i = 0; i < items.length; i++) await fn(items[i], i);
  }

  static async map(items?, fn?) {
    const out: any[] = [];
    for (let i = 0; i < items.length; i++) out.push(await fn(items[i], i));
    return out;
  }

  static async flatMap(items?, fn?) {
    return (await AsyncList.map(items, fn)).flat();
  }

  static async reduce(items?, fn?, initial?) {
    let acc = initial;
    for (let i = 0; i < items.length; i++) acc = await fn(acc, items[i], i);
    return acc;
  }
}

export = { AsyncList };
