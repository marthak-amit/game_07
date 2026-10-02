// Copies the static game into ./www for Capacitor.
import { cpSync, rmSync, mkdirSync } from 'node:fs';
rmSync('www', { recursive: true, force: true });
mkdirSync('www', { recursive: true });
for (const f of ['index.html', 'manifest.webmanifest', 'sw.js', 'css', 'js', 'icons']) cpSync(f, `www/${f}`, { recursive: true });
console.log('www ready');
