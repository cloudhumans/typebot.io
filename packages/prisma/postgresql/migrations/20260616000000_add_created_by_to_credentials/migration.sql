-- AlterTable
ALTER TABLE "Credentials" ADD COLUMN "createdById" TEXT;

-- CreateIndex
CREATE INDEX "Credentials_createdById_idx" ON "Credentials"("createdById");

-- AddForeignKey
ALTER TABLE "Credentials" ADD CONSTRAINT "Credentials_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
