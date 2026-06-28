import * as ts from 'typescript';

const LOGGER_METHODS = new Set(['debug', 'error', 'info', 'warn']);

const DISALLOWED_LOG_NAMES = new Set([
  'alternateUrl',
  'alternateUrls',
  'canonicalUrl',
  'currentUrl',
  'data',
  'documentTitle',
  'href',
  'metadata',
  'normalizedUrl',
  'pageTitle',
  'payload',
  'response',
  'sender',
  'sourceUrl',
  'syncState',
  'tab',
  'tabTitle',
  'targetUrl',
  'title',
  'url',
]);

export interface PrivacyLoggingViolation {
  filePath: string;
  line: number;
  column: number;
  message: string;
}

export function analyzePrivacyLoggingSource(
  filePath: string,
  sourceText: string,
): Array<PrivacyLoggingViolation> {
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    getScriptKind(filePath),
  );

  const violations: Array<PrivacyLoggingViolation> = [];
  const seenViolations = new Set<string>();

  function report(node: ts.Node, name: string): void {
    const start = node.getStart(sourceFile);
    const key = `${start}:${name}`;

    if (seenViolations.has(key)) {
      return;
    }

    seenViolations.add(key);

    const position = sourceFile.getLineAndCharacterOfPosition(start);
    violations.push({
      filePath,
      line: position.line + 1,
      column: position.character + 1,
      message: `Do not log "${name}". Log tabId, mode, reason, counts, booleans, or sanitized domain instead.`,
    });
  }

  function inspectExpression(expression: ts.Expression): void {
    const unsafeName = findUnsafeExpressionName(expression);

    if (unsafeName) {
      report(expression, unsafeName);
    }
  }

  function inspectObjectLiteral(expression: ts.ObjectLiteralExpression): void {
    for (const property of expression.properties) {
      if (ts.isShorthandPropertyAssignment(property)) {
        if (DISALLOWED_LOG_NAMES.has(property.name.text)) {
          report(property.name, property.name.text);
        }

        continue;
      }

      if (ts.isPropertyAssignment(property)) {
        const propertyName = getPropertyNameText(property.name);

        if (propertyName && DISALLOWED_LOG_NAMES.has(propertyName)) {
          report(property.name, propertyName);
          continue;
        }

        inspectExpression(property.initializer);
        continue;
      }

      if (ts.isSpreadAssignment(property)) {
        inspectExpression(property.expression);
      }
    }
  }

  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node) && isLoggerCall(node)) {
      for (const argument of node.arguments.slice(1)) {
        if (ts.isObjectLiteralExpression(argument)) {
          inspectObjectLiteral(argument);
          continue;
        }

        inspectExpression(argument);
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  return violations;
}

export function formatPrivacyLoggingViolation(violation: PrivacyLoggingViolation): string {
  return `${violation.filePath}:${violation.line}:${violation.column} ${violation.message}`;
}

function getScriptKind(filePath: string): ts.ScriptKind {
  if (filePath.endsWith('.tsx')) {
    return ts.ScriptKind.TSX;
  }

  if (filePath.endsWith('.jsx')) {
    return ts.ScriptKind.JSX;
  }

  if (filePath.endsWith('.js')) {
    return ts.ScriptKind.JS;
  }

  return ts.ScriptKind.TS;
}

function isLoggerCall(node: ts.CallExpression): boolean {
  if (!ts.isPropertyAccessExpression(node.expression)) {
    return false;
  }

  return (
    ts.isIdentifier(node.expression.expression) &&
    node.expression.expression.text === 'logger' &&
    LOGGER_METHODS.has(node.expression.name.text)
  );
}

function getPropertyNameText(name: ts.PropertyName): string | null {
  if (
    ts.isIdentifier(name) ||
    ts.isStringLiteral(name) ||
    ts.isNoSubstitutionTemplateLiteral(name) ||
    ts.isNumericLiteral(name)
  ) {
    return name.text;
  }

  return null;
}

function findUnsafeExpressionName(expression: ts.Expression): string | null {
  if (ts.isIdentifier(expression)) {
    return DISALLOWED_LOG_NAMES.has(expression.text) ? expression.text : null;
  }

  if (ts.isPropertyAccessExpression(expression)) {
    const rootSensitiveName = findSensitiveRootName(expression);

    if (rootSensitiveName) {
      return rootSensitiveName;
    }

    const expressionName = findDirectBrowserDataName(expression);

    if (expressionName) {
      return expressionName;
    }

    return null;
  }

  if (ts.isElementAccessExpression(expression)) {
    const targetName = findUnsafeExpressionName(expression.expression);

    if (targetName) {
      return targetName;
    }

    if (ts.isExpression(expression.argumentExpression)) {
      return findUnsafeExpressionName(expression.argumentExpression);
    }
  }

  let nestedUnsafeName: string | null = null;

  expression.forEachChild((child) => {
    if (nestedUnsafeName || !ts.isExpression(child)) {
      return;
    }

    nestedUnsafeName = findUnsafeExpressionName(child);
  });

  return nestedUnsafeName;
}

function findSensitiveRootName(expression: ts.PropertyAccessExpression): string | null {
  const names = getPropertyAccessNames(expression);

  if (!names || names.length < 2) {
    return null;
  }

  if (matchesPropertyAccessPath(names, ['payload', 'url'])) {
    return names[0];
  }

  if (matchesPropertyAccessPath(names, ['tab', 'url'])) {
    return names[0];
  }

  if (matchesPropertyAccessPath(names, ['tab', 'title'])) {
    return names[0];
  }

  return null;
}

function findDirectBrowserDataName(expression: ts.PropertyAccessExpression): string | null {
  const names = getPropertyAccessNames(expression);

  if (!names) {
    return null;
  }

  if (matchesPropertyAccessPath(names, ['document', 'title'])) {
    return names[names.length - 1];
  }

  if (matchesPropertyAccessPath(names, ['location', 'href'])) {
    return names[names.length - 1];
  }

  if (matchesPropertyAccessPath(names, ['window', 'location', 'href'])) {
    return names[names.length - 1];
  }

  return null;
}

function matchesPropertyAccessPath(names: Array<string>, expectedPath: Array<string>): boolean {
  if (names.length !== expectedPath.length) {
    return false;
  }

  return expectedPath.every((part, index) => names[index] === part);
}

function getPropertyAccessNames(expression: ts.PropertyAccessExpression): Array<string> | null {
  const names = new Array<string>();
  let current: ts.Expression = expression;

  while (ts.isPropertyAccessExpression(current)) {
    names.unshift(current.name.text);
    current = current.expression;
  }

  if (!ts.isIdentifier(current)) {
    return null;
  }

  names.unshift(current.text);

  return names;
}
