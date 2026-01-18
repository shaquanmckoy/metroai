"use client";
import React from "react";

type StrategyRowProps = {
  title: string;
  description: string;
  active: boolean;
  onToggle: () => void;
};

export default function StrategyRow({
  title,
  description,
  active,
  onToggle,
}: StrategyRowProps) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div>
        <p className="font-medium text-white/90">{title}</p>
        <p className="text-xs text-gray-400">{description}</p>
      </div>

      <button
        onClick={onToggle}
        className={`
          w-12 h-6 rounded-full relative border transition
          ${active ? "bg-green-600/70 border-green-400" : "bg-white/10 border-white/15"}
        `}
      >
        <span
          className={`
            absolute top-0.5 w-5 h-5 bg-white rounded-full transition
            ${active ? "right-0.5" : "left-0.5"}
          `}
        />
      </button>
    </div>
  );
}