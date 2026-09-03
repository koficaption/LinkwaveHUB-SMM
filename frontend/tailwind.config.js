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
          50: "#E5F2EF",
          100: "#D4EBE6",
          200: "#B3D9D0",
          300: "#7EBFB3",
          400: "#3FA090",
          500: "#177F70",
          600: "#087F68",
          700: "#0A806A",
          800: "#066352",
          900: "#044A3D",
          950: "#02332B",
        },
        muted: {
          DEFAULT: "#667085",
        },
      },
      boxShadow: {
        card: "0 1px 2px rgba(8, 127, 104, 0.06), 0 10px 28px rgba(15, 23, 42, 0.06)",
        nav: "0 1px 0 rgba(15, 23, 42, 0.04), 0 8px 20px rgba(15, 23, 42, 0.04)",
        fab: "0 8px 20px rgba(8, 127, 104, 0.28)",
      },
      maxWidth: {
        dashboard: "1280px",
      },
    },
  },
  plugins: [],
};
