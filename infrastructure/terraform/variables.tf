#
# TASK-026: Terraform Variables
#
# Input variables for Email Gateway infrastructure
#

# ------------------------------------------------------------------------------
# General
# ------------------------------------------------------------------------------

variable "project_name" {
  description = "Project name used for resource naming"
  type        = string
  default     = "email-gateway"
}

variable "environment" {
  description = "Environment name (development, staging, production)"
  type        = string

  validation {
    condition     = contains(["development", "staging", "production"], var.environment)
    error_message = "Environment must be development, staging, or production."
  }
}

variable "aws_region" {
  description = "AWS region for resources"
  type        = string
  default     = "us-east-1"
}

# ------------------------------------------------------------------------------
# Networking
# ------------------------------------------------------------------------------

variable "vpc_id" {
  description = "VPC ID where resources will be created"
  type        = string
}

variable "ssh_allowed_cidrs" {
  description = "CIDR blocks allowed for SSH access"
  type        = list(string)
  default     = []  # Empty = no SSH access
}

# ------------------------------------------------------------------------------
# Application Load Balancer
# ------------------------------------------------------------------------------

variable "ssl_certificate_arn" {
  description = "ARN of SSL certificate for HTTPS listener"
  type        = string
}

variable "enable_alb_logs" {
  description = "Enable ALB access logs"
  type        = bool
  default     = true
}

variable "alb_logs_bucket" {
  description = "S3 bucket for ALB access logs"
  type        = string
  default     = ""
}

# ------------------------------------------------------------------------------
# API Auto Scaling
# ------------------------------------------------------------------------------

variable "api_instance_type" {
  description = "EC2 instance type for API"
  type        = string
  default     = "t3.small"  # 2 vCPU, 2GB RAM
}

variable "api_min_size" {
  description = "Minimum number of API instances"
  type        = number
  default     = 2
}

variable "api_max_size" {
  description = "Maximum number of API instances"
  type        = number
  default     = 10
}

variable "api_desired_capacity" {
  description = "Desired number of API instances"
  type        = number
  default     = 2
}

variable "api_instance_profile_name" {
  description = "IAM instance profile name for API instances"
  type        = string
}

# ------------------------------------------------------------------------------
# Worker Auto Scaling
# ------------------------------------------------------------------------------

variable "worker_instance_type" {
  description = "EC2 instance type for Worker"
  type        = string
  default     = "t3.medium"  # 2 vCPU, 4GB RAM (higher for email processing)
}

variable "worker_min_size" {
  description = "Minimum number of Worker instances"
  type        = number
  default     = 1
}

variable "worker_max_size" {
  description = "Maximum number of Worker instances"
  type        = number
  default     = 5
}

variable "worker_desired_capacity" {
  description = "Desired number of Worker instances"
  type        = number
  default     = 2
}

variable "worker_instance_profile_name" {
  description = "IAM instance profile name for Worker instances"
  type        = string
}

variable "worker_queue_concurrency" {
  description = "BullMQ concurrency per worker instance"
  type        = number
  default     = 16
}

# ------------------------------------------------------------------------------
# Database
# ------------------------------------------------------------------------------

variable "database_url_secret" {
  description = "AWS Secrets Manager secret name for database URL"
  type        = string
  default     = "email-gateway/database-url"
}

# ------------------------------------------------------------------------------
# Redis
# ------------------------------------------------------------------------------

variable "redis_host" {
  description = "Redis host (ElastiCache endpoint)"
  type        = string
}

variable "redis_port" {
  description = "Redis port"
  type        = number
  default     = 6379
}

# ------------------------------------------------------------------------------
# AWS SES
# ------------------------------------------------------------------------------

variable "ses_from_address" {
  description = "SES verified sender email address"
  type        = string
}

# ------------------------------------------------------------------------------
# CloudWatch
# ------------------------------------------------------------------------------

variable "log_retention_days" {
  description = "CloudWatch Logs retention in days"
  type        = number
  default     = 30
}

# ------------------------------------------------------------------------------
# Tags
# ------------------------------------------------------------------------------

variable "additional_tags" {
  description = "Additional tags to apply to all resources"
  type        = map(string)
  default     = {}
}
