#!/bin/bash

# SES Quota Monitoring Script
# TASK 6.2 - SES Domain and DNS Management
#
# Usage:
#   ./monitor-ses-quota.sh [threshold_percentage]
#
# Default threshold: 80%
# Sends alert when quota usage exceeds threshold

set -e

# Configuration
THRESHOLD=${1:-80}
LOG_FILE="/var/log/ses-quota-monitor.log"
ALERT_EMAIL="${ALERT_EMAIL:-admin@example.com}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Log function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Alert function
send_alert() {
    local message="$1"
    log "🚨 ALERT: $message"
    
    # Send email alert if configured
    if [ -n "$ALERT_EMAIL" ] && command -v mail >/dev/null 2>&1; then
        echo "$message" | mail -s "SES Quota Alert" "$ALERT_EMAIL"
    fi
    
    # Send to Slack if webhook is configured
    if [ -n "$SLACK_WEBHOOK_URL" ] && command -v curl >/dev/null 2>&1; then
        curl -X POST -H 'Content-type: application/json' \
            --data "{\"text\":\"🚨 SES Quota Alert: $message\"}" \
            "$SLACK_WEBHOOK_URL"
    fi
}

# Check quota using Node.js script
check_quota() {
    local quota_info
    quota_info=$(node -e "
        const { DomainManagementService } = require('@email-gateway/shared');
        const service = new DomainManagementService();
        
        service.getSESQuota().then(quota => {
            console.log(JSON.stringify(quota));
        }).catch(err => {
            console.error('Error:', err.message);
            process.exit(1);
        });
    ")
    
    if [ $? -ne 0 ]; then
        log "❌ Failed to get SES quota information"
        return 1
    fi
    
    echo "$quota_info"
}

# Parse quota information
parse_quota() {
    local quota_json="$1"
    
    local max_24h=$(echo "$quota_json" | jq -r '.max24HourSend')
    local sent_24h=$(echo "$quota_json" | jq -r '.sentLast24Hours')
    local max_rate=$(echo "$quota_json" | jq -r '.maxSendRate')
    local remaining=$(echo "$quota_json" | jq -r '.remainingQuota')
    local percentage=$(echo "$quota_json" | jq -r '.quotaPercentage')
    
    echo "$max_24h $sent_24h $max_rate $remaining $percentage"
}

# Format numbers with commas
format_number() {
    printf "%'d" "$1"
}

# Main monitoring function
monitor_quota() {
    log "🔍 Checking SES quota..."
    
    # Get quota information
    local quota_info
    quota_info=$(check_quota)
    
    if [ $? -ne 0 ]; then
        log "❌ Failed to retrieve quota information"
        return 1
    fi
    
    # Parse quota data
    local quota_data
    quota_data=$(parse_quota "$quota_info")
    
    local max_24h=$(echo "$quota_data" | cut -d' ' -f1)
    local sent_24h=$(echo "$quota_data" | cut -d' ' -f2)
    local max_rate=$(echo "$quota_data" | cut -d' ' -f3)
    local remaining=$(echo "$quota_data" | cut -d' ' -f4)
    local percentage=$(echo "$quota_data" | cut -d' ' -f5)
    
    # Format numbers
    local max_24h_formatted=$(format_number "$max_24h")
    local sent_24h_formatted=$(format_number "$sent_24h")
    local remaining_formatted=$(format_number "$remaining")
    
    # Log quota status
    log "📊 SES Quota Status:"
    log "   Max 24h Send: $max_24h_formatted"
    log "   Sent Last 24h: $sent_24h_formatted"
    log "   Max Send Rate: $max_rate/sec"
    log "   Remaining: $remaining_formatted"
    log "   Usage: ${percentage}%"
    
    # Check threshold
    local percentage_int=$(echo "$percentage" | cut -d'.' -f1)
    
    if [ "$percentage_int" -ge "$THRESHOLD" ]; then
        local alert_message="SES quota usage is ${percentage}% (threshold: ${THRESHOLD}%). Remaining quota: $remaining_formatted emails."
        send_alert "$alert_message"
        
        # Color output for terminal
        echo -e "${RED}⚠️  WARNING: Quota usage is ${percentage}%${NC}"
        echo -e "${RED}   Threshold: ${THRESHOLD}%${NC}"
        echo -e "${RED}   Remaining: $remaining_formatted emails${NC}"
    else
        log "✅ Quota usage is within acceptable limits"
        echo -e "${GREEN}✅ Quota usage: ${percentage}% (OK)${NC}"
    fi
    
    # Additional warnings
    if [ "$remaining" -lt 1000 ]; then
        local warning_message="Low remaining quota: $remaining_formatted emails remaining."
        send_alert "$warning_message"
        echo -e "${YELLOW}⚠️  Low remaining quota: $remaining_formatted emails${NC}"
    fi
    
    # Check send rate
    if [ "$max_rate" -lt 14 ]; then
        echo -e "${YELLOW}⚠️  Low send rate: $max_rate/sec (consider requesting increase)${NC}"
    fi
}

# Health check function
health_check() {
    log "🏥 Performing SES health check..."
    
    # Check if Node.js is available
    if ! command -v node >/dev/null 2>&1; then
        log "❌ Node.js is not installed"
        return 1
    fi
    
    # Check if jq is available
    if ! command -v jq >/dev/null 2>&1; then
        log "❌ jq is not installed (required for JSON parsing)"
        return 1
    fi
    
    # Check if shared package is available
    if ! node -e "require('@email-gateway/shared')" >/dev/null 2>&1; then
        log "❌ @email-gateway/shared package not found"
        return 1
    fi
    
    log "✅ Health check passed"
    return 0
}

# Show usage information
show_usage() {
    echo "SES Quota Monitoring Script"
    echo ""
    echo "Usage:"
    echo "  $0 [threshold_percentage]"
    echo ""
    echo "Arguments:"
    echo "  threshold_percentage  Alert threshold (default: 80)"
    echo ""
    echo "Environment Variables:"
    echo "  ALERT_EMAIL          Email address for alerts"
    echo "  SLACK_WEBHOOK_URL   Slack webhook URL for alerts"
    echo ""
    echo "Examples:"
    echo "  $0 90                # Alert at 90% usage"
    echo "  ALERT_EMAIL=admin@example.com $0 75"
    echo ""
}

# Main execution
main() {
    # Check for help flag
    if [ "$1" = "-h" ] || [ "$1" = "--help" ]; then
        show_usage
        exit 0
    fi
    
    # Validate threshold
    if ! [[ "$THRESHOLD" =~ ^[0-9]+$ ]] || [ "$THRESHOLD" -lt 1 ] || [ "$THRESHOLD" -gt 100 ]; then
        echo "❌ Invalid threshold: $THRESHOLD. Must be a number between 1 and 100."
        exit 1
    fi
    
    log "🚀 Starting SES quota monitoring (threshold: ${THRESHOLD}%)"
    
    # Perform health check
    if ! health_check; then
        log "❌ Health check failed"
        exit 1
    fi
    
    # Monitor quota
    if ! monitor_quota; then
        log "❌ Quota monitoring failed"
        exit 1
    fi
    
    log "✅ SES quota monitoring completed"
}

# Run main function
main "$@"