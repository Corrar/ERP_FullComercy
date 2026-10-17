-- CreateTable
CREATE TABLE "core_password_resets" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "purpose" VARCHAR(10) NOT NULL DEFAULT 'RESET',
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "core_password_resets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "core_password_resets_token_hash_key" ON "core_password_resets"("token_hash");

-- CreateIndex
CREATE INDEX "core_password_resets_tenant_id_user_id_idx" ON "core_password_resets"("tenant_id", "user_id");

-- AddForeignKey
ALTER TABLE "core_password_resets" ADD CONSTRAINT "core_password_resets_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "core_tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "core_password_resets" ADD CONSTRAINT "core_password_resets_tenant_id_user_id_fkey" FOREIGN KEY ("tenant_id", "user_id") REFERENCES "core_users"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
