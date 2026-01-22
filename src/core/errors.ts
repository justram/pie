export class ExtractError extends Error {
	constructor(message: string, options?: { cause?: Error }) {
		super(message, options);
		this.name = "ExtractError";
	}
}

export interface ValidationErrorDetail {
	path: string;
	message: string;
}

export class SchemaValidationError extends ExtractError {
	public readonly errors: ValidationErrorDetail[];

	constructor(message: string, errors: ValidationErrorDetail[], options?: { cause?: Error }) {
		super(message, options);
		this.name = "SchemaValidationError";
		this.errors = errors;
	}
}

export class CommandValidationError extends ExtractError {
	public readonly command: string;
	public readonly exitCode: number;

	constructor(message: string, command: string, exitCode: number, options?: { cause?: Error }) {
		super(message, options);
		this.name = "CommandValidationError";
		this.command = command;
		this.exitCode = exitCode;
	}
}

export class HttpValidationError extends ExtractError {
	public readonly url: string;
	public readonly statusCode: number;

	constructor(message: string, url: string, statusCode: number, options?: { cause?: Error }) {
		super(message, options);
		this.name = "HttpValidationError";
		this.url = url;
		this.statusCode = statusCode;
	}
}

export class MaxTurnsError extends ExtractError {
	public readonly turns: number;
	public readonly lastError?: Error;

	constructor(message: string, turns: number, lastError?: Error, options?: { cause?: Error }) {
		super(message, options);
		this.name = "MaxTurnsError";
		this.turns = turns;
		this.lastError = lastError;
	}
}

export class AbortError extends ExtractError {
	constructor(message: string = "Extraction aborted") {
		super(message);
		this.name = "AbortError";
	}
}
