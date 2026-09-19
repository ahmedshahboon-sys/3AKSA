import test from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/app.js';

test('Phase 9 concurrency smoke serves health and public room reads without 5xx',async()=>{
  const app=await buildApp();
  try{
    const baseUrl=await app.listen({host:'127.0.0.1',port:0});
    const paths=Array.from({length:160},(_,index)=>
      index%2===0?'/3aksa/api/health':'/3aksa/api/rooms'
    );
    const started=Date.now();
    const results=await Promise.all(paths.map(async(path)=>{
      const response=await fetch(`${baseUrl}${path}`);
      return {status:response.status,body:await response.text()};
    }));
    const elapsed=Date.now()-started;

    const failures=results.filter((result)=>result.status>=500||result.status===0);
    assert.equal(failures.length,0,JSON.stringify(failures.slice(0,3)));
    assert.ok(results.every((result)=>result.status===200));
    assert.ok(elapsed<15_000,`concurrency smoke took ${elapsed}ms`);
  }finally{
    await app.close();
  }
});
