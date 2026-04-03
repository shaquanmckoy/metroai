"use client";

type Props = { symbol: string };

function DerivChart({ symbol }: Props) {
  return (
    <iframe
      title={`Deriv chart ${symbol}`}
      src={`https://charts.deriv.com/deriv.html?symbol=${encodeURIComponent(symbol)}&theme=dark&toolbar=1`}
      className="h-[500px] w-full rounded-lg border-0 bg-black"
      loading="lazy"
      referrerPolicy="no-referrer"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowFullScreen
    />
  );
}

export default DerivChart;