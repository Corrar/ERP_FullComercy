-- CreateTable
CREATE TABLE "plat_account_password_resets" (
    "id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plat_account_password_resets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "plat_account_password_resets_token_hash_key" ON "plat_account_password_resets"("token_hash");

-- CreateIndex
CREATE INDEX "plat_account_password_resets_account_id_idx" ON "plat_account_password_resets"("account_id");

-- AddForeignKey
ALTER TABLE "plat_account_password_resets" ADD CONSTRAINT "plat_account_password_resets_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "plat_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
