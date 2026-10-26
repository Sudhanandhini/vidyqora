/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#062a52',
          50: '#eef3f9',
          100: '#d9e3ef',
          200: '#b0c4dc',
          300: '#7f9dc2',
          400: '#4a72a3',
          500: '#22507f',
          600: '#103d6b',
          700: '#062a52',
          800: '#052242',
          900: '#03162c',
        },
        sand: {
          DEFAULT: '#d9c39b',
          50: '#fbf8f2',
          100: '#f4ecdd',
          200: '#e9dcc2',
          300: '#d9c39b',
          400: '#c7aa76',
          500: '#a88b56',
          600: '#866c40',
        },
        ink: { DEFAULT: '#1d2635', soft: '#4a5568', faint: '#8792a2' },
        canvas: '#f3f5f8',
      },
      fontFamily: {
        sans: ['"Public Sans"', 'system-ui', 'sans-serif'],
        serif: ['"Source Serif 4"', 'Georgia', 'serif'],
      },
      boxShadow: { panel: '0 1px 2px rgba(6,42,82,.06), 0 0 0 1px rgba(6,42,82,.06)' },
    },
  },
  plugins: [],
};
