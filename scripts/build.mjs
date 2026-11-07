#!/usr/bin/env node
/**
 * Збирає застосунок в ОДИН самодостатній HTML-файл (JS і CSS вбудовано).
 *
 *   node scripts/build.mjs            → dist/index.html + dist/klsr-quiz.html
 *   node scripts/build.mjs --watch    → перезбирання при змінах
 *   node scripts/build.mjs --serve    → локальний сервер http://localhost:5173
 *
 * dist/index.html — сторінка для GitHub Pages; dist/klsr-quiz.html — та сама
 * сторінка для завантаження та відкриття напряму з диска (file://).
 */
import * as esbuild from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const args = new Set(process.argv.slice(2));
const watch = args.has('--watch');
const serve = args.has('--serve');

/** @param {esbuild.OutputFile[]} files */
async function assemble(files) {
  const js = files.find((f) => f.path.endsWith('.js'))?.text ?? '';
  const css = files.find((f) => f.path.endsWith('.css'))?.text ?? '';
  const template = await readFile(path.join(root, 'index.html'), 'utf8');
  const html = template
    .replace('/*__INLINE_CSS__*/', () => css.trim())
    // `</script` всередині JS закрив би тег передчасно.
    .replace('/*__INLINE_JS__*/', () => js.trim().replace(/<\/script/gi, '<\\/script'));
  if (html.includes('__INLINE_')) throw new Error('index.html placeholders were not replaced');
  await mkdir(dist, { recursive: true });
  await Promise.all([
    writeFile(path.join(dist, 'index.html'), html),
    writeFile(path.join(dist, 'klsr-quiz.html'), html),
    writeFile(path.join(dist, '.nojekyll'), ''),
  ]);
  return Buffer.byteLength(html);
}

/** @type {esbuild.Plugin} */
const inlineHtml = {
  name: 'inline-html',
  setup(build) {
    build.onEnd(async (result) => {
      if (result.errors.length || !result.outputFiles) return;
      const size = await assemble(result.outputFiles);
      console.log(`✔ dist/index.html, dist/klsr-quiz.html (${(size / 1024).toFixed(1)} KiB)`);
    });
  },
};

/** @type {esbuild.BuildOptions} */
const options = {
  absWorkingDir: root,
  entryPoints: ['src/main.ts'],
  bundle: true,
  minify: !watch,
  sourcemap: false,
  format: 'iife',
  target: 'es2020',
  outdir: dist,
  write: false,
  legalComments: 'none',
  charset: 'utf8',
  logLevel: 'warning',
  plugins: [inlineHtml],
};

if (watch || serve) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  if (serve) {
    const { port } = await ctx.serve({ servedir: dist, port: 5173 });
    console.log(`→ http://localhost:${port}/`);
  }
} else {
  await esbuild.build(options);
}
