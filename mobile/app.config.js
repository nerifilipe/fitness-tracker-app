const { validateReleaseUrl } = require("./scripts/release-config.cjs");

module.exports = ({ config }) => {
  // Local EAS setup must resolve the project before downloading its environment.
  if (process.env.APP_VARIANT === "release" && process.env.EAS_BUILD === "true") {
    validateReleaseUrl(process.env.EXPO_PUBLIC_API_URL);
  }
  return config;
};
