import { asClass, asFunction, asValue, createContainer, InjectionMode } from "awilix";
import type { Cradle } from "@fastify/awilix";
import type { FastifyBaseLogger } from "fastify";
import type { PrismaClient } from "@payvoke/db";
import type { Doorbell, Jobs } from "@payvoke/queue";
import type { Config } from "./config";
import type { Signals } from "./signals";
import { createAuth } from "./modules/auth/auth";
import { AuthController } from "./modules/auth/auth.controller";
import { AuthService } from "./modules/auth/auth.service";
import { CatalogController } from "./modules/catalog/catalog.controller";
import { CatalogService } from "./modules/catalog/catalog.service";
import { ProviderAppService } from "./modules/provider/provider-app.service";
import { ProviderCommandService } from "./modules/provider/provider-command.service";
import { ProviderController } from "./modules/provider/provider.controller";
import { ProviderKeyService } from "./modules/provider/provider-key.service";
import { InvocationService } from "./modules/payments/invocation.service";
import { PaymentGateway } from "./modules/payments/payment-gateway";
import { PaymentStatusService } from "./modules/payments/payment-status.service";
import { PaymentsController } from "./modules/payments/payments.controller";
import { QuoteController } from "./modules/quotes/quote.controller";
import { QuoteService } from "./modules/quotes/quote.service";
import { ContinuationService } from "./modules/runs/continuation.service";
import { ProviderRunService } from "./modules/runs/provider-run.service";
import { RunsController } from "./modules/runs/runs.controller";
import { ThreadController } from "./modules/threads/thread.controller";
import { ThreadService } from "./modules/threads/thread.service";

declare module "@fastify/awilix" {
  interface Cradle {
    config: Config;
    db: PrismaClient;
    log: FastifyBaseLogger;
    doorbell: Doorbell;
    jobs: Jobs;
    auth: ReturnType<typeof createAuth>;
    authService: AuthService;
    authController: AuthController;
    catalogService: CatalogService;
    catalogController: CatalogController;
    providerAppService: ProviderAppService;
    providerCommandService: ProviderCommandService;
    providerKeyService: ProviderKeyService;
    providerController: ProviderController;
    quoteService: QuoteService;
    quoteController: QuoteController;
    invocationService: InvocationService;
    paymentGateway: PaymentGateway;
    paymentStatusService: PaymentStatusService;
    paymentsController: PaymentsController;
    threadService: ThreadService;
    threadController: ThreadController;
    providerRunService: ProviderRunService;
    continuationService: ContinuationService;
    runsController: RunsController;
  }
}

// One container per app instance: tests build several apps in one process, so
// the plugin's module-level default container must not be shared. Strict mode
// rejects a singleton that depends on a shorter-lived registration.
export function createAppContainer(
  config: Config,
  db: PrismaClient,
  log: FastifyBaseLogger,
  signals: Signals,
) {
  const container = createContainer<Cradle>({ injectionMode: InjectionMode.PROXY, strict: true });
  container.register({
    config: asValue(config),
    db: asValue(db),
    log: asValue(log),
    doorbell: asValue(signals.doorbell),
    jobs: asValue(signals.jobs),
    auth: asFunction(({ config, db }: Cradle) => createAuth(config, db)).singleton(),

    authService: asClass(AuthService).singleton(),
    authController: asClass(AuthController).singleton(),
    catalogService: asClass(CatalogService).singleton(),
    catalogController: asClass(CatalogController).singleton(),
    providerAppService: asClass(ProviderAppService).singleton(),
    providerCommandService: asClass(ProviderCommandService).singleton(),
    providerKeyService: asClass(ProviderKeyService).singleton(),
    providerController: asClass(ProviderController).singleton(),
    quoteService: asClass(QuoteService).singleton(),
    quoteController: asClass(QuoteController).singleton(),
    invocationService: asClass(InvocationService).singleton(),
    paymentGateway: asClass(PaymentGateway, { asyncInit: "verifyCapabilities" }).singleton(),
    paymentStatusService: asClass(PaymentStatusService).singleton(),
    paymentsController: asClass(PaymentsController).singleton(),
    threadService: asClass(ThreadService).singleton(),
    threadController: asClass(ThreadController).singleton(),
    providerRunService: asClass(ProviderRunService).singleton(),
    continuationService: asClass(ContinuationService).singleton(),
    runsController: asClass(RunsController).singleton(),
  });
  return container;
}
