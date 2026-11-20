"use strict";
// Local component test renderer, not an application bundler or dev server.
// Transpiles the actual TSX source with installed TypeScript and loads installed
// React's actual CommonJS modules in the browser. No app entry/profile imports.
const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");
const { pathToFileURL } = require("node:url");
const ts = require("typescript");
const root = path.resolve(__dirname, "..");
const entryIndex = process.argv.indexOf("--entry");
const entry = entryIndex >= 0 ? path.resolve(process.argv[entryIndex + 1]) : path.join(root, "src/ui/components/studio/preview/StudioPreview.tsx");
const outIndex = process.argv.indexOf("--out");
const extraCssIndex = process.argv.indexOf("--extra-css");
const extraCss = extraCssIndex >= 0 ? path.resolve(process.argv[extraCssIndex + 1]) : null;
const settingsEntry = /settingsPreview\.tsx$|appGallery\.tsx$/.test(entry);
const output = outIndex >= 0 ? path.resolve(process.argv[outIndex + 1]) : path.join(process.env.LOCALAPPDATA || root, "Temp/opencode/studio-primitives-preview/index.html");

function renderPreview(out) {
    const modules = new Map();
    const css = new Map();
    function resolve(request, parent) {
        const file = request.startsWith("@/") ? path.join(root, "src", request.slice(2)) : request;
        if (path.isAbsolute(file) || file.startsWith(".")) {
            const absolute = path.isAbsolute(file) ? file : path.resolve(path.dirname(parent), file);
            const choices = [absolute, ...[".ts", ".tsx", ".js", ".css", "/index.ts", "/index.tsx", "/index.js"].map(ext => absolute + ext)];
            const found = choices.find(p => fs.existsSync(p) && fs.statSync(p).isFile());
            if (!found) throw new Error(`Cannot resolve ${request} from ${parent}`);
            return found;
        }
        return createRequire(parent).resolve(request);
    }
    function visit(file) {
        if (modules.has(file)) return;
        // Never traverse arbitrary app code or Node builtins into the preview.
        if (!path.isAbsolute(file) || !file.startsWith(root + path.sep)) throw new Error(`Unsafe preview import: ${file}`);
        const relative = path.relative(root, file).replace(/\\/g, "/");
        const allowedSource = relative.startsWith("src/ui/components/studio/")
            || relative === "src/shared/utils/index.ts"
            || /^src\/features\/(spotify|kick|twitch)\/components\/(Spotify|Kick|Twitch)Icon\.tsx$/.test(relative)
            || (settingsEntry && (
                relative.startsWith("src/ui/")
                || relative.startsWith("src/features/settings/")
                || relative.startsWith("src/features/home/")
                || relative.startsWith("src/core/")
                || relative.startsWith("src/shared/")
                || /^src\/features\/(spotify|kick|twitch)\/components\/(Spotify|Kick|Twitch)Icon\.tsx$/.test(relative)
            ));
        const allowedPackage = /^node_modules\/(react|react-dom|scheduler|clsx|tailwind-merge|lucide-react|i18next|react-i18next|use-sync-external-store|@babel|html-parse-stringify|void-elements)\//.test(relative);
        if (!allowedSource && !allowedPackage) throw new Error(`Non-UI dependency rejected: ${relative}`);
        modules.set(file, { code: "", dependencies: {} });
        if (file.endsWith(".css")) {
            css.set(file, fs.readFileSync(file, "utf8"));
            return;
        }
        if (file.endsWith(".json")) {
            modules.set(file, { code: `module.exports = ${fs.readFileSync(file, "utf8")};`, dependencies: {} });
            return;
        }
        let code = fs.readFileSync(file, "utf8");
        if (/\.tsx?$/.test(file)) code = ts.transpileModule(code, { fileName: file, compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
        const dependencies = {};
        for (const match of code.matchAll(/\brequire\(["']([^"']+)["']\)/g)) {
            const dependency = resolve(match[1], file);
            dependencies[match[1]] = dependency;
            visit(dependency);
        }
        modules.set(file, { code, dependencies });
    }
    const react = require.resolve("react");
    const client = require.resolve("react-dom/client");
    visit(entry); visit(react); visit(client);
    if (extraCss) css.set(extraCss, fs.readFileSync(extraCss, "utf8"));
    const ids = new Map([...modules.keys()].map((file, i) => [file, i]));
    const definitions = [...modules].map(([file, value]) => {
        const dependencyIds = Object.fromEntries(Object.entries(value.dependencies).map(([name, target]) => [name, ids.get(target)]));
        return `${ids.get(file)}:[function(module,exports,require){\n${value.code}\n},${JSON.stringify(dependencyIds)}]`;
    }).join(",\n");
    const script = `(function(){const process={env:{NODE_ENV:'development'}};const global=globalThis;const definitions={${definitions}};const cache={};function load(id){if(cache[id])return cache[id].exports;const [run,deps]=definitions[id];const module={exports:{}};cache[id]=module;run(module,module.exports,name=>{if(!(name in deps))throw Error('Unavailable preview module '+name);return load(deps[name])});return module.exports;}const React=load(${ids.get(react)});const client=load(${ids.get(client)});const Preview=load(${ids.get(entry)}).StudioPreview;const choice=new URLSearchParams(location.search).get('theme');const initialTheme=['light','dark'].includes(choice)?choice:'graphite';client.createRoot(document.getElementById('app')).render(React.createElement(Preview,{initialTheme}));})();`;
    const styles = [...css.values()].join("\n");
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Studio React component preview</title><style>html,body{margin:0;min-height:100%;}body{background:#151719;}\n${styles}</style></head><body><div id="app"></div><script>${script.replace(/<\/script/gi, "<\\/script")}</script></body></html>`;
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, html);
    return { file: out, url: pathToFileURL(out).href, moduleCount: modules.size, cssFiles: [...css.keys()].map(p => path.relative(root, p)) };
}

if (require.main === module) console.log(JSON.stringify(renderPreview(output), null, 2));
module.exports = { renderPreview };




