-- AlterTable
ALTER TABLE "Credentials" ADD COLUMN IF NOT EXISTS "createdById" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Credentials_createdById_idx" ON "Credentials"("createdById");

-- CreateIndex (parity with MySQL schema; speeds up workspace-scoped lookups)
CREATE INDEX IF NOT EXISTS "Credentials_workspaceId_idx" ON "Credentials"("workspaceId");

-- AddForeignKey (guarded so a repeat deploy doesn't fail on an existing constraint)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Credentials_createdById_fkey'
  ) THEN
    ALTER TABLE "Credentials" ADD CONSTRAINT "Credentials_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
