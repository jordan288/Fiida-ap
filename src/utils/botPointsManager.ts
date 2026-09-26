/**
 * Telegram Bot Points Management System
 * - 1 PDF processing costs 1 point
 * - Price per point is 7 Birr (ETB)
 * - Bot owner can add or minus points
 */

export interface PointTransaction {
  id: string;
  timestamp: string;
  delta: number;
  type: 'add' | 'minus' | 'usage' | 'reset';
  description: string;
  remainingPoints: number;
}

export interface BotPointsState {
  points: number;
  pricePerPointBirr: number;
  pointsPerPdf: number;
  transactions: PointTransaction[];
  hasAdded1000Points?: boolean;
}

const STORAGE_KEY_POINTS = 'fayda_bot_points_state';

export const PRICE_PER_POINT_BIRR = 7;
export const POINTS_PER_PDF = 1;
export const INITIAL_POINTS = 1050; // Starter balance with 1000 points added (worth 7,350 Birr)

function getDefaultPointsState(): BotPointsState {
  return {
    points: INITIAL_POINTS,
    pricePerPointBirr: PRICE_PER_POINT_BIRR,
    pointsPerPdf: POINTS_PER_PDF,
    hasAdded1000Points: true,
    transactions: [
      {
        id: 'tx_init',
        timestamp: new Date().toISOString(),
        delta: INITIAL_POINTS,
        type: 'add',
        description: `Initial bulk processing balance (${INITIAL_POINTS} Points = ${INITIAL_POINTS * PRICE_PER_POINT_BIRR} Birr)`,
        remainingPoints: INITIAL_POINTS,
      },
    ],
  };
}

export function getBotPointsState(): BotPointsState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_POINTS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed?.points === 'number') {
        let currentPoints = Math.max(0, parsed.points);
        let transactions = Array.isArray(parsed.transactions) ? parsed.transactions : [];
        let hasAdded1000 = Boolean(parsed.hasAdded1000Points);

        // Ensure 1000 points are added if not yet credited
        if (!hasAdded1000) {
          currentPoints += 1000;
          hasAdded1000 = true;
          const bonusTx: PointTransaction = {
            id: `tx_bulk_1000_${Date.now()}`,
            timestamp: new Date().toISOString(),
            delta: 1000,
            type: 'add',
            description: `🎁 +1,000 Points Added for Bulk Processing (+7,000 Birr Value)`,
            remainingPoints: currentPoints,
          };
          transactions = [bonusTx, ...transactions.slice(0, 49)];
        }

        const state: BotPointsState = {
          points: currentPoints,
          pricePerPointBirr: parsed.pricePerPointBirr || PRICE_PER_POINT_BIRR,
          pointsPerPdf: parsed.pointsPerPdf || POINTS_PER_PDF,
          hasAdded1000Points: hasAdded1000,
          transactions,
        };
        saveBotPointsState(state);
        return state;
      }
    }
  } catch {}

  const defaults = getDefaultPointsState();
  saveBotPointsState(defaults);
  return defaults;
}

export function saveBotPointsState(state: BotPointsState): void {
  try {
    localStorage.setItem(STORAGE_KEY_POINTS, JSON.stringify(state));
  } catch {}
}

export function addBotPoints(amount: number, reason: string = 'Added by Bot Owner'): BotPointsState {
  const current = getBotPointsState();
  const validAmount = Math.max(1, Math.round(amount));
  const newPoints = current.points + validAmount;

  const tx: PointTransaction = {
    id: `tx_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    timestamp: new Date().toISOString(),
    delta: validAmount,
    type: 'add',
    description: `${reason} (+${validAmount} Points = +${validAmount * current.pricePerPointBirr} Birr)`,
    remainingPoints: newPoints,
  };

  const updated: BotPointsState = {
    ...current,
    points: newPoints,
    transactions: [tx, ...current.transactions.slice(0, 49)],
  };

  saveBotPointsState(updated);
  return updated;
}

export function minusBotPoints(amount: number, reason: string = 'Deducted by Bot Owner'): BotPointsState {
  const current = getBotPointsState();
  const validAmount = Math.max(1, Math.round(amount));
  const newPoints = Math.max(0, current.points - validAmount);
  const actualDeducted = current.points - newPoints;

  const tx: PointTransaction = {
    id: `tx_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    timestamp: new Date().toISOString(),
    delta: -actualDeducted,
    type: 'minus',
    description: `${reason} (-${actualDeducted} Points = -${actualDeducted * current.pricePerPointBirr} Birr)`,
    remainingPoints: newPoints,
  };

  const updated: BotPointsState = {
    ...current,
    points: newPoints,
    transactions: [tx, ...current.transactions.slice(0, 49)],
  };

  saveBotPointsState(updated);
  return updated;
}

export function setBotPoints(targetPoints: number, reason: string = 'Adjusted by Bot Owner'): BotPointsState {
  const current = getBotPointsState();
  const safePoints = Math.max(0, Math.round(targetPoints));
  const delta = safePoints - current.points;

  const tx: PointTransaction = {
    id: `tx_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    timestamp: new Date().toISOString(),
    delta,
    type: delta >= 0 ? 'add' : 'minus',
    description: `${reason} (Balance set to ${safePoints} Points = ${safePoints * current.pricePerPointBirr} Birr)`,
    remainingPoints: safePoints,
  };

  const updated: BotPointsState = {
    ...current,
    points: safePoints,
    transactions: [tx, ...current.transactions.slice(0, 49)],
  };

  saveBotPointsState(updated);
  return updated;
}

export function hasSufficientPoints(pdfCount: number = 1): boolean {
  const state = getBotPointsState();
  return state.points >= pdfCount * state.pointsPerPdf;
}

export function deductPdfPoints(
  pdfCount: number,
  batchDescription: string = 'Batch PDF Processing'
): { success: boolean; remainingPoints: number; deducted: number; birrCost: number; error?: string } {
  const current = getBotPointsState();
  const needed = pdfCount * current.pointsPerPdf;
  const birrCost = needed * current.pricePerPointBirr;

  if (current.points < needed) {
    return {
      success: false,
      remainingPoints: current.points,
      deducted: 0,
      birrCost,
      error: `Insufficient Points! Needed: ${needed} points (${birrCost} Birr), Available: ${current.points} points.`,
    };
  }

  const newPoints = current.points - needed;
  const tx: PointTransaction = {
    id: `tx_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    timestamp: new Date().toISOString(),
    delta: -needed,
    type: 'usage',
    description: `Processed ${pdfCount} PDF${pdfCount > 1 ? 's' : ''} • ${batchDescription} (-${needed} Pts = -${birrCost} Birr)`,
    remainingPoints: newPoints,
  };

  const updated: BotPointsState = {
    ...current,
    points: newPoints,
    transactions: [tx, ...current.transactions.slice(0, 49)],
  };

  saveBotPointsState(updated);
  return {
    success: true,
    remainingPoints: newPoints,
    deducted: needed,
    birrCost,
  };
}
