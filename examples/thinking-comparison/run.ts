// Example: Demonstrates how thinking levels affect extraction accuracy
//
// Task: Extract solution to a multi-step logic puzzle that requires reasoning
// Compare results with thinking: "off" vs "high"
//
// Run:
//   npm run build
//   npx tsx examples/thinking-comparison/run.ts
//
// Or specify provider/model:
//   npx tsx examples/thinking-comparison/run.ts google-antigravity gemini-3-pro-low
//   npx tsx examples/thinking-comparison/run.ts openai-codex gpt-5.1-codex-mini

import { extract, type Static, type ThinkingLevel, Type } from "@justram/pie";
import { getModels, type Model } from "@mariozechner/pi-ai";

import { ensureOAuthApiKey } from "../_shared/oauth.js";

type SupportedProvider = "openai-codex" | "google-antigravity";

// -----------------------------
// Multi-Step Math Word Problem
// Requires careful reasoning to avoid common errors
// -----------------------------
const PROBLEM = `
## Investment Portfolio Analysis

A venture fund made 5 investments over 3 years. Calculate the final portfolio metrics.

Investment Timeline:
- Year 1: Invested $2M in Company A at $10/share, $1.5M in Company B at $15/share
- Year 2: Company A did 3:1 stock split. Invested additional $1M in Company C at $25/share
- Year 3: Company B did reverse 1:2 stock split (shares halved, price doubled)

Current Prices:
- Company A: $8/share (post-split price)
- Company B: $45/share (post-reverse-split price)  
- Company C: $18/share

Calculate:
1. Total shares owned in each company (accounting for splits)
2. Current value of each position
3. Total portfolio value
4. Overall gain/loss percentage

Important: Stock splits multiply shares (3:1 means 3x shares, 1/3 price).
Reverse splits divide shares (1:2 means 0.5x shares, 2x price).
`;

// -----------------------------
// Schema
// -----------------------------
const PositionSchema = Type.Object({
	company: Type.String({ enum: ["A", "B", "C"] }),
	initialInvestment: Type.Number({ description: "Original investment in dollars" }),
	sharesOwned: Type.Number({ description: "Current shares after splits" }),
	currentPrice: Type.Number({ description: "Current price per share" }),
	currentValue: Type.Number({ description: "Current position value" }),
	gainLoss: Type.Number({ description: "Gain/loss in dollars" }),
});

const PortfolioSchema = Type.Object({
	positions: Type.Array(PositionSchema, { minItems: 3, maxItems: 3 }),
	totalInvested: Type.Number({ description: "Sum of all initial investments" }),
	totalCurrentValue: Type.Number({ description: "Sum of all current values" }),
	totalGainLoss: Type.Number({ description: "Total gain/loss in dollars" }),
	overallReturnPercent: Type.Number({ description: "Overall return as percentage" }),
	workings: Type.String({ description: "Show calculation steps" }),
});

type Portfolio = Static<typeof PortfolioSchema>;

// -----------------------------
// Expected Solution (verified by hand)
// -----------------------------
const EXPECTED = {
	companyA: { shares: 600000, value: 4800000, gainLoss: 2800000 },
	companyB: { shares: 50000, value: 2250000, gainLoss: 750000 },
	companyC: { shares: 40000, value: 720000, gainLoss: -280000 },
	totalInvested: 4500000,
	totalValue: 7770000,
	totalGainLoss: 3270000,
	returnPercent: 72.67,
};

