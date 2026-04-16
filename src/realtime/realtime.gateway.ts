import { WebSocketGateway, WebSocketServer, OnGatewayConnection } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class RealtimeGateway implements OnGatewayConnection {
  @WebSocketServer()
  server!: Server;

  handleConnection(client: Socket) {
    const userId = client.handshake.query.userId as string;

    if (userId) {
      void client.join(`user:${userId}`);
    }
  }

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
