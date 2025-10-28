# AWS Application Load Balancer (ALB) Deployment Guide

**TASK-026: Production Readiness - AWS ALB with Auto-Scaling**

This guide walks you through deploying the Email Gateway with AWS Application Load Balancer and auto-scaling groups using Terraform.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Prerequisites](#prerequisites)
3. [Infrastructure Setup](#infrastructure-setup)
4. [Deployment Steps](#deployment-steps)
5. [Scaling Configuration](#scaling-configuration)
6. [Monitoring](#monitoring)
7. [Troubleshooting](#troubleshooting)
8. [Cost Optimization](#cost-optimization)

---

## Architecture Overview

### High-Level Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                         Internet                                  │
└────────────────────────┬─────────────────────────────────────────┘
                         │
                         │ HTTPS/HTTP
                         ▼
          ┌──────────────────────────────┐
          │  Application Load Balancer    │
          │  - Public Subnets (AZs 1-3)  │
          │  - HTTPS:443 → API:3000      │
          │  - Health checks: /healthz   │
          └──────────────┬───────────────┘
                         │
         ┌───────────────┴────────────────┐
         │                                 │
         ▼                                 ▼
┌────────────────────┐          ┌────────────────────┐
│  API Target Group  │          │   API Instances    │
│  - Port: 3000      │◄─────────│ Auto Scaling Group │
│  - Health: /v1/... │          │  Min: 2, Max: 10   │
│  - Sticky sessions │          │  t3.small instances│
└────────────────────┘          └──────┬─────────────┘
                                       │
                                       │ Connects to
                                       ▼
                         ┌──────────────────────────┐
                         │   Redis (ElastiCache)    │
                         │   PostgreSQL (RDS)       │
                         │   AWS SES                │
                         └──────────────────────────┘
                                       ▲
                                       │ Processes jobs
                                       │
                         ┌─────────────┴────────────┐
                         │   Worker Instances       │
                         │   Auto Scaling Group     │
                         │   Min: 1, Max: 5         │
                         │   t3.medium instances    │
                         └──────────────────────────┘
```

### Auto-Scaling Triggers

**API Auto-Scaling (CPU-based):**
- Scale UP: When CPU > 70% for 10 minutes
- Scale DOWN: When CPU < 30% for 10 minutes
- Cooldown: 5 minutes

**Worker Auto-Scaling (Queue depth-based):**
- Scale UP: When queue depth > 100 jobs for 10 minutes
- Scale DOWN: When queue depth < 10 jobs for 15 minutes
- Cooldown: 5 minutes (up), 10 minutes (down)

---

## Prerequisites

### 1. AWS Account Setup

Required AWS resources:
- **VPC** with public and private subnets across 2+ Availability Zones
- **NAT Gateway** for private subnet internet access
- **RDS PostgreSQL** instance
- **ElastiCache Redis** cluster
- **Route 53 Hosted Zone** (for custom domain)
- **ACM Certificate** (for HTTPS)

### 2. IAM Roles

Create IAM instance profiles with required permissions:

**API Instance Profile:**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue"
      ],
      "Resource": "arn:aws:secretsmanager:*:*:secret:email-gateway/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "ses:SendEmail",
        "ses:SendRawEmail"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "cloudwatch:PutMetricData",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "*"
    }
  ]
}
```

**Worker Instance Profile:**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "secretsmanager:GetSecretValue"
      ],
      "Resource": "arn:aws:secretsmanager:*:*:secret:email-gateway/*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "ses:SendEmail",
        "ses:SendRawEmail",
        "ses:GetSendQuota"
      ],
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "cloudwatch:PutMetricData",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ],
      "Resource": "*"
    }
  ]
}
```

### 3. S3 Buckets

Create S3 buckets for:
1. **Application artifacts**: `email-gateway-artifacts-production`
2. **ALB access logs**: `email-gateway-alb-logs-production`
3. **Terraform state** (optional): `email-gateway-terraform-state`

Configure ALB logs bucket policy:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::127311923021:root"
      },
      "Action": "s3:PutObject",
      "Resource": "arn:aws:s3:::email-gateway-alb-logs-production/*"
    }
  ]
}
```

### 4. ACM Certificate

Request SSL certificate in ACM:
```bash
aws acm request-certificate \
  --domain-name api.yourdomain.com \
  --validation-method DNS \
  --region us-east-1
```

Add DNS validation records in Route 53, then wait for validation.

### 5. Terraform Installation

```bash
# Install Terraform (macOS/Linux)
brew install terraform

# Or download from: https://www.terraform.io/downloads

# Verify installation
terraform --version  # Should be >= 1.0
```

---

## Infrastructure Setup

### Step 1: Clone Repository

```bash
git clone https://github.com/your-org/email-gateway.git
cd email-gateway/infrastructure/terraform
```

### Step 2: Configure Variables

```bash
# Copy example variables
cp terraform.tfvars.example terraform.tfvars

# Edit with your values
vim terraform.tfvars
```

Required values:
- `vpc_id`: Your VPC ID
- `ssl_certificate_arn`: ACM certificate ARN
- `redis_host`: ElastiCache endpoint
- `database_url_secret`: Secrets Manager secret name
- `ses_from_address`: Verified SES email
- `api_instance_profile_name`: IAM instance profile
- `worker_instance_profile_name`: IAM instance profile

### Step 3: Initialize Terraform

```bash
terraform init
```

This will:
- Download AWS provider
- Initialize backend (if configured)
- Create `.terraform` directory

### Step 4: Plan Deployment

```bash
terraform plan -out=tfplan
```

Review the plan carefully:
- **Resources to create**: ~25 resources
- **Estimated cost**: ~$170/month
- **Changes to existing resources**: None (initial deployment)

---

## Deployment Steps

### Step 1: Build and Upload Artifacts

Before deploying infrastructure, build and upload application artifacts:

```bash
# Build API
cd apps/api
npm run build
tar -czf api-latest.tar.gz dist/ node_modules/ package.json

# Upload to S3
aws s3 cp api-latest.tar.gz s3://email-gateway-artifacts-production/

# Build Worker
cd ../worker
npm run build
tar -czf worker-latest.tar.gz dist/ node_modules/ package.json

# Upload to S3
aws s3 cp worker-latest.tar.gz s3://email-gateway-artifacts-production/
```

### Step 2: Apply Terraform

```bash
cd infrastructure/terraform

# Apply the plan
terraform apply tfplan

# Or apply directly (will prompt for confirmation)
terraform apply
```

This will create:
- ✅ Application Load Balancer
- ✅ Target Groups
- ✅ HTTPS/HTTP Listeners
- ✅ Security Groups
- ✅ Launch Templates
- ✅ Auto Scaling Groups
- ✅ CloudWatch Alarms
- ✅ Log Groups

**Expected duration**: 5-10 minutes

### Step 3: Verify Deployment

```bash
# Get ALB DNS name
terraform output alb_dns_name

# Test health endpoint
curl -k https://<alb-dns-name>/v1/health/healthz

# Expected response:
# {
#   "status": "healthy",
#   "timestamp": "2025-10-28T12:00:00.000Z",
#   "uptime": 123
# }
```

### Step 4: Configure DNS

Create Route 53 record pointing to ALB:

```bash
aws route53 change-resource-record-sets \
  --hosted-zone-id Z1234567890ABC \
  --change-batch '{
    "Changes": [{
      "Action": "CREATE",
      "ResourceRecordSet": {
        "Name": "api.yourdomain.com",
        "Type": "A",
        "AliasTarget": {
          "HostedZoneId": "'"$(terraform output -raw alb_zone_id)"'",
          "DNSName": "'"$(terraform output -raw alb_dns_name)"'",
          "EvaluateTargetHealth": true
        }
      }
    }]
  }'
```

### Step 5: Test Production API

```bash
# Test with custom domain
curl https://api.yourdomain.com/v1/health/healthz

# Test email sending
curl -X POST https://api.yourdomain.com/v1/email/send \
  -H "x-api-key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "test@example.com",
    "subject": "Test Email",
    "html": "<p>Hello from Email Gateway!</p>"
  }'
```

---

## Scaling Configuration

### Manual Scaling

#### Scale API Up

```bash
aws autoscaling set-desired-capacity \
  --auto-scaling-group-name email-gateway-api-production \
  --desired-capacity 5
```

#### Scale Worker Up

```bash
aws autoscaling set-desired-capacity \
  --auto-scaling-group-name email-gateway-worker-production \
  --desired-capacity 3
```

### Scheduled Scaling

Create scheduled actions for predictable traffic patterns:

```bash
# Scale up API during business hours (9 AM)
aws autoscaling put-scheduled-update-group-action \
  --auto-scaling-group-name email-gateway-api-production \
  --scheduled-action-name scale-up-morning \
  --recurrence "0 9 * * MON-FRI" \
  --min-size 2 \
  --max-size 10 \
  --desired-capacity 4

# Scale down API after hours (6 PM)
aws autoscaling put-scheduled-update-group-action \
  --auto-scaling-group-name email-gateway-api-production \
  --scheduled-action-name scale-down-evening \
  --recurrence "0 18 * * MON-FRI" \
  --min-size 2 \
  --max-size 10 \
  --desired-capacity 2
```

### Target Tracking Scaling (Advanced)

Use target tracking for more responsive scaling:

```bash
aws autoscaling put-scaling-policy \
  --auto-scaling-group-name email-gateway-api-production \
  --policy-name target-tracking-policy \
  --policy-type TargetTrackingScaling \
  --target-tracking-configuration '{
    "PredefinedMetricSpecification": {
      "PredefinedMetricType": "ASGAverageCPUUtilization"
    },
    "TargetValue": 50.0
  }'
```

---

## Monitoring

### CloudWatch Dashboards

Create a dashboard to monitor the deployment:

```bash
aws cloudwatch put-dashboard \
  --dashboard-name email-gateway-production \
  --dashboard-body file://dashboard.json
```

**dashboard.json:**
```json
{
  "widgets": [
    {
      "type": "metric",
      "properties": {
        "metrics": [
          ["AWS/ApplicationELB", "TargetResponseTime", {"stat": "Average"}],
          [".", "RequestCount", {"stat": "Sum"}],
          [".", "HTTPCode_Target_5XX_Count", {"stat": "Sum"}]
        ],
        "period": 300,
        "stat": "Average",
        "region": "us-east-1",
        "title": "ALB Metrics"
      }
    },
    {
      "type": "metric",
      "properties": {
        "metrics": [
          ["AWS/EC2", "CPUUtilization", {"stat": "Average"}],
          ["EmailGateway", "queue_waiting_count", {"stat": "Average"}]
        ],
        "period": 300,
        "stat": "Average",
        "region": "us-east-1",
        "title": "Scaling Metrics"
      }
    }
  ]
}
```

### Key Metrics to Monitor

| Metric | Threshold | Action |
|--------|-----------|--------|
| **ALB TargetResponseTime** | > 1000ms | Investigate slow endpoints |
| **ALB 5XX Errors** | > 10/min | Check application logs |
| **API CPU Utilization** | > 80% | Increase instance size or count |
| **Worker Queue Depth** | > 1000 | Scale up workers |
| **Unhealthy Hosts** | > 0 | Check instance health |

---

## Troubleshooting

### Problem: Instances Failing Health Checks

**Symptoms:**
```bash
# Check target health
aws elbv2 describe-target-health \
  --target-group-arn <target-group-arn>

# Output shows:
# State: unhealthy
# Reason: Target.FailedHealthChecks
```

**Solutions:**

1. **Check application logs:**
   ```bash
   # SSH to instance (if bastion configured)
   ssh ec2-user@<instance-ip>

   # View logs
   sudo journalctl -u email-gateway-api -f
   ```

2. **Verify security group:**
   ```bash
   # Ensure ALB can reach port 3000
   aws ec2 describe-security-groups \
     --group-ids <api-security-group-id>
   ```

3. **Test health endpoint locally:**
   ```bash
   # From instance
   curl http://localhost:3000/v1/health/healthz
   ```

---

### Problem: Auto-Scaling Not Triggering

**Symptoms:**
- CPU is high but no new instances launched
- Queue depth is high but workers not scaling

**Solutions:**

1. **Check CloudWatch alarms:**
   ```bash
   aws cloudwatch describe-alarms \
     --alarm-names email-gateway-api-cpu-high-production
   ```

2. **Verify alarm is in ALARM state:**
   ```bash
   # Should show State: ALARM
   # If State: INSUFFICIENT_DATA, wait for more data points
   ```

3. **Check scaling policies:**
   ```bash
   aws autoscaling describe-policies \
     --auto-scaling-group-name email-gateway-api-production
   ```

4. **Review scaling activities:**
   ```bash
   aws autoscaling describe-scaling-activities \
     --auto-scaling-group-name email-gateway-api-production \
     --max-records 10
   ```

---

### Problem: Deployment Failures

**Symptoms:**
```
Error: Error creating Auto Scaling Group: ValidationError: You must use a valid fully-formed launch template
```

**Solutions:**

1. **Validate launch template:**
   ```bash
   aws ec2 describe-launch-template-versions \
     --launch-template-id <template-id>
   ```

2. **Check IAM instance profile exists:**
   ```bash
   aws iam get-instance-profile \
     --instance-profile-name email-gateway-api-instance-profile
   ```

3. **Verify AMI is available:**
   ```bash
   aws ec2 describe-images \
     --image-ids <ami-id>
   ```

---

## Cost Optimization

### Monthly Cost Breakdown (us-east-1)

| Resource | Configuration | Monthly Cost |
|----------|--------------|--------------|
| **ALB** | 1 ALB, 2 AZs | ~$16/month |
| **API Instances (2x)** | t3.small (2 vCPU, 2GB) | ~$30/month |
| **Worker Instances (2x)** | t3.medium (2 vCPU, 4GB) | ~$60/month |
| **Data Transfer** | 100GB out | ~$9/month |
| **CloudWatch Logs** | 10GB/month | ~$5/month |
| **CloudWatch Alarms** | 10 alarms | ~$1/month |
| **Total** | - | **~$121/month** |

**Scaling costs:**
- Each additional API instance: +$15/month
- Each additional Worker instance: +$30/month

### Optimization Tips

1. **Use Reserved Instances** (1-year term):
   - Save ~30% on EC2 costs
   - API instances: $30/month → $21/month
   - Worker instances: $60/month → $42/month

2. **Use Spot Instances for Workers** (non-critical):
   - Save up to 70%
   - Configure mixed instance policy in ASG

3. **Right-size instances:**
   - Monitor CPU/memory usage
   - Consider t3.micro for low-traffic environments

4. **Optimize log retention:**
   - Reduce from 30 days to 7 days
   - Save ~70% on CloudWatch Logs costs

---

## Related Documentation

- [AWS Secrets Manager Setup](../runbooks/AWS-SECRETS-MANAGER-SETUP.md)
- [Production Checklist](./PRODUCTION-CHECKLIST.md)
- [Auto-Scaling Best Practices](https://docs.aws.amazon.com/autoscaling/ec2/userguide/as-scaling-simple-step.html)
