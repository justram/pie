export interface CliArgs {
	schema?: string;
	prompt?: string;
	promptFile?: string;
	input?: string;
	attachments: string[];
	output?: string;
	model?: string;
	maxTurns?: number;
	validateCommand?: string;
	validateUrl?: string;
	stream?: boolean;
	verbose?: boolean;
	quiet?: boolean;
	jsonSchema?: boolean;
	config?: string;
	recipe?: string;
	recipeConfig?: string;
	recipeVars?: string;
	listRecipes?: boolean;
	login?: string;
	help?: boolean;
	version?: boolean;
}

export interface ParsedArgs {
	args: CliArgs;
	errors: string[];
}

export function parseArgs(argv: string[]): ParsedArgs {
	const args: CliArgs = {
		attachments: [],
	};
	const errors: string[] = [];

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];

		const nextValue = (flag: string): string | undefined => {
			if (i + 1 >= argv.length) {
				errors.push(`Missing value for ${flag}.`);
				return undefined;
			}
			return argv[++i];
		};

		switch (arg) {
			case "-s":
			case "--schema": {
				const value = nextValue(arg);
				if (value) args.schema = value;
				break;
			}
			case "-p":
			case "--prompt": {
				const value = nextValue(arg);
				if (value) args.prompt = value;
				break;
			}
			case "--prompt-file": {
				const value = nextValue(arg);
				if (value) args.promptFile = value;
				break;
			}
			case "-i":
			case "--input": {
				const value = nextValue(arg);
				if (value) args.input = value;
				break;
			}
			case "-a":
			case "--attach": {
				const value = nextValue(arg);
				if (value) args.attachments.push(value);
				break;
			}
			case "-o":
			case "--output": {
				const value = nextValue(arg);
				if (value) args.output = value;
				break;
			}
			case "-m":
			case "--model": {
				const value = nextValue(arg);
				if (value) args.model = value;
				break;
			}
			case "-t":
			case "--max-turns": {
				const value = nextValue(arg);
				if (!value) break;
				const parsed = Number.parseInt(value, 10);
				if (!Number.isFinite(parsed) || parsed <= 0) {
					errors.push(`Invalid value for ${arg}: ${value}`);
				} else {
					args.maxTurns = parsed;
				}
				break;
			}
			case "--validate": {
				const value = nextValue(arg);
				if (value) args.validateCommand = value;
				break;
			}
			case "--validate-url": {
				const value = nextValue(arg);
				if (value) args.validateUrl = value;
				break;
			}
			case "--stream":
				args.stream = true;
				break;
			case "--verbose":
				args.verbose = true;
				break;
			case "--quiet":
				args.quiet = true;
				break;
			case "--json-schema":
				args.jsonSchema = true;
				break;
			case "-c":
			case "--config": {
				const value = nextValue(arg);
				if (value) args.config = value;
				break;
			}
			case "--recipe": {
				const value = nextValue(arg);
				if (value) args.recipe = value;
				break;
			}
			case "--recipe-config": {
				const value = nextValue(arg);
				if (value) args.recipeConfig = value;
				break;
			}
			case "--recipe-vars": {
				const value = nextValue(arg);
				if (value) args.recipeVars = value;
				break;
			}
			case "--list-recipes":
				args.listRecipes = true;
				break;
			case "--login": {
				const value = nextValue(arg);
				if (value) args.login = value;
				break;
			}
			case "-h":
			case "--help":
				args.help = true;
				break;
			case "-v":
			case "--version":
				args.version = true;
				break;
			default:
				if (arg.startsWith("-")) {
					errors.push(`Unknown option: ${arg}`);
				} else {
					errors.push(`Unexpected argument: ${arg}`);
				}
		}
	}

	return { args, errors };
}

export function renderHelp(): string {
	return `pie - Structured extraction CLI

Usage:
  pie [options]

Options:
  -s, --schema <file|json>   JSON Schema (required unless --config)
  -p, --prompt <text>        System prompt (or setup frontmatter + Jinja template)
  --prompt-file <file>       Load prompt or setup document from file
  -i, --input <file>         Input file (default: stdin)
  -a, --attach <file>        Attach file (repeatable) - text or image
  -o, --output <file>        Output file (default: stdout)
  -m, --model <name>         Model name (default: best available)
  -t, --max-turns <n>        Max turns in extraction loop (default: 3)
  --validate <cmd>           Shell validator command
  --validate-url <url>       HTTP validator endpoint
  --stream                   Stream partial JSON to stderr
  --verbose                  Show detailed progress
  --quiet                    Suppress non-essential output
  --json-schema              Output the generated JSON Schema and exit
  -c, --config <file>        Load JS config for advanced extraction
  --recipe <name>            Use a named recipe from ~/.pie/recipes or ./.pie/recipes
  --recipe-config <file>     Use a recipe config file (default: setup.md)
  --recipe-vars <json>       JSON object for recipe template vars
  --list-recipes             List available recipes and exit
  --login <provider>         OAuth login for a provider (e.g. anthropic)
  -h, --help                 Show help
  -v, --version              Show version
`;
}
