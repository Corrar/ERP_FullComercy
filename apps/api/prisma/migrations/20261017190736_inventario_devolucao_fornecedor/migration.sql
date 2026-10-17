-- CreateEnum
CREATE TYPE "StockCountStatus" AS ENUM ('OPEN', 'APPLIED', 'CANCELLED');

-- CreateTable
CREATE TABLE "core_stock_counts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "status" "StockCountStatus" NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "category_id" UUID,
    "opened_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "applied_at" TIMESTAMPTZ(6),
    "opened_by_user_id" UUID,

    CONSTRAINT "core_stock_counts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core_stock_count_items" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "count_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "snapshot_qty" DECIMAL(14,3) NOT NULL,
    "counted_qty" DECIMAL(14,3),
    "counted_at" TIMESTAMPTZ(6),
    "note" TEXT,

    CONSTRAINT "core_stock_count_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core_purchase_returns" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "purchase_order_id" UUID NOT NULL,
    "supplier_id" UUID NOT NULL,
    "reason" TEXT,
    "total_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "core_purchase_returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core_purchase_return_items" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "return_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unit_cost" DECIMAL(14,4) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,

    CONSTRAINT "core_purchase_return_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "core_stock_counts_tenant_id_status_idx" ON "core_stock_counts"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "core_stock_counts_tenant_id_id_key" ON "core_stock_counts"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "core_stock_count_items_tenant_id_count_id_variant_id_key" ON "core_stock_count_items"("tenant_id", "count_id", "variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "core_stock_count_items_tenant_id_id_key" ON "core_stock_count_items"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "core_purchase_returns_tenant_id_id_key" ON "core_purchase_returns"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "core_purchase_return_items_tenant_id_return_id_variant_id_key" ON "core_purchase_return_items"("tenant_id", "return_id", "variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "core_purchase_return_items_tenant_id_id_key" ON "core_purchase_return_items"("tenant_id", "id");

-- AddForeignKey
ALTER TABLE "core_stock_counts" ADD CONSTRAINT "core_stock_counts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_stock_counts" ADD CONSTRAINT "core_stock_counts_tenant_id_warehouse_id_fkey" FOREIGN KEY ("tenant_id", "warehouse_id") REFERENCES "core_warehouses"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_stock_count_items" ADD CONSTRAINT "core_stock_count_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_stock_count_items" ADD CONSTRAINT "core_stock_count_items_tenant_id_count_id_fkey" FOREIGN KEY ("tenant_id", "count_id") REFERENCES "core_stock_counts"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_stock_count_items" ADD CONSTRAINT "core_stock_count_items_tenant_id_variant_id_fkey" FOREIGN KEY ("tenant_id", "variant_id") REFERENCES "core_product_variants"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_purchase_returns" ADD CONSTRAINT "core_purchase_returns_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_purchase_returns" ADD CONSTRAINT "core_purchase_returns_tenant_id_purchase_order_id_fkey" FOREIGN KEY ("tenant_id", "purchase_order_id") REFERENCES "core_purchase_orders"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_purchase_returns" ADD CONSTRAINT "core_purchase_returns_tenant_id_supplier_id_fkey" FOREIGN KEY ("tenant_id", "supplier_id") REFERENCES "core_suppliers"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_purchase_return_items" ADD CONSTRAINT "core_purchase_return_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_purchase_return_items" ADD CONSTRAINT "core_purchase_return_items_tenant_id_return_id_fkey" FOREIGN KEY ("tenant_id", "return_id") REFERENCES "core_purchase_returns"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_purchase_return_items" ADD CONSTRAINT "core_purchase_return_items_tenant_id_variant_id_fkey" FOREIGN KEY ("tenant_id", "variant_id") REFERENCES "core_product_variants"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
