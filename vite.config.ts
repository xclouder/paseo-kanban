import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  resolve: { alias: [
    { find: /^react-native$/, replacement: 'react-native-web' },
    { find: /^@getpaseo\/plugin(?:\/react-native)?$/, replacement: fileURLToPath(new URL('./preview/host.tsx', import.meta.url)) },
  ] },
  server: { port: 5173, strictPort: true },
  build: { outDir: 'dist/preview' },
});
