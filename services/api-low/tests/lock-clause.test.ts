import { describe, expect, it } from 'vitest';
import { supportsSkipLocked } from '../src/db/lock-clause';

describe('supportsSkipLocked', () => {
  it.each([
    ['10.4.32-MariaDB', false],
    ['10.5.9-MariaDB-log', false],
    ['10.6.0-MariaDB', true],
    ['10.11.14-MariaDB-0+deb12u2', true],
    ['11.4.2-MariaDB', true],
    ['5.7.44', false],
    ['8.0.0', false],
    ['8.0.1', true],
    ['8.4.11', true],
    ['', false]
  ])('%s ⇒ %s', (v, ok) => expect(supportsSkipLocked(v)).toBe(ok));
});
