-- CreateEnum
CREATE TYPE "ModuleKey" AS ENUM ('VAREJO', 'FOOD', 'ACADEMIA', 'SERVICOS');

-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('TRIAL', 'ACTIVE', 'SUSPENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PermissionEffect" AS ENUM ('ALLOW', 'DENY');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'DEBIT', 'CREDIT', 'PIX', 'VOUCHER', 'TRANSFER', 'STORE_CREDIT', 'OTHER');

-- CreateEnum
CREATE TYPE "FinanceAccountKind" AS ENUM ('CASH', 'BANK', 'DIGITAL');

-- CreateEnum
CREATE TYPE "FinanceEntryKind" AS ENUM ('RECEIVABLE', 'PAYABLE');

-- CreateEnum
CREATE TYPE "FinanceEntryStatus" AS ENUM ('OPEN', 'PARTIAL', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProductKind" AS ENUM ('GOOD', 'SERVICE');

-- CreateEnum
CREATE TYPE "StockMovementKind" AS ENUM ('OPENING', 'RECEIVE', 'RESERVE', 'RELEASE', 'CONSUME', 'ADJUST', 'TRANSFER_OUT', 'TRANSFER_IN');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('DRAFT', 'OPEN', 'CONFIRMED', 'IN_PROGRESS', 'READY', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OrderChannel" AS ENUM ('POS', 'COUNTER', 'TABLE', 'ONLINE', 'DELIVERY', 'SUBSCRIPTION', 'WORKSHOP');

-- CreateEnum
CREATE TYPE "OrderItemKind" AS ENUM ('PRODUCT', 'SERVICE', 'FEE', 'DISCOUNT');

-- CreateEnum
CREATE TYPE "PosSessionStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "CommissionStatus" AS ENUM ('PENDING', 'APPROVED', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LabelBatchStatus" AS ENUM ('DRAFT', 'GENERATED', 'PRINTED');

-- CreateEnum
CREATE TYPE "ReturnStatus" AS ENUM ('OPEN', 'APPROVED', 'REFUNDED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RefundMethod" AS ENUM ('CASH', 'PIX', 'CARD_REVERSAL', 'STORE_CREDIT', 'EXCHANGE');

-- CreateEnum
CREATE TYPE "TableStatus" AS ENUM ('FREE', 'OCCUPIED', 'RESERVED', 'CLOSING');

-- CreateEnum
CREATE TYPE "TabStatus" AS ENUM ('OPEN', 'CLOSING', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FoodServiceType" AS ENUM ('DINE_IN', 'TAKEOUT', 'DELIVERY');

-- CreateEnum
CREATE TYPE "KitchenStatus" AS ENUM ('QUEUED', 'PREPARING', 'READY', 'SERVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'ASSIGNED', 'PICKED_UP', 'DELIVERED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BillingCycle" AS ENUM ('WEEKLY', 'MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'PAUSED', 'OVERDUE', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "CheckInSource" AS ENUM ('MANUAL', 'TURNSTILE', 'APP', 'QR');

-- CreateEnum
CREATE TYPE "AccessDeviceKind" AS ENUM ('TURNSTILE', 'DOOR', 'BIOMETRIC', 'QR_READER');

-- CreateEnum
CREATE TYPE "CredentialKind" AS ENUM ('CARD', 'BIOMETRIC', 'QR', 'PIN', 'FACE');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('BOOKED', 'ATTENDED', 'NO_SHOW', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MaintenanceStatus" AS ENUM ('RECEIVED', 'DIAGNOSING', 'AWAITING_APPROVAL', 'APPROVED', 'AWAITING_PARTS', 'IN_SERVICE', 'QUALITY_CHECK', 'READY', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('SCHEDULED', 'CONFIRMED', 'ARRIVED', 'NO_SHOW', 'CANCELLED');

-- CreateTable
CREATE TABLE "core_tenants" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(60) NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "document" VARCHAR(20),
    "status" "TenantStatus" NOT NULL DEFAULT 'TRIAL',
    "timezone" VARCHAR(40) NOT NULL DEFAULT 'America/Sao_Paulo',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "core_tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core_tenant_modules" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "module_key" "ModuleKey" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "config" JSONB NOT NULL DEFAULT '{}',
    "enabled_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "core_tenant_modules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core_users" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "email" VARCHAR(160) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "core_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core_roles" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "key" VARCHAR(40) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "core_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core_role_permissions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "permission_key" VARCHAR(80) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "core_role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core_user_roles" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "core_user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core_user_permissions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "permission_key" VARCHAR(80) NOT NULL,
    "effect" "PermissionEffect" NOT NULL DEFAULT 'ALLOW',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "core_user_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core_refresh_tokens" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "user_agent" TEXT,
    "ip" VARCHAR(45),
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "core_refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core_audit_logs" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID,
    "action" VARCHAR(80) NOT NULL,
    "entity" VARCHAR(60),
    "entity_id" VARCHAR(60),
    "ip" VARCHAR(45),
    "details" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "core_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core_customers" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" VARCHAR(30),
    "name" VARCHAR(160) NOT NULL,
    "document" VARCHAR(20),
    "email" VARCHAR(160),
    "phone" VARCHAR(30),
    "birth_date" DATE,
    "notes" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "core_customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core_customer_addresses" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "label" VARCHAR(40),
    "street" VARCHAR(160) NOT NULL,
    "number" VARCHAR(20),
    "complement" VARCHAR(80),
    "district" VARCHAR(80),
    "city" VARCHAR(80) NOT NULL,
    "state" VARCHAR(2) NOT NULL,
    "zip_code" VARCHAR(10),
    "lat" DECIMAL(10,7),
    "lng" DECIMAL(10,7),
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "core_customer_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core_finance_accounts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "kind" "FinanceAccountKind" NOT NULL DEFAULT 'CASH',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "core_finance_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core_finance_categories" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "kind" "FinanceEntryKind" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "core_finance_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core_finance_entries" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "kind" "FinanceEntryKind" NOT NULL,
    "status" "FinanceEntryStatus" NOT NULL DEFAULT 'OPEN',
    "description" VARCHAR(200) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "paid_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "due_date" DATE NOT NULL,
    "paid_at" TIMESTAMPTZ(6),
    "customer_id" UUID,
    "category_id" UUID,
    "order_id" UUID,
    "origin" VARCHAR(40) NOT NULL DEFAULT 'MANUAL',
    "origin_id" UUID,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "core_finance_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core_finance_payments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "entry_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "paid_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reference" VARCHAR(120),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "core_finance_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core_product_categories" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "parent_id" UUID,
    "name" VARCHAR(80) NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "core_product_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core_products" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "category_id" UUID,
    "name" VARCHAR(160) NOT NULL,
    "description" TEXT,
    "kind" "ProductKind" NOT NULL DEFAULT 'GOOD',
    "unit" VARCHAR(6) NOT NULL DEFAULT 'UN',
    "track_stock" BOOLEAN NOT NULL DEFAULT true,
    "has_variants" BOOLEAN NOT NULL DEFAULT false,
    "cost_price" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "sale_price" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "image_url" TEXT,
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "core_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core_product_variants" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "sku" VARCHAR(60) NOT NULL,
    "barcode" VARCHAR(60),
    "name" VARCHAR(160),
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "price_override" DECIMAL(14,2),
    "cost_override" DECIMAL(14,2),
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "core_product_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core_warehouses" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "core_warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core_stock_balances" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "on_hand" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "reserved" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "min_level" DECIMAL(14,3),
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "core_stock_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core_stock_ledger" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "warehouse_id" UUID NOT NULL,
    "kind" "StockMovementKind" NOT NULL,
    "delta_on_hand" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "delta_reserved" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "unit_cost" DECIMAL(14,4),
    "ref_type" VARCHAR(40),
    "ref_id" UUID,
    "idempotency_key" VARCHAR(120),
    "user_id" UUID,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "core_stock_ledger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core_order_counters" (
    "tenant_id" UUID NOT NULL,
    "last_number" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "core_order_counters_pkey" PRIMARY KEY ("tenant_id")
);

-- CreateTable
CREATE TABLE "core_orders" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "module_key" "ModuleKey",
    "channel" "OrderChannel" NOT NULL DEFAULT 'COUNTER',
    "status" "OrderStatus" NOT NULL DEFAULT 'OPEN',
    "customer_id" UUID,
    "seller_user_id" UUID,
    "warehouse_id" UUID,
    "subtotal" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "surcharge" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "confirmed_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "cancel_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "core_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core_order_items" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "variant_id" UUID,
    "kind" "OrderItemKind" NOT NULL DEFAULT 'PRODUCT',
    "description" VARCHAR(200) NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unit_price" DECIMAL(14,2) NOT NULL,
    "discount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "core_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core_order_payments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "installments" INTEGER NOT NULL DEFAULT 1,
    "reference" VARCHAR(120),
    "paid_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "core_order_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "core_order_status_history" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "from_status" "OrderStatus",
    "to_status" "OrderStatus" NOT NULL,
    "user_id" UUID,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "core_order_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ret_grade_axes" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(40) NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ret_grade_axes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ret_grade_values" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "axis_id" UUID NOT NULL,
    "value" VARCHAR(40) NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "hex_color" VARCHAR(7),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ret_grade_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ret_variant_attributes" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "axis_id" UUID NOT NULL,
    "value_id" UUID NOT NULL,

    CONSTRAINT "ret_variant_attributes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ret_salespeople" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID,
    "name" VARCHAR(120) NOT NULL,
    "default_commission_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ret_salespeople_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ret_commission_rules" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "salesperson_id" UUID,
    "category_id" UUID,
    "rate" DECIMAL(5,2) NOT NULL,
    "valid_from" DATE NOT NULL,
    "valid_to" DATE,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ret_commission_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ret_pos_sessions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "terminal" VARCHAR(40) NOT NULL DEFAULT 'CAIXA-1',
    "status" "PosSessionStatus" NOT NULL DEFAULT 'OPEN',
    "opened_by_user_id" UUID NOT NULL,
    "closed_by_user_id" UUID,
    "opening_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "expected_amount" DECIMAL(14,2),
    "closing_amount" DECIMAL(14,2),
    "opened_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMPTZ(6),
    "notes" TEXT,

    CONSTRAINT "ret_pos_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ret_sales" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "pos_session_id" UUID,
    "salesperson_id" UUID,
    "commission_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "exchange_of_sale_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ret_sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ret_commissions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "sale_id" UUID NOT NULL,
    "salesperson_id" UUID NOT NULL,
    "base_amount" DECIMAL(14,2) NOT NULL,
    "rate" DECIMAL(5,2) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "status" "CommissionStatus" NOT NULL DEFAULT 'PENDING',
    "paid_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ret_commissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ret_label_templates" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "width_mm" DECIMAL(6,2) NOT NULL,
    "height_mm" DECIMAL(6,2) NOT NULL,
    "layout" JSONB NOT NULL DEFAULT '{}',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ret_label_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ret_label_batches" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "status" "LabelBatchStatus" NOT NULL DEFAULT 'DRAFT',
    "file_url" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "printed_at" TIMESTAMPTZ(6),

    CONSTRAINT "ret_label_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ret_label_batch_items" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "ret_label_batch_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ret_returns" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "sale_id" UUID NOT NULL,
    "status" "ReturnStatus" NOT NULL DEFAULT 'OPEN',
    "refund_method" "RefundMethod" NOT NULL DEFAULT 'STORE_CREDIT',
    "total_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "reason" TEXT,
    "user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(6),

    CONSTRAINT "ret_returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ret_return_items" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "return_id" UUID NOT NULL,
    "order_item_id" UUID NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "restock" BOOLEAN NOT NULL DEFAULT true,
    "condition" VARCHAR(40),

    CONSTRAINT "ret_return_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "food_tables" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "name" VARCHAR(40),
    "area" VARCHAR(40),
    "seats" INTEGER NOT NULL DEFAULT 4,
    "status" "TableStatus" NOT NULL DEFAULT 'FREE',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "food_tables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "food_tabs" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "table_id" UUID,
    "customer_name" VARCHAR(80),
    "guests" INTEGER NOT NULL DEFAULT 1,
    "status" "TabStatus" NOT NULL DEFAULT 'OPEN',
    "service_fee_rate" DECIMAL(5,2) NOT NULL DEFAULT 10,
    "opened_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMPTZ(6),

    CONSTRAINT "food_tabs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "food_menus" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "slug" VARCHAR(60) NOT NULL,
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "availability" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "food_menus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "food_menu_categories" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "menu_id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "food_menu_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "food_menu_items" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "menu_id" UUID NOT NULL,
    "category_id" UUID,
    "variant_id" UUID NOT NULL,
    "display_name" VARCHAR(120) NOT NULL,
    "description" TEXT,
    "price" DECIMAL(14,2) NOT NULL,
    "image_url" TEXT,
    "station" VARCHAR(30) NOT NULL DEFAULT 'COZINHA',
    "prep_time_min" INTEGER,
    "is_available" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "food_menu_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "food_modifier_groups" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "min_select" INTEGER NOT NULL DEFAULT 0,
    "max_select" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "food_modifier_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "food_modifiers" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "price" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "food_modifiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "food_menu_item_modifier_groups" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "menu_item_id" UUID NOT NULL,
    "group_id" UUID NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "food_menu_item_modifier_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "food_orders" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "service_type" "FoodServiceType" NOT NULL DEFAULT 'DINE_IN',
    "table_id" UUID,
    "tab_id" UUID,
    "kitchen_status" "KitchenStatus" NOT NULL DEFAULT 'QUEUED',
    "scheduled_for" TIMESTAMPTZ(6),
    "external_source" VARCHAR(30),
    "external_id" VARCHAR(80),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "food_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "food_kitchen_tickets" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "food_order_id" UUID NOT NULL,
    "station" VARCHAR(30) NOT NULL,
    "status" "KitchenStatus" NOT NULL DEFAULT 'QUEUED',
    "started_at" TIMESTAMPTZ(6),
    "ready_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "food_kitchen_tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "food_kitchen_ticket_items" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "ticket_id" UUID NOT NULL,
    "order_item_id" UUID NOT NULL,
    "status" "KitchenStatus" NOT NULL DEFAULT 'QUEUED',
    "display" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "food_kitchen_ticket_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "food_couriers" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID,
    "name" VARCHAR(120) NOT NULL,
    "phone" VARCHAR(30),
    "vehicle" VARCHAR(40),
    "plate" VARCHAR(10),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "food_couriers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "food_delivery_zones" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "rule" JSONB NOT NULL DEFAULT '{}',
    "fee" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "eta_min" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "food_delivery_zones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "food_deliveries" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "food_order_id" UUID NOT NULL,
    "courier_id" UUID,
    "zone_id" UUID,
    "address" JSONB NOT NULL,
    "fee" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "assigned_at" TIMESTAMPTZ(6),
    "picked_up_at" TIMESTAMPTZ(6),
    "delivered_at" TIMESTAMPTZ(6),
    "fail_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "food_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gym_plans" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "product_id" UUID,
    "name" VARCHAR(80) NOT NULL,
    "description" TEXT,
    "price" DECIMAL(14,2) NOT NULL,
    "billing_cycle" "BillingCycle" NOT NULL DEFAULT 'MONTHLY',
    "contract_cycles" INTEGER,
    "enrollment_fee" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "accessRules" JSONB NOT NULL DEFAULT '{}',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "gym_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gym_memberships" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "order_id" UUID,
    "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "next_billing_at" DATE,
    "auto_renew" BOOLEAN NOT NULL DEFAULT true,
    "paused_until" DATE,
    "cancelled_at" TIMESTAMPTZ(6),
    "cancel_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "gym_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gym_membership_charges" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "finance_entry_id" UUID NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gym_membership_charges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gym_check_ins" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "membership_id" UUID,
    "device_id" UUID,
    "source" "CheckInSource" NOT NULL DEFAULT 'MANUAL',
    "checked_in_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checked_out_at" TIMESTAMPTZ(6),

    CONSTRAINT "gym_check_ins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gym_access_devices" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "kind" "AccessDeviceKind" NOT NULL DEFAULT 'TURNSTILE',
    "provider" VARCHAR(40) NOT NULL,
    "config" JSONB NOT NULL DEFAULT '{}',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_seen_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "gym_access_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gym_access_credentials" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "kind" "CredentialKind" NOT NULL,
    "value_hash" VARCHAR(200) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(6),

    CONSTRAINT "gym_access_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gym_access_events" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" UUID NOT NULL,
    "device_id" UUID NOT NULL,
    "credential_id" UUID,
    "customer_id" UUID,
    "allowed" BOOLEAN NOT NULL,
    "reason" VARCHAR(80),
    "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw" JSONB,

    CONSTRAINT "gym_access_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gym_classes" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "instructor_user_id" UUID,
    "capacity" INTEGER NOT NULL DEFAULT 20,
    "duration_min" INTEGER NOT NULL DEFAULT 60,
    "schedule" JSONB NOT NULL DEFAULT '[]',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "gym_classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gym_class_sessions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "capacity" INTEGER NOT NULL,
    "cancelled" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gym_class_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gym_class_bookings" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'BOOKED',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gym_class_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "svc_vehicles" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "plate" VARCHAR(10) NOT NULL,
    "brand" VARCHAR(40),
    "model" VARCHAR(60),
    "year" INTEGER,
    "color" VARCHAR(30),
    "vin" VARCHAR(20),
    "mileage" INTEGER,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "svc_vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "svc_service_catalog" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "product_id" UUID,
    "name" VARCHAR(120) NOT NULL,
    "default_price" DECIMAL(14,2) NOT NULL,
    "estimated_minutes" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "svc_service_catalog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "svc_service_orders" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "vehicle_id" UUID,
    "technician_user_id" UUID,
    "maintenance_status" "MaintenanceStatus" NOT NULL DEFAULT 'RECEIVED',
    "mileage_in" INTEGER,
    "fuel_level" VARCHAR(10),
    "complaint" TEXT,
    "diagnosis" TEXT,
    "promised_at" TIMESTAMPTZ(6),
    "approved_at" TIMESTAMPTZ(6),
    "started_at" TIMESTAMPTZ(6),
    "finished_at" TIMESTAMPTZ(6),
    "delivered_at" TIMESTAMPTZ(6),
    "warranty_days" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "svc_service_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "svc_service_order_events" (
    "id" BIGSERIAL NOT NULL,
    "tenant_id" UUID NOT NULL,
    "service_order_id" UUID NOT NULL,
    "from_status" "MaintenanceStatus",
    "to_status" "MaintenanceStatus" NOT NULL,
    "user_id" UUID,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "svc_service_order_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "svc_checklist_items" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "service_order_id" UUID NOT NULL,
    "phase" VARCHAR(5) NOT NULL DEFAULT 'IN',
    "label" VARCHAR(80) NOT NULL,
    "checked" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "photo_url" TEXT,

    CONSTRAINT "svc_checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "svc_appointments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "vehicle_id" UUID,
    "scheduled_at" TIMESTAMPTZ(6) NOT NULL,
    "duration_min" INTEGER NOT NULL DEFAULT 60,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "service" VARCHAR(160),
    "notes" TEXT,
    "order_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "svc_appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "svc_attachments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "service_order_id" UUID NOT NULL,
    "kind" VARCHAR(20) NOT NULL DEFAULT 'PHOTO',
    "url" TEXT NOT NULL,
    "caption" VARCHAR(160),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "svc_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "core_tenants_slug_key" ON "core_tenants"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "core_tenant_modules_tenant_id_module_key_key" ON "core_tenant_modules"("tenant_id", "module_key");

-- CreateIndex
CREATE UNIQUE INDEX "core_tenant_modules_tenant_id_id_key" ON "core_tenant_modules"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "core_users_tenant_id_email_key" ON "core_users"("tenant_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "core_users_tenant_id_id_key" ON "core_users"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "core_roles_tenant_id_key_key" ON "core_roles"("tenant_id", "key");

-- CreateIndex
CREATE UNIQUE INDEX "core_roles_tenant_id_id_key" ON "core_roles"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "core_role_permissions_tenant_id_role_id_permission_key_key" ON "core_role_permissions"("tenant_id", "role_id", "permission_key");

-- CreateIndex
CREATE UNIQUE INDEX "core_role_permissions_tenant_id_id_key" ON "core_role_permissions"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "core_user_roles_tenant_id_user_id_role_id_key" ON "core_user_roles"("tenant_id", "user_id", "role_id");

-- CreateIndex
CREATE UNIQUE INDEX "core_user_roles_tenant_id_id_key" ON "core_user_roles"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "core_user_permissions_tenant_id_user_id_permission_key_key" ON "core_user_permissions"("tenant_id", "user_id", "permission_key");

-- CreateIndex
CREATE UNIQUE INDEX "core_user_permissions_tenant_id_id_key" ON "core_user_permissions"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "core_refresh_tokens_token_hash_key" ON "core_refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "core_refresh_tokens_tenant_id_user_id_idx" ON "core_refresh_tokens"("tenant_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "core_refresh_tokens_tenant_id_id_key" ON "core_refresh_tokens"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "core_audit_logs_tenant_id_created_at_idx" ON "core_audit_logs"("tenant_id", "created_at");

-- CreateIndex
CREATE INDEX "core_audit_logs_tenant_id_action_idx" ON "core_audit_logs"("tenant_id", "action");

-- CreateIndex
CREATE INDEX "core_customers_tenant_id_name_idx" ON "core_customers"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "core_customers_tenant_id_phone_idx" ON "core_customers"("tenant_id", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "core_customers_tenant_id_document_key" ON "core_customers"("tenant_id", "document");

-- CreateIndex
CREATE UNIQUE INDEX "core_customers_tenant_id_code_key" ON "core_customers"("tenant_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "core_customers_tenant_id_id_key" ON "core_customers"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "core_customer_addresses_tenant_id_customer_id_idx" ON "core_customer_addresses"("tenant_id", "customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "core_customer_addresses_tenant_id_id_key" ON "core_customer_addresses"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "core_finance_accounts_tenant_id_name_key" ON "core_finance_accounts"("tenant_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "core_finance_accounts_tenant_id_id_key" ON "core_finance_accounts"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "core_finance_categories_tenant_id_kind_name_key" ON "core_finance_categories"("tenant_id", "kind", "name");

-- CreateIndex
CREATE UNIQUE INDEX "core_finance_categories_tenant_id_id_key" ON "core_finance_categories"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "core_finance_entries_tenant_id_kind_status_due_date_idx" ON "core_finance_entries"("tenant_id", "kind", "status", "due_date");

-- CreateIndex
CREATE INDEX "core_finance_entries_tenant_id_customer_id_idx" ON "core_finance_entries"("tenant_id", "customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "core_finance_entries_tenant_id_id_key" ON "core_finance_entries"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "core_finance_payments_tenant_id_entry_id_idx" ON "core_finance_payments"("tenant_id", "entry_id");

-- CreateIndex
CREATE UNIQUE INDEX "core_finance_payments_tenant_id_id_key" ON "core_finance_payments"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "core_product_categories_tenant_id_parent_id_name_key" ON "core_product_categories"("tenant_id", "parent_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "core_product_categories_tenant_id_id_key" ON "core_product_categories"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "core_products_tenant_id_name_idx" ON "core_products"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "core_products_tenant_id_category_id_idx" ON "core_products"("tenant_id", "category_id");

-- CreateIndex
CREATE UNIQUE INDEX "core_products_tenant_id_id_key" ON "core_products"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "core_product_variants_tenant_id_product_id_idx" ON "core_product_variants"("tenant_id", "product_id");

-- CreateIndex
CREATE UNIQUE INDEX "core_product_variants_tenant_id_sku_key" ON "core_product_variants"("tenant_id", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "core_product_variants_tenant_id_barcode_key" ON "core_product_variants"("tenant_id", "barcode");

-- CreateIndex
CREATE UNIQUE INDEX "core_product_variants_tenant_id_id_key" ON "core_product_variants"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "core_warehouses_tenant_id_code_key" ON "core_warehouses"("tenant_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "core_warehouses_tenant_id_id_key" ON "core_warehouses"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "core_stock_balances_tenant_id_variant_id_warehouse_id_key" ON "core_stock_balances"("tenant_id", "variant_id", "warehouse_id");

-- CreateIndex
CREATE UNIQUE INDEX "core_stock_balances_tenant_id_id_key" ON "core_stock_balances"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "core_stock_ledger_tenant_id_variant_id_warehouse_id_created_idx" ON "core_stock_ledger"("tenant_id", "variant_id", "warehouse_id", "created_at");

-- CreateIndex
CREATE INDEX "core_stock_ledger_tenant_id_ref_type_ref_id_idx" ON "core_stock_ledger"("tenant_id", "ref_type", "ref_id");

-- CreateIndex
CREATE UNIQUE INDEX "core_stock_ledger_tenant_id_idempotency_key_key" ON "core_stock_ledger"("tenant_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "core_orders_tenant_id_status_created_at_idx" ON "core_orders"("tenant_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "core_orders_tenant_id_customer_id_idx" ON "core_orders"("tenant_id", "customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "core_orders_tenant_id_number_key" ON "core_orders"("tenant_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "core_orders_tenant_id_id_key" ON "core_orders"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "core_order_items_tenant_id_order_id_idx" ON "core_order_items"("tenant_id", "order_id");

-- CreateIndex
CREATE UNIQUE INDEX "core_order_items_tenant_id_id_key" ON "core_order_items"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "core_order_payments_tenant_id_order_id_idx" ON "core_order_payments"("tenant_id", "order_id");

-- CreateIndex
CREATE UNIQUE INDEX "core_order_payments_tenant_id_id_key" ON "core_order_payments"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "core_order_status_history_tenant_id_order_id_idx" ON "core_order_status_history"("tenant_id", "order_id");

-- CreateIndex
CREATE UNIQUE INDEX "ret_grade_axes_tenant_id_name_key" ON "ret_grade_axes"("tenant_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ret_grade_axes_tenant_id_id_key" ON "ret_grade_axes"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ret_grade_values_tenant_id_axis_id_value_key" ON "ret_grade_values"("tenant_id", "axis_id", "value");

-- CreateIndex
CREATE UNIQUE INDEX "ret_grade_values_tenant_id_id_key" ON "ret_grade_values"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ret_variant_attributes_tenant_id_variant_id_axis_id_key" ON "ret_variant_attributes"("tenant_id", "variant_id", "axis_id");

-- CreateIndex
CREATE UNIQUE INDEX "ret_variant_attributes_tenant_id_id_key" ON "ret_variant_attributes"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ret_salespeople_tenant_id_user_id_key" ON "ret_salespeople"("tenant_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "ret_salespeople_tenant_id_id_key" ON "ret_salespeople"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "ret_commission_rules_tenant_id_salesperson_id_valid_from_idx" ON "ret_commission_rules"("tenant_id", "salesperson_id", "valid_from");

-- CreateIndex
CREATE UNIQUE INDEX "ret_commission_rules_tenant_id_id_key" ON "ret_commission_rules"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "ret_pos_sessions_tenant_id_status_terminal_idx" ON "ret_pos_sessions"("tenant_id", "status", "terminal");

-- CreateIndex
CREATE UNIQUE INDEX "ret_pos_sessions_tenant_id_id_key" ON "ret_pos_sessions"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ret_sales_tenant_id_order_id_key" ON "ret_sales"("tenant_id", "order_id");

-- CreateIndex
CREATE UNIQUE INDEX "ret_sales_tenant_id_id_key" ON "ret_sales"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "ret_commissions_tenant_id_salesperson_id_status_idx" ON "ret_commissions"("tenant_id", "salesperson_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ret_commissions_tenant_id_id_key" ON "ret_commissions"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ret_label_templates_tenant_id_name_key" ON "ret_label_templates"("tenant_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ret_label_templates_tenant_id_id_key" ON "ret_label_templates"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ret_label_batches_tenant_id_id_key" ON "ret_label_batches"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ret_label_batch_items_tenant_id_batch_id_variant_id_key" ON "ret_label_batch_items"("tenant_id", "batch_id", "variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "ret_label_batch_items_tenant_id_id_key" ON "ret_label_batch_items"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "ret_returns_tenant_id_sale_id_idx" ON "ret_returns"("tenant_id", "sale_id");

-- CreateIndex
CREATE UNIQUE INDEX "ret_returns_tenant_id_id_key" ON "ret_returns"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ret_return_items_tenant_id_return_id_order_item_id_key" ON "ret_return_items"("tenant_id", "return_id", "order_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "ret_return_items_tenant_id_id_key" ON "ret_return_items"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "food_tables_tenant_id_number_key" ON "food_tables"("tenant_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "food_tables_tenant_id_id_key" ON "food_tables"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "food_tabs_tenant_id_status_code_idx" ON "food_tabs"("tenant_id", "status", "code");

-- CreateIndex
CREATE UNIQUE INDEX "food_tabs_tenant_id_id_key" ON "food_tabs"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "food_menus_tenant_id_slug_key" ON "food_menus"("tenant_id", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "food_menus_tenant_id_id_key" ON "food_menus"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "food_menu_categories_tenant_id_menu_id_name_key" ON "food_menu_categories"("tenant_id", "menu_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "food_menu_categories_tenant_id_id_key" ON "food_menu_categories"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "food_menu_items_tenant_id_menu_id_variant_id_key" ON "food_menu_items"("tenant_id", "menu_id", "variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "food_menu_items_tenant_id_id_key" ON "food_menu_items"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "food_modifier_groups_tenant_id_name_key" ON "food_modifier_groups"("tenant_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "food_modifier_groups_tenant_id_id_key" ON "food_modifier_groups"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "food_modifiers_tenant_id_group_id_name_key" ON "food_modifiers"("tenant_id", "group_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "food_modifiers_tenant_id_id_key" ON "food_modifiers"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "food_menu_item_modifier_groups_tenant_id_menu_item_id_group_key" ON "food_menu_item_modifier_groups"("tenant_id", "menu_item_id", "group_id");

-- CreateIndex
CREATE UNIQUE INDEX "food_menu_item_modifier_groups_tenant_id_id_key" ON "food_menu_item_modifier_groups"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "food_orders_tenant_id_kitchen_status_idx" ON "food_orders"("tenant_id", "kitchen_status");

-- CreateIndex
CREATE UNIQUE INDEX "food_orders_tenant_id_order_id_key" ON "food_orders"("tenant_id", "order_id");

-- CreateIndex
CREATE UNIQUE INDEX "food_orders_tenant_id_external_source_external_id_key" ON "food_orders"("tenant_id", "external_source", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "food_orders_tenant_id_id_key" ON "food_orders"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "food_kitchen_tickets_tenant_id_station_status_idx" ON "food_kitchen_tickets"("tenant_id", "station", "status");

-- CreateIndex
CREATE UNIQUE INDEX "food_kitchen_tickets_tenant_id_id_key" ON "food_kitchen_tickets"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "food_kitchen_ticket_items_tenant_id_ticket_id_order_item_id_key" ON "food_kitchen_ticket_items"("tenant_id", "ticket_id", "order_item_id");

-- CreateIndex
CREATE UNIQUE INDEX "food_kitchen_ticket_items_tenant_id_id_key" ON "food_kitchen_ticket_items"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "food_couriers_tenant_id_user_id_key" ON "food_couriers"("tenant_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "food_couriers_tenant_id_id_key" ON "food_couriers"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "food_delivery_zones_tenant_id_name_key" ON "food_delivery_zones"("tenant_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "food_delivery_zones_tenant_id_id_key" ON "food_delivery_zones"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "food_deliveries_tenant_id_status_courier_id_idx" ON "food_deliveries"("tenant_id", "status", "courier_id");

-- CreateIndex
CREATE UNIQUE INDEX "food_deliveries_tenant_id_food_order_id_key" ON "food_deliveries"("tenant_id", "food_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "food_deliveries_tenant_id_id_key" ON "food_deliveries"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "gym_plans_tenant_id_name_key" ON "gym_plans"("tenant_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "gym_plans_tenant_id_id_key" ON "gym_plans"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "gym_memberships_tenant_id_customer_id_status_idx" ON "gym_memberships"("tenant_id", "customer_id", "status");

-- CreateIndex
CREATE INDEX "gym_memberships_tenant_id_status_next_billing_at_idx" ON "gym_memberships"("tenant_id", "status", "next_billing_at");

-- CreateIndex
CREATE UNIQUE INDEX "gym_memberships_tenant_id_id_key" ON "gym_memberships"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "gym_membership_charges_tenant_id_membership_id_period_start_key" ON "gym_membership_charges"("tenant_id", "membership_id", "period_start");

-- CreateIndex
CREATE UNIQUE INDEX "gym_membership_charges_tenant_id_finance_entry_id_key" ON "gym_membership_charges"("tenant_id", "finance_entry_id");

-- CreateIndex
CREATE UNIQUE INDEX "gym_membership_charges_tenant_id_id_key" ON "gym_membership_charges"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "gym_check_ins_tenant_id_customer_id_checked_in_at_idx" ON "gym_check_ins"("tenant_id", "customer_id", "checked_in_at");

-- CreateIndex
CREATE INDEX "gym_check_ins_tenant_id_checked_in_at_idx" ON "gym_check_ins"("tenant_id", "checked_in_at");

-- CreateIndex
CREATE UNIQUE INDEX "gym_check_ins_tenant_id_id_key" ON "gym_check_ins"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "gym_access_devices_tenant_id_name_key" ON "gym_access_devices"("tenant_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "gym_access_devices_tenant_id_id_key" ON "gym_access_devices"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "gym_access_credentials_tenant_id_kind_value_hash_key" ON "gym_access_credentials"("tenant_id", "kind", "value_hash");

-- CreateIndex
CREATE UNIQUE INDEX "gym_access_credentials_tenant_id_id_key" ON "gym_access_credentials"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "gym_access_events_tenant_id_device_id_occurred_at_idx" ON "gym_access_events"("tenant_id", "device_id", "occurred_at");

-- CreateIndex
CREATE INDEX "gym_access_events_tenant_id_customer_id_occurred_at_idx" ON "gym_access_events"("tenant_id", "customer_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "gym_classes_tenant_id_name_key" ON "gym_classes"("tenant_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "gym_classes_tenant_id_id_key" ON "gym_classes"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "gym_class_sessions_tenant_id_starts_at_idx" ON "gym_class_sessions"("tenant_id", "starts_at");

-- CreateIndex
CREATE UNIQUE INDEX "gym_class_sessions_tenant_id_class_id_starts_at_key" ON "gym_class_sessions"("tenant_id", "class_id", "starts_at");

-- CreateIndex
CREATE UNIQUE INDEX "gym_class_sessions_tenant_id_id_key" ON "gym_class_sessions"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "gym_class_bookings_tenant_id_session_id_customer_id_key" ON "gym_class_bookings"("tenant_id", "session_id", "customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "gym_class_bookings_tenant_id_id_key" ON "gym_class_bookings"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "svc_vehicles_tenant_id_customer_id_idx" ON "svc_vehicles"("tenant_id", "customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "svc_vehicles_tenant_id_plate_key" ON "svc_vehicles"("tenant_id", "plate");

-- CreateIndex
CREATE UNIQUE INDEX "svc_vehicles_tenant_id_id_key" ON "svc_vehicles"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "svc_service_catalog_tenant_id_name_key" ON "svc_service_catalog"("tenant_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "svc_service_catalog_tenant_id_id_key" ON "svc_service_catalog"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "svc_service_orders_tenant_id_maintenance_status_idx" ON "svc_service_orders"("tenant_id", "maintenance_status");

-- CreateIndex
CREATE INDEX "svc_service_orders_tenant_id_vehicle_id_idx" ON "svc_service_orders"("tenant_id", "vehicle_id");

-- CreateIndex
CREATE UNIQUE INDEX "svc_service_orders_tenant_id_order_id_key" ON "svc_service_orders"("tenant_id", "order_id");

-- CreateIndex
CREATE UNIQUE INDEX "svc_service_orders_tenant_id_id_key" ON "svc_service_orders"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "svc_service_order_events_tenant_id_service_order_id_idx" ON "svc_service_order_events"("tenant_id", "service_order_id");

-- CreateIndex
CREATE INDEX "svc_checklist_items_tenant_id_service_order_id_idx" ON "svc_checklist_items"("tenant_id", "service_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "svc_checklist_items_tenant_id_id_key" ON "svc_checklist_items"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "svc_appointments_tenant_id_scheduled_at_idx" ON "svc_appointments"("tenant_id", "scheduled_at");

-- CreateIndex
CREATE UNIQUE INDEX "svc_appointments_tenant_id_id_key" ON "svc_appointments"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "svc_attachments_tenant_id_service_order_id_idx" ON "svc_attachments"("tenant_id", "service_order_id");

-- CreateIndex
CREATE UNIQUE INDEX "svc_attachments_tenant_id_id_key" ON "svc_attachments"("tenant_id", "id");

-- AddForeignKey
ALTER TABLE "core_tenant_modules" ADD CONSTRAINT "core_tenant_modules_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_users" ADD CONSTRAINT "core_users_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_roles" ADD CONSTRAINT "core_roles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_role_permissions" ADD CONSTRAINT "core_role_permissions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_role_permissions" ADD CONSTRAINT "core_role_permissions_tenant_id_role_id_fkey" FOREIGN KEY ("tenant_id", "role_id") REFERENCES "core_roles"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_user_roles" ADD CONSTRAINT "core_user_roles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_user_roles" ADD CONSTRAINT "core_user_roles_tenant_id_user_id_fkey" FOREIGN KEY ("tenant_id", "user_id") REFERENCES "core_users"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_user_roles" ADD CONSTRAINT "core_user_roles_tenant_id_role_id_fkey" FOREIGN KEY ("tenant_id", "role_id") REFERENCES "core_roles"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_user_permissions" ADD CONSTRAINT "core_user_permissions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_user_permissions" ADD CONSTRAINT "core_user_permissions_tenant_id_user_id_fkey" FOREIGN KEY ("tenant_id", "user_id") REFERENCES "core_users"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_refresh_tokens" ADD CONSTRAINT "core_refresh_tokens_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_refresh_tokens" ADD CONSTRAINT "core_refresh_tokens_tenant_id_user_id_fkey" FOREIGN KEY ("tenant_id", "user_id") REFERENCES "core_users"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_audit_logs" ADD CONSTRAINT "core_audit_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_audit_logs" ADD CONSTRAINT "core_audit_logs_tenant_id_user_id_fkey" FOREIGN KEY ("tenant_id", "user_id") REFERENCES "core_users"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_customers" ADD CONSTRAINT "core_customers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_customer_addresses" ADD CONSTRAINT "core_customer_addresses_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_customer_addresses" ADD CONSTRAINT "core_customer_addresses_tenant_id_customer_id_fkey" FOREIGN KEY ("tenant_id", "customer_id") REFERENCES "core_customers"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_finance_accounts" ADD CONSTRAINT "core_finance_accounts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_finance_categories" ADD CONSTRAINT "core_finance_categories_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_finance_entries" ADD CONSTRAINT "core_finance_entries_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_finance_entries" ADD CONSTRAINT "core_finance_entries_tenant_id_customer_id_fkey" FOREIGN KEY ("tenant_id", "customer_id") REFERENCES "core_customers"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_finance_entries" ADD CONSTRAINT "core_finance_entries_tenant_id_category_id_fkey" FOREIGN KEY ("tenant_id", "category_id") REFERENCES "core_finance_categories"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_finance_entries" ADD CONSTRAINT "core_finance_entries_tenant_id_order_id_fkey" FOREIGN KEY ("tenant_id", "order_id") REFERENCES "core_orders"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_finance_payments" ADD CONSTRAINT "core_finance_payments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_finance_payments" ADD CONSTRAINT "core_finance_payments_tenant_id_entry_id_fkey" FOREIGN KEY ("tenant_id", "entry_id") REFERENCES "core_finance_entries"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_finance_payments" ADD CONSTRAINT "core_finance_payments_tenant_id_account_id_fkey" FOREIGN KEY ("tenant_id", "account_id") REFERENCES "core_finance_accounts"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_product_categories" ADD CONSTRAINT "core_product_categories_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_product_categories" ADD CONSTRAINT "core_product_categories_tenant_id_parent_id_fkey" FOREIGN KEY ("tenant_id", "parent_id") REFERENCES "core_product_categories"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_products" ADD CONSTRAINT "core_products_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_products" ADD CONSTRAINT "core_products_tenant_id_category_id_fkey" FOREIGN KEY ("tenant_id", "category_id") REFERENCES "core_product_categories"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_product_variants" ADD CONSTRAINT "core_product_variants_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_product_variants" ADD CONSTRAINT "core_product_variants_tenant_id_product_id_fkey" FOREIGN KEY ("tenant_id", "product_id") REFERENCES "core_products"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_warehouses" ADD CONSTRAINT "core_warehouses_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_stock_balances" ADD CONSTRAINT "core_stock_balances_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_stock_balances" ADD CONSTRAINT "core_stock_balances_tenant_id_variant_id_fkey" FOREIGN KEY ("tenant_id", "variant_id") REFERENCES "core_product_variants"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_stock_balances" ADD CONSTRAINT "core_stock_balances_tenant_id_warehouse_id_fkey" FOREIGN KEY ("tenant_id", "warehouse_id") REFERENCES "core_warehouses"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_stock_ledger" ADD CONSTRAINT "core_stock_ledger_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_stock_ledger" ADD CONSTRAINT "core_stock_ledger_tenant_id_variant_id_fkey" FOREIGN KEY ("tenant_id", "variant_id") REFERENCES "core_product_variants"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_stock_ledger" ADD CONSTRAINT "core_stock_ledger_tenant_id_warehouse_id_fkey" FOREIGN KEY ("tenant_id", "warehouse_id") REFERENCES "core_warehouses"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_stock_ledger" ADD CONSTRAINT "core_stock_ledger_tenant_id_user_id_fkey" FOREIGN KEY ("tenant_id", "user_id") REFERENCES "core_users"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_order_counters" ADD CONSTRAINT "core_order_counters_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_orders" ADD CONSTRAINT "core_orders_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_orders" ADD CONSTRAINT "core_orders_tenant_id_customer_id_fkey" FOREIGN KEY ("tenant_id", "customer_id") REFERENCES "core_customers"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_orders" ADD CONSTRAINT "core_orders_tenant_id_seller_user_id_fkey" FOREIGN KEY ("tenant_id", "seller_user_id") REFERENCES "core_users"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_order_items" ADD CONSTRAINT "core_order_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_order_items" ADD CONSTRAINT "core_order_items_tenant_id_order_id_fkey" FOREIGN KEY ("tenant_id", "order_id") REFERENCES "core_orders"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_order_items" ADD CONSTRAINT "core_order_items_tenant_id_variant_id_fkey" FOREIGN KEY ("tenant_id", "variant_id") REFERENCES "core_product_variants"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_order_payments" ADD CONSTRAINT "core_order_payments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_order_payments" ADD CONSTRAINT "core_order_payments_tenant_id_order_id_fkey" FOREIGN KEY ("tenant_id", "order_id") REFERENCES "core_orders"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_order_status_history" ADD CONSTRAINT "core_order_status_history_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_order_status_history" ADD CONSTRAINT "core_order_status_history_tenant_id_order_id_fkey" FOREIGN KEY ("tenant_id", "order_id") REFERENCES "core_orders"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_order_status_history" ADD CONSTRAINT "core_order_status_history_tenant_id_user_id_fkey" FOREIGN KEY ("tenant_id", "user_id") REFERENCES "core_users"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ret_grade_axes" ADD CONSTRAINT "ret_grade_axes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ret_grade_values" ADD CONSTRAINT "ret_grade_values_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ret_grade_values" ADD CONSTRAINT "ret_grade_values_tenant_id_axis_id_fkey" FOREIGN KEY ("tenant_id", "axis_id") REFERENCES "ret_grade_axes"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ret_variant_attributes" ADD CONSTRAINT "ret_variant_attributes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ret_variant_attributes" ADD CONSTRAINT "ret_variant_attributes_tenant_id_variant_id_fkey" FOREIGN KEY ("tenant_id", "variant_id") REFERENCES "core_product_variants"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ret_variant_attributes" ADD CONSTRAINT "ret_variant_attributes_tenant_id_axis_id_fkey" FOREIGN KEY ("tenant_id", "axis_id") REFERENCES "ret_grade_axes"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ret_variant_attributes" ADD CONSTRAINT "ret_variant_attributes_tenant_id_value_id_fkey" FOREIGN KEY ("tenant_id", "value_id") REFERENCES "ret_grade_values"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ret_salespeople" ADD CONSTRAINT "ret_salespeople_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ret_salespeople" ADD CONSTRAINT "ret_salespeople_tenant_id_user_id_fkey" FOREIGN KEY ("tenant_id", "user_id") REFERENCES "core_users"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ret_commission_rules" ADD CONSTRAINT "ret_commission_rules_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ret_commission_rules" ADD CONSTRAINT "ret_commission_rules_tenant_id_salesperson_id_fkey" FOREIGN KEY ("tenant_id", "salesperson_id") REFERENCES "ret_salespeople"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ret_commission_rules" ADD CONSTRAINT "ret_commission_rules_tenant_id_category_id_fkey" FOREIGN KEY ("tenant_id", "category_id") REFERENCES "core_product_categories"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ret_pos_sessions" ADD CONSTRAINT "ret_pos_sessions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ret_pos_sessions" ADD CONSTRAINT "ret_pos_sessions_tenant_id_opened_by_user_id_fkey" FOREIGN KEY ("tenant_id", "opened_by_user_id") REFERENCES "core_users"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ret_pos_sessions" ADD CONSTRAINT "ret_pos_sessions_tenant_id_closed_by_user_id_fkey" FOREIGN KEY ("tenant_id", "closed_by_user_id") REFERENCES "core_users"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ret_sales" ADD CONSTRAINT "ret_sales_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ret_sales" ADD CONSTRAINT "ret_sales_tenant_id_order_id_fkey" FOREIGN KEY ("tenant_id", "order_id") REFERENCES "core_orders"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ret_sales" ADD CONSTRAINT "ret_sales_tenant_id_pos_session_id_fkey" FOREIGN KEY ("tenant_id", "pos_session_id") REFERENCES "ret_pos_sessions"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ret_sales" ADD CONSTRAINT "ret_sales_tenant_id_salesperson_id_fkey" FOREIGN KEY ("tenant_id", "salesperson_id") REFERENCES "ret_salespeople"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ret_commissions" ADD CONSTRAINT "ret_commissions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ret_commissions" ADD CONSTRAINT "ret_commissions_tenant_id_sale_id_fkey" FOREIGN KEY ("tenant_id", "sale_id") REFERENCES "ret_sales"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ret_commissions" ADD CONSTRAINT "ret_commissions_tenant_id_salesperson_id_fkey" FOREIGN KEY ("tenant_id", "salesperson_id") REFERENCES "ret_salespeople"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ret_label_templates" ADD CONSTRAINT "ret_label_templates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ret_label_batches" ADD CONSTRAINT "ret_label_batches_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ret_label_batches" ADD CONSTRAINT "ret_label_batches_tenant_id_template_id_fkey" FOREIGN KEY ("tenant_id", "template_id") REFERENCES "ret_label_templates"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ret_label_batch_items" ADD CONSTRAINT "ret_label_batch_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ret_label_batch_items" ADD CONSTRAINT "ret_label_batch_items_tenant_id_batch_id_fkey" FOREIGN KEY ("tenant_id", "batch_id") REFERENCES "ret_label_batches"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ret_label_batch_items" ADD CONSTRAINT "ret_label_batch_items_tenant_id_variant_id_fkey" FOREIGN KEY ("tenant_id", "variant_id") REFERENCES "core_product_variants"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ret_returns" ADD CONSTRAINT "ret_returns_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ret_returns" ADD CONSTRAINT "ret_returns_tenant_id_sale_id_fkey" FOREIGN KEY ("tenant_id", "sale_id") REFERENCES "ret_sales"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ret_returns" ADD CONSTRAINT "ret_returns_tenant_id_user_id_fkey" FOREIGN KEY ("tenant_id", "user_id") REFERENCES "core_users"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ret_return_items" ADD CONSTRAINT "ret_return_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ret_return_items" ADD CONSTRAINT "ret_return_items_tenant_id_return_id_fkey" FOREIGN KEY ("tenant_id", "return_id") REFERENCES "ret_returns"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ret_return_items" ADD CONSTRAINT "ret_return_items_tenant_id_order_item_id_fkey" FOREIGN KEY ("tenant_id", "order_item_id") REFERENCES "core_order_items"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_tables" ADD CONSTRAINT "food_tables_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_tabs" ADD CONSTRAINT "food_tabs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_tabs" ADD CONSTRAINT "food_tabs_tenant_id_table_id_fkey" FOREIGN KEY ("tenant_id", "table_id") REFERENCES "food_tables"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_menus" ADD CONSTRAINT "food_menus_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_menu_categories" ADD CONSTRAINT "food_menu_categories_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_menu_categories" ADD CONSTRAINT "food_menu_categories_tenant_id_menu_id_fkey" FOREIGN KEY ("tenant_id", "menu_id") REFERENCES "food_menus"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_menu_items" ADD CONSTRAINT "food_menu_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_menu_items" ADD CONSTRAINT "food_menu_items_tenant_id_menu_id_fkey" FOREIGN KEY ("tenant_id", "menu_id") REFERENCES "food_menus"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_menu_items" ADD CONSTRAINT "food_menu_items_tenant_id_category_id_fkey" FOREIGN KEY ("tenant_id", "category_id") REFERENCES "food_menu_categories"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_menu_items" ADD CONSTRAINT "food_menu_items_tenant_id_variant_id_fkey" FOREIGN KEY ("tenant_id", "variant_id") REFERENCES "core_product_variants"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_modifier_groups" ADD CONSTRAINT "food_modifier_groups_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_modifiers" ADD CONSTRAINT "food_modifiers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_modifiers" ADD CONSTRAINT "food_modifiers_tenant_id_group_id_fkey" FOREIGN KEY ("tenant_id", "group_id") REFERENCES "food_modifier_groups"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_menu_item_modifier_groups" ADD CONSTRAINT "food_menu_item_modifier_groups_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_menu_item_modifier_groups" ADD CONSTRAINT "food_menu_item_modifier_groups_tenant_id_menu_item_id_fkey" FOREIGN KEY ("tenant_id", "menu_item_id") REFERENCES "food_menu_items"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_menu_item_modifier_groups" ADD CONSTRAINT "food_menu_item_modifier_groups_tenant_id_group_id_fkey" FOREIGN KEY ("tenant_id", "group_id") REFERENCES "food_modifier_groups"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_orders" ADD CONSTRAINT "food_orders_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_orders" ADD CONSTRAINT "food_orders_tenant_id_order_id_fkey" FOREIGN KEY ("tenant_id", "order_id") REFERENCES "core_orders"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_orders" ADD CONSTRAINT "food_orders_tenant_id_table_id_fkey" FOREIGN KEY ("tenant_id", "table_id") REFERENCES "food_tables"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_orders" ADD CONSTRAINT "food_orders_tenant_id_tab_id_fkey" FOREIGN KEY ("tenant_id", "tab_id") REFERENCES "food_tabs"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_kitchen_tickets" ADD CONSTRAINT "food_kitchen_tickets_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_kitchen_tickets" ADD CONSTRAINT "food_kitchen_tickets_tenant_id_food_order_id_fkey" FOREIGN KEY ("tenant_id", "food_order_id") REFERENCES "food_orders"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_kitchen_ticket_items" ADD CONSTRAINT "food_kitchen_ticket_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_kitchen_ticket_items" ADD CONSTRAINT "food_kitchen_ticket_items_tenant_id_ticket_id_fkey" FOREIGN KEY ("tenant_id", "ticket_id") REFERENCES "food_kitchen_tickets"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_kitchen_ticket_items" ADD CONSTRAINT "food_kitchen_ticket_items_tenant_id_order_item_id_fkey" FOREIGN KEY ("tenant_id", "order_item_id") REFERENCES "core_order_items"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_couriers" ADD CONSTRAINT "food_couriers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_couriers" ADD CONSTRAINT "food_couriers_tenant_id_user_id_fkey" FOREIGN KEY ("tenant_id", "user_id") REFERENCES "core_users"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_delivery_zones" ADD CONSTRAINT "food_delivery_zones_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_deliveries" ADD CONSTRAINT "food_deliveries_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_deliveries" ADD CONSTRAINT "food_deliveries_tenant_id_food_order_id_fkey" FOREIGN KEY ("tenant_id", "food_order_id") REFERENCES "food_orders"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_deliveries" ADD CONSTRAINT "food_deliveries_tenant_id_courier_id_fkey" FOREIGN KEY ("tenant_id", "courier_id") REFERENCES "food_couriers"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "food_deliveries" ADD CONSTRAINT "food_deliveries_tenant_id_zone_id_fkey" FOREIGN KEY ("tenant_id", "zone_id") REFERENCES "food_delivery_zones"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gym_plans" ADD CONSTRAINT "gym_plans_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gym_plans" ADD CONSTRAINT "gym_plans_tenant_id_product_id_fkey" FOREIGN KEY ("tenant_id", "product_id") REFERENCES "core_products"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gym_memberships" ADD CONSTRAINT "gym_memberships_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gym_memberships" ADD CONSTRAINT "gym_memberships_tenant_id_customer_id_fkey" FOREIGN KEY ("tenant_id", "customer_id") REFERENCES "core_customers"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gym_memberships" ADD CONSTRAINT "gym_memberships_tenant_id_plan_id_fkey" FOREIGN KEY ("tenant_id", "plan_id") REFERENCES "gym_plans"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gym_memberships" ADD CONSTRAINT "gym_memberships_tenant_id_order_id_fkey" FOREIGN KEY ("tenant_id", "order_id") REFERENCES "core_orders"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gym_membership_charges" ADD CONSTRAINT "gym_membership_charges_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gym_membership_charges" ADD CONSTRAINT "gym_membership_charges_tenant_id_membership_id_fkey" FOREIGN KEY ("tenant_id", "membership_id") REFERENCES "gym_memberships"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gym_membership_charges" ADD CONSTRAINT "gym_membership_charges_tenant_id_finance_entry_id_fkey" FOREIGN KEY ("tenant_id", "finance_entry_id") REFERENCES "core_finance_entries"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gym_check_ins" ADD CONSTRAINT "gym_check_ins_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gym_check_ins" ADD CONSTRAINT "gym_check_ins_tenant_id_customer_id_fkey" FOREIGN KEY ("tenant_id", "customer_id") REFERENCES "core_customers"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gym_check_ins" ADD CONSTRAINT "gym_check_ins_tenant_id_membership_id_fkey" FOREIGN KEY ("tenant_id", "membership_id") REFERENCES "gym_memberships"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gym_check_ins" ADD CONSTRAINT "gym_check_ins_tenant_id_device_id_fkey" FOREIGN KEY ("tenant_id", "device_id") REFERENCES "gym_access_devices"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gym_access_devices" ADD CONSTRAINT "gym_access_devices_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gym_access_credentials" ADD CONSTRAINT "gym_access_credentials_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gym_access_credentials" ADD CONSTRAINT "gym_access_credentials_tenant_id_customer_id_fkey" FOREIGN KEY ("tenant_id", "customer_id") REFERENCES "core_customers"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gym_access_events" ADD CONSTRAINT "gym_access_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gym_access_events" ADD CONSTRAINT "gym_access_events_tenant_id_device_id_fkey" FOREIGN KEY ("tenant_id", "device_id") REFERENCES "gym_access_devices"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gym_access_events" ADD CONSTRAINT "gym_access_events_tenant_id_credential_id_fkey" FOREIGN KEY ("tenant_id", "credential_id") REFERENCES "gym_access_credentials"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gym_access_events" ADD CONSTRAINT "gym_access_events_tenant_id_customer_id_fkey" FOREIGN KEY ("tenant_id", "customer_id") REFERENCES "core_customers"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gym_classes" ADD CONSTRAINT "gym_classes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gym_classes" ADD CONSTRAINT "gym_classes_tenant_id_instructor_user_id_fkey" FOREIGN KEY ("tenant_id", "instructor_user_id") REFERENCES "core_users"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gym_class_sessions" ADD CONSTRAINT "gym_class_sessions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gym_class_sessions" ADD CONSTRAINT "gym_class_sessions_tenant_id_class_id_fkey" FOREIGN KEY ("tenant_id", "class_id") REFERENCES "gym_classes"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gym_class_bookings" ADD CONSTRAINT "gym_class_bookings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gym_class_bookings" ADD CONSTRAINT "gym_class_bookings_tenant_id_session_id_fkey" FOREIGN KEY ("tenant_id", "session_id") REFERENCES "gym_class_sessions"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gym_class_bookings" ADD CONSTRAINT "gym_class_bookings_tenant_id_customer_id_fkey" FOREIGN KEY ("tenant_id", "customer_id") REFERENCES "core_customers"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "svc_vehicles" ADD CONSTRAINT "svc_vehicles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "svc_vehicles" ADD CONSTRAINT "svc_vehicles_tenant_id_customer_id_fkey" FOREIGN KEY ("tenant_id", "customer_id") REFERENCES "core_customers"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "svc_service_catalog" ADD CONSTRAINT "svc_service_catalog_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "svc_service_catalog" ADD CONSTRAINT "svc_service_catalog_tenant_id_product_id_fkey" FOREIGN KEY ("tenant_id", "product_id") REFERENCES "core_products"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "svc_service_orders" ADD CONSTRAINT "svc_service_orders_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "svc_service_orders" ADD CONSTRAINT "svc_service_orders_tenant_id_order_id_fkey" FOREIGN KEY ("tenant_id", "order_id") REFERENCES "core_orders"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "svc_service_orders" ADD CONSTRAINT "svc_service_orders_tenant_id_vehicle_id_fkey" FOREIGN KEY ("tenant_id", "vehicle_id") REFERENCES "svc_vehicles"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "svc_service_orders" ADD CONSTRAINT "svc_service_orders_tenant_id_technician_user_id_fkey" FOREIGN KEY ("tenant_id", "technician_user_id") REFERENCES "core_users"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "svc_service_order_events" ADD CONSTRAINT "svc_service_order_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "svc_service_order_events" ADD CONSTRAINT "svc_service_order_events_tenant_id_service_order_id_fkey" FOREIGN KEY ("tenant_id", "service_order_id") REFERENCES "svc_service_orders"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "svc_service_order_events" ADD CONSTRAINT "svc_service_order_events_tenant_id_user_id_fkey" FOREIGN KEY ("tenant_id", "user_id") REFERENCES "core_users"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "svc_checklist_items" ADD CONSTRAINT "svc_checklist_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "svc_checklist_items" ADD CONSTRAINT "svc_checklist_items_tenant_id_service_order_id_fkey" FOREIGN KEY ("tenant_id", "service_order_id") REFERENCES "svc_service_orders"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "svc_appointments" ADD CONSTRAINT "svc_appointments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "svc_appointments" ADD CONSTRAINT "svc_appointments_tenant_id_customer_id_fkey" FOREIGN KEY ("tenant_id", "customer_id") REFERENCES "core_customers"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "svc_appointments" ADD CONSTRAINT "svc_appointments_tenant_id_vehicle_id_fkey" FOREIGN KEY ("tenant_id", "vehicle_id") REFERENCES "svc_vehicles"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "svc_attachments" ADD CONSTRAINT "svc_attachments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "svc_attachments" ADD CONSTRAINT "svc_attachments_tenant_id_service_order_id_fkey" FOREIGN KEY ("tenant_id", "service_order_id") REFERENCES "svc_service_orders"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
