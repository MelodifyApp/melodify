"use strict";

/**
 * Applies package metadata from src/shared/brand.json after a product rename.
 * The installer/runtime/forge/signing identity already reads brand.json; this
 * only keeps the npm metadata in sync. Follow with `npm install
 * --package-lock-only` and update prose/docs where the old name appears.
 */

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const brand = JSON.parse(
    fs.readFileSync(path.join(root, "src", "shared", "brand.json"), "utf8")
);
const packagePath = path.join(root, "package.json");
const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));

pkg.name = brand.packageName;
pkg.productName = brand.productName;
pkg.description = brand.description;

fs.writeFileSync(packagePath, `${JSON.stringify(pkg, null, 4)}\n`, "utf8");
console.log(
    `BRAND_APPLIED name=${pkg.name} product=${pkg.productName}; run npm install --package-lock-only`
);
