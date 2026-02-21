export function getAuthHeaders(): HeadersInit {
  const token = sessionStorage.getItem("auth_token");
  return token ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
}

export async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const headers = { ...getAuthHeaders(), ...(options.headers || {}) };
  const res = await fetch(url, { cache: "no-store", ...options, headers });
  if (res.status === 401) {
    sessionStorage.removeItem("auth_token");
    window.location.href = "/";
  }
  return res;
}

export async function apiGet<T>(url: string): Promise<T> {
  const res = await authFetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || "Request failed");
  }
  return res.json();
}

export async function apiPost<T>(url: string, data?: unknown): Promise<T> {
  const isFormData = data instanceof FormData;
  const headers = getAuthHeaders();
  if (isFormData) {
    delete (headers as Record<string, string>)["Content-Type"];
  }
  const res = await authFetch(url, {
    method: "POST",
    headers,
    body: isFormData ? data as FormData : data ? JSON.stringify(data) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || "Request failed");
  }
  return res.json();
}

export async function apiPut<T>(url: string, data?: unknown): Promise<T> {
  const res = await authFetch(url, {
    method: "PUT",
    body: data ? JSON.stringify(data) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || "Request failed");
  }
  return res.json();
}

export async function apiPatch<T>(url: string, data?: unknown): Promise<T> {
  const res = await authFetch(url, {
    method: "PATCH",
    body: data ? JSON.stringify(data) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || "Request failed");
  }
  return res.json();
}

export async function apiDelete<T>(url: string): Promise<T> {
  const res = await authFetch(url, { method: "DELETE" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || "Request failed");
  }
  return res.json();
}
