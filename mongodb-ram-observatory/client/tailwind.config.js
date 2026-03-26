/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        mongo: {
          dark: '#001E2B',
          green: '#00ED64',
          forest: '#023430',
          blue: '#016BF8',
          amber: '#FFC010',
          red: '#DB3030',
          white: '#F9FBFA',
          'dark-light': '#0a2e3d',
          'dark-lighter': '#112e3c',
        },
      },
    },
  },
  plugins: [],
};
