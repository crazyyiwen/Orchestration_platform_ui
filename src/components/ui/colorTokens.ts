/**
 * Map registry NodeColor values to Tailwind classes used by the icon block on
 * each node card and the palette badge. Tailwind needs literal class names at
 * build time, so we keep the mapping in a single object that is statically
 * analyzable.
 */

import type { NodeColor } from "@/workflow/types";

export const ICON_BG: Record<NodeColor, string> = {
  purple: "bg-purple-100 text-purple-600",
  indigo: "bg-indigo-100 text-indigo-600",
  blue: "bg-blue-100 text-blue-600",
  sky: "bg-sky-100 text-sky-600",
  teal: "bg-teal-100 text-teal-600",
  emerald: "bg-emerald-100 text-emerald-600",
  amber: "bg-amber-100 text-amber-600",
  orange: "bg-orange-100 text-orange-600",
  rose: "bg-rose-100 text-rose-600",
  pink: "bg-pink-100 text-pink-600",
  slate: "bg-slate-100 text-slate-600",
};

export const ICON_BG_LARGE: Record<NodeColor, string> = {
  purple: "bg-purple-50 text-purple-600 ring-1 ring-purple-100",
  indigo: "bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100",
  blue: "bg-blue-50 text-blue-600 ring-1 ring-blue-100",
  sky: "bg-sky-50 text-sky-600 ring-1 ring-sky-100",
  teal: "bg-teal-50 text-teal-600 ring-1 ring-teal-100",
  emerald: "bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100",
  amber: "bg-amber-50 text-amber-600 ring-1 ring-amber-100",
  orange: "bg-orange-50 text-orange-600 ring-1 ring-orange-100",
  rose: "bg-rose-50 text-rose-600 ring-1 ring-rose-100",
  pink: "bg-pink-50 text-pink-600 ring-1 ring-pink-100",
  slate: "bg-slate-50 text-slate-600 ring-1 ring-slate-100",
};

/** Hex equivalents used in non-CSS surfaces — the MiniMap renders nodes as
 *  raw `<rect>` elements and needs literal colors, not Tailwind classes. */
export const MINIMAP_COLORS: Record<NodeColor, string> = {
  purple: "#a78bfa",
  indigo: "#818cf8",
  blue: "#60a5fa",
  sky: "#38bdf8",
  teal: "#2dd4bf",
  emerald: "#34d399",
  amber: "#fbbf24",
  orange: "#fb923c",
  rose: "#fb7185",
  pink: "#f472b6",
  slate: "#94a3b8",
};
