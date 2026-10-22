-- CreateEnum
CREATE TYPE "BelAppointmentStatus" AS ENUM ('SCHEDULED', 'CONFIRMED', 'IN_SERVICE', 'DONE', 'NO_SHOW', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BelCommissionStatus" AS ENUM ('PENDING', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PetGroomingStatus" AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'READY', 'DELIVERED', 'NO_SHOW', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CliAppointmentStatus" AS ENUM ('SCHEDULED', 'CONFIRMED', 'ARRIVED', 'DONE', 'NO_SHOW', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CliPayer" AS ENUM ('PARTICULAR', 'CONVENIO');

-- CreateEnum
CREATE TYPE "HotRoomStatus" AS ENUM ('AVAILABLE', 'OCCUPIED', 'CLEANING', 'MAINTENANCE');

-- CreateEnum
CREATE TYPE "HotReservationStatus" AS ENUM ('BOOKED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED', 'NO_SHOW');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ModuleKey" ADD VALUE 'BELEZA';
ALTER TYPE "ModuleKey" ADD VALUE 'PET';
ALTER TYPE "ModuleKey" ADD VALUE 'CLINICA';
ALTER TYPE "ModuleKey" ADD VALUE 'HOTEL';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "OrderChannel" ADD VALUE 'SALON';
ALTER TYPE "OrderChannel" ADD VALUE 'PETSHOP';
ALTER TYPE "OrderChannel" ADD VALUE 'CLINIC';
ALTER TYPE "OrderChannel" ADD VALUE 'LODGING';

-- CreateTable
CREATE TABLE "bel_professionals" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "user_id" UUID,
    "commission_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "color" VARCHAR(9),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "bel_professionals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bel_services" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "duration_min" INTEGER NOT NULL DEFAULT 30,
    "price" DECIMAL(14,2) NOT NULL,
    "commission_rate" DECIMAL(5,2),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "bel_services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bel_appointments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "professional_id" UUID NOT NULL,
    "service_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6) NOT NULL,
    "status" "BelAppointmentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "notes" TEXT,
    "order_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "bel_appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bel_packages" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "service_id" UUID NOT NULL,
    "sessions" INTEGER NOT NULL,
    "price" DECIMAL(14,2) NOT NULL,
    "validity_days" INTEGER NOT NULL DEFAULT 180,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bel_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bel_customer_packages" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "package_id" UUID NOT NULL,
    "sessions_total" INTEGER NOT NULL,
    "sessions_used" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "order_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bel_customer_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bel_sales" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "professional_id" UUID,
    "appointment_id" UUID,
    "customer_package_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bel_sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bel_commissions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "sale_id" UUID NOT NULL,
    "professional_id" UUID NOT NULL,
    "base_amount" DECIMAL(14,2) NOT NULL,
    "rate" DECIMAL(5,2) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "status" "BelCommissionStatus" NOT NULL DEFAULT 'PENDING',
    "paid_at" TIMESTAMPTZ(6),
    "finance_entry_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bel_commissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pet_animals" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "species" VARCHAR(20) NOT NULL,
    "breed" VARCHAR(60),
    "sex" VARCHAR(1),
    "birth_date" DATE,
    "weight_kg" DECIMAL(6,2),
    "size" VARCHAR(1),
    "allergies" TEXT,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "pet_animals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pet_grooming" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "pet_id" UUID NOT NULL,
    "scheduled_at" TIMESTAMPTZ(6) NOT NULL,
    "duration_min" INTEGER NOT NULL DEFAULT 60,
    "services" VARCHAR(200) NOT NULL,
    "price" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" "PetGroomingStatus" NOT NULL DEFAULT 'SCHEDULED',
    "taxi_dog" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "order_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "pet_grooming_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pet_vaccines" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "pet_id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "applied_at" DATE NOT NULL,
    "next_due_at" DATE,
    "lot" VARCHAR(40),
    "vet_name" VARCHAR(80),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pet_vaccines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pet_records" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "pet_id" UUID NOT NULL,
    "kind" VARCHAR(20) NOT NULL,
    "date" TIMESTAMPTZ(6) NOT NULL,
    "complaint" TEXT,
    "diagnosis" TEXT,
    "prescription" TEXT,
    "weight_kg" DECIMAL(6,2),
    "vet_name" VARCHAR(80),
    "return_at" DATE,
    "user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pet_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pet_sales" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "pet_id" UUID,
    "grooming_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pet_sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cli_professionals" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "specialty" VARCHAR(80),
    "registry" VARCHAR(30),
    "user_id" UUID,
    "default_duration_min" INTEGER NOT NULL DEFAULT 30,
    "default_price" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "cli_professionals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cli_insurances" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "code" VARCHAR(30),
    "price" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cli_insurances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cli_patient_profiles" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "birth_date" DATE,
    "insurance_id" UUID,
    "insurance_card" VARCHAR(40),
    "allergies" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "cli_patient_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cli_appointments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "professional_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6) NOT NULL,
    "kind" VARCHAR(20) NOT NULL DEFAULT 'CONSULTA',
    "payer" "CliPayer" NOT NULL DEFAULT 'PARTICULAR',
    "insurance_id" UUID,
    "price" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" "CliAppointmentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "notes" TEXT,
    "order_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "cli_appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cli_records" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "professional_id" UUID NOT NULL,
    "appointment_id" UUID,
    "date" TIMESTAMPTZ(6) NOT NULL,
    "anamnesis" TEXT,
    "evolution" TEXT,
    "prescription" TEXT,
    "return_at" DATE,
    "user_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cli_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cli_charges" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "appointment_id" UUID,
    "payer" "CliPayer" NOT NULL DEFAULT 'PARTICULAR',
    "insurance_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cli_charges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hot_rooms" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "number" VARCHAR(10) NOT NULL,
    "type" VARCHAR(40) NOT NULL,
    "capacity" INTEGER NOT NULL DEFAULT 2,
    "daily_rate" DECIMAL(14,2) NOT NULL,
    "status" "HotRoomStatus" NOT NULL DEFAULT 'AVAILABLE',
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "hot_rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hot_reservations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "check_in" DATE NOT NULL,
    "check_out" DATE NOT NULL,
    "guests" INTEGER NOT NULL DEFAULT 1,
    "daily_rate" DECIMAL(14,2) NOT NULL,
    "status" "HotReservationStatus" NOT NULL DEFAULT 'BOOKED',
    "source" VARCHAR(30),
    "notes" TEXT,
    "order_id" UUID,
    "checked_in_at" TIMESTAMPTZ(6),
    "checked_out_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "hot_reservations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hot_stays" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "reservation_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hot_stays_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bel_professionals_tenant_id_id_key" ON "bel_professionals"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "bel_services_tenant_id_name_key" ON "bel_services"("tenant_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "bel_services_tenant_id_id_key" ON "bel_services"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "bel_appointments_tenant_id_professional_id_starts_at_idx" ON "bel_appointments"("tenant_id", "professional_id", "starts_at");

