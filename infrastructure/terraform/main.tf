#
# TASK-026: Production Infrastructure - AWS ALB with Auto-Scaling
#
# This Terraform configuration provisions:
# - Application Load Balancer (ALB) for API
# - Auto-Scaling Groups for API and Worker
# - Target Groups with health checks
# - Security Groups for network isolation
# - CloudWatch alarms for scaling triggers
#

terraform {
  required_version = ">= 1.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # IMPORTANT: Configure remote state backend for production
  # backend "s3" {
  #   bucket         = "email-gateway-terraform-state"
  #   key            = "production/terraform.tfstate"
  #   region         = "us-east-1"
  #   encrypt        = true
  #   dynamodb_table = "terraform-locks"
  # }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "Email Gateway"
      Environment = var.environment
      ManagedBy   = "Terraform"
      Task        = "TASK-026"
    }
  }
}

# ------------------------------------------------------------------------------
# Data Sources
# ------------------------------------------------------------------------------

# Get VPC
data "aws_vpc" "main" {
  id = var.vpc_id
}

# Get subnets
data "aws_subnets" "public" {
  filter {
    name   = "vpc-id"
    values = [var.vpc_id]
  }

  tags = {
    Tier = "Public"
  }
}

data "aws_subnets" "private" {
  filter {
    name   = "vpc-id"
    values = [var.vpc_id]
  }

  tags = {
    Tier = "Private"
  }
}

# Get latest Amazon Linux 2 AMI
data "aws_ami" "amazon_linux_2" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["amzn2-ami-hvm-*-x86_64-gp2"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

# ------------------------------------------------------------------------------
# Security Groups
# ------------------------------------------------------------------------------

# ALB Security Group
resource "aws_security_group" "alb" {
  name_prefix = "${var.project_name}-alb-${var.environment}-"
  description = "Security group for Email Gateway ALB"
  vpc_id      = var.vpc_id

  ingress {
    description = "HTTPS from anywhere"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTP from anywhere (redirect to HTTPS)"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "Allow all outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Name = "${var.project_name}-alb-${var.environment}"
  }
}

# API EC2 Security Group
resource "aws_security_group" "api" {
  name_prefix = "${var.project_name}-api-${var.environment}-"
  description = "Security group for Email Gateway API instances"
  vpc_id      = var.vpc_id

  ingress {
    description     = "HTTP from ALB"
    from_port       = 3000
    to_port         = 3000
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  ingress {
    description = "SSH from bastion (optional)"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = var.ssh_allowed_cidrs
  }

  egress {
    description = "Allow all outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Name = "${var.project_name}-api-${var.environment}"
  }
}

# Worker EC2 Security Group
resource "aws_security_group" "worker" {
  name_prefix = "${var.project_name}-worker-${var.environment}-"
  description = "Security group for Email Gateway Worker instances"
  vpc_id      = var.vpc_id

  ingress {
    description = "Health check port"
    from_port   = 3001
    to_port     = 3001
    protocol    = "tcp"
    cidr_blocks = [data.aws_vpc.main.cidr_block]
  }

  ingress {
    description = "SSH from bastion (optional)"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = var.ssh_allowed_cidrs
  }

  egress {
    description = "Allow all outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Name = "${var.project_name}-worker-${var.environment}"
  }
}

# ------------------------------------------------------------------------------
# Application Load Balancer (ALB)
# ------------------------------------------------------------------------------

resource "aws_lb" "main" {
  name               = "${var.project_name}-alb-${var.environment}"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = data.aws_subnets.public.ids

  enable_deletion_protection = var.environment == "production" ? true : false
  enable_http2               = true
  enable_cross_zone_load_balancing = true

  access_logs {
    bucket  = var.alb_logs_bucket
    enabled = var.enable_alb_logs
  }

  tags = {
    Name = "${var.project_name}-alb-${var.environment}"
  }
}

# Target Group for API
resource "aws_lb_target_group" "api" {
  name_prefix = "api-"
  port        = 3000
  protocol    = "HTTP"
  vpc_id      = var.vpc_id

  health_check {
    enabled             = true
    healthy_threshold   = 2
    unhealthy_threshold = 3
    timeout             = 5
    interval            = 30
    path                = "/v1/health/healthz"
    protocol            = "HTTP"
    matcher             = "200"
  }

  deregistration_delay = 30

  stickiness {
    type            = "lb_cookie"
    cookie_duration = 86400  # 24 hours
    enabled         = true
  }

  tags = {
    Name = "${var.project_name}-api-tg-${var.environment}"
  }

  lifecycle {
    create_before_destroy = true
  }
}

# HTTPS Listener
resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.main.arn
  port              = "443"
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS-1-2-2017-01"
  certificate_arn   = var.ssl_certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }
}

