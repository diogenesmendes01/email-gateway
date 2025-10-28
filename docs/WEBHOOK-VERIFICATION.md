# Webhook Signature Verification Guide

**TASK-023: Webhook Security Documentation**

## Overview

All webhooks sent by Email Gateway are signed using HMAC-SHA256 to ensure authenticity and integrity. You **MUST** verify the signature before processing webhook events.

## Security

**Why signature verification is critical:**
- Prevents unauthorized webhook forgery
- Ensures payload integrity (no tampering)
- Verifies the webhook came from Email Gateway

## Webhook Headers

Every webhook HTTP POST includes these headers:

```
Content-Type: application/json
X-Webhook-Signature: <hmac-sha256-hex-signature>
X-Webhook-Event: <event-type>
X-Webhook-Delivery-Id: <unique-delivery-id>
User-Agent: EmailGateway-Webhook/1.0
```

## Verification Process

### Step 1: Extract the Signature

Get the `X-Webhook-Signature` header from the incoming request.

### Step 2: Compute Expected Signature

Use your webhook secret (provided when creating the webhook) to compute the expected HMAC-SHA256 signature of the raw request body.

### Step 3: Compare Signatures

Use a constant-time comparison to prevent timing attacks.

## Implementation Examples

### Node.js / Express

```javascript
const crypto = require('crypto');
const express = require('express');

const app = express();

// IMPORTANT: Use raw body parser for signature verification
app.post('/webhooks/email-gateway', express.raw({ type: 'application/json' }), (req, res) => {
  const signature = req.headers['x-webhook-signature'];
  const secret = process.env.WEBHOOK_SECRET; // Your webhook secret
  const rawBody = req.body; // Raw buffer, not parsed JSON

  // Compute expected signature
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  // Constant-time comparison
  if (!crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  )) {
    console.error('Invalid webhook signature');
    return res.status(401).send('Invalid signature');
  }

  // Signature valid, parse and process webhook
  const payload = JSON.parse(rawBody.toString());
  console.log('Webhook received:', payload);

  // Process webhook...
  processWebhook(payload);

  // Respond quickly (within 30s)
  res.status(200).send('OK');
});

function processWebhook(payload) {
  // Handle email events
  switch (payload.type) {
    case 'email.sent':
      console.log('Email sent successfully:', payload.data.outboxId);
      break;
    case 'email.failed':
      console.log('Email failed:', payload.data.errorReason);
      break;
    case 'email.bounced':
      console.log('Email bounced:', payload.data.to);
      break;
    // ... handle other events
  }
}
```

### Python / Flask

```python
import hmac
import hashlib
from flask import Flask, request, abort

app = Flask(__name__)

WEBHOOK_SECRET = 'your-webhook-secret'

@app.route('/webhooks/email-gateway', methods=['POST'])
def webhook():
    signature = request.headers.get('X-Webhook-Signature')
    raw_body = request.get_data()

    # Compute expected signature
    expected_signature = hmac.new(
        WEBHOOK_SECRET.encode('utf-8'),
        raw_body,
        hashlib.sha256
    ).hexdigest()

    # Constant-time comparison
    if not hmac.compare_digest(signature, expected_signature):
        abort(401, 'Invalid signature')

    # Parse and process webhook
    payload = request.json
    print(f'Webhook received: {payload["type"]}')

    # Process webhook...
    process_webhook(payload)

    return 'OK', 200

def process_webhook(payload):
    event_type = payload['type']
    data = payload['data']

    if event_type == 'email.sent':
        print(f'Email sent: {data["outboxId"]}')
    elif event_type == 'email.failed':
        print(f'Email failed: {data.get("errorReason")}')
    # ... handle other events
```

### PHP

