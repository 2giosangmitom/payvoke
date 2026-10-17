import { MikroOrmModule } from "@mikro-orm/nestjs";
import { PostgreSqlDriver } from "@mikro-orm/postgresql";
import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { appConfigModule } from "../config/environment.js";
import { createMikroOrmOptions } from "../database/mikro-orm.options.js";
import { IdentityModule } from "./identity/identity.module.js";

@Module({
  imports: [
    appConfigModule,
    MikroOrmModule.forRootAsync({
      driver: PostgreSqlDriver,
      inject: [ConfigService],
      useFactory: createMikroOrmOptions,
    }),
    IdentityModule,
  ],
})
export class AppModule {}
