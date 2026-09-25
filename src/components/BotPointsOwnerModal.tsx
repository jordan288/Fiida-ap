import React, { useState } from 'react';
import {
  Coins,
  Plus,
  Minus,
  X,
  History,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
} from 'lucide-react';
import {
  BotPointsState,
  addBotPoints,
  minusBotPoints,
  setBotPoints,
} from '../utils/botPointsManager';

interface BotPointsOwnerModalProps {
  isOpen: boolean;
  onClose: () => void;
  pointsState: BotPointsState;
  onPointsUpdated: (newState: BotPointsState) => void;
}

export const BotPointsOwnerModal: React.FC<BotPointsOwnerModalProps> = ({
  isOpen,
  onClose,
  pointsState,
  onPointsUpdated,
}) => {
  const [customAmount, setCustomAmount] = useState<string>('10');
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  if (!isOpen) return null;

  const currentPoints = pointsState.points;
  const birrValue = currentPoints * pointsState.pricePerPointBirr;

  const triggerFeedback = (msg: string) => {
    setActionFeedback(msg);
    setTimeout(() => setActionFeedback(null), 3500);
  };

  const handleAdd = (amount: number) => {
    const updated = addBotPoints(amount, 'Owner Point Recharge');
    onPointsUpdated(updated);
    triggerFeedback(`✅ Added +${amount} Points (+${amount * pointsState.pricePerPointBirr} Birr)`);
  };

  const handleMinus = (amount: number) => {
    const updated = minusBotPoints(amount, 'Owner Point Deduction');
    onPointsUpdated(updated);
    triggerFeedback(`🔻 Deducted -${amount} Points (-${amount * pointsState.pricePerPointBirr} Birr)`);
  };

  const handleCustomAdd = () => {
    const num = parseInt(customAmount, 10);
    if (isNaN(num) || num <= 0) return;
    handleAdd(num);
  };

  const handleCustomMinus = () => {
    const num = parseInt(customAmount, 10);
    if (isNaN(num) || num <= 0) return;
    handleMinus(num);
  };

  const handleCustomSet = () => {
    const num = parseInt(customAmount, 10);
    if (isNaN(num) || num < 0) return;
    const updated = setBotPoints(num, 'Owner Balance Set');
    onPointsUpdated(updated);
    triggerFeedback(`🔄 Points balance set to ${num} Points (${num * pointsState.pricePerPointBirr} Birr)`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-[#17212b] border border-slate-750 rounded-2xl w-full max-w-xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="p-4 border-b border-slate-800 bg-[#0e1621] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-yellow-300 p-0.5 shadow-md flex items-center justify-center">
              <div className="w-full h-full bg-slate-900 rounded-[10px] flex items-center justify-center">
                <Coins className="w-5 h-5 text-amber-400" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-white text-base">Bot Owner Points Manager</h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" />
                  OWNER ACCESS
                </span>
              </div>
              <p className="text-xs text-slate-400">
                1 PDF Processing = 1 Point • 1 Point = {pointsState.pricePerPointBirr} Birr
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Feedback banner */}
          {actionFeedback && (
            <div className="p-3 rounded-xl bg-emerald-950/80 border border-emerald-500/50 text-emerald-200 text-xs font-semibold flex items-center gap-2 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{actionFeedback}</span>
            </div>
          )}

          {/* Current Balance Display Card */}
          <div className="p-5 rounded-2xl bg-gradient-to-br from-amber-950/40 via-slate-900 to-[#17212b] border border-amber-500/30 shadow-lg">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <span className="text-xs uppercase tracking-wider text-amber-400 font-bold block mb-1">
                  Current Points Balance
                </span>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-extrabold text-white tracking-tight font-mono">
                    {currentPoints}
                  </span>
                  <span className="text-lg font-bold text-amber-400">Points</span>
                </div>
                <div className="mt-1 flex items-center gap-2 text-xs text-slate-300">
                  <span>Equivalent Value:</span>
                  <span className="font-bold text-emerald-400 font-mono text-sm">
                    {birrValue} Birr (ETB)
                  </span>
                </div>
              </div>

              <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-800 text-xs space-y-1 sm:text-right shrink-0">
                <div className="text-slate-400 text-[11px]">Official Rate:</div>
                <div className="font-bold text-white text-sm">1 PDF = 1 Point</div>
                <div className="text-emerald-400 font-semibold text-[11px]">
                  Price: {pointsState.pricePerPointBirr} Birr / Point
                </div>
              </div>
            </div>
          </div>

          {/* Quick Add / Minus Option Buttons */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-200 uppercase tracking-wide">
                Quick Point Recharges (+ Points)
              </span>
              <span className="text-[11px] text-amber-400 font-medium">Add to bot balance</span>
            </div>

            <div className="grid grid-cols-5 gap-2">
              {[1, 5, 10, 50, 100].map((amt) => (
                <button
                  key={`add_${amt}`}
                  onClick={() => handleAdd(amt)}
                  className="py-2.5 px-2 bg-emerald-600/20 hover:bg-emerald-600/30 active:scale-95 border border-emerald-500/40 rounded-xl text-center transition cursor-pointer group"
                >
                  <div className="text-xs font-bold text-emerald-300 flex items-center justify-center gap-0.5">
                    <Plus className="w-3 h-3 group-hover:scale-125 transition-transform" />
                    <span>{amt} Pt{amt > 1 ? 's' : ''}</span>
                  </div>
                  <div className="text-[10px] text-emerald-400/80 font-mono mt-0.5">
                    +{amt * pointsState.pricePerPointBirr} Birr
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-200 uppercase tracking-wide">
                Quick Point Deductions (- Points)
              </span>
              <span className="text-[11px] text-rose-400 font-medium">Minus from bot balance</span>
            </div>

            <div className="grid grid-cols-4 gap-2">
              {[1, 5, 10, 50].map((amt) => (
                <button
                  key={`minus_${amt}`}
                  onClick={() => handleMinus(amt)}
                  disabled={currentPoints === 0}
                  className="py-2.5 px-2 bg-rose-600/15 hover:bg-rose-600/25 active:scale-95 border border-rose-500/30 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl text-center transition cursor-pointer group"
                >
                  <div className="text-xs font-bold text-rose-300 flex items-center justify-center gap-0.5">
                    <Minus className="w-3 h-3 group-hover:scale-125 transition-transform" />
                    <span>{amt} Pt{amt > 1 ? 's' : ''}</span>
                  </div>
                  <div className="text-[10px] text-rose-400/80 font-mono mt-0.5">
                    -{amt * pointsState.pricePerPointBirr} Birr
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Custom Point Adjustment Area */}
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
            <span className="text-xs font-bold text-slate-200 block">
              Custom Amount Adjustments
            </span>

            <div className="flex flex-col sm:flex-row items-center gap-2">
              <div className="relative flex-1 w-full">
                <input
                  type="number"
                  min="0"
                  value={customAmount}
                  onChange={(e) => setCustomAmount(e.target.value)}
                  placeholder="Enter point amount..."
                  className="w-full bg-slate-800 border border-slate-700 text-white text-sm px-3.5 py-2 rounded-xl font-mono focus:border-amber-400 focus:outline-hidden"
                />
                <span className="absolute right-3 top-2.5 text-xs text-slate-400">
                  Pts ({parseInt(customAmount || '0', 10) * pointsState.pricePerPointBirr} Birr)
                </span>
              </div>

              <div className="flex items-center gap-1.5 w-full sm:w-auto">
                <button
                  onClick={handleCustomAdd}
                  className="flex-1 sm:flex-initial flex items-center justify-center gap-1 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition cursor-pointer shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add</span>
                </button>

                <button
                  onClick={handleCustomMinus}
                  disabled={currentPoints === 0}
                  className="flex-1 sm:flex-initial flex items-center justify-center gap-1 px-3.5 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white text-xs font-bold rounded-xl transition cursor-pointer shadow-xs"
                >
                  <Minus className="w-3.5 h-3.5" />
                  <span>Minus</span>
                </button>

                <button
                  onClick={handleCustomSet}
                  className="flex-1 sm:flex-initial flex items-center justify-center gap-1 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl border border-slate-700 transition cursor-pointer"
                  title="Directly set balance"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Set</span>
                </button>
              </div>
            </div>
          </div>

          {/* Pricing Policy Card */}
          <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 flex items-start gap-2.5 text-xs text-slate-300 leading-relaxed">
            <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <b className="text-white">Bot Pricing Rule:</b> Each Ethiopian Fayda PDF slip processed deducts exactly <b className="text-amber-300">1 point</b>. Points are sold at <b className="text-emerald-400">7 Birr each</b>. The owner can recharge user points or deduct adjustments at any time.
            </div>
          </div>

          {/* Recent Point Transaction History */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-300">
              <History className="w-3.5 h-3.5 text-amber-400" />
              <span>Point Transaction History ({pointsState.transactions.length})</span>
            </div>

            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {pointsState.transactions.map((tx) => (
                <div
                  key={tx.id}
                  className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between text-xs"
                >
                  <div className="space-y-0.5">
                    <div className="text-slate-200 font-medium">{tx.description}</div>
                    <div className="text-[10px] text-slate-500">
                      {new Date(tx.timestamp).toLocaleString()}
                    </div>
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    <span
                      className={`font-mono font-bold ${
                        tx.delta > 0
                          ? 'text-emerald-400'
                          : tx.delta < 0
                          ? 'text-rose-400'
                          : 'text-slate-400'
                      }`}
                    >
                      {tx.delta > 0 ? `+${tx.delta}` : tx.delta} Pts
                    </span>
                    <div className="text-[10px] text-slate-400">
                      Bal: {tx.remainingPoints}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-800 bg-[#0e1621] flex items-center justify-between">
          <div className="text-xs text-slate-400">
            Total Points: <b className="text-white font-mono">{currentPoints}</b> • Value:{' '}
            <b className="text-emerald-400 font-mono">{birrValue} Birr</b>
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-[#24A1DE] hover:bg-[#2090c7] text-white text-xs font-bold shadow transition cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
