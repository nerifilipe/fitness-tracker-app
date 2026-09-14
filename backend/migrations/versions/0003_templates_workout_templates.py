"""workout_templates"""

import sqlalchemy as sa
from alembic import op

revision = "0003_templates"
down_revision = "0002_exercises"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "workout_templates",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint("length(trim(name)) > 0", name="ck_templates_name"),
        sa.CheckConstraint("version > 0", name="ck_templates_version"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_workout_templates_user_id"), "workout_templates", ["user_id"], unique=False
    )
    op.create_table(
        "workout_template_exercises",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("template_id", sa.Uuid(), nullable=False),
        sa.Column("exercise_id", sa.Uuid(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("rest_seconds", sa.Integer(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.CheckConstraint("position >= 0", name="ck_template_exercise_position"),
        sa.CheckConstraint("rest_seconds BETWEEN 0 AND 3600", name="ck_template_exercise_rest"),
        sa.ForeignKeyConstraint(["exercise_id"], ["exercises.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["template_id"], ["workout_templates.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "template_id",
            "position",
            deferrable=True,
            initially="DEFERRED",
            name="uq_template_exercise_position",
        ),
    )
    op.create_index(
        op.f("ix_workout_template_exercises_exercise_id"),
        "workout_template_exercises",
        ["exercise_id"],
        unique=False,
    )
    op.create_table(
        "workout_template_sets",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("template_exercise_id", sa.Uuid(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("set_type", sa.String(length=12), nullable=False),
        sa.Column("target_reps_min", sa.Integer(), nullable=False),
        sa.Column("target_reps_max", sa.Integer(), nullable=False),
        sa.Column("target_weight_kg", sa.Numeric(precision=8, scale=3), nullable=True),
        sa.Column("target_rir", sa.Integer(), nullable=True),
        sa.CheckConstraint("set_type IN ('warmup','working')", name="ck_template_set_type"),
        sa.CheckConstraint("position >= 0", name="ck_template_set_position"),
        sa.CheckConstraint(
            "target_reps_min BETWEEN 1 AND 999 AND target_reps_max BETWEEN target_reps_min AND 999",
            name="ck_template_set_reps",
        ),
        sa.CheckConstraint("target_rir BETWEEN 0 AND 10", name="ck_template_set_rir"),
        sa.CheckConstraint(
            "target_weight_kg BETWEEN 0 AND 99999.999", name="ck_template_set_weight"
        ),
        sa.ForeignKeyConstraint(
            ["template_exercise_id"], ["workout_template_exercises.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "template_exercise_id",
            "position",
            deferrable=True,
            initially="DEFERRED",
            name="uq_template_set_position",
        ),
    )


def downgrade() -> None:
    op.drop_table("workout_template_sets")
    op.drop_index(
        op.f("ix_workout_template_exercises_exercise_id"), table_name="workout_template_exercises"
    )
    op.drop_table("workout_template_exercises")
    op.drop_index(op.f("ix_workout_templates_user_id"), table_name="workout_templates")
    op.drop_table("workout_templates")
