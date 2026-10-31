# Translation System Documentation

This document provides comprehensive information about the internationalization (i18n) system in Melodify.

## Overview

The translation system provides type-safe multilingual support with automatic validation to ensure all languages have the same structure and complete coverage.

## Supported Languages

- 🇺🇸 **English** (`en`) - Reference language
- 🇹🇷 **Turkish** (`tr`) - Türkçe

## Architecture

### File Structure

```
src/core/i18n/
├── locales/
│   ├── en.json          # Reference language (English)
│   └── tr.json          # Turkish translations
├── index.ts             # Main i18n configuration
├── translations.ts      # Type definitions
└── validator.ts         # Runtime validation utilities
```

### Key Components

1. **Translation Files** (`locales/*.json`): JSON files containing nested translation objects
2. **Type System** (`translations.ts`): TypeScript types generated from English translations
3. **Validation Script** (`scripts/validate-translations.ts`): Ensures consistency across languages
4. **Runtime Utilities** (`validator.ts`): Development-time validation helpers

## Usage

### Basic Translation

```tsx
import { useTranslation } from "react-i18next";

function MyComponent() {
    const { t } = useTranslation();

    return (
        <div>
            <h1>{t("settings.title")}</h1>
            <p>{t("commands.sr.description")}</p>
        </div>
    );
}
```

### Translation with Variables

```tsx
// Translation file
{
    "messages": {
        "welcome": "Welcome {{username}}!",
        "songsAdded": "Added {{count}} songs to queue"
    }
}

// Component
const welcomeMsg = t("messages.welcome", { username: "John" });
const songsMsg = t("messages.songsAdded", { count: 5 });
```

### Conditional Translations

```tsx
const status = isConnected ? t("common.connected") : t("common.disconnected");
```

## Translation Structure

### Naming Conventions

- Use **camelCase** for keys: `songRequests`, `currentSong`
- Use **descriptive names**: `replyOnSongRequest` not `reply1`
- Group related translations: `commands.sr.name`, `commands.sr.description`
- Keep consistent patterns: `enabled`/`disabled`, `success`/`error`

### Organization

```json
{
    "app": {
        "name": "Melodify",
        "description": "..."
    },
    "navigation": {
        "home": "Home",
        "settings": "Settings"
    },
    "settings": {
        "title": "Settings",
        "general": "General",
        "commands": "Commands"
    },
    "commands": {
        "title": "Commands",
        "sr": {
            "name": "Song Request",
            "description": "Request a song to be played on Spotify"
        }
    }
}
```

## Development Workflow

### Adding New Translations

1. **Add to English first** (reference language):

    ```json
    // en.json
    {
        "newFeature": {
            "title": "New Feature",
            "description": "This is a new feature"
        }
    }
    ```

2. **Validate structure**:

    ```bash
    npm run validate-translations
    ```

3. **Add to other languages**:

    ```json
    // tr.json
    {
        "newFeature": {
            "title": "Yeni Özellik",
            "description": "Bu yeni bir özellik"
        }
    }
    ```

4. **Final validation**:
    ```bash
    npm run validate-translations
    ```

### Translation Guidelines

#### English (Reference Language)

- Use clear, concise language
- Avoid technical jargon when possible
- Use consistent terminology
- Write in present tense for actions
- Use sentence case for UI elements

#### Turkish

- Keep translations natural and conversational
- Use simple, commonly understood words
- Maintain consistency with Turkish UI conventions
- Prefer shorter phrases when possible
- Use Turkish sentence structure, not literal translations

## Type Safety

The system generates TypeScript types automatically from the English translation file:

```typescript
// Auto-generated types
type TranslationKeys =
    | "app.name"
    | "app.description"
    | "settings.title"
    | "commands.sr.name"
    | "commands.sr.description";

// Usage with type checking
const title: string = t("settings.title"); // ✅ Valid
const invalid: string = t("invalid.key"); // ❌ TypeScript error
```

## Validation System

### Validation Script

Run validation to ensure consistency:

```bash
npm run validate-translations
```

The script checks:

- **Structure consistency**: All languages have identical key structures
- **Missing keys**: Keys present in English but missing in other languages
- **Extra keys**: Keys in other languages not present in English
- **JSON validity**: Proper JSON syntax and formatting

### Validation Output

