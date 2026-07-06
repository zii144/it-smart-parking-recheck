"""admin role separation: add admin_users.role

Revision ID: 0002_admin_role
Revises: 0001_initial
Create Date: 2026-07-06

Splits the single back-office account into the design's two actors by adding a
`role` column ("manager" | "sysadmin"). Existing rows (the old combined
`admin01`) default to "sysadmin" so they retain account/location/settings
management; a manager account should then be created for review/stats access.
"""
from alembic import op
import sqlalchemy as sa

revision = "0002_admin_role"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("admin_users") as batch:
        batch.add_column(
            sa.Column("role", sa.String(length=16), nullable=False, server_default="sysadmin")
        )


def downgrade() -> None:
    with op.batch_alter_table("admin_users") as batch:
        batch.drop_column("role")
