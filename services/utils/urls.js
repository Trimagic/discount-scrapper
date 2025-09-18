export function getDomainWithoutTLD(url) {
  try {
    const { hostname } = new URL(url);

    // убираем www.
    const host = hostname.replace(/^www\./i, "").toLowerCase();

    // если это IP или localhost — возвращаем как есть
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host === "localhost") {
      return host;
    }

    const parts = host.split(".");
    if (parts.length < 2) return host;

    // убираем последний сегмент (TLD)
    parts.pop();

    return parts.join(".");
  } catch (e) {
    return null; // если некорректный URL
  }
}

export function stripQueryParams(url) {
  try {
    const u = new URL(url);
    // обнуляем query и hash
    u.search = "";
    u.hash = "";
    return u.toString();
  } catch {
    return url; // если невалидный URL – возвращаем как есть
  }
}
