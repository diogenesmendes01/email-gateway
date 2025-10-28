# Batch Email API

API para envio de emails em lote, permitindo enviar até 1000 emails em uma única requisição.

## Endpoints

### 1. Send Batch of Emails

Envia múltiplos emails em um único request (processamento assíncrono).

```http
POST /v1/email/batch
Content-Type: application/json
X-API-Key: your-api-key
```

#### Request Body

```json
{
  "emails": [
    {
      "to": "user1@example.com",
      "subject": "Welcome!",
      "html": "<p>Hello user1</p>",
      "cc": ["manager@example.com"],
      "bcc": ["bcc@example.com"],
      "replyTo": "support@example.com",
      "headers": {
        "X-Custom-Header": "value"
      },
      "tags": ["welcome", "onboarding"],
      "externalId": "user-001",
      "recipient": {
        "email": "user1@example.com",
        "nome": "User 1",
        "cpfCnpj": "12345678901",
        "razaoSocial": "Company Name",
        "externalId": "ext-001"
      }
    },
    {
      "to": "user2@example.com",
      "subject": "Welcome!",
      "html": "<p>Hello user2</p>"
    }
  ],
  "mode": "best_effort"
}
```

#### Parameters

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `emails` | array | Yes | Array of email objects (1-1000) |
| `emails[].to` | string | Yes | Recipient email address |
| `emails[].subject` | string | Yes | Email subject |
| `emails[].html` | string | Yes | Email HTML content |
| `emails[].cc` | string[] | No | CC recipients |
| `emails[].bcc` | string[] | No | BCC recipients |
| `emails[].replyTo` | string | No | Reply-To address |
| `emails[].headers` | object | No | Custom headers |
| `emails[].tags` | string[] | No | Tags for filtering/analytics |
| `emails[].externalId` | string | No | Your external ID |
| `emails[].recipient` | object | No | Recipient metadata |
| `mode` | string | No | Processing mode (default: `best_effort`) |

#### Processing Modes

- **`best_effort`** (default): Process all emails, skip failures
  - Best for campaigns where some failures are acceptable
  - Failed emails don't affect successful ones
  - Batch status: `COMPLETED` (all ok), `PARTIAL` (some failed), or `FAILED` (all failed)

- **`all_or_nothing`**: Validate all first, rollback if any fails
  - Best when all emails must succeed
  - If any email fails, entire batch is rolled back
  - More strict validation upfront

#### Response (202 Accepted)

```json
{
  "batchId": "clx123abc",
  "status": "PROCESSING",
  "totalEmails": 1000,
  "message": "Batch accepted for processing"
}
```

#### Error Responses

**400 Bad Request** - Invalid batch
```json
{
  "statusCode": 400,
  "message": "Batch cannot exceed 1000 emails"
}
```

**429 Too Many Requests** - Rate limit exceeded
```json
{
  "statusCode": 429,
  "code": "BATCH_RATE_LIMIT_EXCEEDED",
  "message": "Batch rate limit exceeded. Maximum 10 batches per hour.",
  "limit": 10,
  "current": 10,
  "retryAfter": 3600
}
```

---

### 2. Upload CSV for Batch

Upload a CSV file containing email data for batch processing.

```http
POST /v1/email/batch/csv
Content-Type: multipart/form-data
X-API-Key: your-api-key
```

#### Form Data

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | file | Yes | CSV file (max 10MB, up to 1000 emails) |

#### CSV Format

Required columns: `to`, `subject`, `html`

Optional columns: `cc`, `bcc`, `reply_to`, `tags`, `external_id`, `recipient_name`, `recipient_cpf`, `recipient_razao_social`, `recipient_external_id`

**Example CSV:**

```csv
to,subject,html,recipient_name,recipient_cpf
user1@example.com,Welcome,"<p>Hello User 1</p>",John Doe,12345678901
user2@example.com,Welcome,"<p>Hello User 2</p>",Jane Smith,98765432100
```

**Multiple values** (use semicolon separator):
```csv
to,subject,html,cc,tags
user1@example.com,Welcome,"<p>Hello</p>",manager@ex.com;team@ex.com,welcome;onboarding
```

#### Response (202 Accepted)

```json
{
  "batchId": "clx456def",
  "status": "PROCESSING",
  "totalEmails": 500,
  "message": "Batch accepted for processing"
}
```

#### Error Responses

**400 Bad Request** - Invalid file
```json
{
  "statusCode": 400,
  "code": "FILE_TOO_LARGE",
  "message": "CSV file size exceeds maximum of 10MB (got 12MB)"
}
```