# HTTP Listener (redirect to HTTPS)
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = "80"
  protocol          = "HTTP"

  default_action {
    type = "redirect"

    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

# ------------------------------------------------------------------------------
# Launch Template for API
# ------------------------------------------------------------------------------

resource "aws_launch_template" "api" {
  name_prefix   = "${var.project_name}-api-${var.environment}-"
  image_id      = data.aws_ami.amazon_linux_2.id
  instance_type = var.api_instance_type

  iam_instance_profile {
    name = var.api_instance_profile_name
  }

  vpc_security_group_ids = [aws_security_group.api.id]

  user_data = base64encode(templatefile("${path.module}/user-data-api.sh", {
    aws_region             = var.aws_region
    environment            = var.environment
    database_url_secret    = var.database_url_secret
    redis_host             = var.redis_host
    redis_port             = var.redis_port
    ses_from_address       = var.ses_from_address
    use_secrets_manager    = true
    cloudwatch_log_group   = aws_cloudwatch_log_group.api.name
  }))

  monitoring {
    enabled = true
  }

  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"  # IMDSv2 only
    http_put_response_hop_limit = 1
  }

  tag_specifications {
    resource_type = "instance"

    tags = {
      Name        = "${var.project_name}-api-${var.environment}"
      Component   = "API"
      Environment = var.environment
    }
  }

  lifecycle {
    create_before_destroy = true
  }
}

# ------------------------------------------------------------------------------
# Auto Scaling Group for API
# ------------------------------------------------------------------------------

resource "aws_autoscaling_group" "api" {
  name_prefix         = "${var.project_name}-api-${var.environment}-"
  vpc_zone_identifier = data.aws_subnets.private.ids
  target_group_arns   = [aws_lb_target_group.api.arn]

  min_size         = var.api_min_size
  max_size         = var.api_max_size
  desired_capacity = var.api_desired_capacity

  health_check_type         = "ELB"
  health_check_grace_period = 300

  launch_template {
    id      = aws_launch_template.api.id
    version = "$Latest"
  }

  enabled_metrics = [
    "GroupDesiredCapacity",
    "GroupInServiceInstances",
    "GroupMaxSize",
    "GroupMinSize",
    "GroupPendingInstances",
    "GroupStandbyInstances",
    "GroupTerminatingInstances",
    "GroupTotalInstances",
  ]

  tag {
    key                 = "Name"
    value               = "${var.project_name}-api-${var.environment}"
    propagate_at_launch = true
  }

  tag {
    key                 = "Component"
    value               = "API"
    propagate_at_launch = true
  }

  lifecycle {
    create_before_destroy = true
    ignore_changes        = [desired_capacity]
  }
}

# Auto Scaling Policies - API (CPU-based)
resource "aws_autoscaling_policy" "api_scale_up" {
  name                   = "${var.project_name}-api-scale-up-${var.environment}"
  scaling_adjustment     = 1
  adjustment_type        = "ChangeInCapacity"
  cooldown               = 300
  autoscaling_group_name = aws_autoscaling_group.api.name
}

resource "aws_autoscaling_policy" "api_scale_down" {
  name                   = "${var.project_name}-api-scale-down-${var.environment}"
  scaling_adjustment     = -1
  adjustment_type        = "ChangeInCapacity"
  cooldown               = 300
  autoscaling_group_name = aws_autoscaling_group.api.name
}

# CloudWatch Alarms - API
resource "aws_cloudwatch_metric_alarm" "api_cpu_high" {
  alarm_name          = "${var.project_name}-api-cpu-high-${var.environment}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "CPUUtilization"
  namespace           = "AWS/EC2"
  period              = 300
  statistic           = "Average"
  threshold           = 70

  dimensions = {
    AutoScalingGroupName = aws_autoscaling_group.api.name
  }

  alarm_description = "Scale up API when CPU > 70%"
  alarm_actions     = [aws_autoscaling_policy.api_scale_up.arn]
}

resource "aws_cloudwatch_metric_alarm" "api_cpu_low" {
  alarm_name          = "${var.project_name}-api-cpu-low-${var.environment}"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 2
  metric_name         = "CPUUtilization"
  namespace           = "AWS/EC2"
  period              = 300
  statistic           = "Average"
  threshold           = 30

  dimensions = {
    AutoScalingGroupName = aws_autoscaling_group.api.name
  }

  alarm_description = "Scale down API when CPU < 30%"
  alarm_actions     = [aws_autoscaling_policy.api_scale_down.arn]
}

# ------------------------------------------------------------------------------
# Launch Template for Worker
# ------------------------------------------------------------------------------

resource "aws_launch_template" "worker" {
  name_prefix   = "${var.project_name}-worker-${var.environment}-"
  image_id      = data.aws_ami.amazon_linux_2.id
  instance_type = var.worker_instance_type

  iam_instance_profile {
    name = var.worker_instance_profile_name
  }

  vpc_security_group_ids = [aws_security_group.worker.id]

  user_data = base64encode(templatefile("${path.module}/user-data-worker.sh", {
    aws_region             = var.aws_region
    environment            = var.environment
    database_url_secret    = var.database_url_secret
    redis_host             = var.redis_host
    redis_port             = var.redis_port
    ses_from_address       = var.ses_from_address
    use_secrets_manager    = true
    cloudwatch_log_group   = aws_cloudwatch_log_group.worker.name
    queue_concurrency      = var.worker_queue_concurrency
  }))

  monitoring {
    enabled = true
  }

  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"  # IMDSv2 only
    http_put_response_hop_limit = 1
  }

  tag_specifications {
    resource_type = "instance"

    tags = {
      Name        = "${var.project_name}-worker-${var.environment}"
      Component   = "Worker"
      Environment = var.environment
    }
  }

  lifecycle {
    create_before_destroy = true
  }
}

