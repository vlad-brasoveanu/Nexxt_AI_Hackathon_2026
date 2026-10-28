from app.api.routes import cases, catalogue, documents, extractions, facts, runs, session

ROUTERS = [catalogue.router, session.router, cases.router, documents.router, extractions.router, facts.router, runs.router]
