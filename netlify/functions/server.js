import { Readable } from 'node:stream';
import { handleRequest } from '../../src/server.js';

/**
 * Modern Netlify Functions (Request -> Response Web Standard)
 */
export default async function (request, context) {
  const urlObj = new URL(request.url);
  let pathname = urlObj.pathname;
  if (pathname.startsWith('/.netlify/functions/server')) {
    pathname = pathname.replace('/.netlify/functions/server', '') || '/';
  }

  const headers = {};
  for (const [k, v] of request.headers.entries()) {
    headers[k.toLowerCase()] = v;
  }

  const bodyBuffer = request.body ? Buffer.from(await request.arrayBuffer()) : Buffer.alloc(0);
  const reqStream = new Readable({
    read() {
      if (bodyBuffer.length) this.push(bodyBuffer);
      this.push(null);
    }
  });

  reqStream.method = request.method;
  reqStream.url = pathname + urlObj.search;
  reqStream.headers = headers;

  return new Promise((resolve) => {
    let statusCode = 200;
    const resHeaders = {};
    const chunks = [];

    const mockRes = {
      setHeader(k, v) { resHeaders[k.toLowerCase()] = v; },
      writeHead(code, h = {}) {
        statusCode = code;
        for (const [k, v] of Object.entries(h)) {
          resHeaders[k.toLowerCase()] = v;
        }
      },
      write(chunk) {
        if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      },
      end(data) {
        if (data) chunks.push(Buffer.isBuffer(data) ? data : Buffer.from(data));
        const finalBody = Buffer.concat(chunks);
        resolve(new Response(finalBody, {
          status: statusCode,
          headers: resHeaders
        }));
      }
    };

    handleRequest(reqStream, mockRes).catch(err => {
      resolve(new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { 'content-type': 'application/json' }
      }));
    });
  });
}

/**
 * Legacy AWS Lambda / Netlify event-based handler compatibility
 */
export async function handler(event, context) {
  const pathStr = (event.path || '/').replace('/.netlify/functions/server', '') || '/';
  const queryStr = event.queryStringParameters 
    ? '?' + new URLSearchParams(event.queryStringParameters).toString()
    : '';
  
  const headers = {};
  for (const [k, v] of Object.entries(event.headers || {})) {
    headers[k.toLowerCase()] = v;
  }

  const bodyBuffer = event.body
    ? Buffer.from(event.body, event.isBase64Encoded ? 'base64' : 'utf8')
    : Buffer.alloc(0);

  const reqStream = new Readable({
    read() {
      if (bodyBuffer.length) this.push(bodyBuffer);
      this.push(null);
    }
  });

  reqStream.method = event.httpMethod || 'GET';
  reqStream.url = pathStr + queryStr;
  reqStream.headers = headers;

  return new Promise((resolve) => {
    let statusCode = 200;
    const resHeaders = {};
    const chunks = [];

    const mockRes = {
      setHeader(k, v) { resHeaders[k] = v; },
      writeHead(code, h = {}) {
        statusCode = code;
        for (const [k, v] of Object.entries(h)) {
          resHeaders[k] = v;
        }
      },
      write(chunk) {
        if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      },
      end(data) {
        if (data) chunks.push(Buffer.isBuffer(data) ? data : Buffer.from(data));
        const finalBody = Buffer.concat(chunks);
        resolve({
          statusCode,
          headers: resHeaders,
          body: finalBody.toString('utf8')
        });
      }
    };

    handleRequest(reqStream, mockRes).catch(err => {
      resolve({
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: err.message })
      });
    });
  });
}
