-- CreateTable
CREATE TABLE "core_tenant_logos" (
    "tenant_id" UUID NOT NULL,
    "mime" VARCHAR(20) NOT NULL,
    "data" BYTEA NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "core_tenant_logos_pkey" PRIMARY KEY ("tenant_id")
);

-- AddForeignKey
ALTER TABLE "core_tenant_logos" ADD CONSTRAINT "core_tenant_logos_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
