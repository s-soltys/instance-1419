import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

const isSingleFile = process.env.SINGLEFILE === '1';

function devAuditionsPlugin(): Plugin {
  const auditionsDir = path.resolve(process.cwd(), '.dev-auditions');
  return {
    name: 'dev-auditions-static',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/auditions', (req, res, next) => {
        const cleanUrl = (req.url ?? '/').split('?')[0].replace(/^\/+/, '');
        const resolved = path.resolve(auditionsDir, cleanUrl);
        if (!resolved.startsWith(auditionsDir) || !fs.existsSync(resolved) || fs.statSync(resolved).isDirectory()) {
          next();
          return;
        }
        const ext = path.extname(resolved).toLowerCase();
        const mime =
          ext === '.json'
            ? 'application/json; charset=utf-8'
            : ext === '.mp3'
              ? 'audio/mpeg'
              : ext === '.wav'
                ? 'audio/wav'
                : 'application/octet-stream';
        res.setHeader('Content-Type', mime);
        fs.createReadStream(resolved).pipe(res);
      });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [devAuditionsPlugin(), ...(isSingleFile ? [viteSingleFile()] : [])],
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
