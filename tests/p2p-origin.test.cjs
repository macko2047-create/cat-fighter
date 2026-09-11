'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const vm = require('node:vm'), fs = require('node:fs');
function client(content) {
  const requests = [], window = {};
  vm.runInNewContext(fs.readFileSync('src/p2p-transport.js', 'utf8'), {
    window, document: {querySelector: () => content === undefined ? null : {content}}, URL, AbortSignal,
    fetch: async (url, options) => { requests.push({url, options}); return new Response('{}', {headers: {'Content-Type': 'application/json'}}); },
  });
  return {requests, request: window.CatP2P.request};
}
test('missing/empty config preserves absolute same-origin /p2p routes', async () => {
  for (const origin of [undefined, '', '   ']) {
    const c = client(origin); await c.request('create'); assert.equal(c.requests[0].url, '/p2p/create');
  }
});
test('explicit HTTPS origin applies to every signaling operation and omits cookies', async () => {
  const c = client('https://signal.example/');
  for (const route of ['create','join','poll','signal','leave']) {
    await c.request(route, {}, {code:'123456',token:'secret'}, route === 'leave');
    const {url,options} = c.requests.at(-1);
    assert.equal(url, 'https://signal.example/p2p/'+route);
    assert.equal(options.credentials, 'omit'); assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Authorization, 'Bearer secret');
    assert.equal(options.keepalive, route === 'leave');
  }
});
test('invalid origins fail closed before sending credentials; HTTP loopback supports local testing', async () => {
  for (const origin of ['http://public.example','https://user:pass@signal.example','https://signal.example/path','https://signal.example?x=1','https://signal.example#x','/relative','null']) {
    const c = client(origin); await assert.rejects(c.request('poll')); assert.equal(c.requests.length, 0);
  }
  const c = client('http://127.0.0.1:8787'); await c.request('create'); assert.equal(c.requests[0].url,'http://127.0.0.1:8787/p2p/create');
});
