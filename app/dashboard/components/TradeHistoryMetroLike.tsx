"use client";
import React from "react";

export default function TradeHistoryMetroLike({ history }: { history: any[] }) {
  return (
    <div className="p-4 bg-black/20 rounded-xl border border-white/10">
      <h3 className="text-lg font-semibold mb-3">Trade History</h3>

      {history.length === 0 && (
        <p className="text-gray-400 text-sm">No trades yet.</p>
      )}

      {history.map((t, i) => (
        <div
          key={i}
          className="flex justify-between py-2 border-b border-white/5 text-sm"
        >
          <span>{t.symbol}</span>
          <span className="font-semibold">{t.profit >= 0 ? "Win" : "Loss"}</span>
          <span className={t.profit >= 0 ? "text-green-300" : "text-red-300"}>
            {t.profit}
          </span>
        </div>
      ))}
    </div>
  );
}