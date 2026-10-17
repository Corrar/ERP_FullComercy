-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "PurchaseStatus" AS ENUM ('DRAFT', 'ORDERED', 'PARTIAL', 'RECEIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentIntentStatus" AS ENUM ('PENDING', 'PAID', 'EXPIRED', 'CANCELLED', 'FAILED');

-- CreateTable
CREATE TABLE "core_outbox_events" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" UUID NOT NULL,
    "event_type" VARCHAR(60) NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_error" TEXT,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMPTZ(6),

    CONSTRAINT "core_outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core_webhooks" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "events" TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "core_webhooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core_webhook_deliveries" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" UUID NOT NULL,
    "webhook_id" UUID NOT NULL,
    "outbox_event_id" BIGINT NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "response_status" INTEGER,
    "last_error" TEXT,
    "sent_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "core_webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core_notifications" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID,
    "kind" VARCHAR(40) NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "body" TEXT,
    "link" VARCHAR(200),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "core_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core_notification_reads" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "notification_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "read_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "core_notification_reads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core_suppliers" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "document" VARCHAR(20),
    "email" VARCHAR(160),
    "phone" VARCHAR(30),
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "core_suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core_purchase_orders" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "supplier_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "status" "PurchaseStatus" NOT NULL DEFAULT 'DRAFT',
    "expected_at" DATE,
    "invoice_number" VARCHAR(40),
    "freight" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "ordered_at" TIMESTAMPTZ(6),
    "received_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "core_purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core_purchase_order_items" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "purchase_order_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "received_qty" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "unit_cost" DECIMAL(14,4) NOT NULL,
    "total" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "core_purchase_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core_payment_intents" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "order_id" UUID,
    "finance_entry_id" UUID,
    "provider" VARCHAR(30) NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "status" "PaymentIntentStatus" NOT NULL DEFAULT 'PENDING',
    "external_id" VARCHAR(120),
    "qr_code" TEXT,
    "checkout_url" TEXT,
    "expires_at" TIMESTAMPTZ(6),
    "paid_at" TIMESTAMPTZ(6),
    "raw" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "core_payment_intents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "food_recipe_items" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "menu_item_id" UUID NOT NULL,
    "ingredient_variant_id" UUID NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,

    CONSTRAINT "food_recipe_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "core_outbox_events_status_next_attempt_at_idx" ON "core_outbox_events"("status", "next_attempt_at");

-- CreateIndex
CREATE INDEX "core_outbox_events_tenant_id_occurred_at_idx" ON "core_outbox_events"("tenant_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "core_webhooks_tenant_id_id_key" ON "core_webhooks"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "core_webhook_deliveries_tenant_id_webhook_id_created_at_idx" ON "core_webhook_deliveries"("tenant_id", "webhook_id", "created_at");

-- CreateIndex
CREATE INDEX "core_notifications_tenant_id_user_id_created_at_idx" ON "core_notifications"("tenant_id", "user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "core_notifications_tenant_id_id_key" ON "core_notifications"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "core_notification_reads_tenant_id_notification_id_user_id_key" ON "core_notification_reads"("tenant_id", "notification_id", "user_id");

-- CreateIndex
CREATE INDEX "core_suppliers_tenant_id_name_idx" ON "core_suppliers"("tenant_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "core_suppliers_tenant_id_document_key" ON "core_suppliers"("tenant_id", "document");

-- CreateIndex
CREATE UNIQUE INDEX "core_suppliers_tenant_id_id_key" ON "core_suppliers"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "core_purchase_orders_tenant_id_status_idx" ON "core_purchase_orders"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "core_purchase_orders_tenant_id_number_key" ON "core_purchase_orders"("tenant_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "core_purchase_orders_tenant_id_id_key" ON "core_purchase_orders"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "core_purchase_order_items_tenant_id_purchase_order_id_varia_key" ON "core_purchase_order_items"("tenant_id", "purchase_order_id", "variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "core_purchase_order_items_tenant_id_id_key" ON "core_purchase_order_items"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "core_payment_intents_tenant_id_status_idx" ON "core_payment_intents"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "core_payment_intents_tenant_id_provider_external_id_key" ON "core_payment_intents"("tenant_id", "provider", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "core_payment_intents_tenant_id_id_key" ON "core_payment_intents"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "food_recipe_items_tenant_id_menu_item_id_ingredient_variant_key" ON "food_recipe_items"("tenant_id", "menu_item_id", "ingredient_variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "food_recipe_items_tenant_id_id_key" ON "food_recipe_items"("tenant_id", "id");

-- AddForeignKey
ALTER TABLE "core_outbox_events" ADD CONSTRAINT "core_outbox_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_webhooks" ADD CONSTRAINT "core_webhooks_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_webhook_deliveries" ADD CONSTRAINT "core_webhook_deliveries_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_webhook_deliveries" ADD CONSTRAINT "core_webhook_deliveries_tenant_id_webhook_id_fkey" FOREIGN KEY ("tenant_id", "webhook_id") REFERENCES "core_webhooks"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_webhook_deliveries" ADD CONSTRAINT "core_webhook_deliveries_outbox_event_id_fkey" FOREIGN KEY ("outbox_event_id") REFERENCES "core_outbox_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_notifications" ADD CONSTRAINT "core_notifications_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_notifications" ADD CONSTRAINT "core_notifications_tenant_id_user_id_fkey" FOREIGN KEY ("tenant_id", "user_id") REFERENCES "core_users"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_notification_reads" ADD CONSTRAINT "core_notification_reads_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_notification_reads" ADD CONSTRAINT "core_notification_reads_tenant_id_notification_id_fkey" FOREIGN KEY ("tenant_id", "notification_id") REFERENCES "core_notifications"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_notification_reads" ADD CONSTRAINT "core_notification_reads_tenant_id_user_id_fkey" FOREIGN KEY ("tenant_id", "user_id") REFERENCES "core_users"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_suppliers" ADD CONSTRAINT "core_suppliers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_purchase_orders" ADD CONSTRAINT "core_purchase_orders_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_purchase_orders" ADD CONSTRAINT "core_purchase_orders_tenant_id_supplier_id_fkey" FOREIGN KEY ("tenant_id", "supplier_id") REFERENCES "core_suppliers"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_purchase_orders" ADD CONSTRAINT "core_purchase_orders_tenant_id_warehouse_id_fkey" FOREIGN KEY ("tenant_id", "warehouse_id") REFERENCES "core_warehouses"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_purchase_order_items" ADD CONSTRAINT "core_purchase_order_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_purchase_order_items" ADD CONSTRAINT "core_purchase_order_items_tenant_id_purchase_order_id_fkey" FOREIGN KEY ("tenant_id", "purchase_order_id") REFERENCES "core_purchase_orders"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_purchase_order_items" ADD CONSTRAINT "core_purchase_order_items_tenant_id_variant_id_fkey" FOREIGN KEY ("tenant_id", "variant_id") REFERENCES "core_product_variants"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_payment_intents" ADD CONSTRAINT "core_payment_intents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_payment_intents" ADD CONSTRAINT "core_payment_intents_tenant_id_order_id_fkey" FOREIGN KEY ("tenant_id", "order_id") REFERENCES "core_orders"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_payment_intents" ADD CONSTRAINT "core_payment_intents_tenant_id_finance_entry_id_fkey" FOREIGN KEY ("tenant_id", "finance_entry_id") REFERENCES "core_finance_entries"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_recipe_items" ADD CONSTRAINT "food_recipe_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_recipe_items" ADD CONSTRAINT "food_recipe_items_tenant_id_menu_item_id_fkey" FOREIGN KEY ("tenant_id", "menu_item_id") REFERENCES "food_menu_items"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_recipe_items" ADD CONSTRAINT "food_recipe_items_tenant_id_ingredient_variant_id_fkey" FOREIGN KEY ("tenant_id", "ingredient_variant_id") REFERENCES "core_product_variants"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
