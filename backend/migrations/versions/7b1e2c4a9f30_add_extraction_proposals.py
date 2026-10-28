"""Add AI extraction proposals"""
from alembic import op
import sqlalchemy as sa

revision = '7b1e2c4a9f30'
down_revision = 'd5604272657d'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('extraction_proposals',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('case_id', sa.String(length=36), nullable=False),
    sa.Column('case_revision', sa.Integer(), nullable=False),
    sa.Column('status', sa.String(length=20), nullable=False),
    sa.Column('provider', sa.String(length=40), nullable=False),
    sa.Column('model', sa.String(length=120), nullable=False),
    sa.Column('mode', sa.String(length=20), nullable=False),
    sa.Column('prompt_version', sa.String(length=40), nullable=False),
    sa.Column('latency_ms', sa.Float(), nullable=False),
    sa.Column('facts', sa.JSON(), nullable=False),
    sa.Column('rejected', sa.JSON(), nullable=False),
    sa.Column('calls', sa.JSON(), nullable=False),
    sa.Column('error', sa.String(length=200), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['case_id'], ['cases.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_extraction_proposals_case_id'), 'extraction_proposals', ['case_id'], unique=False)


def downgrade():
    op.drop_index(op.f('ix_extraction_proposals_case_id'), table_name='extraction_proposals')
    op.drop_table('extraction_proposals')
