/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        surface:    '#F8FAFC',
        card:       '#FFFFFF',
        'border-light': '#E2E8F0',
        'border-mid':   '#CBD5E1',
        brand:      '#0F766E',
        'brand-50': '#F0FDFA',
        'brand-100':'#CCFBF1',
        'brand-600':'#0D9488',
        'brand-700':'#0F766E',
        'brand-800':'#115E59',
        ink:        '#0F172A',
        muted:      '#64748B',
        faint:      '#94A3B8',
        danger:     '#DC2626',
        'danger-50':'#FEF2F2',
        warning:    '#D97706',
        'warning-50':'#FFFBEB',
        success:    '#059669',
        'success-50':'#ECFDF5',
        indigo:     '#4F46E5',
        'indigo-50':'#EEF2FF',
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
      boxShadow: {
        card: '0 1px 3px 0 rgba(0,0,0,0.08), 0 1px 2px -1px rgba(0,0,0,0.06)',
        'card-md': '0 4px 6px -1px rgba(0,0,0,0.07), 0 2px 4px -2px rgba(0,0,0,0.05)',
      },
    },
  },
  plugins: [],
}
