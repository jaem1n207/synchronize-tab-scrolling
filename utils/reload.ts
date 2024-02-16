import process from 'node:process';
import { Server, WebSocket, WebSocketServer } from 'ws';

import colorLog from './log';

export const PORT = 8800;
const WAIT_FOR_CONNECTION = 2000;

let server: Server | null = null;

const sockets: Set<WebSocket> = new Set();
const times: WeakMap<WebSocket, number> = new WeakMap();
const userAgents: WeakMap<WebSocket, string> = new WeakMap();

function createServer(): Promise<Server> {
  return new Promise((resolve) => {
    const server = new WebSocketServer({ port: PORT });
    server.on('listening', () => {
      colorLog('Auto-reloader started', 'success');
      resolve(server);
    });
    server.on('connection', (ws, request) => {
      const userAgent = request.headers['user-agent'];
      colorLog(`Extension connected: ${userAgent}`, 'success');

      sockets.add(ws);
      times.set(ws, Date.now());
      userAgent && userAgents.set(ws, userAgent);

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === 'reloading') {
          colorLog('Extension reloading...', 'success');
        }
      });
      ws.on('close', () => sockets.delete(ws));
      if (connectionAwaiter !== null) {
        connectionAwaiter();
      }
    });
  });
}

function closeServer() {
  server && server.close(() => colorLog('Auto-reloader exit', 'success'));
  sockets.forEach((ws) => ws.close());
  sockets.clear();
  server = null;
}

process.on('exit', closeServer);
process.on('SIGINT', closeServer);

let connectionAwaiter: (() => void) | null = null;

function waitForConnection() {
  return new Promise((resolve) => {
    connectionAwaiter = () => {
      connectionAwaiter = null;
      clearTimeout(timeoutId);
      setTimeout(resolve, WAIT_FOR_CONNECTION);
    };
    const timeoutId = setTimeout(() => {
      colorLog('Auto-reloader did not connect', 'warning');
      connectionAwaiter = null;
      resolve(true);
    }, WAIT_FOR_CONNECTION);
  });
}

function send(ws: WebSocket, message: unknown) {
  ws.send(JSON.stringify(message));
}

export async function reload({ type }: { type: string }) {
  if (!server) {
    server = await createServer();
  }
  if (sockets.size === 0) {
    await waitForConnection();
  }
  const now = Date.now();
  Array.from(sockets.values())
    .filter((ws) => {
      const created = times.get(ws);
      return created && created < now;
    })
    .forEach((ws) => send(ws, { type }));
}

export function getConnectedBrowsers() {
  const browsers: Set<string> = new Set();
  sockets.forEach((ws) => {
    const userAgent = userAgents.get(ws);
    if (userAgent?.includes('Chrome') || userAgent?.includes('Chromium')) {
      browsers.add('chrome');
    }
    if (userAgent?.includes('Firefox')) {
      browsers.add('firefox');
    }
  });
  return Array.from(browsers);
}

export const CSS = 'reload:css';
export const ALL = 'reload:all';
export const UI = 'reload:ui';
