/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'brand-primary': '#4F46E5',
        'brand-secondary': '#10B981',
        'brand-accent': '#F59E0B',
        'brand-background': '#F9FAFB',
        'brand-surface': '#FFFFFF',
        'brand-text-primary': '#1F2937',
        'brand-text-secondary': '#6B7280',
      },
    },
  },
  plugins: [],
}
