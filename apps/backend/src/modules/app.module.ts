import { fileURLToPath } from "node:url";
import { MikroOrmModule } from "@mikro-orm/nestjs";
import { PostgreSqlDriver } from "@mikro-orm/postgresql";
import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import typia, { tags } from "typia";
import { createMikroOrmOptions } from "../database/mikro-orm.options.js";

export interface Environment {
  DATABASE_URL: string;
  PORT?: number & tags.Type<"uint32"> & tags.Minimum<1> & tags.Maximum<65535>;
}

export function validateEnvironment(config: Record<string, unknown>): Environment {
  return typia.assert<Environment>({
    DATABASE_URL: config.DATABASE_URL,
    PORT: config.PORT === undefined ? 8000 : Number(config.PORT),
  });
}

export const appConfigModule = ConfigModule.forRoot({
  isGlobal: true,
  cache: true,
  envFilePath: fileURLToPath(new URL("../../.env", import.meta.url)),
  validate: validateEnvironment,
});

@Module({
  imports: [
    appConfigModule,
    MikroOrmModule.forRootAsync({
      driver: PostgreSqlDriver,
      inject: [ConfigService],
      useFactory: createMikroOrmOptions,
    }),
  ],
})
export class AppModule {}
