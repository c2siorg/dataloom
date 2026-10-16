"""make checkpoints point at a change log position

Revision ID: b7c1d2e3f4a5
Revises: 13f057cc385b
Create Date: 2026-10-15 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "b7c1d2e3f4a5"
down_revision: str | Sequence[str] | None = "13f057cc385b"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Point each checkpoint at a log position instead of owning log rows.

    The log is shared history, so the column recording group membership goes
    away and the checkpoint records how far down the log it replays to instead.
    Existing checkpoints are backfilled from the rows written at or before they
    were taken. That rule is cumulative and monotonic, so a checkpoint never
    resolves to a position behind an earlier one, and one taken before the log
    started resolves to NULL — the original file.
    """
    op.add_column("checkpoints", sa.Column("log_position", sa.Integer(), nullable=True))

    checkpoints = sa.table(
        "checkpoints",
        sa.column("id", sa.Uuid()),
        sa.column("created_at", sa.DateTime()),
        sa.column("log_position", sa.Integer()),
    )
    user_logs = sa.table(
        "user_logs",
        sa.column("change_log_id", sa.Integer()),
        sa.column("timestamp", sa.DateTime()),
    )

    bind = op.get_bind()
    checkpoint_rows = bind.execute(
        sa.select(checkpoints.c.id, checkpoints.c.created_at).order_by(checkpoints.c.created_at)
    ).all()
    for checkpoint_id, created_at in checkpoint_rows:
        position = bind.execute(
            sa.select(sa.func.max(user_logs.c.change_log_id)).where(user_logs.c.timestamp <= created_at)
        ).scalar()
        bind.execute(checkpoints.update().where(checkpoints.c.id == checkpoint_id).values(log_position=position))

    op.create_foreign_key(
        "checkpoints_log_position_fkey",
        "checkpoints",
        "user_logs",
        ["log_position"],
        ["change_log_id"],
    )
    op.create_index(op.f("ix_checkpoints_log_position"), "checkpoints", ["log_position"], unique=False)

    inspector = sa.inspect(op.get_bind())
    for foreign_key in inspector.get_foreign_keys("user_logs"):
        if foreign_key["constrained_columns"] == ["checkpoint_id"]:
            op.drop_constraint(foreign_key["name"], "user_logs", type_="foreignkey")
    op.drop_column("user_logs", "checkpoint_id")


def downgrade() -> None:
    """Restore the group-membership column, leaving it empty.

    A position cannot be turned back into a group without rewriting the log, so
    the rows come back unlinked — the state a deleted checkpoint used to leave
    behind.
    """
    op.add_column("user_logs", sa.Column("checkpoint_id", sa.Uuid(), nullable=True))
    op.create_foreign_key("user_logs_checkpoint_id_fkey", "user_logs", "checkpoints", ["checkpoint_id"], ["id"])
    op.drop_index(op.f("ix_checkpoints_log_position"), table_name="checkpoints")
    op.drop_constraint("checkpoints_log_position_fkey", "checkpoints", type_="foreignkey")
    op.drop_column("checkpoints", "log_position")
