from app.api.routes import cases, catalogue, documents, facts, runs, session

ROUTERS = [catalogue.router, session.router, cases.router, documents.router, facts.router, runs.router]
