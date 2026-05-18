/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        accent: {
          DEFAULT: "#3b82f6",
          hover: "#2563eb",
          subtle: "#eff6ff",
        },
        dark: {
          bg: 'rgb(var(--dark-bg) / <alpha-value>)',
          surface: 'rgb(var(--dark-surface) / <alpha-value>)',
          border: 'rgb(var(--dark-border) / <alpha-value>)',
          text: 'rgb(var(--dark-text) / <alpha-value>)',
          muted: 'rgb(var(--dark-muted) / <alpha-value>)',
        },
      },
    },
  },
  plugins: [],
};