```json
{
  "statusCode": 400,
  "code": "CSV_TOO_LARGE",
  "message": "CSV contains more than 1000 emails. Please split into multiple files."
}
```

```json
{
  "statusCode": 400,
  "code": "EMPTY_CSV",
  "message": "CSV file contains no valid email records"
}
```

---

### 3. Get Batch Status

Get batch processing status and progress.

```http
GET /v1/email/batch/:batchId
X-API-Key: your-api-key
```

#### Response (200 OK)

```json
{
  "batchId": "clx123abc",
  "status": "PROCESSING",
  "totalEmails": 1000,
  "processedCount": 750,
  "successCount": 745,
  "failedCount": 5,
  "progress": 75,
  "createdAt": "2025-10-28T12:00:00Z",
  "completedAt": null
}
```

#### Batch Status Values

| Status | Description |
|--------|-------------|
| `PROCESSING` | Batch is currently being processed |
| `COMPLETED` | All emails successfully sent |
| `PARTIAL` | Some emails failed, some succeeded |
| `FAILED` | All emails failed |

#### Error Responses

**404 Not Found** - Batch doesn't exist
```json
{
  "statusCode": 404,
  "code": "BATCH_NOT_FOUND",
  "message": "Batch with ID clx123abc not found"
}
```

---

### 4. List Emails in Batch

Get list of emails in batch with their individual status.

```http
GET /v1/email/batch/:batchId/emails
X-API-Key: your-api-key
```

#### Response (200 OK)

```json
{
  "batchId": "clx123abc",
  "count": 100,
  "emails": [
    {
      "id": "email-001",
      "to": "user1@example.com",
      "subject": "Welcome!",
      "status": "SENT",
      "createdAt": "2025-10-28T12:00:00Z",
      "processedAt": "2025-10-28T12:00:05Z",
      "lastError": null
    },
    {
      "id": "email-002",
      "to": "invalid@example.com",
      "subject": "Welcome!",
      "status": "FAILED",
      "createdAt": "2025-10-28T12:00:00Z",
      "processedAt": "2025-10-28T12:00:06Z",
      "lastError": "Invalid email address"
    }
  ]
}
```

**Note:** Results are limited to 100 emails by default.

---

## Limits and Quotas

| Limit | Value | Notes |
|-------|-------|-------|
| **Max emails per batch** | 1000 | Split larger campaigns into multiple batches |
| **Max batches per hour** | 10 | Per company |
| **Max CSV file size** | 10 MB | Approximately 10,000 emails |
| **Max batch size** | 10 MB | Total request size |

---

## Best Practices

### 1. Use Batch API for > 100 Emails

For campaigns with more than 100 recipients, use the batch API instead of individual sends.

**Benefits:**
- 1 request instead of 1000
- Lower latency and overhead
- Better throughput
- Automatic progress tracking

### 2. Split Large Campaigns

For campaigns with > 1000 emails, split into multiple batches:

```javascript
const BATCH_SIZE = 1000;
const batches = [];

for (let i = 0; i < emails.length; i += BATCH_SIZE) {
  const chunk = emails.slice(i, i + BATCH_SIZE);
  const response = await fetch('/v1/email/batch', {
    method: 'POST',
    headers: {
      'X-API-Key': apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      emails: chunk,
      mode: 'best_effort'
    })
  });

  const batch = await response.json();
  batches.push(batch.batchId);
}

// Monitor all batches
for (const batchId of batches) {
  const status = await fetch(`/v1/email/batch/${batchId}`, {
    headers: { 'X-API-Key': apiKey }
  });
  console.log(await status.json());
}
```

### 3. Monitor Batch Status

Poll the status endpoint to track progress:

```javascript
async function waitForBatch(batchId) {
  while (true) {
    const response = await fetch(`/v1/email/batch/${batchId}`, {
      headers: { 'X-API-Key': apiKey }
    });

    const status = await response.json();

    if (['COMPLETED', 'PARTIAL', 'FAILED'].includes(status.status)) {
      return status;
    }

    console.log(`Progress: ${status.progress}%`);
    await new Promise(resolve => setTimeout(resolve, 5000)); // Poll every 5s
  }
}
```

### 4. Handle Partial Failures Gracefully

When using `best_effort` mode, some emails may fail:

```javascript
const batch = await waitForBatch(batchId);

if (batch.status === 'PARTIAL') {
  console.log(`${batch.successCount} succeeded, ${batch.failedCount} failed`);

  // Get failed emails
  const response = await fetch(`/v1/email/batch/${batchId}/emails`);
  const { emails } = await response.json();

  const failed = emails.filter(e => e.status === 'FAILED');

  // Retry failed emails or handle them separately
  for (const email of failed) {
    console.log(`Failed: ${email.to} - ${email.lastError}`);
  }
}
```

