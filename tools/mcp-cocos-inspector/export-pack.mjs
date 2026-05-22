#!/usr/bin/env node
import { writeReplacementPackToDisk } from './export-pack-lib.mjs';
import { closeBridgeClient } from './bridge-server.mjs';

try {
  const result = await writeReplacementPackToDisk();
  console.log(JSON.stringify(result, null, 2));
} finally {
  closeBridgeClient();
}
