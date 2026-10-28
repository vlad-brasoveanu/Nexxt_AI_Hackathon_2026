def case_json(case):
    return {"id": case.id, "title": case.title, "revision": case.revision, "owner_id": case.owner_id, "created_at": case.created_at}


def doc_json(doc):
    return {"id": doc.id, "kind": doc.kind, "filename": doc.filename, "sha256": doc.sha256, "pages": doc.pages}


def run_json(run):
    return {"id": run.id, "case_id": run.case_id, "case_revision": run.case_revision,
            "status": run.status, "snapshot": run.snapshot, "result": run.result}
