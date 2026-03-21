import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dashboardDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../packages/dashboard');
process.chdir(dashboardDir);

const req = createRequire(path.join(dashboardDir, 'package.json'));
const viteBin = path.join(path.dirname(req.resolve('vite/package.json')), 'bin', 'vite.js');
await import('file:///' + viteBin.split(path.sep).join('/'));
