/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#f7f8fb",
        ink: {
          900: "#0f172a",
          700: "#334155",
          500: "#64748b",
          300: "#cbd5e1",
          100: "#e2e8f0",
        },
        brand: {
          500: "#2563eb",
          600: "#1d4ed8",
        },
      },
      boxShadow: {
        node: "0 1px 2px rgba(15, 23, 42, 0.06), 0 1px 3px rgba(15, 23, 42, 0.04)",
        nodeSelected:
          "0 0 0 2px #2563eb, 0 4px 12px rgba(37, 99, 235, 0.15)",
        panel: "0 1px 2px rgba(15, 23, 42, 0.04)",
      },
    },
  },
  plugins: [],
};
