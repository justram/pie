import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

import { parseFrontmatter } from "../core/frontmatter.js";
import type { ExtractionSetup, LoadExtractionSetupOptions } from "../core/setup.js";
import { loadExtractionSetup } from "../core/setup.js";
import type { ExtractOptions } from "../core/types.js";

const RECIPE_FILE_NAME = "RECIPE.md";
const MAX_NAME_LENGTH = 64;
const MAX_DESCRIPTION_LENGTH = 1024;
const ALLOWED_FRONTMATTER_FIELDS = new Set(["name", "description", "metadata"]);

export interface RecipeFrontmatter {
	name?: string;
	description?: string;
	[key: string]: unknown;
}

export interface Recipe {
	name: string;
	description: string;
	filePath: string;
	baseDir: string;
	source: string;
}

export interface RecipeWarning {
	recipePath: string;
	message: string;
}

export interface LoadRecipesOptions {
	cwd?: string;
	customDirectories?: string[];
}

export interface LoadRecipesResult {
	recipes: Recipe[];
	warnings: RecipeWarning[];
}

export interface LoadRecipeSetupOptions<T> {
	setupFile?: string;
	vars?: Record<string, unknown>;
	overrides?: Partial<Omit<ExtractOptions<T>, "prompt" | "schema">>;
}

export function loadRecipes(options: LoadRecipesOptions = {}): LoadRecipesResult {
	const cwd = options.cwd ?? process.cwd();
	const customDirectories = options.customDirectories ?? [];
	const sources: Array<{ dir: string; source: string }> = [
		{ dir: join(homedir(), ".pie", "recipes"), source: "pie-user" },
		{ dir: resolve(cwd, ".pie", "recipes"), source: "pie-project" },
		...customDirectories.map((dir) => ({ dir: expandHome(dir), source: "custom" })),
	];

	const recipesByName = new Map<string, Recipe>();
	const warnings: RecipeWarning[] = [];

	for (const entry of sources) {
		const result = loadRecipesFromDir(entry.dir, entry.source);
		warnings.push(...result.warnings);
		for (const recipe of result.recipes) {
			const existing = recipesByName.get(recipe.name);
			if (existing) {
				warnings.push({
					recipePath: recipe.filePath,
					message: `Recipe "${recipe.name}" overrides ${existing.filePath}.`,
				});
			}
			recipesByName.set(recipe.name, recipe);
		}
	}

	return {
		recipes: Array.from(recipesByName.values()),
		warnings,
	};
}

export function resolveRecipe(name: string, options: LoadRecipesOptions = {}): Recipe | undefined {
	const { recipes } = loadRecipes(options);
	return recipes.find((recipe) => recipe.name === name);
}

export function loadRecipeSetup<T>(recipe: Recipe, options: LoadRecipeSetupOptions<T> = {}): ExtractionSetup<T> {
	const setupFile = options.setupFile ?? "setup.md";
	const setupPath = resolve(recipe.baseDir, setupFile);
	const setupOptions: LoadExtractionSetupOptions<T> = {
		vars: options.vars,
		overrides: options.overrides,
	};
	return loadExtractionSetup<T>(setupPath, setupOptions);
}

function loadRecipesFromDir(dir: string, source: string): LoadRecipesResult {
	const recipes: Recipe[] = [];
	const warnings: RecipeWarning[] = [];

	if (!existsSync(dir)) {
		return { recipes, warnings };
	}

	try {
		const entries = readdirSync(dir, { withFileTypes: true });

		for (const entry of entries) {
			if (entry.name.startsWith(".")) {
				continue;
			}

			if (entry.name === "node_modules") {
				continue;
			}

			const fullPath = join(dir, entry.name);

			let isDirectory = entry.isDirectory();
			let isFile = entry.isFile();
			if (entry.isSymbolicLink()) {
				try {
					const stats = statSync(fullPath);
					isDirectory = stats.isDirectory();
					isFile = stats.isFile();
				} catch {
					continue;
				}
			}

			if (isDirectory) {
				const subResult = loadRecipesFromDir(fullPath, source);
				recipes.push(...subResult.recipes);
				warnings.push(...subResult.warnings);
				continue;
			}

			if (isFile && entry.name === RECIPE_FILE_NAME) {
				const result = loadRecipeFromFile(fullPath, source);
				if (result.recipe) {
					recipes.push(result.recipe);
				}
				warnings.push(...result.warnings);
			}
		}
	} catch {}

	return { recipes, warnings };
}

function loadRecipeFromFile(filePath: string, source: string): { recipe: Recipe | null; warnings: RecipeWarning[] } {
	const warnings: RecipeWarning[] = [];

	try {
		const rawContent = readFileSync(filePath, "utf-8");
		const { frontmatter } = parseFrontmatter(rawContent) as { frontmatter: RecipeFrontmatter; body: string };
		const allKeys = Object.keys(frontmatter);
		const recipeDir = dirname(filePath);
		const parentDirName = basename(recipeDir);

		const fieldErrors = validateFrontmatterFields(allKeys);
		for (const error of fieldErrors) {
			warnings.push({ recipePath: filePath, message: error });
		}

		const descErrors = validateDescription(frontmatter.description);
		for (const error of descErrors) {
			warnings.push({ recipePath: filePath, message: error });
		}

		const name = frontmatter.name ?? parentDirName;
		const nameErrors = validateName(name, parentDirName);
		for (const error of nameErrors) {
			warnings.push({ recipePath: filePath, message: error });
		}

		if (!frontmatter.description || frontmatter.description.trim() === "") {
			return { recipe: null, warnings };
		}

		return {
			recipe: {
				name,
				description: frontmatter.description,
				filePath,
				baseDir: recipeDir,
				source,
			},
			warnings,
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : "failed to parse recipe file";
		warnings.push({ recipePath: filePath, message });
		return { recipe: null, warnings };
	}
}

function validateFrontmatterFields(keys: string[]): string[] {
	const errors: string[] = [];
	for (const key of keys) {
		if (!ALLOWED_FRONTMATTER_FIELDS.has(key)) {
			errors.push(`unknown frontmatter field "${key}"`);
		}
	}
	return errors;
}

function validateDescription(description: string | undefined): string[] {
	const errors: string[] = [];
	if (!description || description.trim() === "") {
		errors.push("description is required");
	} else if (description.length > MAX_DESCRIPTION_LENGTH) {
		errors.push(`description exceeds ${MAX_DESCRIPTION_LENGTH} characters (${description.length})`);
	}
	return errors;
}

function validateName(name: string, parentDirName: string): string[] {
	const errors: string[] = [];
	if (name !== parentDirName) {
		errors.push(`name "${name}" does not match parent directory "${parentDirName}"`);
	}
	if (name.length > MAX_NAME_LENGTH) {
		errors.push(`name exceeds ${MAX_NAME_LENGTH} characters (${name.length})`);
	}
	if (!/^[a-z0-9-]+$/.test(name)) {
		errors.push("name contains invalid characters (must be lowercase a-z, 0-9, hyphens only)");
	}
	if (name.startsWith("-") || name.endsWith("-")) {
		errors.push("name must not start or end with a hyphen");
	}
	if (name.includes("--")) {
		errors.push("name must not contain consecutive hyphens");
	}
	return errors;
}

function expandHome(path: string): string {
	if (path === "~") {
		return homedir();
	}
	if (path.startsWith("~/")) {
		return join(homedir(), path.slice(2));
	}
	return path;
}
