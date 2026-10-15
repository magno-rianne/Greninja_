import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'charts',
              test: /node_modules[\\/](?:echarts|zrender|echarts-for-react)[\\/]/,
              // Removed minSize and maxSize so ECharts stays in one piece
            },
            {
              name: 'mantine',
              test: /node_modules[\\/]@mantine[\\/]/,
              // Removed minSize and maxSize
            },
            {
              name: 'icons',
              test: /node_modules[\\/]@tabler[\\/]icons-react[\\/]/,
              // Removed minSize and maxSize
            },
          ],
        },
      },
    },
  },
})