"""initial schema: inspectors, admin_users, settings, locations, cases

Revision ID: 0001_initial
Revises:
Create Date: 2026-07-06

Creates the full schema from app/models.py. Equivalent to the old hand-rolled
CREATE TABLE statements plus the review_* columns that were previously added
by the ad-hoc migration list in db.py. The only substantive change is that the
`password` columns now hold bcrypt hashes rather than plaintext.
"""
from alembic import op
import sqlalchemy as sa

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "inspectors",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("username", sa.String(length=64), nullable=False),
        sa.Column("password", sa.String(length=255), nullable=False),
        sa.Column("display_name", sa.String(length=128), nullable=False),
        sa.Column("has_permission", sa.Integer(), nullable=False, server_default="1"),
        sa.UniqueConstraint("username", name="uq_inspectors_username"),
    )

    op.create_table(
        "admin_users",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("username", sa.String(length=64), nullable=False),
        sa.Column("password", sa.String(length=255), nullable=False),
        sa.Column("display_name", sa.String(length=128), nullable=False),
        sa.UniqueConstraint("username", name="uq_admin_users_username"),
    )

    op.create_table(
        "settings",
        sa.Column("key", sa.String(length=128), primary_key=True),
        sa.Column("value", sa.Text(), nullable=False),
    )

    op.create_table(
        "locations",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("district", sa.String(length=64), nullable=False),
        sa.Column("road", sa.String(length=128), nullable=False),
        sa.Column("spot_no", sa.String(length=64), nullable=False),
    )

    op.create_table(
        "cases",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("ticket_no", sa.String(length=64), nullable=False),
        sa.Column("district", sa.String(length=64)),
        sa.Column("road", sa.String(length=128)),
        sa.Column("spot_no", sa.String(length=64)),
        sa.Column("plate_no", sa.String(length=32)),
        sa.Column("amount", sa.Float()),
        sa.Column("due_date", sa.String(length=32)),
        sa.Column("parking_date", sa.String(length=32)),
        sa.Column("parking_start", sa.String(length=32)),
        sa.Column("parking_end", sa.String(length=32)),
        sa.Column("data_source", sa.String(length=32), nullable=False),
        sa.Column("manual_corrected", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("original_values", sa.Text()),
        sa.Column("inspector_username", sa.String(length=64)),
        sa.Column("issue_datetime", sa.String(length=32)),
        sa.Column("time_diff_minutes", sa.Float()),
        sa.Column("judgement", sa.String(length=32)),
        sa.Column("review_required", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("duplicate_warning", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("photo_path", sa.String(length=255)),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("synced_offline", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("review_outcome", sa.String(length=32)),
        sa.Column("review_note", sa.Text()),
        sa.Column("reviewed_by", sa.String(length=64)),
        sa.Column("reviewed_at", sa.String(length=32)),
        sa.Column("created_at", sa.String(length=32), nullable=False),
    )
    op.create_index("ix_cases_ticket_no", "cases", ["ticket_no"])


def downgrade() -> None:
    op.drop_index("ix_cases_ticket_no", table_name="cases")
    op.drop_table("cases")
    op.drop_table("locations")
    op.drop_table("settings")
    op.drop_table("admin_users")
    op.drop_table("inspectors")
