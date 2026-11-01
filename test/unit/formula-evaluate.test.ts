'use strict';
// Bộ tính và danh sách phụ thuộc của cây công thức: src/engine/formula.ts → Formula.evaluate, Formula.dependencies.
// evaluate không làm tròn giữa chừng, lỗi tính không âm thầm thành 0.
// Phần ca vàng nằm ở formula-golden.test.ts. Thiếu src/engine/formula.ts thì các test chạy như `todo`; RED=1 để xem đỏ.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const F = require('../helpers/formula-fixture');

const opts = F.READY();
const load = F.loadFormula;

test('evaluate không làm tròn giữa chừng: 1 ÷ 3 giữ đủ độ chính xác số thực, không thành số nguyên', opts, async () => {
  const Formula = await load();
  const out = F.evalText(Formula, 'khoản A = lương cơ bản ÷ ngày công chuẩn', {
    variables: { luongCoBan: 1, ngayCongChuan: 3 }
  });
  assert.equal(out, 1 / 3);
});

test('evaluate giữ nguyên sai số số thực như JavaScript (0,1 + 0,2): không tự làm tròn cho đẹp', opts, async () => {
  const Formula = await load();
  const out = F.evalText(Formula, 'khoản A = lương cơ bản + đi lại', { variables: { luongCoBan: 0.1, diLai: 0.2 } });
  assert.equal(out, 0.1 + 0.2);
});

test(
  'evaluate tiền nguyên đồng lớn vẫn chính xác: 15.000.000 × 0,25 và tổng hàng trăm triệu không lệch đồng nào',
  opts,
  async () => {
    const Formula = await load();
    assert.equal(
      F.evalText(Formula, 'khoản A = lương cơ bản × tỷ lệ chuyên cần', {
        variables: { luongCoBan: 15000000 },
        parameters: { tyLeChuyenCan: 0.25 }
      }),
      3750000
    );
    assert.equal(
      F.evalText(Formula, 'khoản A = lương cơ bản + tiền ngày công + đi lại', {
        variables: { luongCoBan: 123456789, tienNgayCong: 987654321, diLai: 1 }
      }),
      1111111111
    );
  }
);

test('Chia cho 0 lúc tính là lỗi có mã, không âm thầm bằng 0, vô cực hay NaN', opts, async () => {
  const Formula = await load();
  const { tree } = F.parseOk(Formula, 'khoản A = lương cơ bản ÷ ngày công chuẩn');
  const code = F.evalErrorCode(Formula, tree, F.makeCtx({ variables: { luongCoBan: 100, ngayCongChuan: 0 } }));
  assert.ok(code, 'phải là lỗi');
});

test('Thiếu giá trị biến trong ctx là lỗi có mã, không âm thầm bằng 0', opts, async () => {
  const Formula = await load();
  const { tree } = F.parseOk(Formula, 'khoản A = lương cơ bản + đi lại');
  const code = F.evalErrorCode(Formula, tree, F.makeCtx({ variables: { luongCoBan: 100 } }));
  assert.ok(code, 'thiếu diLai phải là lỗi');
});

test(
  'Giá trị biến không phải số hữu hạn (NaN, vô cực, chuỗi, null) là lỗi, không lan thành kết quả',
  opts,
  async () => {
    const Formula = await load();
    const { tree } = F.parseOk(Formula, 'khoản A = lương cơ bản + đi lại');
    for (const bad of [NaN, Infinity, -Infinity, '100', null, undefined, {}, []]) {
      const code = F.evalErrorCode(Formula, tree, F.makeCtx({ variables: { luongCoBan: 100, diLai: bad } }));
      assert.ok(code, `diLai=${String(bad)} phải là lỗi`);
    }
  }
);

test('Thiếu tham số hoặc thiếu cài đặt của hàm có sẵn trong ctx là lỗi có mã', opts, async () => {
  const Formula = await load();
  const withParam = F.parseOk(Formula, 'khoản A = lương cơ bản × tỷ lệ đi lại').tree;
  assert.ok(F.evalErrorCode(Formula, withParam, F.makeCtx({ variables: { luongCoBan: 100 } })), 'thiếu tham số');
  const withBuiltin = F.parseOk(Formula, 'khoản A = nếu giữ được chuyên cần thì lương cơ bản ngược lại 0').tree;
  assert.ok(F.evalErrorCode(Formula, withBuiltin, F.makeCtx({ variables: { luongCoBan: 100 } })), 'thiếu hàm có sẵn');
});

test('Hàm có sẵn trả giá trị không hợp lệ (NaN, chuỗi) là lỗi', opts, async () => {
  const Formula = await load();
  const { tree } = F.parseOk(Formula, 'khoản A = lương cơ bản + tiền OT');
  for (const bad of [NaN, Infinity, 'x', null, undefined]) {
    const code = F.evalErrorCode(
      Formula,
      tree,
      F.makeCtx({ variables: { luongCoBan: 1 }, builtins: { tienOt: () => bad } })
    );
    assert.ok(code, `tienOt trả ${String(bad)} phải là lỗi`);
  }
});

