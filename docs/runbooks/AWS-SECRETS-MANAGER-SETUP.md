# AWS Secrets Manager Setup and Configuration

**TASK-026: Production Readiness - Secure Secrets Management**

This runbook guides you through setting up AWS Secrets Manager for the Email Gateway application.

---

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Initial Setup](#initial-setup)
4. [IAM Permissions](#iam-permissions)
5. [Secret Rotation](#secret-rotation)
6. [Monitoring and Alerts](#monitoring-and-alerts)
7. [Troubleshooting](#troubleshooting)
8. [Cost Analysis](#cost-analysis)

---

## Overview

### Why AWS Secrets Manager?

**Problems with environment variables:**
- ❌ Secrets visible in process lists and logs
- ❌ No audit trail of who accessed secrets
- ❌ Manual rotation requires redeployment
- ❌ Risk of secrets in version control

**AWS Secrets Manager benefits:**
- ✅ Encryption at rest (AWS KMS)
- ✅ Encryption in transit (TLS)
- ✅ Automatic rotation without downtime
- ✅ IAM-based access control
- ✅ CloudTrail audit logging
- ✅ Secret versioning and rollback

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Email Gateway API                       │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │           SecretsService (on startup)                 │   │
│  │  1. Check NODE_ENV or USE_SECRETS_MANAGER flag       │   │
│  │  2. Initialize AWS Secrets Manager client            │   │
│  │  3. Fetch encryption key                             │   │
│  │  4. Cache in memory (5 min TTL)                      │   │
│  │  5. Validate and start application                   │   │
│  └──────────────┬───────────────────────────────────────┘   │
│                 │                                             │
│                 │ AWS SDK (IAM Role)                          │
│                 ▼                                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │            AWS Secrets Manager                        │   │
│  │                                                        │   │
│  │  • email-gateway/encryption-key     [CRITICAL]       │   │
│  │  • email-gateway/encryption-salt    [CRITICAL]       │   │
│  │  • email-gateway/admin-api-key      [CRITICAL]       │   │
│  │  • email-gateway/database-url       [OPTIONAL]       │   │
│  │                                                        │   │
│  │  Encrypted with KMS key: alias/email-gateway         │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## Prerequisites

Before starting, ensure you have:

1. **AWS CLI** installed and configured
   ```bash
   aws --version
   aws configure
   ```

2. **AWS IAM permissions** to:
   - Create secrets (`secretsmanager:CreateSecret`)
   - Manage KMS keys (`kms:CreateKey`, `kms:CreateAlias`)
   - Assign IAM roles (`iam:PutRolePolicy`)

3. **Application running** in AWS environment:
   - EC2 instance with Instance Profile
   - ECS task with Task Role
   - Lambda with Execution Role
   - EKS pod with Service Account (IRSA)

---

## Initial Setup

### Step 1: Create KMS Key (Optional but Recommended)

Create a dedicated KMS key for encrypting secrets:

```bash
# Create KMS key
aws kms create-key \
  --description "Email Gateway Secrets Encryption" \
  --key-usage ENCRYPT_DECRYPT \
  --origin AWS_KMS \
  --region us-east-1

# Note the KeyId from the output
# Example: arn:aws:kms:us-east-1:123456789012:key/abcd1234-...

# Create alias for easier reference
aws kms create-alias \
  --alias-name alias/email-gateway \
  --target-key-id <KEY_ID> \
  --region us-east-1
```

### Step 2: Create Secrets

Create all required secrets:

```bash
# 1. Encryption Key (CRITICAL - for PII encryption)
aws secretsmanager create-secret \
  --name email-gateway/encryption-key \
  --description "AES-256 encryption key for CPF/CNPJ encryption" \
  --secret-string "$(openssl rand -base64 32)" \
  --kms-key-id alias/email-gateway \
  --region us-east-1

# 2. Encryption Salt (CRITICAL - additional entropy)
aws secretsmanager create-secret \
  --name email-gateway/encryption-salt \
  --description "Salt secret for encryption key derivation" \
  --secret-string "$(openssl rand -base64 32)" \
  --kms-key-id alias/email-gateway \
  --region us-east-1

# 3. Admin API Key (CRITICAL - DLQ management)
aws secretsmanager create-secret \
  --name email-gateway/admin-api-key \
  --description "Admin API key for DLQ and system management endpoints" \
  --secret-string "$(openssl rand -base64 32)" \
  --kms-key-id alias/email-gateway \
  --region us-east-1

# 4. Database URL (OPTIONAL - if not using RDS IAM auth)
# Only create this if you're not using RDS IAM authentication
aws secretsmanager create-secret \
  --name email-gateway/database-url \
  --description "PostgreSQL connection string" \
  --secret-string "postgresql://user:password@host:5432/email_gateway" \
  --kms-key-id alias/email-gateway \
  --region us-east-1
```

### Step 3: Verify Secrets

```bash
# List all email-gateway secrets
aws secretsmanager list-secrets \
  --filters Key=name,Values=email-gateway \
  --region us-east-1

# Test retrieval (encryption-key)
aws secretsmanager get-secret-value \
  --secret-id email-gateway/encryption-key \
  --region us-east-1 \
  --query SecretString \
  --output text
```

---

## IAM Permissions

### For EC2 Instances

Create an IAM role with this policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "SecretsManagerReadAccess",
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue",
        "secretsmanager:DescribeSecret"
      ],
      "Resource": "arn:aws:secretsmanager:us-east-1:*:secret:email-gateway/*"
    },
    {
      "Sid": "KMSDecryptAccess",
      "Effect": "Allow",
      "Action": [
        "kms:Decrypt",
        "kms:DescribeKey"
      ],
      "Resource": "arn:aws:kms:us-east-1:*:key/*",
      "Condition": {
        "StringEquals": {
          "kms:ViaService": "secretsmanager.us-east-1.amazonaws.com"
        }
      }
    }
  ]
}
```

Apply to your EC2 instance profile:

```bash
# Create the role (if it doesn't exist)
aws iam create-role \
  --role-name email-gateway-ec2-role \
  --assume-role-policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Principal": {"Service": "ec2.amazonaws.com"},
      "Action": "sts:AssumeRole"
    }]
  }'

