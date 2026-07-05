/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        nature: {
          dark: '#1b3a1a',
          DEFAULT: '#2c5a2b',
          light: '#4d8a4c',
          earth: '#8b5a2b',
        }
      }
    },
  },
  plugins: [],
}
