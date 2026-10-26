-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "SettlementState" AS ENUM ('PENDING', 'HELD', 'REJECTED', 'QUARANTINED');

-- CreateEnum
CREATE TYPE "SettlementAttemptState" AS ENUM ('RESERVED', 'SIGNED', 'BROADCAST', 'UNKNOWN', 'CONFIRMED', 'FINALIZED', 'REVERTED');

-- CreateEnum
CREATE TYPE "InvocationExecutionStatus" AS ENUM ('NOT_STARTED', 'QUEUED', 'ACKED', 'RUNNING', 'WAITING_BUYER', 'VERIFYING', 'DELIVERED', 'FAILED');

-- CreateEnum
CREATE TYPE "FinanceDecisionState" AS ENUM ('APPROVED', 'REJECTED', 'RESERVED', 'SIGNED', 'BROADCAST', 'UNKNOWN', 'FINALIZED', 'REVERTED', 'QUARANTINED');

-- CreateTable
CREATE TABLE "user" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "suspendedAt" TIMESTAMP(3),

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "walletAddress" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "chainId" INTEGER NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "walletAddress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "apps" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "clientRequestId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "visibility" TEXT NOT NULL DEFAULT 'PUBLIC',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "payoutAddress" TEXT NOT NULL,
    "defaultCommandId" TEXT,
    "lastHeartbeatAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "apps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_api_keys" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "secretHash" TEXT NOT NULL,
    "scopes" TEXT[],
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_commands" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "activeRevisionId" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_commands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_command_revisions" (
    "id" TEXT NOT NULL,
    "commandId" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "inputSchema" JSONB NOT NULL,
    "outputSchema" JSONB,
    "positionalParameter" TEXT,
    "grossAmount" DECIMAL(78,0) NOT NULL,
    "terms" JSONB NOT NULL,
    "deliverySeconds" INTEGER NOT NULL,
    "reviewSeconds" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_command_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_threads" (
    "id" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "title" TEXT,
    "clientRequestId" TEXT NOT NULL,
    "activeQuoteId" TEXT,
    "quoteLockVersion" INTEGER NOT NULL DEFAULT 0,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_threads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_stars" (
    "userId" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_stars_pkey" PRIMARY KEY ("userId","appId")
);

-- CreateTable
CREATE TABLE "deployment_policies" (
    "version" TEXT NOT NULL,
    "activeSlot" TEXT,
    "vault" TEXT NOT NULL,
    "feeBps" INTEGER NOT NULL,
    "feeRecipient" TEXT NOT NULL,
    "quoteLifetimeSeconds" INTEGER NOT NULL,
    "maxHoldSeconds" INTEGER NOT NULL,
    "resolutionGraceSeconds" INTEGER NOT NULL,
    "minGrossAmount" DECIMAL(78,0) NOT NULL,

    CONSTRAINT "deployment_policies_pkey" PRIMARY KEY ("version")
);

