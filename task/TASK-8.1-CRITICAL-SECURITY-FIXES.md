# TASK 8.1 - Critical Security Fixes

**Priority:** CRITICAL
**Category:** Security
**Estimated Effort:** 2-3 hours
**Dependencies:** None

## Context

Architectural review identified critical security vulnerabilities that must be fixed immediately before production deployment.

## Issues Identified

### 1. Deprecated Crypto Functions (CRITICAL)

**Location:** `apps/api/src/modules/email/services/email-send.service.ts` lines 340, 359

**Problem:**
- Uses deprecated `crypto.createCipher()` and `crypto.createDecipher()`
- These functions are insecure and have been deprecated since Node.js 10.x
- They use weak key derivation (MD5-based) which is cryptographically broken

**Current Code:**
```typescript
const cipher = crypto.createCipher(algorithm, key);
const decipher = crypto.createDecipher(algorithm, key);
```

**Impact:**
- PII data (CPF/CNPJ) encrypted with weak crypto
- Vulnerable to brute force and rainbow table attacks
- LGPD compliance violation

**Solution:**
Replace with the secure utility already implemented in `packages/shared/src/utils/encryption.util.ts`:

```typescript
import { encryptCpfCnpj, decryptCpfCnpj } from '@email-gateway/shared';

// Store both encrypted data and salt
const { encrypted, salt } = encryptCpfCnpj(cpfCnpj, password);
// Store encrypted and salt in database

// Later decrypt
const decrypted = decryptCpfCnpj(encrypted, password, salt);
```

### 2. Missing Encryption Key Configuration

**Problem:**
- No `ENCRYPTION_KEY` in `.env.example`
- Service uses hardcoded fallback: `'default-key-for-demo-only'`
- Production deployments would use insecure default key

**Solution:**
Add to `.env.example`:
```bash
# Encryption (REQUIRED for production - generate with: openssl rand -base64 32)
ENCRYPTION_KEY=
ENCRYPTION_SALT_SECRET=
```

Add validation in startup:
```typescript
if (!process.env.ENCRYPTION_KEY || process.env.ENCRYPTION_KEY.length < 32) {
  throw new Error('ENCRYPTION_KEY must be set and at least 32 characters');
}
```

### 3. Inconsistent Encryption Implementation

**Problem:**
- `email-send.service.ts` has its own encryption (deprecated)
- `encryption.util.ts` has proper implementation (not used)
- Two different encryption schemes for same data

**Solution:**
- Remove all encryption code from `email-send.service.ts`
- Use only the shared `encryption.util.ts` functions
- Ensure all PII uses consistent encryption

## Implementation Checklist

### Phase 1: Fix Encryption (URGENT)
- [ ] Remove `encryptCpfCnpj()` and `decryptCpfCnpj()` from `email-send.service.ts`
- [ ] Import and use functions from `@email-gateway/shared/encryption.util`
- [ ] Update Recipient model to store `cpfCnpjSalt` field
- [ ] Create migration to add `cpfCnpjSalt` column
- [ ] Update recipient upsert logic to handle salt storage

### Phase 2: Configuration Security
- [ ] Add `ENCRYPTION_KEY` to `.env.example` with warning
- [ ] Add startup validation for `ENCRYPTION_KEY`
- [ ] Document key generation in README
- [ ] Add key rotation documentation (future task)

### Phase 3: Testing
- [ ] Test encryption/decryption round-trip
- [ ] Test with missing encryption key (should fail fast)
- [ ] Test with weak encryption key (should fail)
- [ ] Update existing unit tests for encryption

### Phase 4: Data Migration (if needed)
- [ ] If data exists, create migration script to re-encrypt with proper method
- [ ] Document migration procedure in runbook

## Files to Modify

1. `apps/api/src/modules/email/services/email-send.service.ts`
   - Remove `encryptCpfCnpj()` method (lines 329-345)
   - Remove `decryptCpfCnpj()` method (lines 350-368)
   - Import from shared package
   - Update `processRecipient()` to store salt

2. `packages/database/prisma/schema.prisma`
   - Add `cpfCnpjSalt` field to Recipient model

3. `.env.example`
   - Add `ENCRYPTION_KEY` with documentation
   - Add `ENCRYPTION_SALT_SECRET` (optional, can use same key)

4. `apps/api/src/main.ts`
   - Add encryption key validation on startup

## Security Best Practices to Apply

1. **Key Management:**
   - Use environment variables (never hardcode)
   - Minimum 32 bytes (256 bits) for AES-256
   - Different keys per environment (dev/staging/prod)
   - Document key rotation procedure

2. **Salt Storage:**
   - Store salt in database alongside encrypted data
   - Never reuse salts across records
   - Use cryptographically secure random generation

3. **Algorithm Choice:**
   - Use AES-256-CBC or AES-256-GCM (current implementation uses CBC)
   - Consider upgrading to GCM for authenticated encryption
   - Use proper PBKDF2 key derivation with high iteration count

## Testing Commands

```bash
# Unit tests
npm test -- packages/shared/src/utils/__tests__/encryption.util.spec.ts

# Integration tests
npm test -- apps/api/test/integration/recipient-encryption.spec.ts

# Manual verification
tsx scripts/test-encryption.ts
```

## Documentation Updates

Update these files:
- `docs/data/03-data-retention-privacy.md` - Document encryption implementation
- `README.md` - Add encryption key setup instructions
- `apps/api/README.md` - Add security configuration section

## Success Criteria

- [ ] No usage of deprecated `crypto.createCipher()` in codebase
- [ ] All PII encryption uses shared `encryption.util.ts`
- [ ] Encryption key is validated on startup
- [ ] Salt is properly stored and retrieved
- [ ] All tests pass
- [ ] Documentation updated

## Related Tasks

- TASK 5.2 - PII masking, encryption, retention (partially implemented)
- Future: TASK 8.4 - Encryption key rotation procedure

## References

- [Node.js Crypto Deprecations](https://nodejs.org/api/deprecations.html#DEP0105)
- [OWASP Cryptographic Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)
- LGPD Article 46 - Security measures for personal data
