import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
export const styles = JSON.parse(readFileSync(new URL('../styles.json', import.meta.url), 'utf8'));
export const tmp = () => mkdtempSync(join(tmpdir(), 'muse-'));
// Smallest valid-looking JPEG payload: SOI marker plus padding (the server checks marker and size, not pixels).
export const jpegDataUrl = (size = 4000) => 'data:image/jpeg;base64,' + Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(size)]).toString('base64');
