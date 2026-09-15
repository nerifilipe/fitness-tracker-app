function validateReleaseUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(
      "Define EXPO_PUBLIC_API_URL com o endereço HTTPS da API publicada, terminado em /api/v1.",
    );
  }
  const host = url.hostname.toLowerCase();
  const local =
    !host.includes(".") ||
    host.includes(":") ||
    /^(127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.)/.test(
      host,
    ) ||
    /(^|\.)(localhost|local|invalid|test|example)$/.test(host) ||
    /(^|\.)example\.(com|org|net)$/.test(host);
  if (
    url.protocol !== "https:" ||
    local ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname.replace(/\/$/, "") !== "/api/v1"
  ) {
    throw new Error(
      "O APK requer uma API pública HTTPS em /api/v1, sem credenciais, parâmetros ou endereços locais/de exemplo.",
    );
  }
  return url.toString().replace(/\/$/, "");
}
module.exports = { validateReleaseUrl };
