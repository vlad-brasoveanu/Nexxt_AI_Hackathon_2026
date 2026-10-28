from app.api.routes import agents, cases, catalogue, credit, documents, extractions, facts, market, runs, session, risk

ROUTERS = [catalogue.router, session.router, cases.router, documents.router, extractions.router, facts.router, runs.router,
           agents.router, credit.router, market.router, risk.router]
