/**
 * Minimal client-side HTML sanitizer for the UI View node.
 *
 * Strips obvious attack vectors:
 *   - `<script>`, `<iframe>`, `<object>`, `<embed>` blocks (including content)
 *   - inline event handlers (`on*=...`)
 *   - `javascript:` URLs in `href` / `src`
 *
 * This is **demo-grade** — production code should pipe untrusted markup
 * through a real sanitizer like DOMPurify. UI View previews additionally
 * render inside a `sandbox=""` iframe so any leftover scripts can't execute.
 */
export function sanitizeHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, "")
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, "")
    .replace(/<embed\b[^>]*>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s(href|src|formaction)\s*=\s*"javascript:[^"]*"/gi, "")
    .replace(/\s(href|src|formaction)\s*=\s*'javascript:[^']*'/gi, "");
}
