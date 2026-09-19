import { env } from '../src/config.js';
import { assertProductionSecurity } from '../src/production-security.js';

assertProductionSecurity(env);
console.log('3AKSA production security preflight passed.');
