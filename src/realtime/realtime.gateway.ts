import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class RealtimeGateway {
  @WebSocketServer()
  server: Server;

  broadcastNewRequest(request: any) {
    this.server.emit('request_created', request);
  }

  broadcastClaim(request: any) {
    this.server.emit('request_claimed', request);
  }

  broadcastStatusUpdated(request: any) {
    this.server.emit('request_status_updated', request);
  }
}