-- CreateTable
CREATE TABLE "quotes" (
    "id" TEXT NOT NULL,
    "invocationId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "commandRevisionId" TEXT,
    "clientRequestId" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "document" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invocations" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "executionStatus" "InvocationExecutionStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "runId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settlement_operations" (
    "invocationId" TEXT NOT NULL,
    "invocationKey" TEXT NOT NULL,
    "quoteDigest" TEXT NOT NULL,
    "authorizationDigest" TEXT NOT NULL,
    "recoveredSigner" TEXT NOT NULL,
    "paymentPayload" JSONB NOT NULL,
    "state" "SettlementState" NOT NULL DEFAULT 'PENDING',
    "errorReason" TEXT,
    "leaseOwner" TEXT,
    "leaseEpoch" BIGINT NOT NULL DEFAULT 0,
    "leaseExpiresAt" TIMESTAMP(3),
    "revision" BIGINT NOT NULL DEFAULT 0,
    "nextCheckAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settlement_operations_pkey" PRIMARY KEY ("invocationId")
);

-- CreateTable
CREATE TABLE "settlement_attempts" (
    "id" TEXT NOT NULL,
    "invocationId" TEXT NOT NULL,
    "network" TEXT NOT NULL,
    "relayer" TEXT NOT NULL,
    "nonce" BIGINT NOT NULL,
    "gasLimit" BIGINT NOT NULL,
    "maxFeePerGas" DECIMAL(78,0) NOT NULL,
    "maxPriorityFeePerGas" DECIMAL(78,0) NOT NULL,
    "state" "SettlementAttemptState" NOT NULL DEFAULT 'RESERVED',
    "signedTransaction" TEXT,
    "transactionHash" TEXT,
    "broadcastAt" TIMESTAMP(3),
    "broadcastCount" INTEGER NOT NULL DEFAULT 0,
    "lastErrorReason" TEXT,
    "receiptBlockNumber" BIGINT,
    "receiptBlockHash" TEXT,
    "finalizedBlockNumber" BIGINT,
    "finalizedBlockHash" TEXT,
    "actualGasCost" DECIMAL(78,0),
    "finalizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settlement_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "relayer_lanes" (
    "network" TEXT NOT NULL,
    "relayer" TEXT NOT NULL,
    "activeInvocationId" TEXT,
    "revision" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "relayer_lanes_pkey" PRIMARY KEY ("network","relayer")
);

-- CreateTable
CREATE TABLE "invocation_ready" (
    "invocationId" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),
    "runId" TEXT NOT NULL,

    CONSTRAINT "invocation_ready_pkey" PRIMARY KEY ("invocationId")
);

-- CreateTable
CREATE TABLE "provider_runs" (
    "runId" TEXT NOT NULL,
    "invocationId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "reportSequence" INTEGER NOT NULL DEFAULT 0,
    "activeMessageId" TEXT,
    "state" TEXT NOT NULL DEFAULT 'QUEUED',
    "result" JSONB,
    "acknowledgedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_runs_pkey" PRIMARY KEY ("runId")
);

-- CreateTable
CREATE TABLE "provider_reports" (
    "runId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "reportId" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "type" TEXT NOT NULL,

    CONSTRAINT "provider_reports_pkey" PRIMARY KEY ("runId","sequence")
);

-- CreateTable
CREATE TABLE "agui_stream_events" (
    "cursor" BIGSERIAL NOT NULL,
    "invocationId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "streamSequence" INTEGER,
    "sourceHash" TEXT,
    "event" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agui_stream_events_pkey" PRIMARY KEY ("cursor")
);

-- CreateTable
CREATE TABLE "openui_surfaces" (
    "runId" TEXT NOT NULL,
    "surfaceId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "openui_surfaces_pkey" PRIMARY KEY ("runId","surfaceId")
);

