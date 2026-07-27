"""case query indexes + locations uniqueness

Revision ID: 0005_case_idx_loc_unique
Revises: 0004_admin_management
Create Date: 2026-07-18

The admin review queue, case search, and stats dashboard filter/aggregate on
cases.status / judgement / inspector_username / district / created_at, none of
which were indexed — every such query was a full table scan. Add indexes for
them (ticket_no was already indexed by 0001).

Also enforce the parking-spot uniqueness the API only checked in application
code (check-then-insert, which races): a DB-level UNIQUE(district, road,
spot_no) makes the "此停車格已存在" guarantee real under concurrency.
"""
from alembic import op

revision = "0005_case_idx_loc_unique"
down_revision = "0004_admin_management"
branch_labels = None
depends_on = None


_CASE_INDEXES = [
    ("ix_cases_status", "status"),
    ("ix_cases_judgement", "judgement"),
    ("ix_cases_inspector_username", "inspector_username"),
    ("ix_cases_district", "district"),
    ("ix_cases_created_at", "created_at"),
]


def upgrade() -> None:
    for name, column in _CASE_INDEXES:
        op.create_index(name, "cases", [column])
    # batch_alter_table keeps this working on SQLite too (it can't ALTER ADD
    # CONSTRAINT in place); on PostgreSQL it maps to a plain ADD CONSTRAINT.
    with op.batch_alter_table("locations") as batch:
        batch.create_unique_constraint(
            "uq_location_spot", ["district", "road", "spot_no"]
        )


def downgrade() -> None:
    with op.batch_alter_table("locations") as batch:
        batch.drop_constraint("uq_location_spot", type_="unique")
    for name, _ in reversed(_CASE_INDEXES):
        op.drop_index(name, table_name="cases")
