import brand from "./brand.json";

/**
 * Single source of truth for user-facing identity. Update this file (and run
 * `node scripts/apply-brand.cjs`) before changing the product name again.
 */
export const BRAND = brand;
export const APP_NAME = brand.displayName;
export const APP_ID = brand.appId;
export const PROFILE_NAME = brand.profileName;
export const LEGACY_PROFILE_NAME = brand.legacyProfileName;
export const INSTALLER_NAME = brand.installerName;
export const GITHUB_REPO = brand.githubRepo;
export const UPDATE_KEY_ID = brand.updateKeyId;
