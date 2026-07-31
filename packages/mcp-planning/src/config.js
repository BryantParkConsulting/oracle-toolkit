import fs from "node:fs";
import path from "node:path";

function readProfile() {
  const profilePath = process.env.ORACLE_EPM_PROFILE;
  if (!profilePath) return {};
  return JSON.parse(fs.readFileSync(path.resolve(profilePath), "utf8"));
}

export function loadConfig() {
  const profile = readProfile();
  const value = (envName, profileName) => process.env[envName] || profile[profileName] || "";

  return {
    baseUrl: value("ORACLE_EPM_BASE_URL", "baseUrl").replace(/\/+$/, ""),
    application: value("ORACLE_EPM_APPLICATION", "application"),
    cube: value("ORACLE_EPM_CUBE", "cube"),
    username: value("ORACLE_EPM_USERNAME", "username"),
    password: value("ORACLE_EPM_PASSWORD", "password"),
    kbPath: value("ORACLE_EPM_KB_PATH", "kbPath"),
    mutationsEnabled:
      String(value("ORACLE_EPM_ENABLE_MUTATIONS", "mutationsEnabled")).toLowerCase() === "true"
  };
}

export function requireLiveConfig(config) {
  const missing = ["baseUrl", "username", "password"].filter((key) => !config[key]);
  if (missing.length) {
    throw new Error(`Missing Oracle EPM configuration: ${missing.join(", ")}`);
  }
}
