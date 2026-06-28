import * as ts from 'typescript';

const LOGGER_METHODS = new Set(['debug', 'error', 'info', 'warn']);
const SENSITIVE_MEMBER_SUFFIXES = new Set([
  'alternateUrl',
  'alternateUrls',
  'canonicalUrl',
  'currentUrl',
  'documentTitle',
  'href',
  'normalizedUrl',
  'pageTitle',
  'sourceUrl',
  'tabTitle',
  'targetUrl',
  'title',
  'url',
]);
const SENSITIVE_MEMBER_ROOTS = new Set([
  'data',
  'metadata',
  'payload',
  'response',
  'sender',
  'syncState',
  'tab',
]);

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

interface UnsafeExpressionMatch {
  name: string;
  prefersContainerName: boolean;
}

interface BindingEntry {
  name: string;
  initializer?: ts.Expression;
  declarationStart: number;
  scopeNode: ts.Node;
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
  const bindings = collectBindings(sourceFile);

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

  function inspectExpression(
    expression: ts.Expression,
    seenAliases = new Set<string>(),
    containerName?: string,
  ): void {
    if (ts.isObjectLiteralExpression(expression)) {
      inspectObjectLiteral(expression);
      return;
    }

    const unsafeMatch = findUnsafeExpressionMatch(expression);

    if (unsafeMatch && (ts.isIdentifier(expression) || isMemberAccessExpression(expression))) {
      report(
        expression,
        unsafeMatch.prefersContainerName && containerName ? containerName : unsafeMatch.name,
      );
    }

    if (ts.isIdentifier(expression)) {
      const initializer = resolveVisibleInitializer(bindings, expression);

      if (!initializer || seenAliases.has(expression.text)) {
        return;
      }

      const nextSeenAliases = new Set(seenAliases);
      nextSeenAliases.add(expression.text);
      inspectExpression(initializer, nextSeenAliases, containerName);
      return;
    }

    if (isMemberAccessExpression(expression)) {
      return;
    }

    if (ts.isTemplateExpression(expression)) {
      for (const span of expression.templateSpans) {
        inspectExpression(span.expression, seenAliases, containerName);
      }
      return;
    }

    expression.forEachChild((child) => {
      if (!ts.isExpression(child)) {
        return;
      }

      inspectExpression(child, seenAliases, containerName);
    });
  }

