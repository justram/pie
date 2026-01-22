import simpleImportSort from "eslint-plugin-simple-import-sort";
import tsParser from "@typescript-eslint/parser";

/** @type {import("eslint").Linter.FlatConfig[]} */
export default [
	{
		files: ["**/*.ts"],
		ignores: ["dist/**", "node_modules/**"],
		languageOptions: {
			parser: tsParser,
			ecmaVersion: "latest",
			sourceType: "module"
		},
		plugins: {
			"simple-import-sort": simpleImportSort
		},
		rules: {
			"simple-import-sort/imports": [
				"error",
				{
					groups: [
						["^node:"],
						["^@?\\w"],
						["^\\.\\.(?!/?$)", "^\\.\\./?$"],
						["^\\./(?=.*/)(?!/?$)", "^\\.(?!/?$)", "^\\./?$"],
						["^.+\\u0000$"]
					]
				}
			],
			"simple-import-sort/exports": "error"
		}
	}
];
