import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { RealtimeGateway } from './realtime.gateway';

export type RealtimeResource =
  | 'incidents'
  | 'servers'
  | 'alerts'
  | 'watches'
  | 'notifications'
  | `server:${string}`;

/** Resources refreshed on each live sync tick. */
const LIVE_RESOURCES: RealtimeResource[] = [
  'incidents',
  'servers',
  'alerts',
  'watches',
  'notifications',
];

@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);

  constructor(private readonly gateway: RealtimeGateway) {}

  invalidate(resources: RealtimeResource[], tenantId?: string | null) {
    this.gateway.emitInvalidate(resources, tenantId);
  }

  emitToUser(userId: string, resources: RealtimeResource[]) {
    this.gateway.emitToUser(userId, resources);
  }

  /** Background live sync — pushes invalidations without changing SWR keys on the client. */
  @Interval(15_000)
  syncLiveData() {
    this.gateway.broadcastInvalidate(LIVE_RESOURCES);
    this.logger.debug('Broadcast live-data invalidation');
  }
}
