import { expect, it } from 'vitest';
import { checkVersion } from '../scripts/check-version';

it.each(['0.2.1', '0.3.0', '1.0.0', '0.10.0'])('accepts a higher release version %s', version => {
  expect(() => checkVersion(version, '0.2.0', version, version)).not.toThrow();
});
it.each(['0.2.0', '0.1.9', '0.2', 'v0.3.0', '0.3.0-beta', '00.3.0'])('rejects unchanged, lower or invalid version %s', version => {
  expect(() => checkVersion(version, '0.2.0', version, version)).toThrow();
});
it('compares numeric parts and checks both lockfile versions', () => {
  expect(() => checkVersion('0.9.0', '0.10.0', '0.9.0', '0.9.0')).toThrow();
  expect(() => checkVersion('0.2.1', '0.2.0', '0.2.0', '0.2.1')).toThrow(/must match/);
  expect(() => checkVersion('0.2.1', '0.2.0', '0.2.1', '0.2.0')).toThrow(/must match/);
  expect(() => checkVersion('0.2.1', 'invalid', '0.2.1', '0.2.1')).toThrow();
});
