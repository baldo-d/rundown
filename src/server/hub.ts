import type { WebSocket } from 'ws';
import type { ServerMessage } from '../shared/types';

/** Keeps track of connected editors and pushes change notifications to them. */
export class Hub {
  private sockets = new Set<WebSocket>();

  add(socket: WebSocket) {
    this.sockets.add(socket);
    socket.on('close', () => this.sockets.delete(socket));
    socket.on('error', () => this.sockets.delete(socket));
  }

  get size() {
    return this.sockets.size;
  }

  broadcast(message: ServerMessage) {
    const data = JSON.stringify(message);
    for (const socket of this.sockets) {
      if (socket.readyState === socket.OPEN) socket.send(data);
    }
  }
}
