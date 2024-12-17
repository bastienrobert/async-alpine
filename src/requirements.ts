import strategies, {
	type StrategyName,
	type StrategyComponent,
} from './strategies.js';

export interface RequirementComponent extends StrategyComponent {
	name: string;
	strategy: string;
}

// AST types for the parser
export interface BaseRequirementNode {
	type: 'method' | 'expression';
}

export interface ExpressionNode extends BaseRequirementNode {
	type: 'expression';
	operator: '&&' | '||';
	parameters: RequirementNode[];
}

export interface MethodNode extends BaseRequirementNode {
	type: 'method';
	method: StrategyName;
	argument?: string;
}

// Parser token types
export interface BaseToken {
	type: 'parenthesis' | 'operator' | 'method';
}

export interface ParenthesisToken extends BaseToken {
	type: 'parenthesis';
	value: '(' | ')';
}

export interface OperatorToken extends BaseToken {
	type: 'operator';
	value: '&&' | '||' | '|';
}

export interface MethodToken extends BaseToken {
	type: 'method';
	method: StrategyName;
	argument?: string;
}

export type RequirementNode = MethodNode | ExpressionNode;

export type Token = ParenthesisToken | OperatorToken | MethodToken;

/**
 * Split the strategy into unique requirements and resolve the function when they're met
 */
export async function awaitRequirements(component: RequirementComponent) {
	const requirements = parseRequirements(component.strategy);
	await generateRequirements(component, requirements);
}

/**
 * Converts an AST-like map produced by parseRequirements and convert to Promise all/any (and/or)
 */
async function generateRequirements(
	component: RequirementComponent,
	requirements: RequirementNode
): Promise<any> {
	if (requirements.type === 'expression') {
		if (requirements.operator === '&&') {
			return Promise.all(
				requirements.parameters.map((param) =>
					generateRequirements(component, param)
				)
			);
		}

		if (requirements.operator === '||') {
			return Promise.any(
				requirements.parameters.map((param) =>
					generateRequirements(component, param)
				)
			);
		}
	}

	if (requirements.type === 'method') {
		if (!strategies[requirements.method]) {
			return false;
		}

		return strategies[requirements.method]({
			component,
			argument: requirements.argument,
		});
	}

	return false;
}

/**
 *
 * =================================
 * The functions below together take a requirements expression with somewhat JS-like syntax
 * and convert into a structured tree with AND and OR conditions we can process.
 * =================================
 */

function parseRequirements(expression: string): RequirementNode {
	const tokens = tokenize(expression);
	let ast = parseExpression(tokens);

	// Instead of handling the instance with one item separately,
	// we consider it an AND with only one parameter
	if (ast.type === 'method') {
		return {
			type: 'expression',
			operator: '&&',
			parameters: [ast],
		};
	}

	return ast;
}

function tokenize(expression: string): Token[] {
	// This was generated based on a comprehensive list of test strings
	const regex = /\s*([()])\s*|\s*(\|\||&&|\|)\s*|\s*((?:[^()&|]+\([^()]+\))|[^()&|]+)\s*/g;

	const tokens: Token[] = [];

	let match: RegExpExecArray | null;
  
	while ((match = regex.exec(expression)) !== null) {
		const [, parenthesis, operator, token] = match;

		if (parenthesis !== undefined) {
			tokens.push({
				type: 'parenthesis',
				value: parenthesis as ParenthesisToken['value'],
			});
		} else if (operator !== undefined) {
			tokens.push({
				type: 'operator',
				// Make operators backwards-compatible with previous versions
				value:
					operator === '|' ? '&&' : (operator as ExpressionNode['operator']),
			});
		} else {
			const tokenObj: MethodToken = {
				type: 'method',
				method: token.trim() as StrategyName,
			};

			if (token.includes('(')) {
				tokenObj.method = token
					.substring(0, token.indexOf('('))
					.trim() as StrategyName;
				tokenObj.argument = token.substring(
					token.indexOf('(') + 1,
					token.indexOf(')')
				);
			}

			// Backwards compatibility: 'immediate' === 'eager'
			// @ts-expect-error
			if (tokenObj.method === 'immediate') {
				tokenObj.method = 'eager';
			}

			tokens.push(tokenObj);
		}
	}

	return tokens;
}

function parseExpression(tokens: Token[]): RequirementNode {
	let ast = parseTerm(tokens);

	while (
		tokens.length > 0 &&
		tokens[0].type === 'operator' &&
		(tokens[0].value === '&&' ||
			tokens[0].value === '|' ||
			tokens[0].value === '||')
	) {
		const operator = (tokens.shift() as OperatorToken).value;
		const right = parseTerm(tokens);

		if (ast.type === 'expression' && ast.operator === operator) {
			ast.parameters.push(right);
		} else {
			ast = {
				type: 'expression',
				operator: operator as '&&' | '||',
				parameters: [ast, right],
			};
		}
	}

	return ast;
}

function parseTerm(tokens: Token[]): RequirementNode {
	if (
		tokens[0].type === 'parenthesis' &&
		(tokens[0] as ParenthesisToken).value === '('
	) {
		tokens.shift();
		const ast = parseExpression(tokens);

		if (
			tokens[0] &&
			tokens[0].type === 'parenthesis' &&
			(tokens[0] as ParenthesisToken).value === ')'
		) {
			tokens.shift();
		}

		return ast;
	} else {
		return tokens.shift() as RequirementNode;
	}
}