  function inspectObjectLiteral(expression: ts.ObjectLiteralExpression): void {
    for (const property of expression.properties) {
      if (ts.isShorthandPropertyAssignment(property)) {
        if (DISALLOWED_LOG_NAMES.has(property.name.text)) {
          report(property.name, property.name.text);
          continue;
        }

        inspectExpression(property.name, new Set<string>(), property.name.text);
        continue;
      }

      if (ts.isPropertyAssignment(property)) {
        const propertyName = getPropertyNameText(property.name);

        if (propertyName && DISALLOWED_LOG_NAMES.has(propertyName)) {
          report(property.name, propertyName);
          continue;
        }

        inspectExpression(property.initializer, new Set<string>(), propertyName ?? undefined);
        continue;
      }

      if (ts.isSpreadAssignment(property)) {
        inspectExpression(property.expression);
      }
    }
  }

  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node) && isLoggerCall(node, bindings)) {
      const [messageArgument, ...metadataArguments] = node.arguments;

      if (messageArgument && shouldInspectPrimaryLogArgument(messageArgument)) {
        inspectExpression(messageArgument);
      }

      for (const argument of metadataArguments) {
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

function isLoggerCall(
  node: ts.CallExpression,
  bindings: Map<string, Array<BindingEntry>>,
): boolean {
  if (!ts.isPropertyAccessExpression(node.expression)) {
    return false;
  }

  return (
    LOGGER_METHODS.has(node.expression.name.text) &&
    isLoggerExpression(node.expression.expression, bindings)
  );
}

function isLoggerExpression(
  expression: ts.Expression,
  bindings: Map<string, Array<BindingEntry>>,
  seenAliases = new Set<string>(),
): boolean {
  if (ts.isIdentifier(expression)) {
    if (expression.text === 'logger') {
      return true;
    }

    if (seenAliases.has(expression.text)) {
      return false;
    }

    const initializer = resolveVisibleInitializer(bindings, expression);
    if (!initializer) {
      return false;
    }

    const nextSeenAliases = new Set(seenAliases);
    nextSeenAliases.add(expression.text);
    return isLoggerExpression(initializer, bindings, nextSeenAliases);
  }

  if (ts.isCallExpression(expression) && ts.isPropertyAccessExpression(expression.expression)) {
    return (
      expression.expression.name.text === 'with' &&
      isLoggerExpression(expression.expression.expression, bindings, seenAliases)
    );
  }

  return false;
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

function findUnsafeExpressionMatch(expression: ts.Expression): UnsafeExpressionMatch | null {
  if (ts.isIdentifier(expression)) {
    return DISALLOWED_LOG_NAMES.has(expression.text)
      ? {
          name: expression.text,
          prefersContainerName: false,
        }
      : null;
  }

  if (isMemberAccessExpression(expression)) {
    const rootSensitiveName = findSensitiveRootName(expression);

    if (rootSensitiveName) {
      return {
        name: rootSensitiveName,
        prefersContainerName: false,
      };
    }

    const expressionName = findDirectBrowserDataName(expression);

    if (expressionName) {
      return {
        name: expressionName,
        prefersContainerName: false,
      };
    }

    if (isComputedSensitiveAccess(expression)) {
      return {
        name: 'computed browser access',
        prefersContainerName: true,
      };
    }

    return null;
  }

  if (ts.isElementAccessExpression(expression)) {
    const targetName = findUnsafeExpressionMatch(expression.expression);

    if (targetName) {
      return targetName;
    }

    if (ts.isExpression(expression.argumentExpression)) {
      return findUnsafeExpressionMatch(expression.argumentExpression);
    }
  }

  let nestedUnsafeName: UnsafeExpressionMatch | null = null;

  expression.forEachChild((child) => {
    if (nestedUnsafeName || !ts.isExpression(child)) {
      return;
    }

    nestedUnsafeName = findUnsafeExpressionMatch(child);
  });

  return nestedUnsafeName;
}

function findSensitiveRootName(
  expression: ts.PropertyAccessExpression | ts.ElementAccessExpression,
): string | null {
  const pathInfo = getMemberAccessPathInfo(expression);
  const names = pathInfo?.names;

  if (!names || names.length < 2 || pathInfo.hasComputedNonLiteral) {
    return null;
  }

  const [rootName, ...nestedNames] = names;
  if (!rootName || !SENSITIVE_MEMBER_ROOTS.has(rootName)) {
    return null;
  }

  if (
    nestedNames.some(
      (name) => SENSITIVE_MEMBER_SUFFIXES.has(name) || DISALLOWED_LOG_NAMES.has(name),
    )
  ) {
    return rootName;
  }

  return null;
}

function findDirectBrowserDataName(
  expression: ts.PropertyAccessExpression | ts.ElementAccessExpression,
): string | null {
  const pathInfo = getMemberAccessPathInfo(expression);
  const names = pathInfo?.names;

  if (!names || pathInfo.hasComputedNonLiteral) {
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

function isComputedSensitiveAccess(
  expression: ts.PropertyAccessExpression | ts.ElementAccessExpression,
): boolean {
  const pathInfo = getMemberAccessPathInfo(expression);
  const names = pathInfo?.names;

  if (!pathInfo?.hasComputedNonLiteral || !names) {
    return false;
  }

  return (
    matchesPropertyAccessPath(names, ['document']) ||
    matchesPropertyAccessPath(names, ['location']) ||
    matchesPropertyAccessPath(names, ['window', 'location']) ||
    matchesPropertyAccessPath(names, ['payload']) ||
    matchesPropertyAccessPath(names, ['tab'])
  );
}

function matchesPropertyAccessPath(names: Array<string>, expectedPath: Array<string>): boolean {
  if (names.length !== expectedPath.length) {
    return false;
  }

  return expectedPath.every((part, index) => names[index] === part);
}

function isMemberAccessExpression(
  expression: ts.Expression,
): expression is ts.PropertyAccessExpression | ts.ElementAccessExpression {
  return ts.isPropertyAccessExpression(expression) || ts.isElementAccessExpression(expression);
}

function getMemberAccessPathInfo(
  expression: ts.PropertyAccessExpression | ts.ElementAccessExpression,
): { names: Array<string>; hasComputedNonLiteral: boolean } | null {
  const names = new Array<string>();
  let hasComputedNonLiteral = false;
  let current: ts.Expression = expression;

  while (isMemberAccessExpression(current)) {
    if (ts.isPropertyAccessExpression(current)) {
      names.unshift(current.name.text);
      current = current.expression;
      continue;
    }

    const argumentName = getElementAccessArgumentName(current.argumentExpression);

    if (!argumentName) {
      hasComputedNonLiteral = true;
      current = current.expression;
      continue;
    }

    names.unshift(argumentName);
    current = current.expression;
  }

  if (!ts.isIdentifier(current)) {
    return null;
  }

  names.unshift(current.text);

  return {
    names,
    hasComputedNonLiteral,
  };
}

function getElementAccessArgumentName(argument: ts.Expression): string | null {
  if (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument)) {
    return argument.text;
  }

  return null;
}

function shouldInspectPrimaryLogArgument(argument: ts.Expression): boolean {
  return !ts.isStringLiteral(argument) && !ts.isNoSubstitutionTemplateLiteral(argument);
}

function collectBindings(sourceFile: ts.SourceFile): Map<string, Array<BindingEntry>> {
  const bindings = new Map<string, Array<BindingEntry>>();

  function visit(node: ts.Node): void {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const entries = bindings.get(node.name.text) ?? [];
      entries.push({
        name: node.name.text,
        initializer: node.initializer,
        declarationStart: node.getStart(sourceFile),
        scopeNode: getDeclarationScopeNode(node),
      });
      bindings.set(node.name.text, entries);
    }

    if (ts.isParameter(node) && ts.isIdentifier(node.name)) {
      const entries = bindings.get(node.name.text) ?? [];
      entries.push({
        name: node.name.text,
        declarationStart: node.getStart(sourceFile),
        scopeNode: getParameterScopeNode(node),
      });
      bindings.set(node.name.text, entries);
    }

    if (
      ts.isCatchClause(node) &&
      node.variableDeclaration &&
      ts.isIdentifier(node.variableDeclaration.name)
    ) {
      const name = node.variableDeclaration.name.text;
      const entries = bindings.get(name) ?? [];
      entries.push({
        name,
        declarationStart: node.variableDeclaration.getStart(sourceFile),
        scopeNode: node,
      });
      bindings.set(name, entries);
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  return bindings;
}

function resolveVisibleInitializer(
  bindings: Map<string, Array<BindingEntry>>,
  identifier: ts.Identifier,
): ts.Expression | null {
  const candidates = bindings.get(identifier.text);

  if (!candidates) {
    return null;
  }

  const usageStart = identifier.getStart();
  const usageScopes = getContainingScopes(identifier);
  let bestCandidate: BindingEntry | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    if (candidate.declarationStart >= usageStart) {
      continue;
    }

    const distance = usageScopes.indexOf(candidate.scopeNode);

    if (distance === -1) {
      continue;
    }

    if (
      !bestCandidate ||
      distance < bestDistance ||
      (distance === bestDistance && candidate.declarationStart > bestCandidate.declarationStart)
    ) {
      bestCandidate = candidate;
      bestDistance = distance;
    }
  }

  if (!bestCandidate || !bestCandidate.initializer) {
    return null;
  }

  return bestCandidate.initializer;
}

function getContainingScopes(node: ts.Node): Array<ts.Node> {
  const scopes = new Array<ts.Node>();
  let current: ts.Node | undefined = node;

  while (current) {
    if (isScopeNode(current)) {
      scopes.push(current);
    }

    current = current.parent;
  }

  return scopes;
}

function getDeclarationScopeNode(node: ts.VariableDeclaration): ts.Node {
  const declarationList = node.parent;
  const isBlockScoped =
    ts.isVariableDeclarationList(declarationList) &&
    (declarationList.flags & ts.NodeFlags.BlockScoped) !== 0;

  let current: ts.Node | undefined = node.parent;

  while (current) {
    if (isBlockScoped) {
      if (isBlockScopeNode(current)) {
        return current;
      }
    } else if (isVarScopeNode(current)) {
      return current;
    }

    current = current.parent;
  }

  return node.getSourceFile();
}

function getParameterScopeNode(node: ts.ParameterDeclaration): ts.Node {
  let current: ts.Node | undefined = node.parent;

  while (current) {
    if (ts.isFunctionLike(current) || ts.isSourceFile(current)) {
      return current;
    }

    current = current.parent;
  }

  return node.getSourceFile();
}

function isScopeNode(node: ts.Node): boolean {
  return isBlockScopeNode(node) || isVarScopeNode(node);
}

function isBlockScopeNode(node: ts.Node): boolean {
  return (
    ts.isSourceFile(node) ||
    ts.isBlock(node) ||
    ts.isCaseClause(node) ||
    ts.isDefaultClause(node) ||
    ts.isCatchClause(node)
  );
}

function isVarScopeNode(node: ts.Node): boolean {
  return (
    ts.isSourceFile(node) ||
    ts.isFunctionLike(node) ||
    ts.isModuleBlock(node) ||
    ts.isConstructorDeclaration(node)
  );
}