### 5. Use CSV Upload for Very Large Campaigns

For campaigns with > 10k emails, use CSV upload:

```bash
curl -X POST https://api.example.com/v1/email/batch/csv \
  -H "X-API-Key: your-api-key" \
  -F "file=@campaign.csv"
```

### 6. Respect Rate Limits

The API enforces rate limits:
- **10 batches per hour** per company

If you hit the limit:
```json
{
  "statusCode": 429,
  "retryAfter": 3600
}
```

Wait for the `retryAfter` period (in seconds) before retrying.

---

## Performance Comparison

| Method | Emails | Requests | Time | Overhead |
|--------|--------|----------|------|----------|
| **Individual sends** | 1000 | 1000 | 5-10 min | High (HTTP per email) |
| **Batch API** | 1000 | 1 | 30-60s | Low (single HTTP) |
| **CSV Upload** | 10,000 | 1 | 5-10 min | Minimal |

---

## Metrics

Batch operations expose the following Prometheus metrics:

| Metric | Type | Description |
|--------|------|-------------|
| `email_batch_created_total` | Counter | Total batches created |
| `email_batch_completed_total` | Counter | Total batches completed (by status) |
| `email_batch_size` | Histogram | Number of emails per batch |
| `email_batch_processing_duration_seconds` | Histogram | Batch processing duration |

**Example queries:**

```promql
# Batch creation rate
rate(email_batch_created_total[5m])

# Average batch size
rate(email_batch_size_sum[5m]) / rate(email_batch_size_count[5m])

# Batch completion rate by status
rate(email_batch_completed_total{status="COMPLETED"}[5m])

# P95 processing time
histogram_quantile(0.95, rate(email_batch_processing_duration_seconds_bucket[5m]))
```

---

## Error Handling

### Common Errors

1. **Batch too large**
   ```json
   { "message": "Batch cannot exceed 1000 emails" }
   ```
   **Solution:** Split into multiple batches of ≤ 1000 emails

2. **Rate limit exceeded**
   ```json
   { "code": "BATCH_RATE_LIMIT_EXCEEDED", "retryAfter": 3600 }
   ```
   **Solution:** Wait for `retryAfter` seconds or contact support for higher limits

3. **CSV parse error**
   ```json
   { "code": "CSV_PARSE_ERROR", "message": "Failed to parse CSV file: ..." }
   ```
   **Solution:** Validate CSV format, ensure proper encoding (UTF-8)

4. **Invalid email format**
   ```json
   { "message": "Validation failed", "errors": ["Email 5: Missing required fields"] }
   ```
   **Solution:** Validate email data before submitting batch

### Retry Strategy

For transient errors (5xx, timeouts):

```javascript
async function sendBatchWithRetry(emails, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch('/v1/email/batch', {
        method: 'POST',
        headers: {
          'X-API-Key': apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ emails, mode: 'best_effort' })
      });

      if (response.ok) {
        return await response.json();
      }

      if (response.status === 429) {
        const data = await response.json();
        await new Promise(resolve => setTimeout(resolve, data.retryAfter * 1000));
        continue;
      }

      if (response.status >= 400 && response.status < 500) {
        // Client error - don't retry
        throw new Error(`Client error: ${response.status}`);
      }

    } catch (error) {
      if (attempt === maxRetries) throw error;
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
    }
  }
}
```

---

## FAQ

### Q: What happens if some emails fail in `best_effort` mode?

**A:** The batch continues processing. Final status will be `PARTIAL`, and you can query failed emails via `/batch/:batchId/emails`.

### Q: Can I retry failed emails from a batch?

**A:** Yes! Query `/batch/:batchId/emails`, filter by `status: 'FAILED'`, and create a new batch with just the failed emails.

### Q: How long are batch records kept?

**A:** Batch records are kept for 30 days. After that, they may be archived or deleted.

### Q: Can I cancel a batch in progress?

**A:** No, batches cannot be cancelled once created. Emails already processed will complete.

### Q: What's the difference between batch and CSV upload?

**A:**
- **Batch API**: Send JSON payload, best for programmatic access
- **CSV Upload**: Upload file, best for manual campaigns or external tools

Both create the same underlying batch and have the same limits.

### Q: Does batch API support attachments?

**A:** Not yet. Attachments will be added in a future release.

---

## Support

For questions or issues:
- **Documentation:** https://docs.example.com
- **API Status:** https://status.example.com
- **Support:** support@example.com
