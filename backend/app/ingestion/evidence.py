def verify_facts(factset, documents):
    ids = set()
    for fact in factset.facts:
        if fact.id in ids:
            raise ValueError("Duplicate fact ID")
        ids.add(fact.id)
        evidence = fact.evidence
        doc = documents.get(evidence.document_id)
        if not doc or doc.sha256 != evidence.sha256 or evidence.page > len(doc.pages):
            raise ValueError("Evidence does not belong to this case/document version")
        page = doc.pages[evidence.page - 1]
        if page[evidence.start:evidence.end] != evidence.quote or evidence.end > len(page):
            raise ValueError("Evidence span does not match source")
        if fact.value not in evidence.quote:
            raise ValueError("Manual structured fact must quote its literal value")
