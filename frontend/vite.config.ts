import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import semi from "vite-plugin-semi-theme";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(),


    semi({
      theme: "@semi-bot/semi-theme-zamatest",
      // options: {
      // ... 👆
      //},
    }),

  ],
})
