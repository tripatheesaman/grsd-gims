/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    colors: {
      primary: '#003594',
      secondary: '#d2293b',
      background: '#ffffff',
      foreground: '#000000',
      border: '#e2e8f0'
    }
  },
  plugins: [],
} 