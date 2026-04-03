import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnalyticsModule } from './analytics/analytics.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { BrandsModule } from './brands/brands.module';
import { typeOrmConfigFactory } from './config/database.config';
import { MessagesModule } from './messages/messages.module';
import { OutletsModule } from './outlets/outlets.module';
import { ProductsModule } from './products/products.module';
import { ReportsModule } from './reports/reports.module';
import { ReviewModule } from './review/review.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: typeOrmConfigFactory,
      inject: [ConfigService],
    }),
    AuditModule,
    UsersModule,
    AuthModule,
    BrandsModule,
    OutletsModule,
    ProductsModule,
    MessagesModule,
    ReportsModule,
    ReviewModule,
    AnalyticsModule,
  ],
})
export class AppModule {}