# Attach the policy
aws iam put-role-policy \
  --role-name email-gateway-ec2-role \
  --policy-name SecretsManagerAccess \
  --policy-document file://secrets-policy.json

# Create instance profile
aws iam create-instance-profile \
  --instance-profile-name email-gateway-profile

# Add role to instance profile
aws iam add-role-to-instance-profile \
  --instance-profile-name email-gateway-profile \
  --role-name email-gateway-ec2-role

# Attach to EC2 instance
aws ec2 associate-iam-instance-profile \
  --instance-id i-1234567890abcdef0 \
  --iam-instance-profile Name=email-gateway-profile
```

### For ECS Tasks

Add to your task role policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue"
      ],
      "Resource": "arn:aws:secretsmanager:us-east-1:*:secret:email-gateway/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "kms:Decrypt"
      ],
      "Resource": "*",
      "Condition": {
        "StringEquals": {
          "kms:ViaService": "secretsmanager.us-east-1.amazonaws.com"
        }
      }
    }
  ]
}
```

---

## Secret Rotation

### Automatic Rotation (Recommended)

AWS Secrets Manager supports automatic rotation using Lambda functions.

#### Step 1: Enable Rotation

```bash
# For encryption-key (custom rotation)
aws secretsmanager rotate-secret \
  --secret-id email-gateway/encryption-key \
  --rotation-lambda-arn arn:aws:lambda:us-east-1:123456789012:function:SecretsManagerRotation \
  --rotation-rules AutomaticallyAfterDays=90 \
  --region us-east-1
```

