import fs from 'node:fs';

const source=fs.readFileSync('packages/api-client/src/index.ts','utf8');

if(source.includes('this.fetchImpl = options.fetchImpl ?? fetch;')){
  throw new Error('ApiClient stores browser fetch unbound and can trigger Illegal invocation');
}
if(!source.includes('globalThis.fetch.bind(globalThis)')){
  throw new Error('ApiClient default fetch must be bound to the global browser context');
}
if(!source.includes('response = await this.fetchImpl(')){
  throw new Error('ApiClient request path changed; review browser fetch contract');
}

console.log('Browser fetch receiver contract passed.');
