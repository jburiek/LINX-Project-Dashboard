const http = require('http');
const fs = require('fs');
const path = require('path');

const host = process.env.HOST || '0.0.0.0';
const port = Number(process.env.PORT || 3000);
const rootDir = __dirname;
const dataFile = path.join(rootDir, 'data', 'projects.json');

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.ico': 'image/x-icon'
};

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function readProjects() {
  const raw = fs.readFileSync(dataFile, 'utf8');
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [];
}

function writeProjects(projects) {
  fs.writeFileSync(dataFile, JSON.stringify(projects, null, 2), 'utf8');
}

function getSafePath(urlPath) {
  const cleanPath = decodeURIComponent(urlPath.split('?')[0]);
  const relative = cleanPath === '/' ? '/index.html' : cleanPath;
  const filePath = path.normalize(path.join(rootDir, relative));
  if (!filePath.startsWith(rootDir)) {
    return null;
  }
  return filePath;
}

function serveStatic(req, res) {
  const safePath = getSafePath(req.url || '/');
  if (!safePath) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(safePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      res.writeHead(500);
      res.end('Server error');
      return;
    }

    const ext = path.extname(safePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
    res.end(content);
  });
}

function parseRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 10 * 1024 * 1024) {
        reject(new Error('Request body too large'));
      }
    });
    req.on('end', () => {
      try {
        const parsed = body ? JSON.parse(body) : null;
        resolve(parsed);
      } catch (error) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const method = req.method || 'GET';
  const urlPath = (req.url || '/').split('?')[0];

  if (urlPath === '/api/projects' && method === 'GET') {
    try {
      sendJson(res, 200, readProjects());
    } catch (error) {
      sendJson(res, 500, { error: 'Failed to read projects' });
    }
    return;
  }

  if (urlPath === '/api/projects' && method === 'PUT') {
    try {
      const payload = await parseRequestBody(req);
      if (!Array.isArray(payload)) {
        sendJson(res, 400, { error: 'Expected an array of projects' });
        return;
      }

      writeProjects(payload);
      sendJson(res, 200, { ok: true, count: payload.length });
    } catch (error) {
      if (error.message === 'Invalid JSON' || error.message === 'Request body too large') {
        sendJson(res, 400, { error: error.message });
      } else {
        sendJson(res, 500, { error: 'Failed to save projects' });
      }
    }
    return;
  }

  if (method === 'GET') {
    serveStatic(req, res);
    return;
  }

  sendJson(res, 405, { error: 'Method not allowed' });
});

server.listen(port, host, () => {
  // eslint-disable-next-line no-console
  console.log(`Server running on http://${host}:${port}`);
});
