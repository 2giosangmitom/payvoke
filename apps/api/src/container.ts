import { asClass, asFunction, asValue, createContainer, InjectionMode } from "awilix";
import type { Cradle } from "@fastify/awilix";
import type { PrismaClient } from "@payvoke/db";
import type { Config } from "./config";
import { createAuth } from "./modules/auth/auth";
import { AuthController } from "./modules/auth/auth.controller";
import { AuthService } from "./modules/auth/auth.service";
import { CatalogController } from "./modules/catalog/catalog.controller";
import { CatalogService } from "./modules/catalog/catalog.service";

declare module "@fastify/awilix" {
  interface Cradle {
    config: Config;
    db: PrismaClient;
    auth: ReturnType<typeof createAuth>;
    authService: AuthService;
    authController: AuthController;
    catalogService: CatalogService;
    catalogController: CatalogController;
  }
}

// One container per app instance: tests build several apps in one process, so
// the plugin's module-level default container must not be shared. Strict mode
// rejects a singleton that depends on a shorter-lived registration.
export function createAppContainer(config: Config, db: PrismaClient) {
  const container = createContainer<Cradle>({ injectionMode: InjectionMode.PROXY, strict: true });
  container.register({
    config: asValue(config),
    db: asValue(db),
    auth: asFunction(({ config, db }: Cradle) => createAuth(config, db)).singleton(),

    authService: asClass(AuthService).singleton(),
    authController: asClass(AuthController).singleton(),
    catalogService: asClass(CatalogService).singleton(),
    catalogController: asClass(CatalogController).singleton(),
  });
  return container;
}
