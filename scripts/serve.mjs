import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.md': 'text/plain; charset=utf-8'
};

export function createStaticServer() {
  return http.createServer((request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'no-store');
    if (!['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(405, { Allow: 'GET, HEAD' });
      response.end('Método não permitido.');
      return;
    }
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url, 'http://preview.invalid').pathname);
    } catch {
      response.writeHead(400);
      response.end('URL inválida.');
      return;
    }
    if (pathname === '/') {
      response.writeHead(302, { Location: '/login.html' });
      response.end();
      return;
    }
    const filename = path.resolve(ROOT, `.${pathname}`);
    if (!filename.startsWith(`${ROOT}${path.sep}`) || pathname.includes('\0') || pathname.split('/').some(part => part.startsWith('.'))) {
      response.writeHead(403);
      response.end('Acesso negado.');
      return;
    }
    fs.stat(filename, (error, stat) => {
      if (error || !stat.isFile()) {
        response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Arquivo não encontrado.');
        return;
      }
      response.writeHead(200, {
        'Content-Type': types[path.extname(filename)] || 'application/octet-stream',
        'Content-Length': stat.size
      });
      if (request.method === 'HEAD') {
        response.end();
        return;
      }
      const stream = fs.createReadStream(filename);
      stream.on('error', () => response.destroy());
      stream.pipe(response);
    });
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3000);
  createStaticServer().listen(port, '0.0.0.0', () => {
    console.log(`PortalMeli disponível em http://0.0.0.0:${port}/login.html`);
    console.log('Servidor estático: nenhuma planilha ou webhook é chamado durante a inicialização.');
  });
}
