import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

const isSingleFile = process.env.SINGLEFILE === '1';

export default defineConfig({
  base: './',
  plugins: isSingleFile ? [viteSingleFile()] : [],
  build: {
    target: 'es2022',
    outDir: isSingleFile ? 'dist-single' : 'dist',
    assetsInlineLimit: isSingleFile ? 100000000 : 4096,
    rollupOptions: isSingleFile
      ? undefined
      : {
          output: {
            manualChunks: {
              three: ['three'],
              inkjs: ['inkjs'],
            },
          },
        },
  },
  server: {
    host: true,
    port: 5173,
  },
});
