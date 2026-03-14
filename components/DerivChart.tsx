"use client";

type Props = { symbol: string };

function DerivChart({ symbol }: Props) {
  return (
    <iframe
      src={`https://charts.deriv.com/?symbol=${symbol}&theme=dark&toolbar=1`}
      className="w-full h-[520px] border-0 bg-black"
      style={{ width: "145%", height: "500px" }}
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowFullScreen
    />
  );
}

export default DerivChart;
export { DerivChart };