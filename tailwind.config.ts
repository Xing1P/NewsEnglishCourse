import type { Config } from "tailwindcss";

export default {
  content: ["./src/renderer/index.html", "./src/renderer/src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#17202A",
        paper: "#F7F6F1",
        moss: "#536B4D",
        teal: "#1E7775",
        coral: "#C55F48",
        gold: "#B2842E"
      },
      boxShadow: {
        panel: "0 16px 50px rgba(23, 32, 42, 0.08)"
      }
    }
  },
  plugins: []
} satisfies Config;
