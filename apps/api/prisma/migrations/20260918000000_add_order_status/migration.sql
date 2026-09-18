CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "dailyOrderNumber" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "estimatedReadyAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);
