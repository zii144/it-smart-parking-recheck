"""case GPS: add cases.gps_lat / cases.gps_lng

Revision ID: 0003_case_gps
Revises: 0002_admin_role
Create Date: 2026-07-06

Adds the auxiliary GPS coordinates captured on the inspector's device when the
parking spot was selected (design step 2). Nullable - geolocation permission
may be denied, in which case the case is still saved without coordinates.
"""
from alembic import op
import sqlalchemy as sa

revision = "0003_case_gps"
down_revision = "0002_admin_role"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("cases") as batch:
        batch.add_column(sa.Column("gps_lat", sa.Float(), nullable=True))
        batch.add_column(sa.Column("gps_lng", sa.Float(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("cases") as batch:
        batch.drop_column("gps_lng")
        batch.drop_column("gps_lat")
