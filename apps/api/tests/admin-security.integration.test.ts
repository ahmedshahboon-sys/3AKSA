import test from 'node:test';
import assert from 'node:assert/strict';
import { totpCodeForSecret, verifyTotpCode } from '../src/modules/admin/security.js';

test('admin TOTP verification accepts the current code and rejects malformed values',()=>{
  const secret='JBSWY3DPEHPK3PXP';
  const now=1_780_000_000_000;
  const code=totpCodeForSecret(secret,now);
  assert.match(code,/^\d{6}$/);
  assert.equal(verifyTotpCode(secret,code,now),true);
  assert.equal(verifyTotpCode(secret,'00000x',now),false);
});
