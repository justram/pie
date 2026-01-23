import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const packagePath = path.join(root, "package.json");
const lockPath = path.join(root, "package-lock.json");

const pkg = JSON.parse(readFileSync(packagePath, "utf-8"));
const version = pkg.version;

const lock = JSON.parse(readFileSync(lockPath, "utf-8"));
let updated = false;

if (lock.version !== version) {
	lock.version = version;
	updated = true;
}

if (lock.packages && lock.packages[""] && lock.packages[""].version !== version) {
	lock.packages[""].version = version;
	updated = true;
}

if (updated) {
	writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`, "utf-8");
}
