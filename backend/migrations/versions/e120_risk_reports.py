"""Persist reproducible risk simulations."""
from alembic import op
import sqlalchemy as sa
revision='e120_risk_reports'
down_revision='d7a3b1c0e5f2'
branch_labels=None
depends_on=None


def upgrade():
    op.create_table('risk_reports', sa.Column('id',sa.String(36),primary_key=True),
        sa.Column('run_id',sa.String(36),sa.ForeignKey('agent_runs.id'),nullable=False,index=True),
        sa.Column('case_id',sa.String(36),sa.ForeignKey('cases.id'),nullable=False,index=True),
        sa.Column('actor_id',sa.String(36),sa.ForeignKey('users.id'),nullable=False),
        sa.Column('report',sa.JSON(),nullable=False),sa.Column('created_at',sa.DateTime(timezone=True),nullable=False))


def downgrade():
    op.drop_table('risk_reports')
