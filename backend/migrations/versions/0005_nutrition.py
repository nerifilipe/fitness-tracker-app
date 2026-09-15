"""Nutrition diary, private food library, goals and idempotent meal copies."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0005_nutrition"
down_revision = "0004_workouts"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "nutrition_foods",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("source_code", sa.String(14)),
        sa.Column("snapshot", postgresql.JSONB(), nullable=False),
        sa.Column("is_favorite", sa.Boolean(), nullable=False),
        sa.Column("last_quantity", sa.Numeric(12, 3)),
        sa.Column(
            "last_used_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.UniqueConstraint("user_id", "source_code", name="uq_nutrition_food_source"),
    )
    op.create_index(
        "ix_nutrition_foods_user_recent", "nutrition_foods", ["user_id", "last_used_at"]
    )
    op.create_table(
        "nutrition_entries",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column(
            "food_id",
            sa.Uuid(),
            sa.ForeignKey("nutrition_foods.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("meal", sa.String(12), nullable=False),
        sa.Column("quantity", sa.Numeric(12, 3), nullable=False),
        sa.Column("snapshot", postgresql.JSONB(), nullable=False),
        sa.Column("deleted", sa.Boolean(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint("quantity > 0 AND quantity <= 10000", name="ck_nutrition_quantity"),
        sa.CheckConstraint(
            "meal IN ('breakfast','lunch','dinner','snack')", name="ck_nutrition_meal"
        ),
    )
    op.create_index("ix_nutrition_entries_user_date", "nutrition_entries", ["user_id", "date"])
    op.create_table(
        "nutrition_goals",
        sa.Column(
            "user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
        ),
        sa.Column("targets", postgresql.JSONB(), nullable=False),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_table(
        "nutrition_copies",
        sa.Column(
            "user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
        ),
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("request", postgresql.JSONB(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )


def downgrade() -> None:
    for table in ("nutrition_copies", "nutrition_goals", "nutrition_entries", "nutrition_foods"):
        op.drop_table(table)
