const { validateReleaseUrl } = require("./release-config.cjs");
validateReleaseUrl(process.env.EXPO_PUBLIC_API_URL);
console.log("Endereço da API válido para distribuição Android.");