-- CreateIndex
CREATE INDEX "bel_appointments_tenant_id_starts_at_idx" ON "bel_appointments"("tenant_id", "starts_at");

-- CreateIndex
CREATE UNIQUE INDEX "bel_appointments_tenant_id_id_key" ON "bel_appointments"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "bel_packages_tenant_id_id_key" ON "bel_packages"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "bel_customer_packages_tenant_id_customer_id_idx" ON "bel_customer_packages"("tenant_id", "customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "bel_customer_packages_tenant_id_id_key" ON "bel_customer_packages"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "bel_sales_tenant_id_order_id_key" ON "bel_sales"("tenant_id", "order_id");

-- CreateIndex
CREATE UNIQUE INDEX "bel_sales_tenant_id_id_key" ON "bel_sales"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "bel_commissions_tenant_id_professional_id_status_idx" ON "bel_commissions"("tenant_id", "professional_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "bel_commissions_tenant_id_id_key" ON "bel_commissions"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "pet_animals_tenant_id_customer_id_idx" ON "pet_animals"("tenant_id", "customer_id");

-- CreateIndex
CREATE INDEX "pet_animals_tenant_id_name_idx" ON "pet_animals"("tenant_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "pet_animals_tenant_id_id_key" ON "pet_animals"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "pet_grooming_tenant_id_scheduled_at_idx" ON "pet_grooming"("tenant_id", "scheduled_at");

-- CreateIndex
CREATE UNIQUE INDEX "pet_grooming_tenant_id_id_key" ON "pet_grooming"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "pet_vaccines_tenant_id_next_due_at_idx" ON "pet_vaccines"("tenant_id", "next_due_at");

-- CreateIndex
CREATE UNIQUE INDEX "pet_vaccines_tenant_id_id_key" ON "pet_vaccines"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "pet_records_tenant_id_pet_id_date_idx" ON "pet_records"("tenant_id", "pet_id", "date");

-- CreateIndex
CREATE INDEX "pet_records_tenant_id_return_at_idx" ON "pet_records"("tenant_id", "return_at");

-- CreateIndex
CREATE UNIQUE INDEX "pet_records_tenant_id_id_key" ON "pet_records"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "pet_sales_tenant_id_order_id_key" ON "pet_sales"("tenant_id", "order_id");

-- CreateIndex
CREATE UNIQUE INDEX "pet_sales_tenant_id_id_key" ON "pet_sales"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "cli_professionals_tenant_id_id_key" ON "cli_professionals"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "cli_insurances_tenant_id_name_key" ON "cli_insurances"("tenant_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "cli_insurances_tenant_id_id_key" ON "cli_insurances"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "cli_patient_profiles_tenant_id_customer_id_key" ON "cli_patient_profiles"("tenant_id", "customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "cli_patient_profiles_tenant_id_id_key" ON "cli_patient_profiles"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "cli_appointments_tenant_id_professional_id_starts_at_idx" ON "cli_appointments"("tenant_id", "professional_id", "starts_at");

-- CreateIndex
CREATE INDEX "cli_appointments_tenant_id_starts_at_idx" ON "cli_appointments"("tenant_id", "starts_at");

-- CreateIndex
CREATE UNIQUE INDEX "cli_appointments_tenant_id_id_key" ON "cli_appointments"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "cli_records_tenant_id_customer_id_date_idx" ON "cli_records"("tenant_id", "customer_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "cli_records_tenant_id_id_key" ON "cli_records"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "cli_charges_tenant_id_order_id_key" ON "cli_charges"("tenant_id", "order_id");

-- CreateIndex
CREATE UNIQUE INDEX "cli_charges_tenant_id_id_key" ON "cli_charges"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "hot_rooms_tenant_id_number_key" ON "hot_rooms"("tenant_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "hot_rooms_tenant_id_id_key" ON "hot_rooms"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "hot_reservations_tenant_id_room_id_check_in_idx" ON "hot_reservations"("tenant_id", "room_id", "check_in");

-- CreateIndex
CREATE INDEX "hot_reservations_tenant_id_check_in_idx" ON "hot_reservations"("tenant_id", "check_in");

-- CreateIndex
CREATE UNIQUE INDEX "hot_reservations_tenant_id_id_key" ON "hot_reservations"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "hot_stays_tenant_id_order_id_key" ON "hot_stays"("tenant_id", "order_id");

-- CreateIndex
CREATE UNIQUE INDEX "hot_stays_tenant_id_reservation_id_key" ON "hot_stays"("tenant_id", "reservation_id");

-- CreateIndex
CREATE UNIQUE INDEX "hot_stays_tenant_id_id_key" ON "hot_stays"("tenant_id", "id");

-- AddForeignKey
ALTER TABLE "bel_professionals" ADD CONSTRAINT "bel_professionals_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bel_services" ADD CONSTRAINT "bel_services_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bel_appointments" ADD CONSTRAINT "bel_appointments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bel_appointments" ADD CONSTRAINT "bel_appointments_tenant_id_customer_id_fkey" FOREIGN KEY ("tenant_id", "customer_id") REFERENCES "core_customers"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bel_appointments" ADD CONSTRAINT "bel_appointments_tenant_id_professional_id_fkey" FOREIGN KEY ("tenant_id", "professional_id") REFERENCES "bel_professionals"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bel_appointments" ADD CONSTRAINT "bel_appointments_tenant_id_service_id_fkey" FOREIGN KEY ("tenant_id", "service_id") REFERENCES "bel_services"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bel_packages" ADD CONSTRAINT "bel_packages_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bel_packages" ADD CONSTRAINT "bel_packages_tenant_id_service_id_fkey" FOREIGN KEY ("tenant_id", "service_id") REFERENCES "bel_services"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bel_customer_packages" ADD CONSTRAINT "bel_customer_packages_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bel_customer_packages" ADD CONSTRAINT "bel_customer_packages_tenant_id_customer_id_fkey" FOREIGN KEY ("tenant_id", "customer_id") REFERENCES "core_customers"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bel_customer_packages" ADD CONSTRAINT "bel_customer_packages_tenant_id_package_id_fkey" FOREIGN KEY ("tenant_id", "package_id") REFERENCES "bel_packages"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bel_sales" ADD CONSTRAINT "bel_sales_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bel_sales" ADD CONSTRAINT "bel_sales_tenant_id_order_id_fkey" FOREIGN KEY ("tenant_id", "order_id") REFERENCES "core_orders"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bel_sales" ADD CONSTRAINT "bel_sales_tenant_id_professional_id_fkey" FOREIGN KEY ("tenant_id", "professional_id") REFERENCES "bel_professionals"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bel_sales" ADD CONSTRAINT "bel_sales_tenant_id_customer_package_id_fkey" FOREIGN KEY ("tenant_id", "customer_package_id") REFERENCES "bel_customer_packages"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bel_commissions" ADD CONSTRAINT "bel_commissions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bel_commissions" ADD CONSTRAINT "bel_commissions_tenant_id_sale_id_fkey" FOREIGN KEY ("tenant_id", "sale_id") REFERENCES "bel_sales"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bel_commissions" ADD CONSTRAINT "bel_commissions_tenant_id_professional_id_fkey" FOREIGN KEY ("tenant_id", "professional_id") REFERENCES "bel_professionals"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pet_animals" ADD CONSTRAINT "pet_animals_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pet_animals" ADD CONSTRAINT "pet_animals_tenant_id_customer_id_fkey" FOREIGN KEY ("tenant_id", "customer_id") REFERENCES "core_customers"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pet_grooming" ADD CONSTRAINT "pet_grooming_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pet_grooming" ADD CONSTRAINT "pet_grooming_tenant_id_pet_id_fkey" FOREIGN KEY ("tenant_id", "pet_id") REFERENCES "pet_animals"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pet_vaccines" ADD CONSTRAINT "pet_vaccines_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pet_vaccines" ADD CONSTRAINT "pet_vaccines_tenant_id_pet_id_fkey" FOREIGN KEY ("tenant_id", "pet_id") REFERENCES "pet_animals"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pet_records" ADD CONSTRAINT "pet_records_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pet_records" ADD CONSTRAINT "pet_records_tenant_id_pet_id_fkey" FOREIGN KEY ("tenant_id", "pet_id") REFERENCES "pet_animals"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pet_sales" ADD CONSTRAINT "pet_sales_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pet_sales" ADD CONSTRAINT "pet_sales_tenant_id_order_id_fkey" FOREIGN KEY ("tenant_id", "order_id") REFERENCES "core_orders"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pet_sales" ADD CONSTRAINT "pet_sales_tenant_id_pet_id_fkey" FOREIGN KEY ("tenant_id", "pet_id") REFERENCES "pet_animals"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cli_professionals" ADD CONSTRAINT "cli_professionals_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cli_insurances" ADD CONSTRAINT "cli_insurances_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cli_patient_profiles" ADD CONSTRAINT "cli_patient_profiles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cli_patient_profiles" ADD CONSTRAINT "cli_patient_profiles_tenant_id_customer_id_fkey" FOREIGN KEY ("tenant_id", "customer_id") REFERENCES "core_customers"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cli_patient_profiles" ADD CONSTRAINT "cli_patient_profiles_tenant_id_insurance_id_fkey" FOREIGN KEY ("tenant_id", "insurance_id") REFERENCES "cli_insurances"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cli_appointments" ADD CONSTRAINT "cli_appointments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cli_appointments" ADD CONSTRAINT "cli_appointments_tenant_id_customer_id_fkey" FOREIGN KEY ("tenant_id", "customer_id") REFERENCES "core_customers"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cli_appointments" ADD CONSTRAINT "cli_appointments_tenant_id_professional_id_fkey" FOREIGN KEY ("tenant_id", "professional_id") REFERENCES "cli_professionals"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cli_appointments" ADD CONSTRAINT "cli_appointments_tenant_id_insurance_id_fkey" FOREIGN KEY ("tenant_id", "insurance_id") REFERENCES "cli_insurances"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cli_records" ADD CONSTRAINT "cli_records_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cli_records" ADD CONSTRAINT "cli_records_tenant_id_customer_id_fkey" FOREIGN KEY ("tenant_id", "customer_id") REFERENCES "core_customers"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cli_records" ADD CONSTRAINT "cli_records_tenant_id_professional_id_fkey" FOREIGN KEY ("tenant_id", "professional_id") REFERENCES "cli_professionals"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cli_records" ADD CONSTRAINT "cli_records_tenant_id_appointment_id_fkey" FOREIGN KEY ("tenant_id", "appointment_id") REFERENCES "cli_appointments"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cli_charges" ADD CONSTRAINT "cli_charges_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cli_charges" ADD CONSTRAINT "cli_charges_tenant_id_order_id_fkey" FOREIGN KEY ("tenant_id", "order_id") REFERENCES "core_orders"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hot_rooms" ADD CONSTRAINT "hot_rooms_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hot_reservations" ADD CONSTRAINT "hot_reservations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hot_reservations" ADD CONSTRAINT "hot_reservations_tenant_id_customer_id_fkey" FOREIGN KEY ("tenant_id", "customer_id") REFERENCES "core_customers"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hot_reservations" ADD CONSTRAINT "hot_reservations_tenant_id_room_id_fkey" FOREIGN KEY ("tenant_id", "room_id") REFERENCES "hot_rooms"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hot_stays" ADD CONSTRAINT "hot_stays_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hot_stays" ADD CONSTRAINT "hot_stays_tenant_id_order_id_fkey" FOREIGN KEY ("tenant_id", "order_id") REFERENCES "core_orders"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hot_stays" ADD CONSTRAINT "hot_stays_tenant_id_reservation_id_fkey" FOREIGN KEY ("tenant_id", "reservation_id") REFERENCES "hot_reservations"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
