import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function checkVersion(current: string, previous: string, lockVersion: string, packageVersion: string): void {
  const parse = (version: string): bigint[] => {
    if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) throw Error(`Invalid release version: ${version}`);
    return version.split('.').map(BigInt);
  };
  const next = parse(current), base = parse(previous);
  if (lockVersion !== current || packageVersion !== current) throw Error('package.json and package-lock.json versions must match');
  const different = next.findIndex((part, index) => part !== base[index]);
  if (different < 0 || next[different] < base[different]) throw Error(`Bump the release version above ${previous} (current: ${current})`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const ref = process.argv[2];
  if (!ref) throw Error('Usage: npm run check:version -- <base-ref>');
  const revision = execFileSync('git', ['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`], { encoding: 'utf8' }).trim();
  const previous = JSON.parse(execFileSync('git', ['show', `${revision}:package.json`], { encoding: 'utf8' })).version;
  const current = JSON.parse(readFileSync('package.json', 'utf8')).version;
  const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
  checkVersion(current, previous, lock.version, lock.packages?.['']?.version);
  console.log(`Release version verified: ${previous} → ${current}`);
}
