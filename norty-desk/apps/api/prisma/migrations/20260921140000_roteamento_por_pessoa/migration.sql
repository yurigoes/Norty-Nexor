-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "defaultAssigneeId" UUID;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_defaultAssigneeId_fkey" FOREIGN KEY ("defaultAssigneeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

