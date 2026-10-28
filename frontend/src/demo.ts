import clean from "../../fixtures/clean.json";
import mismatch from "../../fixtures/mismatch.json";
import expired from "../../fixtures/expired.json";
import missing from "../../fixtures/missing_identity.json";
import stale from "../../fixtures/stale_extract.json";
import { api, post, type Case, type Doc, type Fact, type Run } from "./api";
export const samples = [
  { label: "Identificatori diferiți", data: mismatch },
  { label: "Dosar fără discrepanțe", data: clean },
  { label: "Act de identitate expirat", data: expired },
  { label: "Document lipsă", data: missing },
  { label: "Extras prea vechi", data: stale },
];
export async function createSample(index: number) {
  const packet = samples[index].data;
  const c = await post<Case>("/cases", {
    title: `Atelier Demo SRL · ${samples[index].label}`,
  });
  let revision = c.revision;
  const facts: Fact[] = [];
  for (const [index, source] of packet.documents.entries()) {
    const form = new FormData();
    form.set("kind", source.kind);
    form.set("expected_revision", String(revision));
    form.set(
      "file",
      new Blob([JSON.stringify({ pages: source.pages })], {
        type: "application/json",
      }),
      source.kind + ".json",
    );
    const res = await api<{ document: Doc; revision: number }>(
      `/cases/${c.id}/documents`,
      { method: "POST", body: form },
    );
    revision = res.revision;
    for (const obs of source.observations) {
      const start = source.pages[0].indexOf(obs.value);
      facts.push({
        ...obs,
        id: `${index}-${obs.field}`,
        evidence: {
          document_id: res.document.id,
          sha256: res.document.sha256,
          page: 1,
          start,
          end: start + obs.value.length,
          quote: obs.value,
        },
      });
    }
  }
  revision = (
    await post<{ revision: number }>(`/cases/${c.id}/facts`, {
      expected_revision: revision,
      facts: { facts },
    })
  ).revision;
  await post<Run>(
    `/cases/${c.id}/runs`,
    { expected_revision: revision, evaluation_date: packet.evaluation_date },
    { "Idempotency-Key": crypto.randomUUID() },
  );
  return c.id;
}
