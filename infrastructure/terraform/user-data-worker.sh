#!/bin/bash
#
# TASK-026: Worker Instance User Data Script
#
# This script runs on EC2 instance launch to:
# - Install Node.js and dependencies
# - Clone application code (or pull from S3/ECR)
# - Configure environment variables
# - Start Worker service
# - Configure CloudWatch Logs agent
#

set -e  # Exit on error
set -x  # Print commands

# ------------------------------------------------------------------------------
# Variables (templated by Terraform)
# ------------------------------------------------------------------------------

AWS_REGION="${aws_region}"
ENVIRONMENT="${environment}"
DATABASE_URL_SECRET="${database_url_secret}"
REDIS_HOST="${redis_host}"
REDIS_PORT="${redis_port}"
SES_FROM_ADDRESS="${ses_from_address}"
USE_SECRETS_MANAGER="${use_secrets_manager}"
CLOUDWATCH_LOG_GROUP="${cloudwatch_log_group}"
QUEUE_CONCURRENCY="${queue_concurrency}"

# Application configuration
APP_DIR="/opt/email-gateway"
APP_USER="emailgw"
LOG_FILE="/var/log/email-gateway/worker.log"

# ------------------------------------------------------------------------------
# System Setup
# ------------------------------------------------------------------------------

# Update system
yum update -y

# Install Node.js 18 (LTS)
curl -fsSL https://rpm.nodesource.com/setup_18.x | bash -
yum install -y nodejs

# Install Git and other dependencies
yum install -y git gcc-c++ make amazon-cloudwatch-agent

# Create application user
useradd -r -s /bin/false "$APP_USER" || true

# Create directories
mkdir -p "$APP_DIR"
mkdir -p /var/log/email-gateway
chown -R "$APP_USER:$APP_USER" /var/log/email-gateway

# ------------------------------------------------------------------------------
# Application Deployment
# ------------------------------------------------------------------------------

# Download from S3 (production deployment)
ARTIFACT_BUCKET="email-gateway-artifacts-${ENVIRONMENT}"
aws s3 cp "s3://$ARTIFACT_BUCKET/worker-latest.tar.gz" /tmp/worker.tar.gz
tar -xzf /tmp/worker.tar.gz -C "$APP_DIR"

# Install dependencies
cd "$APP_DIR"
npm ci --production

# ------------------------------------------------------------------------------
# Environment Configuration
# ------------------------------------------------------------------------------

# Create .env file
cat > "$APP_DIR/.env" <<EOF
# Environment
NODE_ENV=$ENVIRONMENT
WORKER_PORT=3001

# AWS
AWS_REGION=$AWS_REGION
USE_SECRETS_MANAGER=$USE_SECRETS_MANAGER

# Database (will be fetched from Secrets Manager)
# DATABASE_URL is fetched by SecretsService at runtime

# Redis
REDIS_HOST=$REDIS_HOST
REDIS_PORT=$REDIS_PORT

# SES
SES_FROM_ADDRESS=$SES_FROM_ADDRESS

# Queue Configuration
QUEUE_NAME=email:send
QUEUE_CONCURRENCY=$QUEUE_CONCURRENCY
QUEUE_MAX_RETRIES=5
WORKER_CONCURRENCY=$QUEUE_CONCURRENCY

# Logging
LOG_LEVEL=info
LOG_FORMAT=json
EOF

chown "$APP_USER:$APP_USER" "$APP_DIR/.env"

# ------------------------------------------------------------------------------
# Systemd Service
# ------------------------------------------------------------------------------

# Create systemd service for Worker
cat > /etc/systemd/system/email-gateway-worker.service <<EOF
[Unit]
Description=Email Gateway Worker
After=network.target

[Service]
Type=simple
User=$APP_USER
Group=$APP_USER
WorkingDirectory=$APP_DIR
Environment=NODE_ENV=$ENVIRONMENT

ExecStart=/usr/bin/node $APP_DIR/apps/worker/dist/main.js

# Restart on failure
Restart=always
RestartSec=10

# Resource limits
LimitNOFILE=65536

# Logging
StandardOutput=append:$LOG_FILE
StandardError=append:$LOG_FILE

[Install]
WantedBy=multi-user.target
EOF

# Enable and start service
systemctl daemon-reload
systemctl enable email-gateway-worker
systemctl start email-gateway-worker

# ------------------------------------------------------------------------------
# CloudWatch Logs Agent
# ------------------------------------------------------------------------------

# Configure CloudWatch Logs agent
cat > /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json <<EOF
{
  "logs": {
    "logs_collected": {
      "files": {
        "collect_list": [
          {
            "file_path": "$LOG_FILE",
            "log_group_name": "$CLOUDWATCH_LOG_GROUP",
            "log_stream_name": "{instance_id}/worker.log",
            "timezone": "UTC"
          },
          {
            "file_path": "/var/log/cloud-init-output.log",
            "log_group_name": "$CLOUDWATCH_LOG_GROUP",
            "log_stream_name": "{instance_id}/cloud-init.log",
            "timezone": "UTC"
          }
        ]
      }
    }
  },
  "metrics": {
    "namespace": "EmailGateway/Worker",
    "metrics_collected": {
      "cpu": {
        "measurement": [
          {
            "name": "cpu_usage_idle",
            "rename": "CPU_IDLE",
            "unit": "Percent"
          }
        ],
        "metrics_collection_interval": 60
      },
      "mem": {
        "measurement": [
          {
            "name": "mem_used_percent",
            "rename": "MEMORY_USED",
            "unit": "Percent"
          }
        ],
        "metrics_collection_interval": 60
      },
      "disk": {
        "measurement": [
          {
            "name": "used_percent",
            "rename": "DISK_USED",
            "unit": "Percent"
          }
        ],
        "metrics_collection_interval": 60,
        "resources": [
          "*"
        ]
      }
    }
  }
}
EOF

# Start CloudWatch agent
/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
  -a fetch-config \
  -m ec2 \
  -s \
  -c file:/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json

# ------------------------------------------------------------------------------
# Health Checks
# ------------------------------------------------------------------------------

# Wait for Worker to be ready
echo "Waiting for Worker to start..."
for i in {1..30}; do
  if systemctl is-active --quiet email-gateway-worker; then
    echo "Worker is running!"
    break
  fi
  echo "Waiting for Worker... ($i/30)"
  sleep 10
done

# Verify service is running
systemctl status email-gateway-worker || {
  echo "ERROR: Worker failed to start!"
  cat "$LOG_FILE"
  exit 1
}

echo "Worker instance initialization complete!"
