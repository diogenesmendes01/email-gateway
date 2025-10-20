#!/bin/bash
# Apply Prisma migrations directly inside the PostgreSQL container

echo "Applying Prisma migrations to Docker PostgreSQL..."

# Read the migration SQL file
MIGRATION_SQL=$(cat packages/database/prisma/migrations/20250119_add_pipeline_states/migration.sql)

# Execute the migration inside the container
docker exec -i email-gateway-postgres psql -U postgres -d email_gateway <<EOF
$MIGRATION_SQL
EOF

echo "✅ Migrations applied successfully!"
