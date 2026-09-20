import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0b0b0c",
        paper: "#ffffff",
        accent: "#f4e9ff",
        brand: {
          DEFAULT: "#1c4b4b",
          dark: "#123434",
          // Top bar and logo band: light enough that the dark H of the logo stays visible.
          bar: "#2a6363",
          light: "#e8f1f1",
        },
      },
    },
  },
  plugins: [],
} satisfies Config;
