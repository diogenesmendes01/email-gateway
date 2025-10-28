# DLQ Investigation Runbook

**Dead Letter Queue (DLQ) Management Guide for Email Gateway**

---

## 🚨 When DLQ Alert Fires

### Immediate Actions

1. **Check DLQ Statistics**
   ```bash
   curl -H "x-admin-key: YOUR_ADMIN_KEY" http://localhost:3000/admin/dlq/stats
   ```

2. **View Failed Jobs**
   ```bash
   curl -H "x-admin-key: YOUR_ADMIN_KEY" http://localhost:3000/admin/dlq?limit=10
   ```

3. **Open Grafana Dashboard**
   - Navigate to: http://localhost:3001/d/dlq-monitoring
   - Check DLQ size, growth rate, and failure patterns

---

## 📊 Understanding DLQ Metrics

### Key Metrics

| Metric | Description | Healthy | Warning | Critical |
|--------|-------------|---------|---------|----------|
| `dlq_size` | Jobs in DLQ | 0 | 1-100 | >100 |
| `dlq_oldest_job_age_hours` | Oldest job age | <1h | 1-24h | >24h |
| DLQ Growth Rate | Jobs/minute | <1 | 1-5 | >5 |
| Recent Failures | Last 10min | <10 | 10-50 | >50 |

### Alert Severity Levels

**🟢 Healthy**: DLQ empty, no recent failures

**🟡 Warning**:
- DLQ not empty for >30 minutes
- Jobs older than 7 days (stale)

**🔴 Critical**:
- DLQ size >100 jobs
- Jobs older than 24 hours
- Growth rate >5 jobs/minute

---

## 🔍 Investigation Steps

### 1. Identify Common Failure Reasons

```bash
curl -H "x-admin-key: YOUR_ADMIN_KEY" http://localhost:3000/admin/dlq/stats
```

Look for patterns in `commonErrors`:
```json
{
  "stats": {
    "total": 45,
    "commonErrors": [
      { "reason": "MessageRejected", "count": 30 },
      { "reason": "ThrottlingException", "count": 10 },
      { "reason": "TimeoutError", "count": 5 }
    ]
  }
}
```

### 2. Analyze Failure Patterns

#### A. **SES-Related Failures**

| Error | Cause | Action |
|-------|-------|--------|
| `MessageRejected` | Invalid recipient, blacklisted | Validate email format, check SES bounce list |
| `ThrottlingException` | SES rate limit exceeded | Increase SES sending quota or slow down |
| `SendingPausedException` | SES account paused | Contact AWS Support |
| `InvalidParameterValue` | Malformed email data | Validate email structure, check encoding |

**Actions:**
- Check AWS SES Dashboard: https://console.aws.amazon.com/ses/
- Review SES sending quotas
- Check for reputation issues

#### B. **Network/Timeout Failures**

| Error | Cause | Action |
|-------|-------|--------|
| `NetworkingError` | Network connectivity | Check VPC, security groups, internet gateway |
| `TimeoutError` | SES API slow/unavailable | Check AWS service health, increase timeout |
| `ECONNREFUSED` | SES endpoint unreachable | Verify AWS region, check DNS resolution |

**Actions:**
- Check AWS Service Health: https://status.aws.amazon.com/
- Verify network connectivity to SES endpoints
- Review CloudWatch logs

#### C. **Database/Redis Failures**

| Error | Cause | Action |
|-------|-------|--------|
| `PrismaClientKnownRequestError` | Database constraint violation | Fix data integrity issues |
| `ConnectionError` | DB/Redis unavailable | Check database and Redis health |
| `QueryTimeout` | Slow database queries | Optimize queries, add indexes |

**Actions:**
- Check database connection pool
- Monitor Redis memory usage
- Review slow query logs

#### D. **Application Logic Errors**

| Error | Cause | Action |
|-------|-------|--------|
| `ValidationError` | Invalid job data | Fix validation logic |
| `TypeError` | Code bug | Review stacktrace, fix code |
| `ReferenceError` | Missing dependency | Check environment configuration |

**Actions:**
- Review stacktraces in DLQ job details
- Check recent deployments
- Verify environment variables

---

## 🛠️ Recovery Procedures

### Manual Retry (Single Job)

```bash
# Get job details
curl -H "x-admin-key: YOUR_ADMIN_KEY" \
  http://localhost:3000/admin/dlq/JOB_ID

# Retry the job
curl -X POST -H "x-admin-key: YOUR_ADMIN_KEY" \
  http://localhost:3000/admin/dlq/JOB_ID/retry
```

### Bulk Retry (Multiple Jobs)

```bash
curl -X POST -H "x-admin-key: YOUR_ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"jobIds": ["job1", "job2", "job3"]}' \
  http://localhost:3000/admin/dlq/bulk-retry
```

### Remove Unfixable Jobs

```bash
# Permanently delete a job
curl -X DELETE -H "x-admin-key: YOUR_ADMIN_KEY" \
  http://localhost:3000/admin/dlq/JOB_ID
```

### Clean Old Jobs (>7 days)

```bash
# Remove jobs older than 7 days
curl -X POST -H "x-admin-key: YOUR_ADMIN_KEY" \
  http://localhost:3000/admin/dlq/clean?daysOld=7
```

---

## 📋 Common Scenarios

### Scenario 1: SES Rate Limit Exceeded

**Symptoms:**
- Many `ThrottlingException` errors
- Recent spike in DLQ size
- All failures within short timeframe

**Root Cause:** Application sending too fast for current SES quota

**Resolution:**
1. Check SES sending rate: AWS Console → SES → Account Dashboard
2. If quota reached, either:
   - Request quota increase (AWS Support)
   - Slow down sending rate (add delays)
   - Retry jobs after quota resets

