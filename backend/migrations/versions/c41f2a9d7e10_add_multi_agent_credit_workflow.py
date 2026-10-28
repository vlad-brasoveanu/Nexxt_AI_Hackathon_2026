"""Add the multi-agent credit workflow: case kind/meta, agent runs and steps, client requests, decisions, market snapshots"""
from alembic import op
import sqlalchemy as sa

revision = 'c41f2a9d7e10'
down_revision = '7b1e2c4a9f30'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('cases', sa.Column('kind', sa.String(length=20), nullable=False, server_default='kyc'))
    op.add_column('cases', sa.Column('meta', sa.JSON(), nullable=False, server_default=sa.text("'{}'")))
    op.create_table('agent_runs',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('case_id', sa.String(length=36), nullable=False),
    sa.Column('started_by', sa.String(length=36), nullable=False),
    sa.Column('status', sa.String(length=30), nullable=False),
    sa.Column('case_revision', sa.Integer(), nullable=False),
    sa.Column('mode_label', sa.String(length=200), nullable=False),
    sa.Column('plan', sa.JSON(), nullable=False),
    sa.Column('board', sa.JSON(), nullable=False),
    sa.Column('recommendation', sa.JSON(), nullable=True),
    sa.Column('level', sa.String(length=4), nullable=True),
    sa.Column('budget_used', sa.Integer(), nullable=False),
    sa.Column('segment_started_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('error', sa.String(length=300), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['case_id'], ['cases.id'], ),
    sa.ForeignKeyConstraint(['started_by'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_agent_runs_case_id'), 'agent_runs', ['case_id'], unique=False)
    op.create_table('agent_steps',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('run_id', sa.String(length=36), nullable=False),
    sa.Column('seq', sa.Integer(), nullable=False),
    sa.Column('agent', sa.String(length=30), nullable=False),
    sa.Column('kind', sa.String(length=20), nullable=False),
    sa.Column('title', sa.String(length=300), nullable=False),
    sa.Column('thought', sa.Text(), nullable=True),
    sa.Column('task', sa.String(length=60), nullable=True),
    sa.Column('status', sa.String(length=20), nullable=False),
    sa.Column('model', sa.JSON(), nullable=True),
    sa.Column('duration_ms', sa.Float(), nullable=True),
    sa.Column('detail', sa.JSON(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['run_id'], ['agent_runs.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('run_id', 'seq')
    )
    op.create_index(op.f('ix_agent_steps_run_id'), 'agent_steps', ['run_id'], unique=False)
    op.create_table('client_requests',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('case_id', sa.String(length=36), nullable=False),
    sa.Column('run_id', sa.String(length=36), nullable=False),
    sa.Column('round', sa.Integer(), nullable=False),
    sa.Column('status', sa.String(length=20), nullable=False),
    sa.Column('channel', sa.String(length=80), nullable=False),
    sa.Column('message', sa.Text(), nullable=False),
    sa.Column('items', sa.JSON(), nullable=False),
    sa.Column('sent_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('answered_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['case_id'], ['cases.id'], ),
    sa.ForeignKeyConstraint(['run_id'], ['agent_runs.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_client_requests_case_id'), 'client_requests', ['case_id'], unique=False)
    op.create_index(op.f('ix_client_requests_run_id'), 'client_requests', ['run_id'], unique=False)
    op.create_table('credit_decisions',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('case_id', sa.String(length=36), nullable=False),
    sa.Column('run_id', sa.String(length=36), nullable=False),
    sa.Column('action', sa.String(length=10), nullable=False),
    sa.Column('status', sa.String(length=30), nullable=False),
    sa.Column('terms', sa.JSON(), nullable=True),
    sa.Column('conditions', sa.JSON(), nullable=False),
    sa.Column('reason', sa.Text(), nullable=True),
    sa.Column('override', sa.Boolean(), nullable=False),
    sa.Column('level', sa.String(length=4), nullable=False),
    sa.Column('votes', sa.JSON(), nullable=False),
    sa.Column('human_seconds', sa.Float(), nullable=True),
    sa.Column('letter', sa.Text(), nullable=True),
    sa.Column('recommendation', sa.JSON(), nullable=False),
    sa.Column('case_revision', sa.Integer(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['case_id'], ['cases.id'], ),
    sa.ForeignKeyConstraint(['run_id'], ['agent_runs.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_credit_decisions_case_id'), 'credit_decisions', ['case_id'], unique=False)
    op.create_index(op.f('ix_credit_decisions_run_id'), 'credit_decisions', ['run_id'], unique=False)
    op.create_table('market_snapshots',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('index', sa.String(length=20), nullable=False),
    sa.Column('value_pct', sa.Float(), nullable=False),
    sa.Column('as_of', sa.String(length=10), nullable=False),
    sa.Column('source', sa.String(length=200), nullable=False),
    sa.Column('published_by', sa.String(length=36), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['published_by'], ['users.id'], ),
    sa.PrimaryKeyConstraint('id')
    )


def downgrade():
    op.drop_table('market_snapshots')
    op.drop_index(op.f('ix_credit_decisions_run_id'), table_name='credit_decisions')
    op.drop_index(op.f('ix_credit_decisions_case_id'), table_name='credit_decisions')
    op.drop_table('credit_decisions')
    op.drop_index(op.f('ix_client_requests_run_id'), table_name='client_requests')
    op.drop_index(op.f('ix_client_requests_case_id'), table_name='client_requests')
    op.drop_table('client_requests')
    op.drop_index(op.f('ix_agent_steps_run_id'), table_name='agent_steps')
    op.drop_table('agent_steps')
    op.drop_index(op.f('ix_agent_runs_case_id'), table_name='agent_runs')
    op.drop_table('agent_runs')
    op.drop_column('cases', 'meta')
    op.drop_column('cases', 'kind')
