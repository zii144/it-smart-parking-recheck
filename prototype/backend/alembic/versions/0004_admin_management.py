"""admin management: add admin_users.is_active / created_at / created_by

Revision ID: 0004_admin_management
Revises: 0003_case_gps
Create Date: 2026-07-13

Backs the admin management console. Adds a soft-disable flag plus a lightweight
audit trail (who created the account and when) so managers/sysadmins can be
instantiated, disabled, and traced from the UI instead of only ever being the
seeded demo accounts. Existing rows default to is_active=1 so no admin loses
access on upgrade.
"""
from alembic import op
import sqlalchemy as sa

revision = "0004_admin_management"
down_revision = "0003_case_gps"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("admin_users") as batch:
        batch.add_column(
            sa.Column("is_active", sa.Integer(), nullable=False, server_default="1")
        )
        batch.add_column(sa.Column("created_at", sa.String(length=32), nullable=True))
        batch.add_column(sa.Column("created_by", sa.String(length=64), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("admin_users") as batch:
        batch.drop_column("created_by")
        batch.drop_column("created_at")
        batch.drop_column("is_active")
