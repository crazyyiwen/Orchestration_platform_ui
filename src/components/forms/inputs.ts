/**
 * Shared Tailwind class strings for form controls. Centralised so every
 * field looks the same and only one place needs to change to restyle.
 */

export const inputBase =
  "h-8 w-full rounded-md border border-ink-100 bg-white px-2 text-xs text-ink-900 outline-none placeholder:text-ink-500 focus:border-brand-500";

export const textareaBase =
  "w-full rounded-md border border-ink-100 bg-white px-2 py-1.5 text-xs leading-relaxed text-ink-900 outline-none placeholder:text-ink-500 focus:border-brand-500 resize-y";

export const codeBase =
  "w-full rounded-md border border-ink-100 bg-canvas px-2 py-1.5 font-mono text-[11px] leading-relaxed text-ink-900 outline-none focus:border-brand-500 resize-y";

export const selectBase = inputBase + " pr-6 appearance-none";

export const chipBase =
  "inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700 ring-1 ring-blue-100";

export const subtleButton =
  "inline-flex items-center gap-1 rounded-md border border-dashed border-ink-300 px-2 py-1 text-[11px] font-medium text-ink-700 hover:bg-ink-100/40";

export const iconButton =
  "flex h-6 w-6 items-center justify-center rounded text-ink-500 hover:bg-ink-100/60 hover:text-ink-900";
