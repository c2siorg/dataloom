"""make_last_modified_timezone_aware

Revision ID: c4d5e6f7a8b9
Revises: b2c3d4e5f6a7
Create Date: 2026-03-19 16:35:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c4d5e6f7a8b9"
down_revision: str | Sequence[str] | None = "b2c3d4e5f6a7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _sqlite_append_utc_offset(column_name: str) -> None:
    op.execute(
        sa.text(
            f"""
            UPDATE projects
            SET {column_name} = CASE
                WHEN {column_name} IS NULL THEN NULL
                WHEN {column_name} LIKE '%+__:__' THEN {column_name}
                WHEN {column_name} LIKE '%-__:__' THEN {column_name}
                WHEN {column_name} LIKE '%Z' THEN {column_name}
                ELSE {column_name} || '+00:00'
            END
            """
        )
    )


def _sqlite_strip_utc_offset(column_name: str) -> None:
    op.execute(
        sa.text(
            f"""
            UPDATE projects
            SET {column_name} = CASE
                WHEN {column_name} LIKE '%+__:__'
                    THEN substr({column_name}, 1, length({column_name}) - 6)
                WHEN {column_name} LIKE '%-__:__'
                    THEN substr({column_name}, 1, length({column_name}) - 6)
                WHEN {column_name} LIKE '%Z'
                    THEN substr({column_name}, 1, length({column_name}) - 1)
                ELSE {column_name}
            END
            """
        )
    )


def upgrade() -> None:
    """Upgrade schema."""
    dialect = op.get_bind().dialect.name

    if dialect == "postgresql":
        op.alter_column(
            "projects",
            "last_modified",
            existing_type=sa.DateTime(),
            type_=sa.DateTime(timezone=True),
            existing_nullable=True,
            postgresql_using="last_modified AT TIME ZONE 'UTC'",
        )
        return

    if dialect == "sqlite":
        # Existing rows are stored as naive datetime strings.
        # Add +00:00 to normalize them before timezone-aware reads/writes.
        _sqlite_append_utc_offset("last_modified")
        return

    with op.batch_alter_table("projects") as batch_op:
        batch_op.alter_column(
            "last_modified",
            existing_type=sa.DateTime(),
            type_=sa.DateTime(timezone=True),
            existing_nullable=True,
        )


def downgrade() -> None:
    """Downgrade schema."""
    dialect = op.get_bind().dialect.name

    if dialect == "postgresql":
        op.alter_column(
            "projects",
            "last_modified",
            existing_type=sa.DateTime(timezone=True),
            type_=sa.DateTime(),
            existing_nullable=True,
            postgresql_using="last_modified AT TIME ZONE 'UTC'",
        )
        return

    if dialect == "sqlite":
        _sqlite_strip_utc_offset("last_modified")
        return

    with op.batch_alter_table("projects") as batch_op:
        batch_op.alter_column(
            "last_modified",
            existing_type=sa.DateTime(timezone=True),
            type_=sa.DateTime(),
            existing_nullable=True,
        )