// -----------------------------
// Validation
// -----------------------------
function validatePortfolio(data: Portfolio): void {
	const tolerance = 0.01; // Allow 1% tolerance for rounding

	const check = (name: string, actual: number, expected: number) => {
		const diff = Math.abs(actual - expected) / Math.max(Math.abs(expected), 1);
		if (diff > tolerance) {
			throw new Error(`${name}: expected ${expected}, got ${actual} (${(diff * 100).toFixed(1)}% off)`);
		}
	};

	const posA = data.positions.find((p) => p.company === "A");
	const posB = data.positions.find((p) => p.company === "B");
	const posC = data.positions.find((p) => p.company === "C");

	if (!posA || !posB || !posC) {
		throw new Error("Missing positions for companies A, B, or C");
	}

	// Check individual positions
	check("Company A shares", posA.sharesOwned, EXPECTED.companyA.shares);
	check("Company A value", posA.currentValue, EXPECTED.companyA.value);

	check("Company B shares", posB.sharesOwned, EXPECTED.companyB.shares);
	check("Company B value", posB.currentValue, EXPECTED.companyB.value);

	check("Company C shares", posC.sharesOwned, EXPECTED.companyC.shares);
	check("Company C value", posC.currentValue, EXPECTED.companyC.value);

	// Check totals
	check("Total invested", data.totalInvested, EXPECTED.totalInvested);
	check("Total current value", data.totalCurrentValue, EXPECTED.totalValue);
	check("Total gain/loss", data.totalGainLoss, EXPECTED.totalGainLoss);
	check("Return percentage", data.overallReturnPercent, EXPECTED.returnPercent);
}

// -----------------------------
// Run extraction with different thinking levels
// -----------------------------
async function runWithThinking(options: { model: Model<any>; apiKey: string; thinkingLevel: ThinkingLevel }): Promise<{
	success: boolean;
	result?: Portfolio;
	error?: string;
	turns: number;
	tokens: number;
	cost: number;
	timeMs: number;
}> {
	const start = Date.now();

	const prompt = [
		"Analyze the investment portfolio and calculate all metrics.",
		"Be very careful with stock split calculations:",
		"- A 3:1 split means shareholders get 3 shares for every 1 share owned",
		"- A 1:2 reverse split means shareholders get 1 share for every 2 shares owned",
		"Show your work step by step in the 'workings' field.",
	].join("\n");

	try {
		const stream = extract<Portfolio>(PROBLEM, {
			schema: PortfolioSchema,
			prompt,
			model: options.model,
			apiKey: options.apiKey,
			thinking: options.thinkingLevel,
			thinkingBudgets: { high: 16000 },
			maxTurns: 3,
			validate: validatePortfolio,
		});

		let result: Portfolio | undefined;
		let turns = 0;
		let tokens = 0;
		let cost = 0;
		let errorMsg: string | undefined;

		for await (const event of stream) {
			if (event.type === "turn_start") {
				console.log(`  [Turn ${event.turn}] Started`);
			}
			if (event.type === "llm_start") {
				process.stderr.write("  waiting for model...");
			}
			if (event.type === "thinking") {
				process.stderr.write(event.text);
			}
			if (event.type === "llm_delta") {
				process.stderr.write(event.delta);
			}
			if (event.type === "complete") {
				process.stderr.write("\n"); // Ensure newline after thinking
				result = event.result;
				turns = event.turns;
				tokens = event.usage.totalTokens;
				cost = event.usage.cost;
			}
			if (event.type === "error") {
				process.stderr.write("\n"); // Ensure newline after thinking
				errorMsg = event.error.message;
				turns = event.turns;
			}
			if (event.type === "warning") {
				console.error(`  Warning: ${event.message}`);
			}
			if (event.type === "validation_error") {
				console.error(`  [${options.thinkingLevel}] Validation: ${event.error}`);
			}
			if (event.type === "turn_end" && !event.hasResult) {
				console.error(`  [${options.thinkingLevel}] Turn ${event.turn} failed, retrying...`);
			}
		}

		return {
			success: !!result,
			result,
			error: errorMsg,
			turns,
			tokens,
			cost,
			timeMs: Date.now() - start,
		};
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : String(error),
			turns: 0,
			tokens: 0,
			cost: 0,
			timeMs: Date.now() - start,
		};
	}
}