#### Step 2: Create Rotation Lambda

Create a Lambda function for encryption key rotation:

```javascript
// lambda/secrets-rotation.js
exports.handler = async (event) => {
  const { SecretId, Token, Step } = event;

  switch (Step) {
    case 'createSecret':
      // Generate new encryption key
      const crypto = require('crypto');
      const newKey = crypto.randomBytes(32).toString('base64');

      // Store as AWSPENDING version
      await secretsManager.putSecretValue({
        SecretId,
        ClientRequestToken: Token,
        SecretString: newKey,
        VersionStages: ['AWSPENDING']
      }).promise();
      break;

    case 'setSecret':
      // Test new key with application
      // (Application should handle both AWSCURRENT and AWSPENDING versions)
      break;

    case 'testSecret':
      // Verify new key works
      // Try encrypting/decrypting test data
      break;

    case 'finishSecret':
      // Promote AWSPENDING to AWSCURRENT
      await secretsManager.updateSecretVersionStage({
        SecretId,
        VersionStage: 'AWSCURRENT',
        MoveToVersionId: Token,
        RemoveFromVersionId: event.OldSecretVersion
      }).promise();
      break;
  }

  return { statusCode: 200 };
};
```

### Manual Rotation

For immediate key rotation:

```bash
# 1. Generate new key
NEW_KEY=$(openssl rand -base64 32)

# 2. Update secret
aws secretsmanager update-secret \
  --secret-id email-gateway/encryption-key \
  --secret-string "$NEW_KEY" \
  --region us-east-1

# 3. Wait for application cache to expire (5 minutes)
# OR restart application for immediate effect

# 4. Verify new key is being used
# Check application logs for "Secret fetched from AWS Secrets Manager"
```

### Zero-Downtime Rotation Strategy

The application supports zero-downtime rotation through caching:

1. **Application cache**: 5 minutes TTL
2. **Rotation steps**:
   - Update secret in AWS Secrets Manager
   - Wait 5 minutes (cache expiration)
   - Application automatically fetches new key
   - No restart required

For immediate rotation:
```bash
# Trigger cache refresh via API
curl -X POST http://your-api/admin/secrets/refresh \
  -H "x-admin-key: your-admin-key"
```

---

## Monitoring and Alerts

### CloudWatch Metrics

Monitor secret access:

```bash
# Create CloudWatch dashboard
aws cloudwatch put-dashboard \
  --dashboard-name email-gateway-secrets \
  --dashboard-body file://secrets-dashboard.json
```

**secrets-dashboard.json:**
```json
{
  "widgets": [
    {
      "type": "metric",
      "properties": {
        "metrics": [
          ["AWS/SecretsManager", "GetSecretValueRequests", { "stat": "Sum" }],
          [".", "GetSecretValueErrors", { "stat": "Sum" }]
        ],
        "period": 300,
        "stat": "Sum",
        "region": "us-east-1",
        "title": "Secrets Manager API Calls"
      }
    }
  ]
}
```

### CloudTrail Audit Logging

Track who accessed secrets:

```bash
# Query CloudTrail for secret access
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=ResourceName,AttributeValue=email-gateway/encryption-key \
  --max-results 10 \
  --region us-east-1
```

### Application Health Check

The application exposes a health check endpoint:

```bash
# Check Secrets Manager connectivity
curl http://your-api/v1/health/readyz

# Response
{
  "status": "healthy",
  "checks": {
    "secretsManager": "ok",
    "database": "ok",
    "redis": "ok"
  }
}
```

---

## Troubleshooting

### Problem: Application fails to start with "Failed to fetch secrets"

**Symptoms:**
```
❌ Failed to fetch secrets from AWS Secrets Manager
ResourceNotFoundException: Secrets Manager can't find the specified secret
```

**Solution:**
1. Verify secret exists:
   ```bash
   aws secretsmanager describe-secret \
     --secret-id email-gateway/encryption-key \
     --region us-east-1
   ```

