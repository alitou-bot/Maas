import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { UserRole } from '../../common/enums';
import type { JwtPayload } from '../auth/jwt.strategy';
import type { RealtimeResource } from './realtime.service';

@WebSocketGateway({
  namespace: '/realtime',
  cors: {
    origin: true,
    credentials: true,
  },
})
export class RealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token =
        (client.handshake.auth?.token as string | undefined) ||
        (client.handshake.query?.token as string | undefined);
      if (!token) {
        client.disconnect(true);
        return;
      }

      const payload = await this.jwt.verifyAsync<JwtPayload>(token, {
        secret:
          this.config.get<string>('app.jwtSecret') ||
          'maas-dev-secret-change-me',
      });

      client.data.userId = payload.sub;
      client.data.tenantId = payload.tenantId;
      client.data.role = payload.role;

      await client.join(`user:${payload.sub}`);
      if (payload.tenantId) {
        await client.join(`tenant:${payload.tenantId}`);
      }
      if (
        payload.role === UserRole.SUPER_ADMIN ||
        payload.role === UserRole.NOC_OPERATOR
      ) {
        await client.join('global');
      }

      this.logger.log(`Socket connected user=${payload.sub} role=${payload.role}`);
    } catch {
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`Socket disconnected user=${client.data.userId ?? '?'}`);
  }

  emitInvalidate(resources: RealtimeResource[], tenantId?: string | null) {
    if (!this.server) return;

    const payload = { resources, at: new Date().toISOString() };

    if (tenantId) {
      this.server.to(`tenant:${tenantId}`).emit('invalidate', payload);
    }
    this.server.to('global').emit('invalidate', payload);
  }

  broadcastInvalidate(resources: RealtimeResource[]) {
    if (!this.server) return;
    this.server.emit('invalidate', {
      resources,
      at: new Date().toISOString(),
    });
  }

  emitToUser(userId: string, resources: RealtimeResource[]) {
    if (!this.server) return;
    this.server.to(`user:${userId}`).emit('invalidate', {
      resources,
      at: new Date().toISOString(),
    });
  }

  @SubscribeMessage('subscribe')
  handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { serverId?: string },
  ) {
    if (body?.serverId) {
      void client.join(`server:${body.serverId}`);
    }
    return { ok: true };
  }

  emitServer(serverId: string, tenantId: string | null) {
    if (!this.server) return;
    const payload = {
      resources: ['servers', `server:${serverId}`] as RealtimeResource[],
      at: new Date().toISOString(),
    };
    this.server.to(`server:${serverId}`).emit('invalidate', payload);
    if (tenantId) {
      this.server.to(`tenant:${tenantId}`).emit('invalidate', payload);
    }
    this.server.to('global').emit('invalidate', payload);
  }
}