```
🔍 Validating translation files...
📋 Reference file (English): 148 keys
🔑 Expected keys structure validated

✅ TR: Perfect match
   📊 148/148 keys match (100%)

🏁 FINAL RESULT:
✅ Translation validation PASSED!
   All 2 languages have matching key structures
   Total keys validated: 148
🎉 All translation files are perfectly synchronized!
```

### Error Examples

```
❌ TR: Key mismatch detected
   📊 145/148 keys match (98%)
   🚫 Missing keys (3):
      - commands.newFeature.title
      - commands.newFeature.description
      - settings.advanced.title
```

## Testing Translations

### Manual Testing

1. **Change language in UI**: Test all features in different languages
2. **Check layouts**: Ensure text fits properly in UI components
3. **Verify context**: Confirm translations make sense in context

### Automated Testing

The validation script runs automatically in CI/CD to prevent broken translations from being merged.

### TypeScript Testing

TypeScript will catch invalid translation keys at compile time:

```tsx
// ❌ This will show TypeScript error
const invalid = t("nonexistent.key");

// ✅ This works - valid key
const valid = t("settings.title");
```

## Best Practices

### For Developers

1. **Always validate** after making translation changes
2. **Use TypeScript** to catch key errors early
3. **Test in multiple languages** during development
4. **Keep keys descriptive** and self-documenting
5. **Group related translations** logically

### For Translators

1. **Understand context** before translating
2. **Maintain consistency** with existing translations
3. **Keep UI constraints** in mind (button sizes, etc.)
4. **Use natural language** for the target audience
5. **Test your translations** in the actual UI

### Common Pitfalls

- ❌ Adding translations only to one language
- ❌ Using hardcoded strings instead of translation keys
- ❌ Breaking the JSON structure with syntax errors
- ❌ Using overly literal translations that sound unnatural
- ❌ Not testing translations in the actual UI context

## Troubleshooting

### Validation Errors

**JSON Parse Error**:

```
💥 TR: Parse Error
   Error: Unexpected token } in JSON
```

→ Check for missing commas, extra commas, or invalid JSON syntax

**Missing Keys**:

```
🚫 Missing keys (1):
   - settings.newFeature
```

→ Add the missing key to the specified language file

**Extra Keys**:

```
➕ Extra keys (1):
   - settings.oldFeature
```

→ Remove the extra key or add it to the reference language

### TypeScript Errors

**Invalid translation key**:

```typescript
// Error: Argument of type '"invalid.key"' is not assignable to parameter of type 'TranslationKeys'
const text = t("invalid.key");
```

→ Check the key exists in the English translation file

### Runtime Issues

**Missing translation displays key**:
If you see `"settings.title"` instead of `"Settings"` in the UI:

1. Check the key exists in the current language file
2. Verify the language is properly loaded
3. Check for typos in the translation key

## Contributing

When contributing translations:

1. Fork the repository
2. Add your translations following the established patterns
3. Run `npm run validate-translations` to ensure consistency
4. Test your translations in the UI
5. Submit a pull request with a clear description

## Migration from Old System

If migrating from a previous translation system:

1. Export existing translations to JSON format
2. Restructure to match the current key organization
3. Run validation to identify issues
4. Update component code to use new translation keys
5. Validate and test thoroughly

---

_For technical questions about the translation system, please refer to the source code in `src/core/i18n/` or open an issue on GitHub._
├── index.ts # Main i18n configuration
├── types.ts # TypeScript type definitions
├── translations.ts # Type-safe translation loader
├── validator.ts # Runtime validation utility
├── hooks.ts # Custom translation hooks
└── locales/
├── en.json # English (reference)
├── es.json # Spanish
├── fr.json # French
├── de.json # German
└── tr.json # Turkish

````

## Using Translations in Components

### Basic Usage

```tsx
import { useTranslation } from "react-i18next";

function MyComponent() {
    const { t } = useTranslation();

    return (
        <div>
            <h1>{t("settings.title")}</h1>
            <p>{t("general.description")}</p>
        </div>
    );
}
````

### With Interpolation

```tsx
// For dynamic values
<p>{t('home.byArtist', { artist: 'The Beatles' })}</p>
// Renders: "by The Beatles"

