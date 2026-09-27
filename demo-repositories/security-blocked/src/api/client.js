export const API_BASE = "http://localhost:8080";

export async function fetchHealth() {
  const res = await fetch(`${API_BASE}/health`);
  return res.json();
}
