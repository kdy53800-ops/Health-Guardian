const assert = require('node:assert/strict');
const test = require('node:test');
const config = require('../vercel.json');
const { buildCsp } = require('../scripts/generate-csp');

test('deployed CSP hashes every inline script and event handler currently in the app', () => {
  const headers = config.headers.find(entry => entry.source === '/(.*)').headers;
  const deployed = headers.find(header => header.key === 'Content-Security-Policy').value;
  assert.equal(deployed, buildCsp());
  assert.match(deployed, /^default-src 'none'; script-src 'self'/);
  assert.doesNotMatch(deployed.split('; ')[1], /'unsafe-inline'|'unsafe-eval'/);
  assert.match(deployed, /frame-ancestors 'none'; object-src 'none'/);
});
