import type { ValidatorLayer } from "../events.js";
import type { ExtractOptions } from "../types.js";
import { runCommandValidator } from "./command.js";
import { runHttpValidator } from "./http.js";

export type EmitValidationEvent = (event: { type: "validation_start"; layer: ValidatorLayer }) => void;
export type EmitValidationPassEvent = (event: { type: "validation_pass"; layer: ValidatorLayer }) => void;
export type EmitValidationErrorEvent = (event: {
	type: "validation_error";
	layer: ValidatorLayer;
	error: string;
}) => void;

export interface ValidationEmitter {
	start(layer: ValidatorLayer): void;
	pass(layer: ValidatorLayer): void;
	fail(layer: ValidatorLayer, error: string): void;
}

export function createValidationEmitter(emit: (event: any) => void): ValidationEmitter {
	return {
		start: (layer) => emit({ type: "validation_start", layer }),
		pass: (layer) => emit({ type: "validation_pass", layer }),
		fail: (layer, error) => emit({ type: "validation_error", layer, error }),
	};
}

export async function runValidators<T>(
	data: T,
	options: ExtractOptions<T>,
	emitter: ValidationEmitter,
	signal?: AbortSignal,
): Promise<void> {
	if (options.validate) {
		emitter.start("sync");
		try {
			options.validate(data);
			emitter.pass("sync");
		} catch (e) {
			emitter.fail("sync", e instanceof Error ? e.message : String(e));
			throw e;
		}
	}

	if (options.validateAsync) {
		emitter.start("async");
		try {
			await options.validateAsync(data);
			emitter.pass("async");
		} catch (e) {
			emitter.fail("async", e instanceof Error ? e.message : String(e));
			throw e;
		}
	}

	if (options.validateCommand) {
		emitter.start("command");
		try {
			await runCommandValidator(data, options.validateCommand, signal);
			emitter.pass("command");
		} catch (e) {
			emitter.fail("command", e instanceof Error ? e.message : String(e));
			throw e;
		}
	}

	if (options.validateUrl) {
		emitter.start("http");
		try {
			await runHttpValidator(data, options.validateUrl, signal);
			emitter.pass("http");
		} catch (e) {
			emitter.fail("http", e instanceof Error ? e.message : String(e));
			throw e;
		}
	}
}
