from datetime import datetime, timezone
from uuid import uuid4

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint, create_engine, event
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker


def uid():
    return str(uuid4())


def now():
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    username: Mapped[str] = mapped_column(String(80), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(20))
    team: Mapped[str] = mapped_column(String(80))
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    authority_level: Mapped[str | None] = mapped_column(String(4), nullable=True)
    own_cases_only: Mapped[bool] = mapped_column(Boolean, default=False)
    revision: Mapped[int] = mapped_column(Integer, default=1)


class SessionToken(Base):
    __tablename__ = "sessions"
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    csrf: Mapped[str] = mapped_column(String(64))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Case(Base):
    __tablename__ = "cases"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    title: Mapped[str] = mapped_column(String(200))
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    team: Mapped[str] = mapped_column(String(80))
    revision: Mapped[int] = mapped_column(Integer, default=0)
    kind: Mapped[str] = mapped_column(String(20), default="kyc")  # "kyc" (account onboarding) or "credit"
    meta: Mapped[dict] = mapped_column(JSON, default=dict)        # credit request and intake envelope
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Document(Base):
    __tablename__ = "documents"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    case_id: Mapped[str] = mapped_column(ForeignKey("cases.id"), index=True)
    kind: Mapped[str] = mapped_column(String(40))
    filename: Mapped[str] = mapped_column(String(200))
    sha256: Mapped[str] = mapped_column(String(64))
    media_type: Mapped[str] = mapped_column(String(80))
    pages: Mapped[list] = mapped_column(JSON)
    ocr_pages: Mapped[list] = mapped_column(JSON, default=list)  # pages transcribed locally from a scan
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class FactSnapshot(Base):
    __tablename__ = "fact_snapshots"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    case_id: Mapped[str] = mapped_column(ForeignKey("cases.id"), index=True)
    case_revision: Mapped[int] = mapped_column(Integer)
    payload: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Run(Base):
    __tablename__ = "runs"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    case_id: Mapped[str] = mapped_column(ForeignKey("cases.id"), index=True)
    case_revision: Mapped[int] = mapped_column(Integer)
    request_key: Mapped[str] = mapped_column(String(160), unique=True)
    request_hash: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(40))
    snapshot: Mapped[dict] = mapped_column(JSON)
    result: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class ExtractionProposal(Base):
    __tablename__ = "extraction_proposals"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    case_id: Mapped[str] = mapped_column(ForeignKey("cases.id"), index=True)
    case_revision: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(20))
    provider: Mapped[str] = mapped_column(String(40))
    model: Mapped[str] = mapped_column(String(120))
    mode: Mapped[str] = mapped_column(String(20))
    prompt_version: Mapped[str] = mapped_column(String(40))
    latency_ms: Mapped[float] = mapped_column(Float)
    facts: Mapped[dict] = mapped_column(JSON)
    rejected: Mapped[list] = mapped_column(JSON)
    calls: Mapped[list] = mapped_column(JSON)
    error: Mapped[str | None] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class AgentRun(Base):
    """One multi-agent preparation of a credit case: plan, shared board, budget and the routed recommendation."""
    __tablename__ = "agent_runs"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    case_id: Mapped[str] = mapped_column(ForeignKey("cases.id"), index=True)
    started_by: Mapped[str] = mapped_column(ForeignKey("users.id"))
    status: Mapped[str] = mapped_column(String(30))
    case_revision: Mapped[int] = mapped_column(Integer)
    mode_label: Mapped[str] = mapped_column(String(200))
    plan: Mapped[list] = mapped_column(JSON, default=list)
    board: Mapped[dict] = mapped_column(JSON, default=dict)
    recommendation: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    level: Mapped[str | None] = mapped_column(String(4), nullable=True)
    budget_used: Mapped[int] = mapped_column(Integer, default=0)
    segment_started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    error: Mapped[str | None] = mapped_column(String(300), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class AgentStep(Base):
    __tablename__ = "agent_steps"
    __table_args__ = (UniqueConstraint("run_id", "seq"),)
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    run_id: Mapped[str] = mapped_column(ForeignKey("agent_runs.id"), index=True)
    seq: Mapped[int] = mapped_column(Integer)
    agent: Mapped[str] = mapped_column(String(30))
    kind: Mapped[str] = mapped_column(String(20))
    title: Mapped[str] = mapped_column(String(300))
    thought: Mapped[str | None] = mapped_column(Text, nullable=True)
    task: Mapped[str | None] = mapped_column(String(60), nullable=True)
    status: Mapped[str] = mapped_column(String(20))
    model: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    duration_ms: Mapped[float | None] = mapped_column(Float, nullable=True)
    detail: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class ClientRequest(Base):
    """A consolidated request for documents or clarifications, sent through the (simulated) client portal."""
    __tablename__ = "client_requests"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    case_id: Mapped[str] = mapped_column(ForeignKey("cases.id"), index=True)
    run_id: Mapped[str] = mapped_column(ForeignKey("agent_runs.id"), index=True)
    round: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(20))
    channel: Mapped[str] = mapped_column(String(80))
    message: Mapped[str] = mapped_column(Text)
    items: Mapped[list] = mapped_column(JSON)
    sent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    answered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class CreditDecision(Base):
    """The human decision on a credit case. Agents never write this table."""
    __tablename__ = "credit_decisions"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    case_id: Mapped[str] = mapped_column(ForeignKey("cases.id"), index=True)
    run_id: Mapped[str] = mapped_column(ForeignKey("agent_runs.id"), index=True)
    action: Mapped[str] = mapped_column(String(10))
    status: Mapped[str] = mapped_column(String(30))
    terms: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    conditions: Mapped[list] = mapped_column(JSON, default=list)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    demo_exception: Mapped[bool] = mapped_column(Boolean, default=False)
    override: Mapped[bool] = mapped_column(Boolean, default=False)
    level: Mapped[str] = mapped_column(String(4))
    votes: Mapped[list] = mapped_column(JSON, default=list)
    human_seconds: Mapped[float | None] = mapped_column(Float, nullable=True)
    letter: Mapped[str | None] = mapped_column(Text, nullable=True)
    recommendation: Mapped[dict] = mapped_column(JSON)
    case_revision: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class MarketSnapshot(Base):
    __tablename__ = "market_snapshots"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    index: Mapped[str] = mapped_column(String(20))
    value_pct: Mapped[float] = mapped_column(Float)
    as_of: Mapped[str] = mapped_column(String(10))
    source: Mapped[str] = mapped_column(String(200))
    published_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class AuditEvent(Base):
    __tablename__ = "audit_events"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    actor_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    case_id: Mapped[str | None] = mapped_column(ForeignKey("cases.id"), nullable=True)
    action: Mapped[str] = mapped_column(String(80))
    details: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


