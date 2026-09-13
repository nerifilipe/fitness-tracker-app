"""exercise library"""

import sqlalchemy as sa
from alembic import op

revision = "0002_exercises"
down_revision = "0001_identity"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "muscle_groups",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("slug", sa.String(length=40), nullable=False),
        sa.Column("name", sa.String(length=80), nullable=False),
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
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("slug"),
    )
    op.create_table(
        "exercises",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("owner_id", sa.Uuid(), nullable=True),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("equipment", sa.String(length=20), nullable=False),
        sa.Column("load_type", sa.String(length=20), nullable=False),
        sa.Column("load_convention", sa.String(length=20), nullable=False),
        sa.Column("instructions", sa.Text(), nullable=True),
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
        sa.CheckConstraint(
            "(load_type = 'external' AND load_convention IN ('total','per_hand')) OR "
            "(load_type = 'bodyweight' AND load_convention IN ('none','added')) OR "
            "(load_type = 'assisted' AND load_convention = 'assistance')",
            name="ck_exercises_load",
        ),
        sa.CheckConstraint(
            "equipment IN ('barbell','dumbbell','machine','cable','bodyweight',"
            "'band','kettlebell','other')",
            name="ck_exercises_equipment",
        ),
        sa.CheckConstraint("length(trim(name)) > 0", name="ck_exercises_name"),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_exercises_owner_name",
        "exercises",
        ["owner_id", sa.literal_column("lower(name)"), "id"],
        unique=False,
    )
    op.create_table(
        "exercise_muscles",
        sa.Column("exercise_id", sa.Uuid(), nullable=False),
        sa.Column("muscle_group_id", sa.Uuid(), nullable=False),
        sa.Column("role", sa.String(length=12), nullable=False),
        sa.CheckConstraint("role IN ('primary','secondary')", name="ck_exercise_muscles_role"),
        sa.ForeignKeyConstraint(["exercise_id"], ["exercises.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["muscle_group_id"], ["muscle_groups.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("exercise_id", "muscle_group_id"),
    )
    op.create_index(
        "ix_exercise_muscles_group",
        "exercise_muscles",
        ["muscle_group_id", "exercise_id"],
        unique=False,
    )
    op.create_index(
        "ix_exercise_muscles_primary",
        "exercise_muscles",
        ["exercise_id"],
        unique=True,
        postgresql_where=sa.text("role = 'primary'"),
    )
    op.create_table(
        "user_exercises",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("exercise_id", sa.Uuid(), nullable=False),
        sa.Column("is_favorite", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(["exercise_id"], ["exercises.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("user_id", "exercise_id"),
    )
    op.create_index(
        op.f("ix_user_exercises_exercise_id"), "user_exercises", ["exercise_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_user_exercises_exercise_id"), table_name="user_exercises")
    op.drop_table("user_exercises")
    op.drop_index(
        "ix_exercise_muscles_primary",
        table_name="exercise_muscles",
        postgresql_where=sa.text("role = 'primary'"),
    )
    op.drop_index("ix_exercise_muscles_group", table_name="exercise_muscles")
    op.drop_table("exercise_muscles")
    op.drop_index("ix_exercises_owner_name", table_name="exercises")
    op.drop_table("exercises")
    op.drop_table("muscle_groups")
