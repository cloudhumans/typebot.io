-- AlterTable
ALTER TABLE "Credentials" ADD COLUMN IF NOT EXISTS "deprecatedAt" TIMESTAMP(3);
