import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';

export default defineConfig({
  plugins: [pluginReact()],
  source: {
    entry: {
      index: './src/main.tsx',
    },
  },
  html: {
    template: './index.html',
    title: 'llman-sdd Studio',
  },
  output: {
    distPath: {
      root: 'dist',
    },
  },
  server: {
    port: 4711,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:4710',
        changeOrigin: false,
      },
    },
  },
});
