/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Phones in landscape: wide enough for sm/lg, but very little height
      screens: { short: { raw: '(max-height: 500px)' } },
    },
  },
  plugins: [],
}
