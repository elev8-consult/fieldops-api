import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnalyticsModule } from './analytics/analytics.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { BrandsModule } from './brands/brands.module';
import { typeOrmConfigFactory } from './config/database.config';
import { DashboardModule } from './dashboard/dashboard.module';
import { MessagesModule } from './messages/messages.module';
import { OutletsModule } from './outlets/outlets.module';
import { ProductsModule } from './products/products.module';
import { MerchandiserReportItemBatch } from './reports/merchandiser/entities/merchandiser-report-item-batch.entity';
import { ReportsModule } from './reports/reports.module';
import { ReviewModule } from './review/review.module';
import { UnknownSender } from './unknown-senders/entities/unknown-sender.entity';
import { UnknownSendersModule } from './unknown-senders/unknown-senders.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        ...typeOrmConfigFactory(config),
        entities: [MerchandiserReportItemBatch, UnknownSender],
      }),
      inject: [ConfigService],
    }),
    AuditModule,
    UsersModule,
    AuthModule,
    BrandsModule,
    DashboardModule,
    OutletsModule,
    ProductsModule,
    MessagesModule,
    ReportsModule,
    ReviewModule,
    UnknownSendersModule,
    AnalyticsModule,
  ],
})
export class AppModule {}