def connect(url):
    engine = create_engine(url, pool_pre_ping=True)
    if url.startswith("sqlite"):
        # Local preview only: agents write from a background thread while the UI streams; WAL lets readers proceed.
        @event.listens_for(engine, "connect")
        def wal(connection, _):
            connection.execute("PRAGMA journal_mode=WAL")
            connection.execute("PRAGMA busy_timeout=5000")
    return engine, sessionmaker(engine, expire_on_commit=False)


class RiskReport(Base):
    __tablename__ = 'risk_reports'
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    run_id: Mapped[str] = mapped_column(ForeignKey('agent_runs.id'), index=True)
    case_id: Mapped[str] = mapped_column(ForeignKey('cases.id'), index=True)
    actor_id: Mapped[str] = mapped_column(ForeignKey('users.id'))
    report: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class PolicyVersion(Base):
    __tablename__ = 'policy_versions'
    __table_args__ = (UniqueConstraint('team','version'),UniqueConstraint('team','parent_version'))
    id: Mapped[str] = mapped_column(String(36),primary_key=True,default=uid)
    team: Mapped[str] = mapped_column(String(80))
    version: Mapped[str] = mapped_column(String(80))
    parent_version: Mapped[str] = mapped_column(String(80))
    policy: Mapped[dict] = mapped_column(JSON)
    published_by: Mapped[str] = mapped_column(ForeignKey('users.id'))
    reason: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True),default=now)
