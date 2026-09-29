/*
  Warnings:

  - A unique constraint covering the columns `[senderId,idempotencyKey]` on the table `Message` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "Message_idempotencyKey_key";

-- CreateIndex
CREATE UNIQUE INDEX "Message_senderId_idempotencyKey_key" ON "Message"("senderId", "idempotencyKey");
