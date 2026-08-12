import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Incident } from '../../entities/incident.entity';
import { IncidentNote } from '../../entities/incident-note.entity';
import { Server } from '../../entities/server.entity';
import { RealtimeModule } from '../realtime/realtime.module';
import { IncidentsController } from './incidents.controller';
import { IncidentsService } from './incidents.service';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([Incident, IncidentNote, Server]),
    RealtimeModule,
  ],
  controllers: [IncidentsController],
  providers: [IncidentsService],
  exports: [IncidentsService],
})
export class IncidentsModule {}
