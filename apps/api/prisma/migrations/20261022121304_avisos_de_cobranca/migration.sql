-- CreateTable
CREATE TABLE "core_billing_notices" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "kind" VARCHAR(30) NOT NULL,
    "ref" VARCHAR(120) NOT NULL,
    "sent_to" VARCHAR(254) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "core_billing_notices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "core_billing_notices_tenant_id_kind_ref_key" ON "core_billing_notices"("tenant_id", "kind", "ref");

-- AddForeignKey
ALTER TABLE "core_billing_notices" ADD CONSTRAINT "core_billing_notices_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_billing_notices" ADD CONSTRAINT "core_billing_notices_tenant_id_subscription_id_fkey" FOREIGN KEY ("tenant_id", "subscription_id") REFERENCES "core_subscriptions"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
