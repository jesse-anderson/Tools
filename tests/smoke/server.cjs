const http = require('http');
const fs = require('fs');
const path = require('path');

const defaultRootDir = path.resolve(__dirname, '..', '..');
const defaultHost = '127.0.0.1';
const defaultPort = Number(process.env.PORT || 4173);

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml; charset=utf-8'
};

function send(res, statusCode, body, headers = {}) {
  res.writeHead(statusCode, headers);
  res.end(body);
}

function createRequestResolver(rootDir, host, port) {
  return function resolveRequestPath(requestUrl) {
    const parsedUrl = new URL(requestUrl, `http://${host}:${port}`);
    const pathname = decodeURIComponent(parsedUrl.pathname);
    const relativePath = pathname === '/' ? '/tools.html' : pathname;
    const candidatePath = path.resolve(rootDir, `.${relativePath}`);

    if (!candidatePath.startsWith(rootDir)) {
      return null;
    }

    return candidatePath;
  };
}

function createStaticServer(options = {}) {
  const rootDir = options.rootDir || defaultRootDir;
  const host = options.host || defaultHost;
  const port = Number(options.port || defaultPort);
  const resolveRequestPath = createRequestResolver(rootDir, host, port);
  const sockets = new Set();

  const server = http.createServer((req, res) => {
    const filePath = resolveRequestPath(req.url || '/');
    if (!filePath) {
      send(res, 403, 'Forbidden', { 'Content-Type': 'text/plain; charset=utf-8' });
      return;
    }

    fs.stat(filePath, (statError, stats) => {
      if (statError) {
        send(res, 404, 'Not found', { 'Content-Type': 'text/plain; charset=utf-8' });
        return;
      }

      const targetPath = stats.isDirectory() ? path.join(filePath, 'index.html') : filePath;

      fs.readFile(targetPath, (readError, data) => {
        if (readError) {
          send(res, 404, 'Not found', { 'Content-Type': 'text/plain; charset=utf-8' });
          return;
        }

        const ext = path.extname(targetPath).toLowerCase();
        const contentType = mimeTypes[ext] || 'application/octet-stream';
        send(res, 200, data, { 'Content-Type': contentType });
      });
    });
  });

  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });

  function close() {
    return new Promise((resolve) => {
      for (const socket of sockets) {
        socket.destroy();
      }

      const forceClose = setTimeout(resolve, 1000);
      forceClose.unref();

      const finish = () => {
        clearTimeout(forceClose);
        resolve();
      };

      server.close(finish);
    });
  }

  return { server, host, port, close };
}

function startServer(options = {}) {
  const instance = createStaticServer(options);
  const reuseExisting = options.reuseExisting !== false;

  return new Promise((resolve, reject) => {
    instance.server.once('error', (error) => {
      if (reuseExisting && error.code === 'EADDRINUSE') {
        resolve({
          host: instance.host,
          port: instance.port,
          close: async () => {}
        });
        return;
      }

      reject(error);
    });

    instance.server.listen(instance.port, instance.host, () => {
      console.log(`Static server listening on http://${instance.host}:${instance.port}`);
      resolve(instance);
    });
  });
}

if (require.main === module) {
  let runningServer;

  startServer({ reuseExisting: false }).then((instance) => {
    runningServer = instance;
  }).catch((error) => {
    console.error(error);
    process.exit(1);
  });

  async function shutdown() {
    if (runningServer) {
      await runningServer.close();
    }
    process.exit(0);
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

module.exports = {
  createStaticServer,
  startServer
};
