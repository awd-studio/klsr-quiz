/** Стилі імпортуються в main.ts і вбудовуються в HTML під час збирання. */
declare module '*.css';

/** Текстові файли (CHANGELOG.md) вбудовуються як рядок під час збирання. */
declare module '*.md' {
  const text: string;
  export default text;
}

/** Версія з package.json (підставляє esbuild). */
declare const __APP_VERSION__: string;
