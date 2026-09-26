// ShopSphere API client
const API_BASE = "http://localhost:9090/api";

export async function fetchProducts() {
  const res = await fetch(`${API_BASE}/products`);
  return res.json();
}

export async function login(username, password) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  return res.json();
}
