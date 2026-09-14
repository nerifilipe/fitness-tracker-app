"""active_workouts"""

import sqlalchemy as sa
from alembic import op

revision = "0004_workouts"
down_revision = "0003_templates"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "workouts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("template_id", sa.Uuid(), nullable=True),
        sa.Column("create_hash", sa.String(length=64), nullable=False),
        sa.Column("name_snapshot", sa.String(length=120), nullable=False),
        sa.Column("status", sa.String(length=12), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("paused_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("paused_seconds", sa.Integer(), nullable=False),
        sa.Column("rest_deadline", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False),
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
        sa.CheckConstraint(
            "(status = 'paused') = (paused_at IS NOT NULL)", name="ck_workout_pause"
        ),
        sa.CheckConstraint(
            "(status IN ('cancelled','completed')) = (finished_at IS NOT NULL)",
            name="ck_workout_finish",
        ),
        sa.CheckConstraint(
            "status IN ('active','paused','cancelled','completed')", name="ck_workout_status"
        ),
        sa.CheckConstraint(
            "finished_at IS NULL OR finished_at >= started_at", name="ck_workout_dates"
        ),
        sa.CheckConstraint("version > 0 AND paused_seconds >= 0", name="ck_workout_numbers"),
        sa.ForeignKeyConstraint(["template_id"], ["workout_templates.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_workout_user_started", "workouts", ["user_id", "started_at", "id"], unique=False
    )
    op.create_index(op.f("ix_workouts_template_id"), "workouts", ["template_id"], unique=False)
    op.create_index(
        "uq_workout_live_user",
        "workouts",
        ["user_id"],
        unique=True,
        postgresql_where=sa.text("status IN ('active','paused')"),
    )
    op.create_table(
        "workout_exercises",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("workout_id", sa.Uuid(), nullable=False),
        sa.Column("exercise_id", sa.Uuid(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("name_snapshot", sa.String(length=120), nullable=False),
        sa.Column("load_type_snapshot", sa.String(length=20), nullable=False),
        sa.Column("load_convention_snapshot", sa.String(length=20), nullable=False),
        sa.Column("rest_seconds", sa.Integer(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.CheckConstraint(
            "position >= 0 AND rest_seconds BETWEEN 0 AND 3600", name="ck_workout_exercise_numbers"
        ),
        sa.ForeignKeyConstraint(["exercise_id"], ["exercises.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["workout_id"], ["workouts.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "workout_id",
            "position",
            deferrable=True,
            initially="DEFERRED",
            name="uq_workout_exercise_position",
        ),
    )
    op.create_index(
        op.f("ix_workout_exercises_exercise_id"), "workout_exercises", ["exercise_id"], unique=False
    )
    op.create_table(
        "workout_mutations",
        sa.Column("workout_id", sa.Uuid(), nullable=False),
        sa.Column("mutation_id", sa.Uuid(), nullable=False),
        sa.Column("payload_hash", sa.String(length=64), nullable=False),
        sa.Column("applied_version", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["workout_id"], ["workouts.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("workout_id", "mutation_id"),
    )
    op.create_table(
        "workout_sets",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("workout_exercise_id", sa.Uuid(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("set_type", sa.String(length=12), nullable=False),
        sa.Column("weight_kg", sa.Numeric(precision=8, scale=3), nullable=True),
        sa.Column("reps", sa.Integer(), nullable=True),
        sa.Column("rir", sa.Integer(), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("set_type IN ('warmup','working')", name="ck_workout_set_type"),
        sa.CheckConstraint(
            "completed_at IS NULL OR (reps IS NOT NULL AND weight_kg IS NOT NULL)",
            name="ck_workout_set_complete",
        ),
        sa.CheckConstraint("position >= 0", name="ck_workout_set_position"),
        sa.CheckConstraint("reps BETWEEN 1 AND 999", name="ck_workout_set_reps"),
        sa.CheckConstraint("rir BETWEEN 0 AND 10", name="ck_workout_set_rir"),
        sa.CheckConstraint("weight_kg BETWEEN 0 AND 99999.999", name="ck_workout_set_weight"),
        sa.ForeignKeyConstraint(
            ["workout_exercise_id"], ["workout_exercises.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "workout_exercise_id",
            "position",
            deferrable=True,
            initially="DEFERRED",
            name="uq_workout_set_position",
        ),
    )


def downgrade() -> None:
    op.drop_table("workout_sets")
    op.drop_table("workout_mutations")
    op.drop_index(op.f("ix_workout_exercises_exercise_id"), table_name="workout_exercises")
    op.drop_table("workout_exercises")
    op.drop_index(
        "uq_workout_live_user",
        table_name="workouts",
        postgresql_where=sa.text("status IN ('active','paused')"),
    )
    op.drop_index(op.f("ix_workouts_template_id"), table_name="workouts")
    op.drop_index("ix_workout_user_started", table_name="workouts")
    op.drop_table("workouts")
