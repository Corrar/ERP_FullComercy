-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED');

-- CreateEnum
CREATE TYPE "BillingMethod" AS ENUM ('CARD', 'BOLETO', 'PIX_AUTO');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('OPEN', 'PAID', 'FAILED', 'VOID');

-- AlterTable
ALTER TABLE "core_users" ADD COLUMN     "account_id" UUID;

-- CreateTable
CREATE TABLE "plat_accounts" (
    "id" UUID NOT NULL,
    "email" VARCHAR(160) NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "password_hash" TEXT,
    "google_sub" VARCHAR(64),
    "avatar_url" TEXT,
    "trial_used_at" TIMESTAMPTZ(6),
    "last_login_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "plat_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core_subscriptions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIALING',
    "method" "BillingMethod" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "trial_ends_at" TIMESTAMPTZ(6),
    "current_period_start" TIMESTAMPTZ(6) NOT NULL,
    "current_period_end" TIMESTAMPTZ(6) NOT NULL,
    "cancel_at_period_end" BOOLEAN NOT NULL DEFAULT false,
    "canceled_at" TIMESTAMPTZ(6),
    "past_due_since" TIMESTAMPTZ(6),
    "suspended_by_billing" BOOLEAN NOT NULL DEFAULT false,
    "provider" VARCHAR(30) NOT NULL,
    "provider_customer_id" VARCHAR(120),
    "payment_ref" VARCHAR(160),
    "payment_info" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "core_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core_subscription_items" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "feature_key" VARCHAR(60) NOT NULL,
    "module_key" "ModuleKey",
    "label" VARCHAR(120) NOT NULL,
    "price" DECIMAL(14,2) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "core_subscription_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core_invoices" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'OPEN',
    "method" "BillingMethod" NOT NULL,
    "period_start" TIMESTAMPTZ(6) NOT NULL,
    "period_end" TIMESTAMPTZ(6) NOT NULL,
    "due_at" TIMESTAMPTZ(6) NOT NULL,
    "paid_at" TIMESTAMPTZ(6),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "failure_reason" VARCHAR(200),
    "provider_ref" VARCHAR(120),
    "boleto_url" TEXT,
    "boleto_line" VARCHAR(80),
    "pix_code" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "core_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "plat_accounts_email_key" ON "plat_accounts"("email");

-- CreateIndex
CREATE UNIQUE INDEX "plat_accounts_google_sub_key" ON "plat_accounts"("google_sub");

-- CreateIndex
CREATE INDEX "core_subscriptions_status_current_period_end_idx" ON "core_subscriptions"("status", "current_period_end");

-- CreateIndex
CREATE UNIQUE INDEX "core_subscriptions_tenant_id_key" ON "core_subscriptions"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "core_subscriptions_tenant_id_id_key" ON "core_subscriptions"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "core_subscription_items_tenant_id_subscription_id_feature_k_key" ON "core_subscription_items"("tenant_id", "subscription_id", "feature_key");

-- CreateIndex
CREATE UNIQUE INDEX "core_subscription_items_tenant_id_id_key" ON "core_subscription_items"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "core_invoices_status_due_at_idx" ON "core_invoices"("status", "due_at");

-- CreateIndex
CREATE INDEX "core_invoices_provider_ref_idx" ON "core_invoices"("provider_ref");

-- CreateIndex
CREATE UNIQUE INDEX "core_invoices_tenant_id_id_key" ON "core_invoices"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "core_users_account_id_idx" ON "core_users"("account_id");

-- AddForeignKey
ALTER TABLE "core_users" ADD CONSTRAINT "core_users_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "plat_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_subscriptions" ADD CONSTRAINT "core_subscriptions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_subscriptions" ADD CONSTRAINT "core_subscriptions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "plat_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_subscription_items" ADD CONSTRAINT "core_subscription_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_subscription_items" ADD CONSTRAINT "core_subscription_items_tenant_id_subscription_id_fkey" FOREIGN KEY ("tenant_id", "subscription_id") REFERENCES "core_subscriptions"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_invoices" ADD CONSTRAINT "core_invoices_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_invoices" ADD CONSTRAINT "core_invoices_tenant_id_subscription_id_fkey" FOREIGN KEY ("tenant_id", "subscription_id") REFERENCES "core_subscriptions"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
