import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ProxyAwareThrottlerGuard } from './auth/guards/proxy-aware-throttler.guard';
import { AuthModule } from './auth/auth.module';
import { GroupModule } from './group/group.module';
import { InternalMailModule } from './internal-mail/internal-mail.module';
import { KnowledgePageModule } from './knowledge-page/knowledge-page.module';
import { KnowledgeSpaceModule } from './knowledge-space/knowledge-space.module';
import { MailcowModule } from './mailcow/mailcow.module';
import { OrganizationModule } from './organization/organization.module';
import { PrismaModule } from './prisma/prisma.module';
import { RoleModule } from './role/role.module';
import { UserModule } from './user/user.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['apps/server/.env', '.env'],
    }),
    ThrottlerModule.forRoot({
      throttlers: [
        {
          name: 'default',
          ttl: 60_000,
          limit: 120,
        },
      ],
    }),
    PrismaModule,
    MailcowModule,
    AuthModule,
    UserModule,
    RoleModule,
    GroupModule,
    InternalMailModule,
    KnowledgeSpaceModule,
    KnowledgePageModule,
    OrganizationModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ProxyAwareThrottlerGuard,
    },
  ],
})
export class AppModule {}
