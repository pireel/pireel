import { parse } from 'acorn';
import type { LookIssue } from './look';

/** Submission-time syntax checking only. No eval, and old stored looks remain repairable. */
export function lookSourceSyntaxIssues(source: string, path: string): LookIssue[] {
  try {
    const ast = parse(`(${source})`, { ecmaVersion: 'latest', sourceType: 'script' });
    const statement = ast.body[0];
    if (ast.body.length !== 1 || statement?.type !== 'ExpressionStatement'
      || !['FunctionExpression', 'ArrowFunctionExpression'].includes(statement.expression.type)) {
      return [{ path, message: 'Submit one function expression, not an invoked function or a sequence of expressions.' }];
    }
    return [];
  } catch (error) {
    return [{ path, message: `JavaScript syntax error: ${error instanceof Error ? error.message : String(error)}. Fix the function source before placing instances.` }];
  }
}
