-- Migration: Add Pipeline States
-- TASK 4.1 — Pipeline de estados, validações e envio SES
-- Adiciona novos estados ao enum EmailStatus e EventType

-- Adiciona novos estados ao EmailStatus
ALTER TYPE "EmailStatus" ADD VALUE IF NOT EXISTS 'RECEIVED';
ALTER TYPE "EmailStatus" ADD VALUE IF NOT EXISTS 'VALIDATED';
ALTER TYPE "EmailStatus" ADD VALUE IF NOT EXISTS 'SENT_ATTEMPT';
ALTER TYPE "EmailStatus" ADD VALUE IF NOT EXISTS 'RETRY_SCHEDULED';

-- Adiciona novos eventos ao EventType
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'RECEIVED';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'VALIDATED';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'SENT_ATTEMPT';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'RETRY_SCHEDULED';
ALTER TYPE "EventType" ADD VALUE IF NOT EXISTS 'VALIDATION_FAILED';
