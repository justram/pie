import type { Api, Model } from "@mariozechner/pi-ai";
import type { TSchema } from "@sinclair/typebox";

type SchemaNode = Record<string, unknown>;

type ProviderWithSchemaConstraints = "google-antigravity" | "google-gemini-cli";

type ProviderRequiringObjectSchema = ProviderWithSchemaConstraints | "openai-codex";

const PROVIDERS_WITH_SCHEMA_CONSTRAINTS = new Set<ProviderWithSchemaConstraints>([
	"google-antigravity",
	"google-gemini-cli",
]);

const PROVIDERS_REQUIRING_OBJECT_SCHEMA = new Set<ProviderRequiringObjectSchema>([
	"google-antigravity",
	"google-gemini-cli",
	"openai-codex",
]);

export type NormalizedToolSchema = {
	schema: TSchema;
	unwrapKey: string | null;
};

const WRAPPED_VALUE_KEY = "value";

export function normalizeToolSchema(model: Model<Api>, schema: TSchema): NormalizedToolSchema {
	let normalizedSchema: TSchema = schema;
	if (PROVIDERS_WITH_SCHEMA_CONSTRAINTS.has(model.provider as ProviderWithSchemaConstraints)) {
		const cloned = deepClone(schema);
		const withoutRefs = resolveRefs(cloned) as TSchema;
		const normalized = normalizeLiterals(withoutRefs);
		normalizedSchema = stripUnsupportedKeywords(normalized) as TSchema;
	}

	if (!PROVIDERS_REQUIRING_OBJECT_SCHEMA.has(model.provider as ProviderRequiringObjectSchema)) {
		return { schema: normalizedSchema, unwrapKey: null };
	}

	return wrapNonObjectSchema(normalizedSchema);
}

function deepClone<T>(value: T): T {
	if (typeof structuredClone === "function") {
		return structuredClone(value);
	}

	return JSON.parse(JSON.stringify(value)) as T;
}

function resolveRefs(schema: unknown): unknown {
	if (!schema || typeof schema !== "object") {
		return schema;
	}

	const root = schema as SchemaNode;
	const defs = (root.$defs as SchemaNode | undefined) ?? (root.definitions as SchemaNode | undefined);
	const seen = new Map<string, unknown>();
	const resolving = new Set<string>();

	const resolveNode = (node: unknown): unknown => {
		if (Array.isArray(node)) {
			return node.map(resolveNode);
		}
		if (!node || typeof node !== "object") {
			return node;
		}

		const obj = node as SchemaNode;
		const ref = typeof obj.$ref === "string" ? obj.$ref : null;
		if (ref) {
			const target = resolveRef(ref, defs);
			if (target) {
				if (seen.has(ref)) {
					return seen.get(ref);
				}
				if (resolving.has(ref)) {
					return obj;
				}
				resolving.add(ref);
				const resolved = resolveNode(target);
				resolving.delete(ref);
				seen.set(ref, resolved);
				return resolved;
			}
		}

		const result: SchemaNode = {};
		for (const [key, value] of Object.entries(obj)) {
			if (key === "$defs" || key === "definitions") {
				continue;
			}
			result[key] = resolveNode(value);
		}
		return result;
	};

	return resolveNode(root);
}

function resolveRef(ref: string, defs: SchemaNode | undefined): unknown | null {
	if (!defs) {
		return null;
	}
	const prefix = ref.startsWith("#/$defs/") ? "#/$defs/" : ref.startsWith("#/definitions/") ? "#/definitions/" : null;
	if (!prefix) {
		return null;
	}

	const key = ref.slice(prefix.length);
	return defs[key];
}

function normalizeLiterals(schema: unknown): unknown {
	if (Array.isArray(schema)) {
		return schema.map(normalizeLiterals);
	}
	if (!schema || typeof schema !== "object") {
		return schema;
	}

	const node = schema as SchemaNode;
	const anyOf = node.anyOf;
	if (Array.isArray(anyOf) && anyOf.length > 0 && anyOf.every(isConstSchema)) {
		const values = anyOf.map((item) => (item as SchemaNode).const);
		const types = collectEnumTypes(anyOf);
		const next: SchemaNode = {};
		for (const [key, value] of Object.entries(node)) {
			if (key === "anyOf") {
				continue;
			}
			next[key] = normalizeLiterals(value);
		}
		next.enum = values;
		if (types.length === 1) {
			next.type = types[0];
		} else if (types.length === 0) {
			delete next.type;
		}
		return next;
	}

	if ("const" in node) {
		const value = node.const;
		const next: SchemaNode = {};
		for (const [key, val] of Object.entries(node)) {
			if (key === "const") {
				continue;
			}
			next[key] = normalizeLiterals(val);
		}
		next.enum = [value];
		return next;
	}

	const result: SchemaNode = {};
	for (const [key, value] of Object.entries(node)) {
		result[key] = normalizeLiterals(value);
	}
	return result;
}

function stripUnsupportedKeywords(schema: unknown): unknown {
	if (Array.isArray(schema)) {
		return schema.map(stripUnsupportedKeywords);
	}
	if (!schema || typeof schema !== "object") {
		return schema;
	}

	const node = schema as SchemaNode;
	const result: SchemaNode = {};
	for (const [key, value] of Object.entries(node)) {
		if (key === "examples") {
			continue;
		}
		result[key] = stripUnsupportedKeywords(value);
	}
	return result;
}

function wrapNonObjectSchema(schema: TSchema): NormalizedToolSchema {
	if (isObjectSchema(schema)) {
		return { schema, unwrapKey: null };
	}

	const wrapped = {
		type: "object",
		properties: {
			[WRAPPED_VALUE_KEY]: schema,
		},
		required: [WRAPPED_VALUE_KEY],
		additionalProperties: false,
	} as unknown as TSchema;

	return { schema: wrapped, unwrapKey: WRAPPED_VALUE_KEY };
}

function isObjectSchema(schema: unknown): boolean {
	if (!schema || typeof schema !== "object") {
		return false;
	}

	const node = schema as SchemaNode;
	if (node.type === "object") {
		return true;
	}
	return "properties" in node;
}

function isConstSchema(node: unknown): boolean {
	return !!node && typeof node === "object" && "const" in (node as SchemaNode);
}

function collectEnumTypes(items: unknown[]): string[] {
	const types = new Set<string>();
	for (const item of items) {
		if (!item || typeof item !== "object") {
			return [];
		}
		const type = (item as SchemaNode).type;
		if (typeof type === "string") {
			types.add(type);
		}
	}
	return Array.from(types);
}
