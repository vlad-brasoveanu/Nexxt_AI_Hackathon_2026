// Mock-only demo users, shared by the legacy KYC mock and the credit mock. Password for all: 12345.
import type { User } from "./types";

export const MOCK_PASSWORD = "12345";

export const USERS: Record<string, User> = {
  manager: { id: "u-manager", username: "manager", role: "manager" },
  analyst: { id: "u-analyst", username: "analyst", role: "analyst" },
  credit_analyst: { id: "u-credit-analyst", username: "credit_analyst", role: "credit_analyst" },
  risk_officer: { id: "u-risk-officer", username: "risk_officer", role: "risk_officer" },
  committee_a: { id: "u-committee-a", username: "committee_a", role: "credit_committee" },
  committee_b: { id: "u-committee-b", username: "committee_b", role: "credit_committee" },
  supervisor: { id: "u-supervisor", username: "supervisor", role: "supervisor" },
};

const STORE_KEY = "casecheck-mock-user";
let current: User | null = null;

export function getMockUser(): User | null {
  if (!current && typeof window !== "undefined") {
    try {
      const name = window.sessionStorage.getItem(STORE_KEY);
      if (name && USERS[name]) current = USERS[name];
    } catch {
      /* storage blocked: the user simply has to sign in again */
    }
  }
  return current;
}

export function setMockUser(user: User | null) {
  current = user;
  try {
    if (user) window.sessionStorage.setItem(STORE_KEY, user.username);
    else window.sessionStorage.removeItem(STORE_KEY);
  } catch {
    /* storage blocked */
  }
}