test('Hàm có sẵn được gọi theo khoá và nhận tham số của ctx; kết quả đi vào phép tính', opts, async () => {
  const Formula = await load();
  const seen: any[] = [];
  const out = F.evalText(Formula, 'khoản A = lương cơ bản + tiền OT', {
    variables: { luongCoBan: 10 },
    parameters: { tyLeDiLai: 0.15 },
    builtins: {
      tienOt: (args?, params?) => {
        seen.push([args, params]);
        return 5;
      }
    }
  });
  assert.equal(out, 15);
  assert.equal(seen.length, 1, 'gọi một lần cho một lần tính');
});

test('evaluate không sửa cây hay ctx và cho cùng kết quả qua nhiều lần gọi', opts, async () => {
  const Formula = await load();
  const { tree } = F.parseOk(Formula, 'khoản A = nhỏ nhất của (lương cơ bản ; đi lại) + tiền ngày công');
  const before = F.ser(Formula, tree);
  const variables = Object.freeze({ luongCoBan: 5, diLai: 9, tienNgayCong: 2 });
  const ctx = F.makeCtx({ variables });
  Object.freeze(ctx);
  const first = Formula.evaluate(tree, ctx);
  assert.equal(first, 7);
  for (let i = 0; i < 20; i++) assert.equal(Formula.evaluate(tree, ctx), first);
  assert.equal(F.ser(Formula, tree), before);
});

test('Nhánh không được chọn của "nếu" không được tính (nhánh sai chia cho 0 không gây lỗi)', opts, async () => {
  const Formula = await load();
  const text = 'khoản A = nếu giữ được chuyên cần thì lương cơ bản ngược lại lương cơ bản ÷ ngày công chuẩn';
  const out = F.evalText(Formula, text, {
    variables: { luongCoBan: 9, ngayCongChuan: 0 },
    builtins: { giuChuyenCan: () => true }
  });
  assert.equal(out, 9);
});

test('Công thức có tên được tính qua ctx.formulas (FormulaRef) và đệ quy không vòng', opts, async () => {
  const Formula = await load();
  const b = F.parseOk(Formula, 'khoản B = lương cơ bản + đi lại').tree;
  const a = F.parseOk(Formula, 'khoản A = khoản B + tiền ngày công').tree;
  const out = Formula.evaluate(
    a,
    F.makeCtx({ variables: { luongCoBan: 1, diLai: 2, tienNgayCong: 4 }, formulas: { khoanB: b } })
  );
  assert.equal(out, 7);
});

test(
  'Công thức tham chiếu vòng bị chặn lúc tính (không treo, không tràn ngăn xếp): ném hoặc trả lỗi có mã',
  opts,
  async () => {
    const Formula = await load();
    const a = F.parseOk(Formula, 'khoản A = khoản B + lương cơ bản').tree;
    const b = F.parseOk(Formula, 'khoản B = khoản A + đi lại').tree;
    const code = F.evalErrorCode(
      Formula,
      a,
      F.makeCtx({ variables: { luongCoBan: 1, diLai: 1 }, formulas: { khoanA: a, khoanB: b } })
    );
    assert.ok(code, 'vòng phải là lỗi, không phải số');
  }
);

// ---------- dependencies ----------

test('dependencies: không trùng, gồm biến, tham số, hàm có sẵn, công thức khác; không gồm vế trái', opts, async () => {
  const Formula = await load();
  const { tree } = F.parseOk(
    Formula,
    'khoản A = lương cơ bản + lương cơ bản × tỷ lệ đi lại + (nếu giữ được chuyên cần thì khoản B ngược lại 0)'
  );
  const deps = Formula.dependencies(tree);
  assert.deepEqual([...deps].sort(), ['giuChuyenCan', 'khoanB', 'luongCoBan', 'tyLeDiLai']);
  assert.equal(new Set<any>(deps).size, deps.length, 'không được trùng');
});

test('dependencies của số 0 và 1 viết thẳng là rỗng; của điều kiện gồm cả vị từ', opts, async () => {
  const Formula = await load();
  assert.deepEqual([...Formula.dependencies(F.parseOk(Formula, 'khoản A = 0 + 1').tree)], []);
  const cond = F.parseOk(Formula, 'khoản A = nếu không ở iDorm thì 0 ngược lại 1').tree;
  assert.deepEqual([...Formula.dependencies(cond)], ['idorm']);
});

test('dependencies xác định thứ tự và không đổi sau serialize/deserialize', opts, async () => {
  const Formula = await load();
  const { tree } = F.parseOk(Formula, 'tổng thu nhập = tiền ngày công + đi lại + chuyên cần + lương KPI');
  const a = [...Formula.dependencies(tree)];
  assert.deepEqual([...Formula.dependencies(Formula.deserialize(Formula.serialize(tree)))], a);
  assert.deepEqual([...Formula.dependencies(tree)], a);
});
