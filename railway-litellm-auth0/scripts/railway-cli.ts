import path from 'node:path';
import { root } from './settings.ts';

export const railwayBin = path.join(root, 'node_modules/.bin/railway');

export function railwayEnvironment(parent: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  // railway/iac 3.16.0 probes process.env._ with --version during native CLI evaluation.
  // npm run lab leaves it pointing at Node; name the real CLI rather than bypassing the check.
  return { ...parent, _: railwayBin };
}