function formatCurrency(n: number): string {
	return `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

async function main(): Promise<void> {
	const [providerArg, modelIdArg] = process.argv.slice(2);

	const provider: SupportedProvider = (providerArg as SupportedProvider | undefined) ?? "google-antigravity";
	const defaultModelId = provider === "openai-codex" ? "gpt-5.2" : "gemini-3-pro-low";
	const modelId = modelIdArg ?? defaultModelId;

	const model = getModels(provider).find((m) => m.id === modelId) as Model<any> | undefined;
	if (!model) {
		throw new Error(`Unknown model: ${provider}:${modelId}`);
	}

	console.log(`Model: ${provider}:${modelId} (reasoning: ${model.reasoning ? "yes" : "no"})`);

	const apiKey = await ensureOAuthApiKey(provider);

	console.log(`\n${"=".repeat(70)}`);
	console.log("PROBLEM: Multi-step portfolio calculation with stock splits");
	console.log("=".repeat(70));
	console.log(PROBLEM);

	const levels: ThinkingLevel[] = ["off", "high"];
	const results: Record<string, Awaited<ReturnType<typeof runWithThinking>>> = {};

	for (const level of levels) {
		console.log(`\n${"-".repeat(50)}`);
		console.log(`Running with thinking: "${level}"`);
		console.log("-".repeat(50));

		results[level] = await runWithThinking({ model, apiKey, thinkingLevel: level });
		const r = results[level];

		if (r.success && r.result) {
			console.log("\nSUCCESS");
			console.log(
				`   Turns: ${r.turns} | Tokens: ${r.tokens.toLocaleString()} | Cost: $${r.cost.toFixed(4)} | Time: ${(r.timeMs / 1000).toFixed(1)}s`,
			);
			console.log("\n   Positions:");
			for (const p of r.result.positions) {
				const gainLabel = p.gainLoss >= 0 ? "gain" : "loss";
				console.log(
					`   Company ${p.company}: ${p.sharesOwned.toLocaleString()} shares @ $${p.currentPrice} = ${formatCurrency(p.currentValue)} (${gainLabel} ${formatCurrency(p.gainLoss)})`,
				);
			}
			console.log(`\n   Total Invested: ${formatCurrency(r.result.totalInvested)}`);
			console.log(`   Current Value:  ${formatCurrency(r.result.totalCurrentValue)}`);
			console.log(`   Return:         ${r.result.overallReturnPercent.toFixed(2)}%`);
		} else {
			console.log("\nFAILED");
			console.log(`   ${r.error}`);
			console.log(`   Time: ${(r.timeMs / 1000).toFixed(1)}s`);
		}
	}

	// Summary comparison
	console.log(`\n${"=".repeat(70)}`);
	console.log("COMPARISON SUMMARY");
	console.log("=".repeat(70));
	console.log("\n| Thinking | Success | Turns | Tokens    | Cost     | Time   |");
	console.log("|----------|---------|-------|-----------|----------|--------|");
	for (const level of levels) {
		const r = results[level];
		console.log(
			`| ${level.padEnd(8)} | ${r.success ? "Yes" : "No "}     | ${String(r.turns).padStart(5)} | ${String(r.tokens.toLocaleString()).padStart(9)} | $${r.cost.toFixed(4).padStart(6)} | ${(r.timeMs / 1000).toFixed(1).padStart(5)}s |`,
		);
	}

	console.log(`\n${"=".repeat(70)}`);
	console.log("EXPECTED ANSWER (for reference):");
	console.log("=".repeat(70));
	console.log("Company A: 600,000 shares × $8 = $4,800,000 (+$2,800,000)");
	console.log("Company B: 50,000 shares × $45 = $2,250,000 (+$750,000)");
	console.log("Company C: 40,000 shares × $18 = $720,000 (-$280,000)");
	console.log("Total: $7,770,000 from $4,500,000 invested = 72.67% return");
}

void main().catch((error) => {
	const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
	console.error(message);
	process.exitCode = 1;
});
