-- CreateEnum
CREATE TYPE "CashRegisterMode" AS ENUM ('LIBRE', 'STRICT');

-- AlterTable
ALTER TABLE "Business" ADD COLUMN     "cashRegisterMode" "CashRegisterMode" NOT NULL DEFAULT 'LIBRE';