# ------------------------------------------------------------------------------
# Auto Scaling Group for Worker
# ------------------------------------------------------------------------------

resource "aws_autoscaling_group" "worker" {
  name_prefix         = "${var.project_name}-worker-${var.environment}-"
  vpc_zone_identifier = data.aws_subnets.private.ids

  min_size         = var.worker_min_size
  max_size         = var.worker_max_size
  desired_capacity = var.worker_desired_capacity

  health_check_type         = "EC2"
  health_check_grace_period = 300

  launch_template {
    id      = aws_launch_template.worker.id
    version = "$Latest"
  }

  enabled_metrics = [
    "GroupDesiredCapacity",
    "GroupInServiceInstances",
    "GroupMaxSize",
    "GroupMinSize",
    "GroupPendingInstances",
    "GroupStandbyInstances",
    "GroupTerminatingInstances",
    "GroupTotalInstances",
  ]

  tag {
    key                 = "Name"
    value               = "${var.project_name}-worker-${var.environment}"
    propagate_at_launch = true
  }

  tag {
    key                 = "Component"
    value               = "Worker"
    propagate_at_launch = true
  }

  lifecycle {
    create_before_destroy = true
    ignore_changes        = [desired_capacity]
  }
}

# Auto Scaling Policies - Worker (Queue depth-based)
resource "aws_autoscaling_policy" "worker_scale_up" {
  name                   = "${var.project_name}-worker-scale-up-${var.environment}"
  scaling_adjustment     = 1
  adjustment_type        = "ChangeInCapacity"
  cooldown               = 300
  autoscaling_group_name = aws_autoscaling_group.worker.name
}

resource "aws_autoscaling_policy" "worker_scale_down" {
  name                   = "${var.project_name}-worker-scale-down-${var.environment}"
  scaling_adjustment     = -1
  adjustment_type        = "ChangeInCapacity"
  cooldown               = 600  # Longer cooldown for scale-down
  autoscaling_group_name = aws_autoscaling_group.worker.name
}

# CloudWatch Alarms - Worker (Queue depth from custom metrics)
resource "aws_cloudwatch_metric_alarm" "worker_queue_high" {
  alarm_name          = "${var.project_name}-worker-queue-high-${var.environment}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "queue_waiting_count"
  namespace           = "EmailGateway"
  period              = 300
  statistic           = "Average"
  threshold           = 100  # Scale up when > 100 jobs waiting

  alarm_description = "Scale up Worker when queue depth > 100"
  alarm_actions     = [aws_autoscaling_policy.worker_scale_up.arn]
}

resource "aws_cloudwatch_metric_alarm" "worker_queue_low" {
  alarm_name          = "${var.project_name}-worker-queue-low-${var.environment}"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 3
  metric_name         = "queue_waiting_count"
  namespace           = "EmailGateway"
  period              = 300
  statistic           = "Average"
  threshold           = 10  # Scale down when < 10 jobs waiting

  alarm_description = "Scale down Worker when queue depth < 10"
  alarm_actions     = [aws_autoscaling_policy.worker_scale_down.arn]
}

# ------------------------------------------------------------------------------
# CloudWatch Log Groups
# ------------------------------------------------------------------------------

resource "aws_cloudwatch_log_group" "api" {
  name              = "/email-gateway/api/${var.environment}"
  retention_in_days = var.log_retention_days

  tags = {
    Component = "API"
  }
}

resource "aws_cloudwatch_log_group" "worker" {
  name              = "/email-gateway/worker/${var.environment}"
  retention_in_days = var.log_retention_days

  tags = {
    Component = "Worker"
  }
}

# ------------------------------------------------------------------------------
# Outputs
# ------------------------------------------------------------------------------

output "alb_dns_name" {
  description = "DNS name of the Application Load Balancer"
  value       = aws_lb.main.dns_name
}

output "alb_zone_id" {
  description = "Zone ID of the Application Load Balancer"
  value       = aws_lb.main.zone_id
}

output "api_autoscaling_group_name" {
  description = "Name of the API Auto Scaling Group"
  value       = aws_autoscaling_group.api.name
}

output "worker_autoscaling_group_name" {
  description = "Name of the Worker Auto Scaling Group"
  value       = aws_autoscaling_group.worker.name
}

output "api_target_group_arn" {
  description = "ARN of the API Target Group"
  value       = aws_lb_target_group.api.arn
}
