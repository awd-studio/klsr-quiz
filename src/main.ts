import './styles.css';
import { seeded } from './core/rng.ts';
import { browserStorage, loadState } from './core/storage.ts';
import { App } from './ui/app.ts';

const root = document.getElementById('app');
if (!root) throw new Error('#app not found');

const storage = browserStorage();
/**
 * Параметри для тестів і налагодження:
 * `?seed=123` — відтворюване перемішування; `?alt=1` — частка альтернативних форматів (0…1).
 */
const params = new URLSearchParams(location.search);
const seed = params.get('seed');
const alt = Number(params.get('alt') ?? NaN);
const app = new App({
  root,
  storage,
  ...(seed && Number.isFinite(Number(seed)) ? { rng: seeded(Number(seed)) } : {}),
  ...(alt >= 0 && alt <= 1 ? { altShare: alt } : {}),
  initial: loadState(storage),
  canDownload: location.protocol === 'http:' || location.protocol === 'https:',
});
app.render();

/** Тестовий хук для e2e: доступ до поточного стану (лише читання). */
declare global {
  interface Window {
    __klsr?: { state: () => ReturnType<App['getState']> };
  }
}
window.__klsr = { state: () => app.getState() };
