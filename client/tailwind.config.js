/** Design tokens live in CSS variables (src/index.css); Tailwind just names them. */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ivory: { DEFAULT: 'rgb(var(--ivory) / <alpha-value>)', deep: 'rgb(var(--ivory-deep) / <alpha-value>)' },
        plum: { DEFAULT: 'rgb(var(--plum) / <alpha-value>)', soft: 'rgb(var(--plum-soft) / <alpha-value>)' },
        burgundy: { DEFAULT: 'rgb(var(--burgundy) / <alpha-value>)', dark: 'rgb(var(--burgundy-dark) / <alpha-value>)' },
        blush: { DEFAULT: 'rgb(var(--blush) / <alpha-value>)', soft: 'rgb(var(--blush-soft) / <alpha-value>)' },
        gold: { DEFAULT: 'rgb(var(--gold) / <alpha-value>)', ink: 'rgb(var(--gold-ink) / <alpha-value>)' },
        ink: { DEFAULT: 'rgb(var(--ink) / <alpha-value>)', soft: 'rgb(var(--ink-soft) / <alpha-value>)' },
        line: 'rgb(var(--line) / <alpha-value>)',
        ok: 'rgb(var(--ok) / <alpha-value>)',
        warn: 'rgb(var(--warn) / <alpha-value>)',
        danger: 'rgb(var(--danger) / <alpha-value>)',
      },
      fontFamily: {
        display: ['"Bodoni Moda Variable"', '"Noto Sans Ethiopic"', 'Georgia', 'serif'],
        sans: ['"Hanken Grotesk Variable"', '"Noto Sans Ethiopic"', 'system-ui', 'sans-serif'],
      },
      borderRadius: { arch: '9999px 9999px 1.25rem 1.25rem' },
      boxShadow: {
        soft: '0 1px 2px rgb(63 18 48 / 0.06), 0 8px 24px -12px rgb(63 18 48 / 0.18)',
        lift: '0 2px 4px rgb(63 18 48 / 0.08), 0 18px 40px -16px rgb(63 18 48 / 0.35)',
      },
      keyframes: {
        rise: { from: { opacity: '0', transform: 'translateY(14px)' }, to: { opacity: '1', transform: 'none' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
      },
      animation: { rise: 'rise .7s cubic-bezier(.2,.7,.2,1) both' },
    },
  },
  plugins: [],
};
