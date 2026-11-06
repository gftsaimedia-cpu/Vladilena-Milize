import test from 'node:test';
import assert from 'node:assert/strict';
import {
  allocateHalfShiftDebt,
  DebtEvent,
  WorkPiece,
  PieceSplit,
} from '../../src/common/half-shift.js';

test('Task 9: allocateHalfShiftDebt (hàm thuần phân bổ nợ nghỉ giữa ca)', async (t) => {
  await t.test('nợ 240 ngày 12/11; piece 13/11 18:00 240 phút → [{repaid: 240, ot: 0}]', () => {
    const events: DebtEvent[] = [{ date: '2026-11-12', minutes: 240 }];
    const pieces: WorkPiece[] = [{ date: '2026-11-13', start: '18:00', minutes: 240 }];
    const result = allocateHalfShiftDebt(events, pieces);
    assert.deepStrictEqual(result, [{ repaid: 240, ot: 0 }]);
  });

  await t.test('nợ 240 (12/11); 13/11 18:00 180 và 16/11 18:00 180 → [{repaid: 180, ot: 0}, {repaid: 60, ot: 120}]', () => {
    const events: DebtEvent[] = [{ date: '2026-11-12', minutes: 240 }];
    const pieces: WorkPiece[] = [
      { date: '2026-11-13', start: '18:00', minutes: 180 },
      { date: '2026-11-16', start: '18:00', minutes: 180 },
    ];
    const result = allocateHalfShiftDebt(events, pieces);
    assert.deepStrictEqual(result, [
      { repaid: 180, ot: 0 },
      { repaid: 60, ot: 120 },
    ]);
  });

  await t.test('chỉ piece 16/11 180 → [{repaid: 180, ot: 0}] (60 nợ còn lại không ở trong kết quả: người gọi tự trừ)', () => {
    const events: DebtEvent[] = [{ date: '2026-11-12', minutes: 240 }];
    const pieces: WorkPiece[] = [{ date: '2026-11-16', start: '18:00', minutes: 180 }];
    const result = allocateHalfShiftDebt(events, pieces);
    assert.deepStrictEqual(result, [{ repaid: 180, ot: 0 }]);
  });

  await t.test('piece 10/11 120 (trước ngày nợ) → [{repaid: 0, ot: 120}]', () => {
    const events: DebtEvent[] = [{ date: '2026-11-12', minutes: 240 }];
    const pieces: WorkPiece[] = [{ date: '2026-11-10', start: '18:00', minutes: 120 }];
    const result = allocateHalfShiftDebt(events, pieces);
    assert.deepStrictEqual(result, [{ repaid: 0, ot: 120 }]);
  });

  await t.test('piece cùng ngày 12/11 (sau ca 18:00 hoặc trước ca 06:00) đều trả nợ theo luật so ngày (Review Focus 1)', () => {
    const events: DebtEvent[] = [{ date: '2026-11-12', minutes: 240 }];
    // Cùng ngày sau ca
    const pieceAfter: WorkPiece[] = [{ date: '2026-11-12', start: '18:00', minutes: 120 }];
    assert.deepStrictEqual(allocateHalfShiftDebt(events, pieceAfter), [{ repaid: 120, ot: 0 }]);

    // Cùng ngày trước ca: spec mục 8 so ngày (date <= piece.date) nên khung trước ca vẫn trả nợ
    const pieceBefore: WorkPiece[] = [{ date: '2026-11-12', start: '06:00', minutes: 120 }];
    assert.deepStrictEqual(allocateHalfShiftDebt(events, pieceBefore), [{ repaid: 120, ot: 0 }]);
  });

  await t.test('hai nợ 12/11 và 13/11 (480 phút); piece 14/11 300 → {300, 0}; piece 17/11 240 → {180, 60}', () => {
    const events: DebtEvent[] = [
      { date: '2026-11-12', minutes: 240 },
      { date: '2026-11-13', minutes: 240 },
    ];
    const pieces: WorkPiece[] = [
      { date: '2026-11-14', start: '18:00', minutes: 300 },
      { date: '2026-11-17', start: '18:00', minutes: 240 },
    ];
    const result = allocateHalfShiftDebt(events, pieces);
    assert.deepStrictEqual(result, [
      { repaid: 300, ot: 0 },
      { repaid: 180, ot: 60 },
    ]);
  });

  await t.test('piece đưa vào lộn thứ tự (16/11 trước 13/11) → kết quả theo thứ tự đầu vào nhưng nợ trừ theo thứ tự ngày', () => {
    const events: DebtEvent[] = [{ date: '2026-11-12', minutes: 240 }];
    const pieces: WorkPiece[] = [
      { date: '2026-11-16', start: '18:00', minutes: 180 },
      { date: '2026-11-13', start: '18:00', minutes: 180 },
    ];
    const result = allocateHalfShiftDebt(events, pieces);
    // 13/11 diễn ra trước nên nhận 180 repaid đầu tiên (nợ còn 60)
    // 16/11 diễn ra sau nên nhận 60 repaid còn lại và 120 ot
    // Kết quả trả về theo đúng thứ tự mảng pieces: [piece 16/11, piece 13/11]
    assert.deepStrictEqual(result, [
      { repaid: 60, ot: 120 },
      { repaid: 180, ot: 0 },
    ]);
  });

  await t.test('hai piece cùng ngày, start khác nhau: piece có start sớm hơn trả nợ trước', () => {
    const events: DebtEvent[] = [{ date: '2026-11-12', minutes: 100 }];
    const pieces: WorkPiece[] = [
      { date: '2026-11-13', start: '20:00', minutes: 80 },
      { date: '2026-11-13', start: '18:00', minutes: 80 },
    ];
    const result = allocateHalfShiftDebt(events, pieces);
    // 18:00 sớm hơn 20:00 nên 18:00 trả 80 phút trước (nợ còn 20)
    // 20:00 trả 20 phút nợ còn lại, 60 phút thành ot
    // Kết quả theo thứ tự đầu vào: [piece 20:00, piece 18:00]
    assert.deepStrictEqual(result, [
      { repaid: 20, ot: 60 },
      { repaid: 80, ot: 0 },
    ]);
  });

  await t.test('piece 0 phút → {repaid: 0, ot: 0}; không có nợ → mọi piece ot = minutes', () => {
    const events: DebtEvent[] = [{ date: '2026-11-12', minutes: 240 }];
    const pieceZero: WorkPiece[] = [{ date: '2026-11-13', start: '18:00', minutes: 0 }];
    assert.deepStrictEqual(allocateHalfShiftDebt(events, pieceZero), [{ repaid: 0, ot: 0 }]);

    const noEvents: DebtEvent[] = [];
    const regularPieces: WorkPiece[] = [
      { date: '2026-11-13', start: '18:00', minutes: 180 },
      { date: '2026-11-14', start: '18:00', minutes: 120 },
    ];
    assert.deepStrictEqual(allocateHalfShiftDebt(noEvents, regularPieces), [
      { repaid: 0, ot: 180 },
      { repaid: 0, ot: 120 },
    ]);
  });

  await t.test('bảo toàn bất biến: repaid + ot === minutes, repaid >= 0', () => {
    const events: DebtEvent[] = [
      { date: '2026-11-05', minutes: 240 },
      { date: '2026-11-12', minutes: 240 },
    ];
    const pieces: WorkPiece[] = [
      { date: '2026-11-04', start: '18:00', minutes: 120 },
      { date: '2026-11-05', start: '19:00', minutes: 150 },
      { date: '2026-11-10', start: '18:00', minutes: 180 },
      { date: '2026-11-15', start: '18:00', minutes: 200 },
    ];
    const result = allocateHalfShiftDebt(events, pieces);
    assert.strictEqual(result.length, pieces.length);
    for (let i = 0; i < pieces.length; i++) {
      assert(result[i].repaid >= 0);
      assert(result[i].ot >= 0);
      assert.strictEqual(result[i].repaid + result[i].ot, pieces[i].minutes);
    }
  });
});
