-- CreateTable
CREATE TABLE "brand" (
    "id" TEXT NOT NULL DEFAULT 'unica',
    "productName" TEXT NOT NULL DEFAULT 'Norty Desk',
    "tagline" TEXT,
    "logoKey" TEXT,
    "logoContentType" TEXT,
    "faviconKey" TEXT,
    "faviconContentType" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brand_pkey" PRIMARY KEY ("id")
);
