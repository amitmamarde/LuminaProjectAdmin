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
        'positive': {
          base: '#E8F5E9',      // soft green-mint
          accent: '#43A047',     // medium green
          text: '#1B5E20',       // deep green
        },
        'research': {
          base: '#E3F2FD',      // soft sky blue
          accent: '#1976D2',     // vivid but not harsh blue
          text: '#0D47A1',       // deep navy blue
        },
        'misinformation': {
          base: '#FFF3E0',      // soft amber-peach
          accent: '#FB8C00',     // moderate orange
          text: '#E65100',       // deep orange-brown
        },
        'trending': {
          base: '#F5F5F5',      // light gray (for General Quality News)
          accent: '#616161',     // medium gray
          text: '#212121',       // rich black/charcoal
        },
      },
      typography: ({ theme }) => ({
        'green-lumina': {
          css: {
            '--tw-prose-body': theme('colors.positive.text'),
            '--tw-prose-headings': theme('colors.positive.text'),
            '--tw-prose-links': theme('colors.positive.accent'),
            '--tw-prose-bold': theme('colors.positive.text'),
            '--tw-prose-bullets': theme('colors.positive.accent'),
            '--tw-prose-quote-borders': theme('colors.positive.accent'),
            '--tw-prose-captions': theme('colors.positive.text'),
          },
        },
        'blue-lumina': {
          css: {
            '--tw-prose-body': theme('colors.research.text'),
            '--tw-prose-headings': theme('colors.research.text'),
            '--tw-prose-links': theme('colors.research.accent'),
            '--tw-prose-bold': theme('colors.research.text'),
            '--tw-prose-bullets': theme('colors.research.accent'),
            '--tw-prose-quote-borders': theme('colors.research.accent'),
            '--tw-prose-captions': theme('colors.research.text'),
          },
        },
        'orange-lumina': {
          css: {
            '--tw-prose-body': theme('colors.misinformation.text'),
            '--tw-prose-headings': theme('colors.misinformation.text'),
            '--tw-prose-links': theme('colors.misinformation.accent'),
            '--tw-prose-bold': theme('colors.misinformation.text'),
            '--tw-prose-bullets': theme('colors.misinformation.accent'),
            '--tw-prose-quote-borders': theme('colors.misinformation.accent'),
            '--tw-prose-captions': theme('colors.misinformation.text'),
          },
        },
        'gray-lumina': {
          css: {
            '--tw-prose-body': theme('colors.trending.text'),
            '--tw-prose-headings': theme('colors.trending.text'),
            '--tw-prose-links': theme('colors.trending.accent'),
            '--tw-prose-bold': theme('colors.trending.text'),
            '--tw-prose-bullets': theme('colors.trending.accent'),
            '--tw-prose-quote-borders': theme('colors.trending.accent'),
            '--tw-prose-captions': theme('colors.trending.text'),
          },
        },
      }),
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}
