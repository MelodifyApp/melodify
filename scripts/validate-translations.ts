#!/usr/bin/env node

/**
 * Translation validation script
 *
 * This script validates that all translation files have the same structure
 * and reports any missing or extra keys with detailed analysis.
 *
 * Usage: npm run validate-translations
 */

import fs from "fs";
import path from "path";

// Types
interface TranslationObject {
    [key: string]: string | TranslationObject;
}

interface KeyComparison {
    missing: string[];
    extra: string[];
    matching: string[];
    isValid: boolean;
    totalExpected: number;
    totalActual: number;
    totalMatching: number;
}

interface ValidationResult extends KeyComparison {
    language: string;
    error?: string;
}

interface CrossLanguageAnalysis {
    universalKeys: string[];
    inconsistentKeys: string[];
    languageKeyMap: Record<string, string[]>;
}

interface UnusedKeysAnalysis {
    unusedKeys: string[];
    totalKeys: number;
    usedKeys: string[];
    usageCount: Record<string, number>;
    missingKeys: string[]; // Keys used in code but not in translations
}

// Configuration
const TRANSLATIONS_PATH = path.join(__dirname, "../src/core/i18n/locales");
const REFERENCE_LANGUAGE = "en";
const SOURCE_CODE_PATHS = [path.join(__dirname, "../src")];
const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx"];

