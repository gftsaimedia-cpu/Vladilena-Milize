export type HalfShift = 'FIRST' | 'SECOND';

export interface ClockRange {
  start: string;
  end: string;
}

export interface HalfPair {
  work: ClockRange;
  leave: ClockRange;
}

export interface Halves {
  FIRST: HalfPair;
  SECOND: HalfPair;
}

export const HALF_SHIFT_OWED_MINUTES = 240;

function parseMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function formatMinutes(min: number): string {
  const normalized = ((min % 1440) + 1440) % 1440;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function halvesOf(shift: ClockRange): Halves | null {
  const startMin = parseMinutes(shift.start);
  const endMin = parseMinutes(shift.end);
  let length = (endMin - startMin + 1440) % 1440;
  if (length === 0) length = 1440;

  if (length !== 540) {
    return null;
  }

  const firstWorkStart = startMin;
  const firstWorkEnd = (startMin + 240) % 1440;

  const secondWorkStart = (startMin + 300) % 1440;
  const secondWorkEnd = (startMin + 540) % 1440;

  return {
    FIRST: {
      work: {
        start: formatMinutes(firstWorkStart),
        end: formatMinutes(firstWorkEnd),
      },
      leave: {
        start: formatMinutes(secondWorkStart),
        end: formatMinutes(secondWorkEnd),
      },
    },
    SECOND: {
      work: {
        start: formatMinutes(secondWorkStart),
        end: formatMinutes(secondWorkEnd),
      },
      leave: {
        start: formatMinutes(firstWorkStart),
        end: formatMinutes(firstWorkEnd),
      },
    },
  };
}

export function leaveWindowOf(half: HalfShift, work: ClockRange): ClockRange {
  if (half === 'FIRST') {
    const endMin = parseMinutes(work.end);
    const leaveStart = (endMin + 60) % 1440;
    const leaveEnd = (leaveStart + 240) % 1440;
    return {
      start: formatMinutes(leaveStart),
      end: formatMinutes(leaveEnd),
    };
  }

  const startMin = parseMinutes(work.start);
  const leaveStart = ((startMin - 300) % 1440 + 1440) % 1440;
  const leaveEnd = ((startMin - 60) % 1440 + 1440) % 1440;
  return {
    start: formatMinutes(leaveStart),
    end: formatMinutes(leaveEnd),
  };
}

export interface DebtEvent {
  date: string;
  minutes: number;
}

export interface WorkPiece {
  date: string;
  start: string;
  minutes: number;
}

export interface PieceSplit {
  repaid: number;
  ot: number;
}

export function allocateHalfShiftDebt(
  events: readonly DebtEvent[],
  pieces: readonly WorkPiece[],
): PieceSplit[] {
  const indexedPieces = pieces.map((piece, index) => ({ piece, index }));
  indexedPieces.sort((a, b) => {
    if (a.piece.date !== b.piece.date) {
      return a.piece.date.localeCompare(b.piece.date);
    }
    if (a.piece.start !== b.piece.start) {
      return a.piece.start.localeCompare(b.piece.start);
    }
    return a.index - b.index;
  });

  let totalRepaid = 0;
  const results: PieceSplit[] = new Array(pieces.length);

  for (const { piece, index } of indexedPieces) {
    let debtUpToPiece = 0;
    for (const event of events) {
      if (event.date <= piece.date) {
        debtUpToPiece += event.minutes;
      }
    }
    const available = Math.max(0, debtUpToPiece - totalRepaid);
    const repaid = Math.min(available, piece.minutes);
    const ot = piece.minutes - repaid;
    totalRepaid += repaid;
    results[index] = { repaid, ot };
  }

  return results;
}
