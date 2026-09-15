"""Daily body weight and optional body measurements."""

import sqlalchemy as sa
from alembic import op

revision = "0006_progress"
down_revision = "0005_nutrition"
branch_labels = None
depends_on = None


def upgrade() -> None:
    limits = {"weight_kg": 500, "waist_cm": 400, "chest_cm": 400, "arms_cm": 200, "legs_cm": 300}
    op.create_table(
        "body_measurements",
        sa.Column(
            "user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
        ),
        sa.Column("date", sa.Date(), primary_key=True),
        *(sa.Column(field, sa.Numeric(7, 3)) for field in limits),
        sa.Column("notes", sa.String(500)),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.CheckConstraint(
            " OR ".join(f"{field} IS NOT NULL" for field in limits),
            name="ck_body_measurements_nonempty",
        ),
        *(
            sa.CheckConstraint(
                f"{field} IS NULL OR ({field} >= 1 AND {field} <= {limit})",
                name=f"ck_body_measurements_{field}",
            )
            for field, limit in limits.items()
        ),
    )


def downgrade() -> None:
    op.drop_table("body_measurements")