```php
<?php

$webhookSecret = $_ENV['WEBHOOK_SECRET'];
$signature = $_SERVER['HTTP_X_WEBHOOK_SIGNATURE'] ?? '';
$rawBody = file_get_contents('php://input');

// Compute expected signature
$expectedSignature = hash_hmac('sha256', $rawBody, $webhookSecret);

// Constant-time comparison
if (!hash_equals($expectedSignature, $signature)) {
    http_response_code(401);
    die('Invalid signature');
}

// Parse and process webhook
$payload = json_decode($rawBody, true);
error_log('Webhook received: ' . $payload['type']);

// Process webhook...
processWebhook($payload);

http_response_code(200);
echo 'OK';

function processWebhook($payload) {
    $eventType = $payload['type'];
    $data = $payload['data'];

    switch ($eventType) {
        case 'email.sent':
            error_log('Email sent: ' . $data['outboxId']);
            break;
        case 'email.failed':
            error_log('Email failed: ' . $data['errorReason']);
            break;
        // ... handle other events
    }
}
?>
```

### Go

```go
package main

import (
    "crypto/hmac"
    "crypto/sha256"
    "crypto/subtle"
    "encoding/hex"
    "encoding/json"
    "io"
    "log"
    "net/http"
    "os"
)

type WebhookPayload struct {
    Type      string                 `json:"type"`
    Timestamp string                 `json:"timestamp"`
    Data      map[string]interface{} `json:"data"`
}

func webhookHandler(w http.ResponseWriter, r *http.Request) {
    signature := r.Header.Get("X-Webhook-Signature")
    webhookSecret := os.Getenv("WEBHOOK_SECRET")

    // Read raw body
    rawBody, err := io.ReadAll(r.Body)
    if err != nil {
        http.Error(w, "Cannot read body", http.StatusBadRequest)
        return
    }

    // Compute expected signature
    mac := hmac.New(sha256.New, []byte(webhookSecret))
    mac.Write(rawBody)
    expectedSignature := hex.EncodeToString(mac.Sum(nil))

    // Constant-time comparison
    if subtle.ConstantTimeCompare([]byte(signature), []byte(expectedSignature)) != 1 {
        http.Error(w, "Invalid signature", http.StatusUnauthorized)
        return
    }

    // Parse webhook
    var payload WebhookPayload
    if err := json.Unmarshal(rawBody, &payload); err != nil {
        http.Error(w, "Invalid JSON", http.StatusBadRequest)
        return
    }

    log.Printf("Webhook received: %s", payload.Type)

    // Process webhook...
    processWebhook(payload)

    w.WriteHeader(http.StatusOK)
    w.Write([]byte("OK"))
}

func processWebhook(payload WebhookPayload) {
    switch payload.Type {
    case "email.sent":
        log.Printf("Email sent: %v", payload.Data["outboxId"])
    case "email.failed":
        log.Printf("Email failed: %v", payload.Data["errorReason"])
    // ... handle other events
    }
}

func main() {
    http.HandleFunc("/webhooks/email-gateway", webhookHandler)
    log.Fatal(http.Listen AndServe(":8080", nil))
}
```

## Webhook Payload Format

```json
{
  "type": "email.sent",
  "timestamp": "2025-10-28T12:34:56.789Z",
  "data": {
    "outboxId": "clx123abc",
    "externalId": "invoice-12345",
    "to": "user@example.com",
    "subject": "Your Invoice",
    "status": "SENT",
    "sesMessageId": "01234567-89ab-cdef-0123-456789abcdef",
    "sentAt": "2025-10-28T12:34:56.789Z",
    "attempts": 1,
    "recipient": {
      "externalId": "customer-456",
      "email": "user@example.com"
    }
  }
}
```

## Event Types

| Event Type | Description | When Triggered |
|------------|-------------|----------------|
| `email.sent` | Email sent successfully to SES | After SES accepts the email |
| `email.failed` | Email permanently failed | After all retry attempts exhausted |
| `email.bounced` | Email bounced (hard/soft) | When SES reports bounce |
| `email.complained` | Spam complaint received | When recipient marks as spam |
| `email.delivered` | Email delivered to recipient | When SES confirms delivery |
| `webhook.test` | Test webhook event | When testing webhook configuration |

## Best Practices

### 1. Always Verify Signature

