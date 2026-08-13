/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ["Plus Jakarta Sans", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        brand: {
          50: "#eef4ff",
          100: "#d7e4ff",
          200: "#b3ccff",
          300: "#7aa8ff",
          400: "#3d8bff",
          500: "#1d6bff",
          600: "#1554e8",
          700: "#1e3a8a",
          800: "#12275e",
          900: "#081b4b",
          950: "#050814",
        },
      },
      boxShadow: {
        card: "0 1px 2px rgba(8, 27, 75, 0.08), 0 12px 32px rgba(8, 27, 75, 0.12)",
      },
    },
  },
  plugins: [],
};