2. Check IAM permissions:
   ```bash
   # Test from EC2 instance
   aws secretsmanager get-secret-value \
     --secret-id email-gateway/encryption-key \
     --region us-east-1
   ```

3. Verify region matches:
   ```bash
   echo $AWS_REGION  # Should match secret region
   ```

---

### Problem: AccessDeniedException

**Symptoms:**
```
AccessDeniedException: User is not authorized to perform secretsmanager:GetSecretValue
```

**Solution:**
1. Check IAM role attached to instance:
   ```bash
   # Get instance metadata
   curl http://169.254.169.254/latest/meta-data/iam/security-credentials/
   ```

2. Verify role policy includes secretsmanager:GetSecretValue

3. Check KMS key permissions:
   ```bash
   aws kms describe-key --key-id alias/email-gateway --region us-east-1
   ```

---

### Problem: Slow application startup (> 10 seconds)

**Symptoms:**
```
🔐 Fetching secrets from AWS Secrets Manager...
[10 second delay]
✅ AWS Secrets Manager integration successful
```

**Solution:**
1. Reduce secret fetch calls (application already caches)

2. Use VPC endpoints for Secrets Manager (eliminate internet latency):
   ```bash
   aws ec2 create-vpc-endpoint \
     --vpc-id vpc-12345678 \
     --service-name com.amazonaws.us-east-1.secretsmanager \
     --route-table-ids rtb-12345678 \
     --region us-east-1
   ```

3. Check network connectivity:
   ```bash
   time aws secretsmanager get-secret-value \
     --secret-id email-gateway/encryption-key \
     --region us-east-1
   ```

---

## Cost Analysis

### Monthly Costs (us-east-1)

| Item | Quantity | Unit Cost | Monthly Cost |
|------|----------|-----------|--------------|
| **Secrets** | 4 secrets | $0.40/secret/month | **$1.60** |
| **API Calls** | ~10,000/month | $0.05/10,000 calls | **$0.05** |
| **KMS** | 1 key | $1.00/key/month | **$1.00** |
| **KMS Requests** | ~10,000/month | $0.03/10,000 requests | **$0.03** |
| **Total** | - | - | **~$2.68/month** |

**API Call Estimation:**
- Application cache: 5 minutes TTL
- Calls per day per instance: ~288 (1 every 5 min)
- 1 API instance: ~8,640 calls/month
- 1 Worker instance: ~8,640 calls/month
- Total: ~17,280 calls/month ≈ $0.09

**Cost Optimization:**
- ✅ Use caching (already implemented - 5 min TTL)
- ✅ Fetch only required secrets
- ✅ Use VPC endpoints (no data transfer costs)
- ⚠️ Avoid unnecessary refreshes

---

## Development Mode

For local development, disable Secrets Manager:

```bash
# .env
USE_SECRETS_MANAGER=false
ENCRYPTION_KEY=your-local-dev-key-at-least-32-chars
```

This allows faster iteration without AWS credentials.

---

## Security Best Practices

1. **Never log secret values**
   - ✅ Application masks secrets in logs
   - ✅ Use CloudTrail for audit, not application logs

2. **Rotate regularly**
   - 🔐 Encryption keys: every 90 days
   - 🔐 Admin API keys: every 60 days

3. **Use least privilege IAM**
   - Only grant `secretsmanager:GetSecretValue`
   - Restrict by resource ARN

4. **Monitor access**
   - Enable CloudTrail logging
   - Set up alerts for unauthorized access

5. **Backup secrets**
   - Secrets Manager automatically handles versioning
   - Export critical secrets to secure offline storage

---

## Related Documentation

- [AWS Secrets Manager Documentation](https://docs.aws.amazon.com/secretsmanager/)
- [IAM Best Practices](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html)
- [Email Gateway Production Checklist](./PRODUCTION-CHECKLIST.md)
