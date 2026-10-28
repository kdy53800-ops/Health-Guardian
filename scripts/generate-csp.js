const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const pageFiles = fs.readdirSync(root).filter(name => name.endsWith('.html')).map(name => path.join(root, name));
const clientFiles = fs.readdirSync(path.join(root, 'js')).filter(name => name.endsWith('.js')).map(name => path.join(root, 'js', name));

function hash(source) {
  return `'sha256-${crypto.createHash('sha256').update(source, 'utf8').digest('base64')}'`;
}

function buildCsp() {
  const inlineScripts = new Set();
  const eventHandlers = new Set();

  for (const file of pageFiles) {
    const html = fs.readFileSync(file, 'utf8');
    for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      if (!/\bsrc\s*=/.test(match[1]) && match[2].trim()) inlineScripts.add(match[2]);
    }
  }

  for (const file of [...pageFiles, ...clientFiles]) {
    const source = fs.readFileSync(file, 'utf8');
    for (const match of source.matchAll(/\s(on[a-z]+)="([^"]*)"/gi)) {
      if (match[2].includes('${')) {
        throw new Error(`Dynamic ${match[1]} handler in ${path.relative(root, file)} must use data attributes`);
      }
      if (match[2].includes('&')) {
        throw new Error(`HTML entities in ${match[1]} handler in ${path.relative(root, file)} need decoding before hashing`);
      }
      eventHandlers.add(match[2]);
    }
  }

  const scriptHashes = [...new Set([...inlineScripts, ...eventHandlers].map(hash))].sort();
  return [
    "default-src 'none'",
    `script-src 'self' https://cdn.jsdelivr.net 'unsafe-hashes' ${scriptHashes.join(' ')}`,
    "style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://fonts.googleapis.com",
    "font-src 'self' data: https://cdnjs.cloudflare.com https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "form-action 'self'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    "object-src 'none'",
  ].join('; ');
}

function writeCsp() {
  const configPath = path.join(root, 'vercel.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const headers = config.headers.find(entry => entry.source === '/(.*)')?.headers;
  if (!headers) throw new Error('Global Vercel headers are missing');
  const existing = headers.find(header => header.key.toLowerCase() === 'content-security-policy');
  if (existing) existing.value = buildCsp();
  else headers.push({ key: 'Content-Security-Policy', value: buildCsp() });
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
}

if (require.main === module) writeCsp();
module.exports = { buildCsp };
