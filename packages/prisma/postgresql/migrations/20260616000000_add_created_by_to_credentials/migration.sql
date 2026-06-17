-- AlterTable
ALTER TABLE "Credentials" ADD COLUMN IF NOT EXISTS "createdById" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Credentials_createdById_idx" ON "Credentials"("createdById");

-- CreateIndex (parity with MySQL schema; speeds up workspace-scoped lookups)
CREATE INDEX IF NOT EXISTS "Credentials_workspaceId_idx" ON "Credentials"("workspaceId");

-- AddForeignKey
ALTER TABLE "Credentials" ADD CONSTRAINT "Credentials_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
