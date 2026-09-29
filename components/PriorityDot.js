"use client";

// Priority shown as a coloured dot rather than a coloured-circle
// emoji. The emoji versions render at different sizes on every
// platform and sit awkwardly against text; a styled span lines up
// with the baseline and matches the rest of the interface.
const PRIORITY_COLOR = {
  urgent: "#DC2626",
  high: "#EA580C",
  normal: "#CA8A04",
  low: "#16A34A",
};

export default function PriorityDot({ priority, className = "" }) {
  const color = PRIORITY_COLOR[priority] || "#94A3B8";
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full align-middle flex-shrink-0 ${className}`}
      style={{ background: color }}
      aria-hidden="true"
    />
  );
}