// Improved regex pattern to match t("key") and t('key') calls
const TRANSLATION_KEY_PATTERN = /\bt\s*\(\s*["'`]([^"'`]+)["'`]/g;

// Helper function to get all nested keys from an object
function getNestedKeys(obj: TranslationObject, prefix = ""): string[] {
    let keys: string[] = [];

    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
            const fullKey = prefix ? `${prefix}.${key}` : key;

            if (
                typeof obj[key] === "object" &&
                obj[key] !== null &&
                !Array.isArray(obj[key])
            ) {
                keys = keys.concat(
                    getNestedKeys(obj[key] as TranslationObject, fullKey)
                );
            } else {
                keys.push(fullKey);
            }
        }
    }

    return keys.sort();
}

// Compare two sets of keys and return detailed comparison
function compareKeySets(
    expectedKeys: string[],
    actualKeys: string[]
): KeyComparison {
    const expectedSet = new Set(expectedKeys);
    const actualSet = new Set(actualKeys);

    const missingKeys = expectedKeys.filter((key) => !actualSet.has(key));
    const extraKeys = actualKeys.filter((key) => !expectedSet.has(key));
    const matchingKeys = expectedKeys.filter((key) => actualSet.has(key));

    return {
        missing: missingKeys.sort(),
        extra: extraKeys.sort(),
        matching: matchingKeys.sort(),
        isValid: missingKeys.length === 0 && extraKeys.length === 0,
        totalExpected: expectedKeys.length,
        totalActual: actualKeys.length,
        totalMatching: matchingKeys.length,
    };
}

// Load translation file safely
function loadTranslationFile(filePath: string): TranslationObject | null {
    try {
        const content = fs.readFileSync(filePath, "utf8");
        return JSON.parse(content) as TranslationObject;
    } catch (error) {
        return null;
    }
}

// Get list of translation files
function getTranslationFiles(): string[] {
    try {
        return fs
            .readdirSync(TRANSLATIONS_PATH)
            .filter((file) => file.endsWith(".json"))
            .sort();
    } catch (error) {
        throw new Error(
            `Cannot read translations directory: ${TRANSLATIONS_PATH}`
        );
    }
}

// Recursively find all source files
function findSourceFiles(dir: string): string[] {
    let files: string[] = [];

    try {
        const items = fs.readdirSync(dir);

        for (const item of items) {
            const fullPath = path.join(dir, item);
            const stat = fs.statSync(fullPath);

            if (stat.isDirectory()) {
                // Skip node_modules and other common directories to ignore
                if (
                    !item.startsWith(".") &&
                    item !== "node_modules" &&
                    item !== "dist" &&
                    item !== "build"
                ) {
                    files = files.concat(findSourceFiles(fullPath));
                }
            } else if (
                SOURCE_EXTENSIONS.some((ext) => fullPath.endsWith(ext))
            ) {
                files.push(fullPath);
            }
        }
    } catch (error) {
        console.warn(`Warning: Could not read directory ${dir}`);
    }

    return files;
}

// Extract translation keys used in source code
function extractUsedTranslationKeys(): Record<string, number> {
    const usedKeys: Record<string, number> = {};

    // Get all source files
    const allSourceFiles: string[] = [];
    for (const sourcePath of SOURCE_CODE_PATHS) {
        allSourceFiles.push(...findSourceFiles(sourcePath));
    }

    console.log(
        `🔍 Scanning ${allSourceFiles.length} source files for t("key") usage...`
    );

    for (const filePath of allSourceFiles) {
        try {
            const content = fs.readFileSync(filePath, "utf8");

            // Reset regex state for each file
            TRANSLATION_KEY_PATTERN.lastIndex = 0;
            let match;

            while ((match = TRANSLATION_KEY_PATTERN.exec(content)) !== null) {
                const key = match[1];
                usedKeys[key] = (usedKeys[key] || 0) + 1;
            }
        } catch (error) {
            // Silently skip files that can't be read
        }
    }

    return usedKeys;
}

// Analyze unused translation keys
function analyzeUnusedKeys(
    allKeys: string[],
    usedKeys: Record<string, number>
): UnusedKeysAnalysis {
    const usedKeySet = new Set(Object.keys(usedKeys));
    const allKeysSet = new Set(allKeys);

    const unusedKeys = allKeys.filter((key) => !usedKeySet.has(key));
    const actualUsedKeys = allKeys.filter((key) => usedKeySet.has(key));

    // Find keys used in code but not in translations
    const missingKeys = Array.from(usedKeySet).filter(
        (key) => !allKeysSet.has(key)
    );

    return {
        unusedKeys: unusedKeys.sort(),
        totalKeys: allKeys.length,
        usedKeys: actualUsedKeys.sort(),
        usageCount: usedKeys,
        missingKeys: missingKeys.sort(),
    };
}

// Display unused keys analysis
function displayUnusedKeysAnalysis(analysis: UnusedKeysAnalysis): void {
    console.log("🗑️  UNUSED KEYS ANALYSIS:");
    console.log("─".repeat(30));

    const unusedCount = analysis.unusedKeys.length;
    const usedCount = analysis.usedKeys.length;
    const missingCount = analysis.missingKeys.length;
    const usagePercentage = Math.round((usedCount / analysis.totalKeys) * 100);

    console.log(
        `📊 Usage: ${usedCount}/${analysis.totalKeys} keys (${usagePercentage}%)`
    );

    // Show missing keys (used in code but not in translations) - this is critical
    if (missingCount > 0) {
        console.log(
            `❌ ${missingCount} keys used in code but missing from translations:`
        );
        analysis.missingKeys.forEach((key) => console.log(`   - ${key}`));
        console.log("");
    }

    // Show unused keys (in translations but not used in code)
    if (unusedCount === 0) {
        console.log("✅ All translation keys are being used!");
    } else {
        console.log(`⚠️  ${unusedCount} unused keys found:`);

        // Show first 10 unused keys to avoid cluttering
        const keysToShow = analysis.unusedKeys.slice(0, 10);
        keysToShow.forEach((key) => console.log(`   - ${key}`));

        if (analysis.unusedKeys.length > 10) {
            console.log(`   ... and ${analysis.unusedKeys.length - 10} more`);
        }
    }
}

// Main validation function
function validateTranslations(): void {
    console.log("🔍 Validating translation files...\n");

    try {
        // Load reference file (English)
        const referencePath = path.join(
            TRANSLATIONS_PATH,
            `${REFERENCE_LANGUAGE}.json`
        );
        const referenceContent = loadTranslationFile(referencePath);

        if (!referenceContent) {
            throw new Error(
                `Cannot load reference language file: ${referencePath}`
            );
        }

        const expectedKeys = getNestedKeys(referenceContent);
        console.log(
            `📋 Reference (${REFERENCE_LANGUAGE.toUpperCase()}): ${expectedKeys.length} keys`
        );

        // Get all translation files except reference
        const translationFiles = getTranslationFiles().filter(
            (file) => file !== `${REFERENCE_LANGUAGE}.json`
        );

        let hasErrors = false;
        const results: Record<string, ValidationResult> = {};
        const allLanguageKeys: Record<string, string[]> = {
            [REFERENCE_LANGUAGE]: expectedKeys,
        };

        // Validate each file
        for (const file of translationFiles) {
            const filePath = path.join(TRANSLATIONS_PATH, file);
            const language = path.basename(file, ".json");
            const langCode = language.toUpperCase();

            const content = loadTranslationFile(filePath);

            if (!content) {
                console.log(`❌ ${langCode}: Parse error`);
                hasErrors = true;
                results[language] = {
                    language: langCode,
                    error: "Failed to parse JSON file",
                    missing: [],
                    extra: [],
                    matching: [],
                    isValid: false,
                    totalExpected: expectedKeys.length,
                    totalActual: 0,
                    totalMatching: 0,
                };
            } else {
                const actualKeys = getNestedKeys(content);
                allLanguageKeys[language] = actualKeys;

                const comparison = compareKeySets(expectedKeys, actualKeys);
                results[language] = {
                    ...comparison,
                    language: langCode,
                };

                if (!comparison.isValid) {
                    hasErrors = true;
                }

                // Simplified language result display
                if (comparison.isValid) {
                    console.log(
                        `✅ ${langCode}: Perfect match (${comparison.totalMatching} keys)`
                    );
                } else {
                    const percentage = Math.round(
                        (comparison.totalMatching / comparison.totalExpected) *
                            100
                    );
                    console.log(
                        `❌ ${langCode}: ${percentage}% match (${comparison.missing.length} missing, ${comparison.extra.length} extra)`
                    );

                    if (comparison.missing.length > 0) {
                        console.log(
                            `   Missing: ${comparison.missing.slice(0, 3).join(", ")}${comparison.missing.length > 3 ? "..." : ""}`
                        );
                    }
                    if (comparison.extra.length > 0) {
                        console.log(
                            `   Extra: ${comparison.extra.slice(0, 3).join(", ")}${comparison.extra.length > 3 ? "..." : ""}`
                        );
                    }
                }
            }
        }

        console.log("");

        // Unused keys analysis
        const usedKeys = extractUsedTranslationKeys();
        const unusedAnalysis = analyzeUnusedKeys(expectedKeys, usedKeys);
        displayUnusedKeysAnalysis(unusedAnalysis);

        console.log("");
        console.log("🏁 RESULT:");
        console.log("═".repeat(20));

        const totalLanguages = Object.keys(allLanguageKeys).length;

        if (hasErrors) {
            console.log("❌ FAILED - Key synchronization issues found");
            process.exit(1);
        } else {
            console.log("✅ PASSED - All languages synchronized");

            if (unusedAnalysis.unusedKeys.length > 0) {
                console.log(
                    `⚠️  ${unusedAnalysis.unusedKeys.length} unused keys found`
                );
            }

            process.exit(0);
        }
    } catch (error) {
        console.error("💥 Error:", (error as Error).message);
        process.exit(1);
    }
}

// Run validation if called directly
if (require.main === module) {
    validateTranslations();
}

export {
    validateTranslations,
    getNestedKeys,
    compareKeySets,
    extractUsedTranslationKeys,
    analyzeUnusedKeys,
};