-- CreateTable
CREATE TABLE "invocation_questions" (
    "id" TEXT NOT NULL,
    "invocationId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "inputSchema" JSONB NOT NULL,
    "chatTextParameter" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answeredAt" TIMESTAMP(3),

    CONSTRAINT "invocation_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invocation_answers" (
    "id" TEXT NOT NULL,
    "invocationId" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "clientRequestId" VARCHAR(128) NOT NULL,
    "arguments" JSONB NOT NULL,
    "acknowledgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invocation_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invocation_revisions" (
    "id" TEXT NOT NULL,
    "invocationId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "clientRequestId" VARCHAR(128) NOT NULL,
    "reason" TEXT NOT NULL,
    "targetArtifactVersion" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "acknowledgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invocation_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settlement_scan_cursors" (
    "id" TEXT NOT NULL,
    "blockNumber" BIGINT NOT NULL,
    "blockHash" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settlement_scan_cursors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settlement_incidents" (
    "id" TEXT NOT NULL,
    "transactionHash" TEXT NOT NULL,
    "invocationKey" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "settlement_incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vault_financial_health" (
    "id" TEXT NOT NULL,
    "blocked" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vault_financial_health_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vault_hold_projections" (
    "holdId" TEXT NOT NULL,
    "vault" TEXT NOT NULL,
    "invocationId" TEXT,
    "status" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "version" BIGINT NOT NULL,
    "blockNumber" BIGINT NOT NULL,
    "blockHash" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vault_hold_projections_pkey" PRIMARY KEY ("holdId")
);

-- CreateTable
CREATE TABLE "vault_financial_events" (
    "id" TEXT NOT NULL,
    "vault" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "holdId" TEXT,
    "transactionHash" TEXT NOT NULL,
    "blockNumber" BIGINT NOT NULL,
    "blockHash" TEXT NOT NULL,
    "logIndex" INTEGER NOT NULL,
    "data" JSONB NOT NULL,

    CONSTRAINT "vault_financial_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_delivery_evidence" (
    "id" TEXT NOT NULL,
    "invocationId" TEXT NOT NULL,
    "artifactVersion" INTEGER NOT NULL,
    "outputHash" TEXT NOT NULL,
    "verifier" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "accessInterruptionSeconds" INTEGER NOT NULL,
    "evidenceLevel" TEXT NOT NULL,
    "envelope" JSONB NOT NULL,
    "envelopeHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_delivery_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_decisions" (
    "id" TEXT NOT NULL,
    "holdId" TEXT NOT NULL,
    "vault" TEXT NOT NULL,
    "digest" TEXT NOT NULL,
    "decision" JSONB NOT NULL,
    "beforeHold" JSONB,
    "approver" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "evidenceId" TEXT,
    "reason" TEXT NOT NULL,
    "state" "FinanceDecisionState" NOT NULL DEFAULT 'APPROVED',
    "executor" TEXT,
    "nonce" BIGINT,
    "gasLimit" BIGINT,
    "maxFeePerGas" DECIMAL(78,0),
    "maxPriorityFeePerGas" DECIMAL(78,0),
    "signedTransaction" TEXT,
    "transactionHash" TEXT,
    "broadcastCount" INTEGER NOT NULL DEFAULT 0,
    "actualGasCost" DECIMAL(78,0),
    "receipt" JSONB,
    "finalizedAt" TIMESTAMP(3),
    "errorReason" TEXT,
    "leaseOwner" TEXT,
    "leaseEpoch" BIGINT NOT NULL DEFAULT 0,
    "leaseExpiresAt" TIMESTAMP(3),
    "nextCheckAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revision" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "finance_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finance_lanes" (
    "id" TEXT NOT NULL,
    "activeDecisionId" TEXT,
    "revision" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "finance_lanes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE INDEX "session_userId_idx" ON "session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE INDEX "account_userId_idx" ON "account"("userId");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

-- CreateIndex
CREATE INDEX "walletAddress_userId_idx" ON "walletAddress"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "apps_defaultCommandId_key" ON "apps"("defaultCommandId");

-- CreateIndex
CREATE INDEX "apps_visibility_status_id_idx" ON "apps"("visibility", "status", "id");

-- CreateIndex
CREATE INDEX "apps_ownerId_createdAt_idx" ON "apps"("ownerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "apps_ownerId_clientRequestId_key" ON "apps"("ownerId", "clientRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "app_api_keys_prefix_key" ON "app_api_keys"("prefix");

-- CreateIndex
CREATE UNIQUE INDEX "app_api_keys_secretHash_key" ON "app_api_keys"("secretHash");

-- CreateIndex
CREATE INDEX "app_api_keys_appId_revokedAt_idx" ON "app_api_keys"("appId", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "app_api_keys_one_active_per_app" ON "app_api_keys"("appId") WHERE ("revokedAt" IS NULL);

-- CreateIndex
CREATE UNIQUE INDEX "app_commands_activeRevisionId_key" ON "app_commands"("activeRevisionId");

-- CreateIndex
CREATE INDEX "app_commands_appId_archivedAt_idx" ON "app_commands"("appId", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "app_commands_appId_name_key" ON "app_commands"("appId", "name");

-- CreateIndex
CREATE INDEX "app_command_revisions_commandId_createdAt_idx" ON "app_command_revisions"("commandId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "chat_threads_activeQuoteId_key" ON "chat_threads"("activeQuoteId");

-- CreateIndex
CREATE INDEX "chat_threads_buyerId_archivedAt_updatedAt_idx" ON "chat_threads"("buyerId", "archivedAt", "updatedAt");

-- CreateIndex
CREATE INDEX "chat_threads_appId_idx" ON "chat_threads"("appId");

-- CreateIndex
CREATE UNIQUE INDEX "chat_threads_buyerId_clientRequestId_key" ON "chat_threads"("buyerId", "clientRequestId");

-- CreateIndex
CREATE INDEX "app_stars_userId_createdAt_idx" ON "app_stars"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "deployment_policies_activeSlot_key" ON "deployment_policies"("activeSlot");

-- CreateIndex
CREATE UNIQUE INDEX "quotes_invocationId_key" ON "quotes"("invocationId");

-- CreateIndex
CREATE INDEX "quotes_sessionId_validUntil_idx" ON "quotes"("sessionId", "validUntil");

-- CreateIndex
CREATE INDEX "quotes_appId_idx" ON "quotes"("appId");

-- CreateIndex
CREATE UNIQUE INDEX "quotes_buyerId_clientRequestId_key" ON "quotes"("buyerId", "clientRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "invocations_quoteId_key" ON "invocations"("quoteId");

-- CreateIndex
CREATE UNIQUE INDEX "invocations_runId_key" ON "invocations"("runId");

-- CreateIndex
CREATE INDEX "invocations_buyerId_createdAt_idx" ON "invocations"("buyerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "settlement_operations_invocationKey_key" ON "settlement_operations"("invocationKey");

-- CreateIndex
CREATE INDEX "settlement_operations_state_leaseExpiresAt_createdAt_idx" ON "settlement_operations"("state", "leaseExpiresAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "settlement_attempts_invocationId_key" ON "settlement_attempts"("invocationId");

-- CreateIndex
CREATE UNIQUE INDEX "settlement_attempts_transactionHash_key" ON "settlement_attempts"("transactionHash");

-- CreateIndex
CREATE INDEX "settlement_attempts_network_relayer_finalizedAt_idx" ON "settlement_attempts"("network", "relayer", "finalizedAt");

-- CreateIndex
CREATE UNIQUE INDEX "settlement_attempts_network_relayer_nonce_key" ON "settlement_attempts"("network", "relayer", "nonce");

-- CreateIndex
CREATE UNIQUE INDEX "relayer_lanes_activeInvocationId_key" ON "relayer_lanes"("activeInvocationId");

-- CreateIndex
CREATE INDEX "provider_runs_invocationId_updatedAt_idx" ON "provider_runs"("invocationId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "provider_reports_runId_reportId_key" ON "provider_reports"("runId", "reportId");

-- CreateIndex
CREATE INDEX "agui_stream_events_threadId_cursor_idx" ON "agui_stream_events"("threadId", "cursor");

-- CreateIndex
CREATE UNIQUE INDEX "agui_stream_events_runId_streamSequence_key" ON "agui_stream_events"("runId", "streamSequence");

-- CreateIndex
CREATE INDEX "invocation_questions_invocationId_status_idx" ON "invocation_questions"("invocationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "invocation_questions_invocationId_questionId_key" ON "invocation_questions"("invocationId", "questionId");

-- CreateIndex
CREATE INDEX "invocation_answers_buyerId_createdAt_idx" ON "invocation_answers"("buyerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "invocation_answers_invocationId_clientRequestId_key" ON "invocation_answers"("invocationId", "clientRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "invocation_answers_invocationId_questionId_key" ON "invocation_answers"("invocationId", "questionId");

-- CreateIndex
CREATE INDEX "invocation_revisions_buyerId_createdAt_idx" ON "invocation_revisions"("buyerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "invocation_revisions_invocationId_clientRequestId_key" ON "invocation_revisions"("invocationId", "clientRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "vault_hold_projections_invocationId_key" ON "vault_hold_projections"("invocationId");

-- CreateIndex
CREATE INDEX "vault_hold_projections_vault_blockNumber_idx" ON "vault_hold_projections"("vault", "blockNumber");

-- CreateIndex
CREATE INDEX "vault_financial_events_holdId_blockNumber_idx" ON "vault_financial_events"("holdId", "blockNumber");

-- CreateIndex
CREATE INDEX "payment_delivery_evidence_invocationId_observedAt_idx" ON "payment_delivery_evidence"("invocationId", "observedAt");

-- CreateIndex
CREATE UNIQUE INDEX "finance_decisions_digest_key" ON "finance_decisions"("digest");

-- CreateIndex
CREATE UNIQUE INDEX "finance_decisions_transactionHash_key" ON "finance_decisions"("transactionHash");

-- CreateIndex
CREATE INDEX "finance_decisions_state_nextCheckAt_idx" ON "finance_decisions"("state", "nextCheckAt");

-- CreateIndex
CREATE INDEX "finance_decisions_executor_finalizedAt_idx" ON "finance_decisions"("executor", "finalizedAt");

-- CreateIndex
CREATE UNIQUE INDEX "finance_decisions_executor_nonce_key" ON "finance_decisions"("executor", "nonce");

-- CreateIndex
CREATE UNIQUE INDEX "finance_lanes_activeDecisionId_key" ON "finance_lanes"("activeDecisionId");

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "walletAddress" ADD CONSTRAINT "walletAddress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "apps" ADD CONSTRAINT "apps_defaultCommandId_fkey" FOREIGN KEY ("defaultCommandId") REFERENCES "app_commands"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "app_api_keys" ADD CONSTRAINT "app_api_keys_appId_fkey" FOREIGN KEY ("appId") REFERENCES "apps"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_commands" ADD CONSTRAINT "app_commands_appId_fkey" FOREIGN KEY ("appId") REFERENCES "apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_commands" ADD CONSTRAINT "app_commands_activeRevisionId_fkey" FOREIGN KEY ("activeRevisionId") REFERENCES "app_command_revisions"("id") ON DELETE SET NULL ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "app_command_revisions" ADD CONSTRAINT "app_command_revisions_commandId_fkey" FOREIGN KEY ("commandId") REFERENCES "app_commands"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_threads" ADD CONSTRAINT "chat_threads_appId_fkey" FOREIGN KEY ("appId") REFERENCES "apps"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_stars" ADD CONSTRAINT "app_stars_appId_fkey" FOREIGN KEY ("appId") REFERENCES "apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "chat_threads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_appId_fkey" FOREIGN KEY ("appId") REFERENCES "apps"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_commandRevisionId_fkey" FOREIGN KEY ("commandRevisionId") REFERENCES "app_command_revisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invocations" ADD CONSTRAINT "invocations_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invocations" ADD CONSTRAINT "invocations_runId_fkey" FOREIGN KEY ("runId") REFERENCES "provider_runs"("runId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlement_operations" ADD CONSTRAINT "settlement_operations_invocationId_fkey" FOREIGN KEY ("invocationId") REFERENCES "invocations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlement_attempts" ADD CONSTRAINT "settlement_attempts_invocationId_fkey" FOREIGN KEY ("invocationId") REFERENCES "settlement_operations"("invocationId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlement_attempts" ADD CONSTRAINT "settlement_attempts_network_relayer_fkey" FOREIGN KEY ("network", "relayer") REFERENCES "relayer_lanes"("network", "relayer") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invocation_ready" ADD CONSTRAINT "invocation_ready_invocationId_fkey" FOREIGN KEY ("invocationId") REFERENCES "invocations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_runs" ADD CONSTRAINT "provider_runs_invocationId_fkey" FOREIGN KEY ("invocationId") REFERENCES "invocations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_reports" ADD CONSTRAINT "provider_reports_runId_fkey" FOREIGN KEY ("runId") REFERENCES "provider_runs"("runId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agui_stream_events" ADD CONSTRAINT "agui_stream_events_invocationId_fkey" FOREIGN KEY ("invocationId") REFERENCES "invocations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "openui_surfaces" ADD CONSTRAINT "openui_surfaces_runId_fkey" FOREIGN KEY ("runId") REFERENCES "provider_runs"("runId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invocation_questions" ADD CONSTRAINT "invocation_questions_invocationId_fkey" FOREIGN KEY ("invocationId") REFERENCES "invocations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invocation_answers" ADD CONSTRAINT "invocation_answers_invocationId_fkey" FOREIGN KEY ("invocationId") REFERENCES "invocations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invocation_answers" ADD CONSTRAINT "invocation_answers_invocationId_questionId_fkey" FOREIGN KEY ("invocationId", "questionId") REFERENCES "invocation_questions"("invocationId", "questionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invocation_revisions" ADD CONSTRAINT "invocation_revisions_invocationId_fkey" FOREIGN KEY ("invocationId") REFERENCES "invocations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
