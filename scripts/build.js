import { build } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

async function runBuild() {
  console.log('🚀 Starting TextSnip extension build...');

  // 1. Build Popup, Options & Background
  console.log('📦 Step 1: Building Popup, Options & Service Worker...');
  await build({
    root: rootDir,
    publicDir: 'public',
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      rollupOptions: {
        input: {
          popup: path.resolve(rootDir, 'src/popup/popup.html'),
          options: path.resolve(rootDir, 'src/options/options.html'),
          offscreen: path.resolve(rootDir, 'src/offscreen/offscreen.html'),
          'background/service-worker': path.resolve(rootDir, 'src/background/service-worker.ts'),
        },
        output: {
          entryFileNames: (chunkInfo) => {
            if (chunkInfo.name === 'background/service-worker') {
              return 'background/service-worker.js';
            }
            return '[name]/[name].js';
          },
          chunkFileNames: 'chunks/[name]-[hash].js',
          assetFileNames: (assetInfo) => {
            if (assetInfo.name && assetInfo.name.endsWith('.css')) {
              return 'assets/[name].[ext]';
            }
            return 'assets/[name]-[hash].[ext]';
          }
        }
      }
    }
  });

  // 2. Build Content Script as standalone IIFE (so it can execute anywhere without module restrictions)
  console.log('📦 Step 2: Building Content Script (standalone IIFE)...');
  await build({
    root: rootDir,
    publicDir: false, // Don't copy publicDir again
    build: {
      outDir: 'dist',
      emptyOutDir: false, // Do not clear dist
      lib: {
        entry: path.resolve(rootDir, 'src/content/index.ts'),
        name: 'TextSnipContentScript',
        formats: ['iife'],
        fileName: () => 'content/index.js',
      },
      rollupOptions: {
        output: {
          extend: true
        }
      }
    }
  });

  // 3. Move HTML files to match manifest.json paths
  const fs = await import('fs');
  const popupSrc = path.resolve(rootDir, 'dist/src/popup/popup.html');
  const popupDest = path.resolve(rootDir, 'dist/popup/popup.html');
  if (fs.existsSync(popupSrc)) {
    fs.copyFileSync(popupSrc, popupDest);
  }

  const optionsSrc = path.resolve(rootDir, 'dist/src/options/options.html');
  const optionsDest = path.resolve(rootDir, 'dist/options/options.html');
  if (fs.existsSync(optionsSrc)) {
    fs.copyFileSync(optionsSrc, optionsDest);
  }

  const offscreenSrc = path.resolve(rootDir, 'dist/src/offscreen/offscreen.html');
  const offscreenDest = path.resolve(rootDir, 'dist/offscreen/offscreen.html');
  if (fs.existsSync(offscreenSrc)) {
    if (!fs.existsSync(path.dirname(offscreenDest))) {
      fs.mkdirSync(path.dirname(offscreenDest), { recursive: true });
    }
    fs.copyFileSync(offscreenSrc, offscreenDest);
  }

  // Remove dist/src directory
  const distSrcDir = path.resolve(rootDir, 'dist/src');
  if (fs.existsSync(distSrcDir)) {
    fs.rmSync(distSrcDir, { recursive: true, force: true });
  }

  console.log('✅ TextSnip build completed successfully into dist/');
}

runBuild().catch((err) => {
  console.error('❌ Build failed:', err);
  process.exit(1);
});
