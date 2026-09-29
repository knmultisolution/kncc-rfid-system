import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#fffaeb",
          100: "#fdf0c8",
          200: "#fbe08d",
          300: "#f9cb51",
          400: "#f7b429",
          500: "#faa419",
          600: "#d4770a",
          700: "#b0570c",
          800: "#8f4410",
          900: "#763a11",
          950: "#431d06",
        },
        gold: {
          50: "#fffaeb",
          100: "#fdf0c8",
          200: "#fbe08d",
          300: "#f9cb51",
          400: "#f7b429",
          500: "#faa419",
          600: "#d4770a",
          700: "#b0570c",
          800: "#8f4410",
          900: "#763a11",
          950: "#431d06",
        },
        navy: {
          50: "#fdf6ec",
          100: "#f8e7c8",
          200: "#efc98a",
          300: "#e2a94e",
          400: "#c98a2e",
          500: "#a66f1f",
          600: "#7d5417",
          700: "#5c3d10",
          800: "#3d270a",
          900: "#241705",
          950: "#140d03",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(0 0 0 / 0.04), 0 1px 3px 0 rgb(0 0 0 / 0.06)",
      },
    },
  },
  plugins: [],
};
export default config;
