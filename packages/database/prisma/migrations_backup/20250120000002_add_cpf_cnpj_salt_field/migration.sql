-- Add cpfCnpjSalt field to recipients table
ALTER TABLE "recipients" ADD COLUMN "cpf_cnpj_salt" TEXT;
