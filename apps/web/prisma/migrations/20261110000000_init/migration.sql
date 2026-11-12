-- CreateEnum
CREATE TYPE "PurchaseCategory" AS ENUM ('PC', 'COMPONENTS', 'PERIPHERALS', 'OTHER');
CREATE TYPE "PurchaseStatus" AS ENUM ('ACTIVE', 'CANCELLED');
CREATE TYPE "TicketStatus" AS ENUM ('ACTIVE', 'VOID');
CREATE TYPE "AdminRole" AS ENUM ('OWNER', 'MANAGER', 'STAFF');
CREATE TYPE "ClaimStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE "RaffleStatus" AS ENUM ('DRAFT', 'ACTIVE', 'REGISTRATION_CLOSED', 'FINISHED');

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "telegramId" BIGINT NOT NULL,
    "username" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT,
    "phone" TEXT,
    "consentAt" TIMESTAMP(3),
    "consentVersion" TEXT,
    "notifyEnabled" BOOLEAN NOT NULL DEFAULT true,
    "botBlocked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Purchase" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "receiptNumber" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "category" "PurchaseCategory" NOT NULL,
    "ticketsAwarded" INTEGER NOT NULL,
    "purchasedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "PurchaseStatus" NOT NULL DEFAULT 'ACTIVE',
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Ticket" (
    "id" SERIAL NOT NULL,
    "ticketNumber" TEXT NOT NULL,
    "ticketSeq" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "purchaseId" INTEGER NOT NULL,
    "status" "TicketStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Ticket_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Admin" (
    "id" SERIAL NOT NULL,
    "telegramId" BIGINT NOT NULL,
    "role" "AdminRole" NOT NULL DEFAULT 'STAFF',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Admin_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditLog" (
    "id" SERIAL NOT NULL,
    "adminId" INTEGER,
    "action" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Raffle" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Moscow',
    "status" "RaffleStatus" NOT NULL DEFAULT 'DRAFT',
    "winnerTicketId" INTEGER,
    "winnerFixedAt" TIMESTAMP(3),
    "streamUrl" TEXT,
    CONSTRAINT "Raffle_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PurchaseClaim" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "receiptNumber" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "category" "PurchaseCategory" NOT NULL,
    "purchasedAt" TIMESTAMP(3) NOT NULL,
    "photo" BYTEA,
    "photoMime" TEXT,
    "status" "ClaimStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedBy" INTEGER,
    "reviewedAt" TIMESTAMP(3),
    "rejectReason" TEXT,
    "verifyNote" TEXT,
    "purchaseId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PurchaseClaim_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReminderLog" (
    "id" SERIAL NOT NULL,
    "raffleId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReminderLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_telegramId_key" ON "User"("telegramId");
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");
CREATE UNIQUE INDEX "Purchase_receiptNumber_key" ON "Purchase"("receiptNumber");
CREATE INDEX "Purchase_userId_idx" ON "Purchase"("userId");
CREATE UNIQUE INDEX "Ticket_ticketNumber_key" ON "Ticket"("ticketNumber");
CREATE UNIQUE INDEX "Ticket_ticketSeq_key" ON "Ticket"("ticketSeq");
CREATE INDEX "Ticket_userId_idx" ON "Ticket"("userId");
CREATE INDEX "Ticket_purchaseId_idx" ON "Ticket"("purchaseId");
CREATE UNIQUE INDEX "Admin_telegramId_key" ON "Admin"("telegramId");
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
CREATE UNIQUE INDEX "Raffle_winnerTicketId_key" ON "Raffle"("winnerTicketId");
CREATE UNIQUE INDEX "PurchaseClaim_purchaseId_key" ON "PurchaseClaim"("purchaseId");
CREATE INDEX "PurchaseClaim_status_createdAt_idx" ON "PurchaseClaim"("status", "createdAt");
CREATE INDEX "PurchaseClaim_receiptNumber_idx" ON "PurchaseClaim"("receiptNumber");
CREATE UNIQUE INDEX "ReminderLog_raffleId_kind_key" ON "ReminderLog"("raffleId", "kind");

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Ticket" ADD CONSTRAINT "Ticket_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Raffle" ADD CONSTRAINT "Raffle_winnerTicketId_fkey" FOREIGN KEY ("winnerTicketId") REFERENCES "Ticket"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PurchaseClaim" ADD CONSTRAINT "PurchaseClaim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseClaim" ADD CONSTRAINT "PurchaseClaim_reviewedBy_fkey" FOREIGN KEY ("reviewedBy") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PurchaseClaim" ADD CONSTRAINT "PurchaseClaim_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Ручные дополнения (Prisma их не описывает)
-- Сквозная нумерация билетов CP-000001...: пропуски возможны при откате транзакции, повторов нет.
CREATE SEQUENCE "ticket_number_seq" START 1;
-- Один активный чек на номер среди заявок (PENDING/APPROVED). Отклонённую заявку можно подать заново.
CREATE UNIQUE INDEX "PurchaseClaim_receipt_active_key" ON "PurchaseClaim"("receiptNumber") WHERE "status" IN ('PENDING', 'APPROVED');
-- Защитные проверки на уровне БД
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "PurchaseClaim" ADD CONSTRAINT "PurchaseClaim_amount_positive" CHECK ("amount" > 0);
