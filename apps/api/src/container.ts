import { asClass, asFunction, asValue, createContainer, InjectionMode } from "awilix";
import type { PrismaClient } from "#core/db";
import type { Doorbell, Jobs } from "#core/queue";
import type { ObjectStorage } from "#core/storage";
import type { Config } from "./config";
import type { Facilitator } from "#core/facilitator";
import type { Logger } from "./logging";
import type { RateStore } from "./http/limits";
import type { Signals } from "./signals";
import { createAuth } from "./modules/auth/auth";
import { AuthService } from "./modules/auth/auth.service";
import { CatalogService } from "./modules/catalog/catalog.service";
import { FileService } from "./modules/files/file.service";
import { PresaleService } from "./modules/presale/presale.service";
import { ProviderAppService } from "./modules/provider/provider-app.service";
import { ProviderCommandService } from "./modules/provider/provider-command.service";
import { ProviderKeyService } from "./modules/provider/provider-key.service";
import { InvocationService } from "./modules/payments/invocation.service";
import { PaymentGateway } from "./modules/payments/payment-gateway";
import { PaymentStatusService } from "./modules/payments/payment-status.service";
import { QuoteService } from "./modules/quotes/quote.service";
import { ContinuationService } from "./modules/runs/continuation.service";
import { ProviderRunService } from "./modules/runs/provider-run.service";
import { ThreadService } from "./modules/threads/thread.service";

export interface Cradle {
  config: Config;
  db: PrismaClient;
  log: Logger;
  rateStore: RateStore;
  // Null when PAYMENTS_ENABLED is false.
  facilitator: Facilitator | null;
  doorbell: Doorbell;
  jobs: Jobs;
  // Null when FILES_ENABLED is false.
  storage: ObjectStorage | null;
  auth: ReturnType<typeof createAuth>;
  authService: AuthService;
  catalogService: CatalogService;
  providerAppService: ProviderAppService;
  providerCommandService: ProviderCommandService;
  providerKeyService: ProviderKeyService;
  quoteService: QuoteService;
  invocationService: InvocationService;
  paymentGateway: PaymentGateway;
  paymentStatusService: PaymentStatusService;
  threadService: ThreadService;
  providerRunService: ProviderRunService;
  continuationService: ContinuationService;
  fileService: FileService;
  presaleService: PresaleService;
}

// One container per app instance: tests build several apps in one process.
// Strict mode rejects a singleton that depends on a shorter-lived registration.
export function createAppContainer(
  config: Config,
  db: PrismaClient,
  log: Logger,
  signals: Signals,
  storage: ObjectStorage | null,
  facilitator: Facilitator | null,
  rateStore: RateStore,
) {
  const container = createContainer<Cradle>({ injectionMode: InjectionMode.PROXY, strict: true });
  container.register({
    config: asValue(config),
    db: asValue(db),
    log: asValue(log),
    rateStore: asValue(rateStore),
    facilitator: asValue(facilitator),
    doorbell: asValue(signals.doorbell),
    jobs: asValue(signals.jobs),
    storage: asValue(storage),
    auth: asFunction(({ config, db }: Cradle) => createAuth(config, db)).singleton(),

    authService: asClass(AuthService).singleton(),
    catalogService: asClass(CatalogService).singleton(),
    providerAppService: asClass(ProviderAppService).singleton(),
    providerCommandService: asClass(ProviderCommandService).singleton(),
    providerKeyService: asClass(ProviderKeyService).singleton(),
    quoteService: asClass(QuoteService).singleton(),
    invocationService: asClass(InvocationService).singleton(),
    paymentGateway: asClass(PaymentGateway).singleton(),
    paymentStatusService: asClass(PaymentStatusService).singleton(),
    threadService: asClass(ThreadService).singleton(),
    providerRunService: asClass(ProviderRunService).singleton(),
    continuationService: asClass(ContinuationService).singleton(),
    fileService: asClass(FileService).singleton(),
    presaleService: asClass(PresaleService).singleton(),
  });
  return container;
}