```javascript
// ❌ WRONG: Don't skip verification
app.post('/webhook', (req, res) => {
  const payload = req.body;
  processWebhook(payload); // Vulnerable to forgery!
});

// ✅ CORRECT: Always verify
app.post('/webhook', (req, res) => {
  if (!verifySignature(req)) {
    return res.status(401).send('Invalid signature');
  }
  processWebhook(req.body);
});
```

### 2. Use HTTPS (Required)

Webhooks **must** be delivered over HTTPS. HTTP endpoints will be rejected.

```javascript
// ❌ WRONG
url: 'http://api.example.com/webhooks' // Will be rejected

// ✅ CORRECT
url: 'https://api.example.com/webhooks'
```

### 3. Respond Quickly (< 30s)

Return `200 OK` within 30 seconds. Process webhooks asynchronously.

```javascript
// ✅ CORRECT: Queue for async processing
app.post('/webhook', async (req, res) => {
  if (!verifySignature(req)) {
    return res.status(401).send('Invalid signature');
  }

  // Queue for processing
  await queue.add('process-webhook', req.body);

  // Respond immediately
  res.status(200).send('OK');
});
```

### 4. Handle Retries Idempotently

We retry failed webhooks up to 3 times with exponential backoff (5s, 10s, 20s). Use the `X-Webhook-Delivery-Id` header to detect duplicates.

```javascript
const deliveryId = req.headers['x-webhook-delivery-id'];

// Check if already processed
if (await isProcessed(deliveryId)) {
  return res.status(200).send('Already processed');
}

// Process webhook...
await processWebhook(req.body);

// Mark as processed
await markProcessed(deliveryId);
```

### 5. Log Webhook Activity

Log all webhook receipts for debugging and monitoring:

```javascript
console.log({
  event: 'webhook_received',
  type: payload.type,
  deliveryId: req.headers['x-webhook-delivery-id'],
  timestamp: payload.timestamp,
  outboxId: payload.data.outboxId,
});
```

## Testing Webhooks

Use the test endpoint to verify your webhook configuration:

```bash
POST /v1/webhooks/:webhookId/test
```

This sends a test event with `type: "webhook.test"`.

## Troubleshooting

### Signature Verification Fails

**Common causes:**
1. Using parsed JSON instead of raw body
2. Wrong secret key
3. Charset encoding issues (use UTF-8)

**Solution:**
```javascript
// Ensure raw body is used
app.use(express.raw({ type: 'application/json' }));
```

### Webhook Times Out

**Cause:** Processing takes > 30 seconds

**Solution:** Queue webhooks for async processing:
```javascript
res.status(200).send('OK'); // Respond first
await queue.add('process-webhook', payload); // Process async
```

### High Failure Rate

Check delivery logs:
```bash
GET /v1/webhooks/:id/deliveries
```

Common issues:
- Endpoint down/unreachable
- SSL certificate errors
- Firewall blocking requests
- Rate limiting on your end

## Rate Limiting

Email Gateway rate limits webhook deliveries:
- **Maximum:** 100 webhooks per second
- **Concurrency:** 10 parallel deliveries
- **Retry:** 3 attempts with exponential backoff

If you exceed rate limits, you'll receive 429 status codes (will retry automatically).

## Security Checklist

- [ ] Verify HMAC-SHA256 signature on every request
- [ ] Use constant-time comparison to prevent timing attacks
- [ ] Only accept webhooks over HTTPS
- [ ] Validate event types before processing
- [ ] Implement idempotency using delivery ID
- [ ] Rate limit incoming webhooks
- [ ] Log all webhook activity
- [ ] Monitor for suspicious patterns
- [ ] Rotate webhook secrets periodically

## Support

For webhook-related issues:
1. Check delivery logs: `GET /v1/webhooks/:id/deliveries`
2. Review webhook statistics: `GET /v1/webhooks/_/stats`
3. Test webhook configuration: `POST /v1/webhooks/:id/test`

---

**Last Updated:** 2025-10-28 (TASK-023)
**API Version:** v1
