import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

export function typeOrmConfigFactory(
  config: ConfigService,
): TypeOrmModuleOptions {
  const databaseUrl = config.get<string>('DATABASE_URL');
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  const isDev = config.get<string>('NODE_ENV') === 'development';

  return {
    type: 'postgres',
    url: databaseUrl,
    ssl: { rejectUnauthorized: false },
    autoLoadEntities: true,
    synchronize: false,
    logging: isDev,
  };
}
