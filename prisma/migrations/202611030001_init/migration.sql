-- IdeaLab initial PostgreSQL schema.

CREATE TABLE "User" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "Business" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL UNIQUE,
  "version" INTEGER NOT NULL DEFAULT 0,
  "snapshot" JSONB NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT
);

CREATE TABLE "Payment" (
  "chargeId" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL UNIQUE,
  "amount" INTEGER NOT NULL,
  "payload" JSONB NOT NULL
);

CREATE TABLE "AdminAuditLog" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "adminId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "payload" JSONB NOT NULL
);

CREATE TABLE "CurrencyLedger" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "balance" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "at" TIMESTAMP(3) NOT NULL
);

CREATE INDEX "CurrencyLedger_userId_at_idx" ON "CurrencyLedger" ("userId", "at");

CREATE TABLE "Order" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "status" TEXT NOT NULL,
  "payload" JSONB NOT NULL
);

CREATE INDEX "Order_userId_idx" ON "Order" ("userId");

CREATE TABLE "Entitlement" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "revoked" BOOLEAN NOT NULL DEFAULT false,
  "payload" JSONB NOT NULL
);

CREATE INDEX "Entitlement_userId_idx" ON "Entitlement" ("userId");

CREATE TABLE "Shift" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "end" TIMESTAMP(3) NOT NULL,
  "finalized" BOOLEAN NOT NULL,
  "payload" JSONB NOT NULL
);

CREATE INDEX "Shift_finalized_end_idx" ON "Shift" ("finalized", "end");

CREATE TABLE "BusinessLayout" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "payload" JSONB NOT NULL
);

CREATE TABLE "FurnitureInstance" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "payload" JSONB NOT NULL
);

CREATE TABLE "Employee" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "payload" JSONB NOT NULL
);

CREATE TABLE "Employment" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "payload" JSONB NOT NULL
);

CREATE TABLE "Inventory" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL UNIQUE,
  "payload" JSONB NOT NULL
);

CREATE TABLE "ShiftEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "payload" JSONB NOT NULL
);

CREATE TABLE "Decision" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "payload" JSONB NOT NULL
);

CREATE TABLE "StoryProgress" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL UNIQUE,
  "payload" JSONB NOT NULL
);

CREATE TABLE "Achievement" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "payload" JSONB NOT NULL
);

CREATE TABLE "Product" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "payload" JSONB NOT NULL
);

CREATE TABLE "NotificationPreference" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL UNIQUE,
  "payload" JSONB NOT NULL
);
