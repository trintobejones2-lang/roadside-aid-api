import { APP_GUARD } from '@nestjs/core'; // ✅ add
import { RolesGuard } from './common/guards/roles.guard'; // ✅ add
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { HelpRequestsModule } from './help-requests/help-requests.module';
import { PointsModule } from './points/points.module';
import { VolunteersModule } from './volunteers/volunteers.module';
import { RealtimeModule } from './realtime/realtime.module';
import { QueueModule } from './queue/queue.module';
import { NotificationsModule } from './notifications/notifications.module';

@Module({
  imports: [
    AuthModule,
    NotificationsModule,
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    QueueModule,
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const dbUrl = config.get<string>('DATABASE_URL');
        if (!dbUrl) throw new Error('DATABASE_URL is not set');

        console.log('DATABASE_URL host =', new URL(dbUrl).host);

        const u = new URL(dbUrl);

        return {
          type: 'postgres',
          host: u.hostname,
          port: Number(u.port || 5432),
          username: decodeURIComponent(u.username),
          password: decodeURIComponent(u.password),
          database: u.pathname.replace('/', '') || 'postgres',
          ssl: { rejectUnauthorized: false },
          extra: { ssl: { rejectUnauthorized: false } },
          autoLoadEntities: true,
          synchronize: false,
        };
      },
    }),

    VolunteersModule,
    HelpRequestsModule,
    PointsModule,
    RealtimeModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: RolesGuard }, // ✅ add
  ],
})
export class AppModule {}
