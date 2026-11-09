/** @type {import('tailwindcss').Config} */
const c = (n) => `rgb(var(--b${n}) / <alpha-value>)`;
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'], display: ['Inter', 'sans-serif'] },
      colors: { brand: { 50: c(50), 100: c(100), 200: c(200), 300: c(300), 400: c(400), 500: c(500), 600: c(600), 700: c(700), 800: c(800), 900: c(900) } },
      boxShadow: { glow: '0 0 0 1px rgb(var(--b500) / .35), 0 8px 24px -10px rgb(var(--b500) / .45)', soft: 'var(--sh2)' },
      keyframes: { in: { from: { opacity: 0, transform: 'translateY(4px)' }, to: { opacity: 1, transform: 'none' } }, slide: { from: { transform: 'translateX(20px)', opacity: 0 }, to: { transform: 'none', opacity: 1 } }, pop: { from: { opacity: 0, transform: 'scale(.97) translateY(-4px)' }, to: { opacity: 1, transform: 'none' } } },
      animation: { in: 'in .22s ease-out both', slide: 'slide .2s ease-out both', pop: 'pop .14s ease-out both' },
    },
  },
  plugins: [],
};