<span>{t('home.downloadingUpdate', { percent: 45 })}</span>
// Renders: "Downloading update... 45%"
```

### Nested Keys

```tsx
// Access nested translation keys
<p>{t('commands.sr.description')}</p>
<p>{t('authentication.status')}</p>
```

## Adding New Translations

### 1. Add to English Reference

First, add your new key to `src/core/i18n/locales/en.json`:

```json
{
    "mySection": {
        "title": "My New Section",
        "description": "This is a new feature"
    }
}
```

### 2. Update TypeScript Types

Add the corresponding type to `src/core/i18n/types.ts`:

```typescript
export interface TranslationKeys {
    // ...existing keys...
    mySection: {
        title: string;
        description: string;
    };
}
```

### 3. Add to All Language Files

Add the same structure to all other language files:

- `es.json` - Spanish translations
- `fr.json` - French translations
- `de.json` - German translations
- `tr.json` - Turkish translations

### 4. Validate Translations

Run the validation script to ensure all files have matching keys:

```bash
npm run validate-translations
```

## Validation System

### Automatic Validation

- **Development Mode**: Validation runs automatically when the app starts
- **Build Time**: Manual validation with `npm run validate-translations`
- **TypeScript**: Compile-time type checking ensures structure matches

### Manual Validation

```bash
# Check all translation files
npm run validate-translations

# Expected output for valid files:
✅ All translation files are valid!
```

### Validation Errors

If validation fails, you'll see detailed output:

```
❌ SPANISH: Validation failed
   Missing keys (2):
     - home.newFeature
     - settings.newOption
   Extra keys (1):
     - outdated.oldKey
```

## Type Safety

### Compile-Time Checking

All translation files are type-checked at compile time:

```typescript
// This will fail compilation if structure doesn't match
const translations: TranslationKeys = require("./locales/es.json");
```

### IntelliSense Support

Get autocomplete for translation keys:

```tsx
const { t } = useTranslation();
// TypeScript will suggest available keys
t("settings."); // Autocomplete shows: title, general, secrets, etc.
```

## Language Switching

### Programmatic

```tsx
import { useTranslation } from "react-i18next";

function LanguageSwitcher() {
    const { i18n } = useTranslation();

    const switchToSpanish = () => {
        i18n.changeLanguage("es");
    };

    return <button onClick={switchToSpanish}>Español</button>;
}
```

### UI Component

Use the built-in `LanguageSelector` component:

```tsx
import LanguageSelector from "@/ui/components/LanguageSelector";

// Renders a dropdown with all supported languages
<LanguageSelector />;
```

## Best Practices

### 1. Use Descriptive Keys

```json
// ❌ Bad - unclear meaning
{
    "btn1": "Save",
    "txt": "Enter name"
}

// ✅ Good - clear hierarchy
{
    "buttons": {
        "save": "Save",
        "cancel": "Cancel"
    },
    "forms": {
        "enterName": "Enter your name"
    }
}
```

### 2. Group Related Keys

```json
{
    "authentication": {
        "title": "Authentication",
        "login": "Log In",
        "logout": "Log Out",
        "status": "Status"
    }
}
```

### 3. Use Interpolation for Dynamic Content

```json
{
    "messages": {
        "welcome": "Welcome, {{username}}!",
        "itemCount": "{{count}} items found"
    }
}
```

### 4. Keep Keys Consistent

Ensure the same logical structure across all language files.

## Troubleshooting

### Common Errors

1. **Missing Keys**: Add missing translations to the language file
2. **Extra Keys**: Remove unused keys from language files
3. **JSON Syntax**: Check for missing commas, quotes, or brackets
4. **Type Mismatch**: Ensure the structure matches `TranslationKeys` interface

### Debug Mode

Enable debug logging in development:

```typescript
// In src/core/i18n/index.ts
debug: process.env.NODE_ENV === "development";
```

This will log missing keys and other i18n issues to the console.

## Migration Guide

### From Hardcoded Strings

1. Identify all hardcoded text in your component
2. Add translation keys to English reference file
3. Update TypeScript types
4. Replace hardcoded strings with `t()` calls
5. Add translations to all language files
6. Run validation to confirm

### Example Migration

```tsx
// Before
function Settings() {
    return <h1>Settings</h1>;
}

// After
function Settings() {
    const { t } = useTranslation();
    return <h1>{t("settings.title")}</h1>;
}
```

## Contributing Translations

1. Fork the repository
2. Add your language file in `src/core/i18n/locales/`
3. Update supported languages in `src/core/i18n/translations.ts`
4. Add the language to the TypeScript types
5. Run validation to ensure completeness
6. Submit a pull request

The validation system ensures that all translations maintain consistency and completeness across the entire application.
