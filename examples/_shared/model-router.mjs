import { streamSimple } from "@mariozechner/pi-ai";

/**
 * @typedef {import("@mariozechner/pi-ai").Message} Message
 * @typedef {import("@mariozechner/pi-ai").Model} Model
 * @typedef {import("pie").StreamFn} StreamFn
 */

/**
 * @typedef {object} RouterContext
 * @property {number} turn
 * @property {Model<any>} model
 * @property {any} context
 */

/**
 * @typedef {object} ModelRouterOptions
 * @property {(ctx: RouterContext) => Model<any>} selectModel
 * @property {(model: Model<any>) => (string | undefined)} [selectApiKey]
 * @property {(ctx: RouterContext) => any} [transformContext]
 */

/**
 * Create a streamFn that selects a model per turn and optionally transforms the context.
 * @param {ModelRouterOptions} options
 * @returns {StreamFn}
 */
export function createModelRouter(options) {
	let turn = 0;

	return (_baseModel, context, streamOptions) => {
		turn += 1;

		const selectedModel = options.selectModel({ turn, model: _baseModel, context });
		const selectedContext = options.transformContext
			? options.transformContext({ turn, model: selectedModel, context })
			: context;

		streamOptions.onModelSelected?.(selectedModel);

		return streamSimple(selectedModel, selectedContext, {
			...streamOptions,
			apiKey: options.selectApiKey?.(selectedModel) ?? streamOptions.apiKey,
		});
	};
}

/**
 * Strip image parts from messages for text-only models.
 * @param {Message[]} messages
 * @returns {Message[]}
 */
export function stripImagesForTextOnlyModel(messages) {
	return messages.map((message) => {
		if (message.role === "user" && Array.isArray(message.content)) {
			const text = message.content
				.filter((content) => content.type === "text")
				.map((content) => content.text)
				.join("\n")
				.trim();
			return {
				...message,
				content: text || "[image omitted for non-vision model]",
			};
		}
		if (message.role === "toolResult" && Array.isArray(message.content)) {
			const text = message.content
				.filter((content) => content.type === "text")
				.map((content) => content.text)
				.join("\n")
				.trim();
			return {
				...message,
				content: text ? [{ type: "text", text }] : [{ type: "text", text: "[tool result omitted]" }],
			};
		}
		return message;
	});
}
