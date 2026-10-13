/*
  Warnings:

  - You are about to drop the column `Payload` on the `OutboxEvent` table. All the data in the column will be lost.
  - Added the required column `payload` to the `OutboxEvent` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "OutboxEvent" DROP COLUMN "Payload",
ADD COLUMN     "payload" JSONB NOT NULL;