```bash
# Retry all after quota reset (next hour)
curl -X POST -H "x-admin-key: YOUR_ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"jobIds": ["..."]}' \
  http://localhost:3000/admin/dlq/bulk-retry
```

---

### Scenario 2: Invalid Recipients

**Symptoms:**
- `MessageRejected` or `InvalidParameterValue` errors
- Specific recipient emails failing consistently

**Root Cause:** Invalid email addresses, blacklisted domains, or format issues

**Resolution:**
1. Get failed job details to see recipient email
2. Validate email format
3. Check SES suppression list
4. Remove unfixable jobs (permanently invalid emails)

```bash
# Get job details
curl -H "x-admin-key: YOUR_ADMIN_KEY" \
  http://localhost:3000/admin/dlq/JOB_ID

# If email is invalid, remove from DLQ
curl -X DELETE -H "x-admin-key: YOUR_ADMIN_KEY" \
  http://localhost:3000/admin/dlq/JOB_ID
```

---

### Scenario 3: Database Connection Issues

**Symptoms:**
- `ConnectionError` or `PrismaClientInitializationError`
- All jobs failing simultaneously
- DLQ growing rapidly (>5 jobs/min)

**Root Cause:** Database unavailable, connection pool exhausted, or network issues

**Resolution:**
1. Check database health:
   ```bash
   # Test database connection
   psql -h DB_HOST -U DB_USER -d DB_NAME -c "SELECT 1;"
   ```

2. Check connection pool:
   ```bash
   # Check active connections
   SELECT count(*) FROM pg_stat_activity;
   ```

3. Restart worker if needed:
   ```bash
   pm2 restart worker
   # or
   docker restart email-gateway-worker
   ```

4. Bulk retry after database recovers:
   ```bash
   curl -X POST -H "x-admin-key: YOUR_ADMIN_KEY" \
     -H "Content-Type: application/json" \
     -d '{"jobIds": ["..."]}' \
     http://localhost:3000/admin/dlq/bulk-retry
   ```

---

### Scenario 4: Code Deployment Bugs

**Symptoms:**
- All failures started after recent deployment
- Same error across all jobs (e.g., `TypeError`, `ReferenceError`)
- Stacktraces point to specific code location

**Root Cause:** Bug introduced in recent deployment

**Resolution:**
1. **Immediate**: Rollback deployment
   ```bash
   git revert HEAD
   git push
   pm2 restart worker
   ```

2. Review stacktraces:
   ```bash
   curl -H "x-admin-key: YOUR_ADMIN_KEY" \
     http://localhost:3000/admin/dlq/JOB_ID | jq '.stacktrace'
   ```

3. Fix bug in code

4. Deploy fix

5. Bulk retry all jobs:
   ```bash
   curl -X POST -H "x-admin-key: YOUR_ADMIN_KEY" \
     -H "Content-Type: application/json" \
     -d '{"jobIds": ["..."]}' \
     http://localhost:3000/admin/dlq/bulk-retry
   ```

---

## 📈 Monitoring & Prevention

### Proactive Monitoring

1. **Set up Slack alerts** (`.env`):
   ```bash
   SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
   ```

2. **Monitor Grafana dashboards**:
   - Email Gateway Overview: http://localhost:3001/d/email-gateway-overview
   - DLQ Monitoring: http://localhost:3001/d/dlq-monitoring

3. **Regular health checks**:
   ```bash
   # Daily cron job to check DLQ
   0 9 * * * curl -H "x-admin-key: $ADMIN_KEY" http://localhost:3000/admin/dlq/stats
   ```

### Prevention Strategies

1. **Validate inputs** before enqueueing:
   - Email format validation
   - Recipient verification
   - Content sanitization

2. **Monitor SES quotas**:
   - Set alerts for 80% quota usage
   - Request increases proactively

3. **Implement circuit breakers**:
   - Automatic backoff on repeated failures
   - Pause processing on systemic issues

4. **Regular DLQ cleanup**:
   - Weekly cleanup of jobs >7 days old
   - Archive old failures for analysis

---

## 🔐 Security & Access Control

### Admin API Key Management

1. **Generate strong admin key**:
   ```bash
   openssl rand -base64 32
   ```

2. **Set in environment**:
   ```bash
   ADMIN_API_KEY=your-generated-key-here
   ```

3. **Rotate regularly** (quarterly):
   - Generate new key
   - Update deployment
   - Invalidate old key

### Access Logging

All admin DLQ operations are logged:
```json
{
  "message": "Job manually retried from DLQ",
  "jobId": "123",
  "outboxId": "abc",
  "retriedBy": "admin",
  "timestamp": "2025-10-28T10:00:00Z"
}
```

---

## 📞 Escalation

### When to Escalate

1. **DLQ >1000 jobs** and growing
2. **All retry attempts failing** (systemic issue)
3. **AWS SES issues** (not in our control)
4. **Database/Redis complete failure**

### Escalation Contacts

- **DevOps**: Check infrastructure (database, Redis, network)
- **AWS Support**: SES-specific issues, quota increases
- **Engineering Lead**: Code bugs, architecture issues

---

## 📚 Additional Resources

- [AWS SES Error Codes](https://docs.aws.amazon.com/ses/latest/dg/api-error-codes.html)
- [BullMQ Failed Jobs](https://docs.bullmq.io/guide/jobs/failing)
- [Prometheus Alerting](https://prometheus.io/docs/alerting/latest/overview/)
- [Email Gateway Architecture](./architecture/01-visao-geral-sistema.md)

---

**Last Updated:** 2025-10-28
**Version:** 1.0
**Maintainer:** DevOps Team
