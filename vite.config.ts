import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { SCHOOL } from './src/config/school'

// Fills %SCHOOL_*% placeholders in index.html from the school config.
function schoolHtmlPlugin() {
  return {
    name: 'school-html-transform',
    transformIndexHtml(html: string) {
      return html
        .replaceAll('%SCHOOL_TITLE%', `${SCHOOL.gameName} - ${SCHOOL.tagline}`)
        .replaceAll('%SCHOOL_META_DESCRIPTION%', SCHOOL.metaDescription)
    },
  }
}

export default defineConfig({
  plugins: [react(), schoolHtmlPlugin()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        // Point at the local dev API (npm run dev:api) when set; otherwise
        // proxy to the deployed site so /api works against production.
        target: process.env.VITE_DEV_API_PROXY || SCHOOL.siteUrl,
        changeOrigin: true,
      },
    },
  },
})
