import { generateLevel } from './generator';
self.onmessage = (event: MessageEvent<{ number: number; seed: number }>) => {
  try { self.postMessage({ level: generateLevel(event.data.number, event.data.seed) }); }
  catch { self.postMessage({ error: 'generation' }); }
};
