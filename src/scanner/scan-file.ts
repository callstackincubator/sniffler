import type {
  EntitySelection,
  RawExport,
  RawImport,
  ScanInput,
  ScanResult,
  ScanWarning,
  SourceLocation
} from "./scanner-types.js";

type ScannerState = {
  index: number;
  line: number;
  column: number;
};

type ParsedLiteral = {
  specifier: string;
  loc: SourceLocation;
};

type NamedBinding = {
  imported: string;
  local?: string;
};

const isIdentifierStart = (char: string | undefined): boolean => {
  return char !== undefined && /[A-Za-z_$]/.test(char);
};

const isIdentifierChar = (char: string | undefined): boolean => {
  return char !== undefined && /[A-Za-z0-9_$]/.test(char);
};

const isWhitespace = (char: string | undefined): boolean => {
  return char !== undefined && /\s/.test(char);
};

const createWarningMessage = (filePath: string | undefined, line: number, kind: "import" | "require"): string => {
  const prefix = filePath === undefined ? `${line}` : `${filePath}:${line}`;
  return `${prefix} dynamic ${kind} target is not statically resolvable`;
};

const createNamedSelection = (entities: ReadonlyArray<NamedBinding>): EntitySelection => {
  return {
    type: "named",
    entities
  };
};

export const scanFileText = (input: ScanInput): ScanResult => {
  const text = input.text;
  const state: ScannerState = { index: 0, line: 1, column: 1 };
  const imports: RawImport[] = [];
  const exports: RawExport[] = [];
  const warnings: ScanWarning[] = [];

  const currentChar = (): string | undefined => {
    return text[state.index];
  };

  const nextChar = (): string | undefined => {
    return text[state.index + 1];
  };

  const location = (): SourceLocation => {
    return {
      line: state.line,
      column: state.column
    };
  };

  const snapshotState = (): ScannerState => {
    return {
      index: state.index,
      line: state.line,
      column: state.column
    };
  };

  const restoreState = (snapshot: ScannerState): void => {
    state.index = snapshot.index;
    state.line = snapshot.line;
    state.column = snapshot.column;
  };

  const advance = (count = 1): void => {
    for (let step = 0; step < count && state.index < text.length; step += 1) {
      const char = text[state.index];
      state.index += 1;

      if (char === "\n") {
        state.line += 1;
        state.column = 1;
        continue;
      }

      state.column += 1;
    }
  };

  const startsWithWord = (word: string): boolean => {
    if (text.slice(state.index, state.index + word.length) !== word) {
      return false;
    }

    const before = text[state.index - 1];
    const after = text[state.index + word.length];

    return !isIdentifierChar(before) && !isIdentifierChar(after);
  };

  const skipWhitespaceAndComments = (): void => {
    while (state.index < text.length) {
      const char = currentChar();

      if (isWhitespace(char)) {
        advance();
        continue;
      }

      if (char === "/" && nextChar() === "/") {
        advance(2);

        while (state.index < text.length && currentChar() !== "\n") {
          advance();
        }

        continue;
      }

      if (char === "/" && nextChar() === "*") {
        advance(2);

        while (state.index < text.length) {
          if (currentChar() === "*" && nextChar() === "/") {
            advance(2);
            break;
          }

          advance();
        }

        continue;
      }

      break;
    }
  };

  const consumeQuotedLiteral = (quote: "'" | '"'): ParsedLiteral | null => {
    const loc = location();
    advance();
    const start = state.index;

    while (state.index < text.length) {
      const char = currentChar();

      if (char === "\\") {
        advance(2);
        continue;
      }

      if (char === quote) {
        const specifier = text.slice(start, state.index);
        advance();
        return { specifier, loc };
      }

      advance();
    }

    return null;
  };

  const consumeTemplateLiteral = (): { specifier: string; loc: SourceLocation; hadExpression: boolean } | null => {
    const loc = location();
    advance();
    const start = state.index;
    let hadExpression = false;

    const consumeTemplateExpression = (): void => {
      let depth = 1;

      while (state.index < text.length && depth > 0) {
        skipWhitespaceAndComments();

        if (state.index >= text.length || depth <= 0) {
          break;
        }

        const char = currentChar();

        if (char === "'" || char === '"') {
          const parsed = consumeQuotedLiteral(char);
          if (parsed === null) {
            return;
          }
          continue;
        }

        if (char === "`") {
          const parsed = consumeTemplateLiteral();
          if (parsed === null) {
            return;
          }
          continue;
        }

        if (char === "{") {
          depth += 1;
          advance();
          continue;
        }

        if (char === "}") {
          depth -= 1;
          advance();
          continue;
        }

        advance();
      }
    };

    while (state.index < text.length) {
      const char = currentChar();

      if (char === "\\") {
        advance(2);
        continue;
      }

      if (char === "`") {
        const specifier = text.slice(start, state.index);
        advance();
        return { specifier, loc, hadExpression };
      }

      if (char === "$" && nextChar() === "{") {
        hadExpression = true;
        advance(2);
        consumeTemplateExpression();
        continue;
      }

      advance();
    }

    return null;
  };

  const consumeLiteral = (): ParsedLiteral | null => {
    const char = currentChar();

    if (char === "'" || char === '"') {
      return consumeQuotedLiteral(char);
    }

    if (char === "`") {
      const template = consumeTemplateLiteral();
      if (template === null || template.hadExpression) {
        return null;
      }

      return {
        specifier: template.specifier,
        loc: template.loc
      };
    }

    return null;
  };

  const readIdentifier = (): string | null => {
    if (!isIdentifierStart(currentChar())) {
      return null;
    }

    const start = state.index;
    advance();

    while (isIdentifierChar(currentChar())) {
      advance();
    }

    return text.slice(start, state.index);
  };

  const skipToTopLevelDelimiter = (delimiters: ReadonlySet<string>): void => {
    let parenDepth = 0;
    let braceDepth = 0;
    let bracketDepth = 0;

    while (state.index < text.length) {
      const char = currentChar();

      if (char === "'" || char === '"' || char === "`") {
        const parsed = consumeLiteral();
        if (parsed === null) {
          continue;
        }
        continue;
      }

      if (char === "/" && nextChar() === "/") {
        advance(2);

        while (state.index < text.length && currentChar() !== "\n") {
          advance();
        }

        continue;
      }

      if (char === "/" && nextChar() === "*") {
        advance(2);

        while (state.index < text.length) {
          if (currentChar() === "*" && nextChar() === "/") {
            advance(2);
            break;
          }

          advance();
        }

        continue;
      }

      if (
        parenDepth === 0 &&
        braceDepth === 0 &&
        bracketDepth === 0 &&
        char !== undefined &&
        delimiters.has(char)
      ) {
        return;
      }

      if (char === "(") {
        parenDepth += 1;
        advance();
        continue;
      }

      if (char === ")") {
        if (parenDepth > 0) {
          parenDepth -= 1;
        }
        advance();
        continue;
      }

      if (char === "{") {
        braceDepth += 1;
        advance();
        continue;
      }

      if (char === "}") {
        if (braceDepth > 0) {
          braceDepth -= 1;
        }
        advance();
        continue;
      }

      if (char === "[") {
        bracketDepth += 1;
        advance();
        continue;
      }

      if (char === "]") {
        if (bracketDepth > 0) {
          bracketDepth -= 1;
        }
        advance();
        continue;
      }

      advance();
    }
  };

  const finishStatement = (): void => {
    skipToTopLevelDelimiter(new Set([";", "\n"]));

    if (currentChar() === ";" || currentChar() === "\n") {
      advance();
    }
  };

  const parseNamedBindings = (): Array<NamedBinding> | null => {
    if (currentChar() !== "{") {
      return null;
    }

    advance();
    const bindings: NamedBinding[] = [];

    while (state.index < text.length) {
      skipWhitespaceAndComments();

      if (currentChar() === "}") {
        advance();
        return bindings;
      }

      if (currentChar() === ",") {
        advance();
        continue;
      }

      if (startsWithWord("type")) {
        advance(4);
        skipWhitespaceAndComments();
      }

      const imported = readIdentifier();

      if (imported === null) {
        return null;
      }

      let local = imported;
      skipWhitespaceAndComments();

      if (startsWithWord("as")) {
        advance(2);
        skipWhitespaceAndComments();

        const alias = readIdentifier();
        if (alias === null) {
          return null;
        }

        local = alias;
      }

      bindings.push(local === imported ? { imported } : { imported, local });
      skipWhitespaceAndComments();

      if (currentChar() === ",") {
        advance();
        continue;
      }

      if (currentChar() === "}") {
        advance();
        return bindings;
      }
    }

    return null;
  };

  const emitImport = (
    specifier: string,
    kind: RawImport["kind"],
    loc: SourceLocation,
    entities: EntitySelection
  ): void => {
    imports.push({
      specifier,
      kind,
      loc,
      entities
    });
  };

  const emitLocalExport = (exported: string, local: string | undefined, loc: SourceLocation): void => {
    exports.push({
      kind: "local",
      exported,
      local,
      loc
    });
  };

  const emitReExport = (
    specifier: string,
    imported: string,
    exported: string,
    loc: SourceLocation
  ): void => {
    exports.push({
      kind: "re-export",
      specifier,
      imported,
      exported,
      loc
    });
  };

  const emitReExportAll = (
    specifier: string,
    loc: SourceLocation,
    exportedNamespace?: string
  ): void => {
    exports.push({
      kind: "re-export-all",
      specifier,
      exportedNamespace,
      loc
    });
  };

  const emitWarning = (kind: "import" | "require", loc: SourceLocation): void => {
    warnings.push({
      type: kind === "import" ? "unresolved-dynamic-import" : "unresolved-dynamic-require",
      message: createWarningMessage(input.filePath, loc.line, kind),
      loc
    });
  };

  const parseDynamicImportOrRequire = (kind: "import" | "require"): void => {
    skipWhitespaceAndComments();

    if (currentChar() !== "(") {
      return;
    }

    advance();
    skipWhitespaceAndComments();
    const argumentLoc = location();
    const parsed = consumeLiteral();

    if (parsed === null) {
      emitWarning(kind, argumentLoc);
      skipToTopLevelDelimiter(new Set([")"]));

      if (currentChar() === ")") {
        advance();
      }

      return;
    }

    emitImport(
      parsed.specifier,
      kind === "import" ? "dynamic-import" : "require",
      parsed.loc,
      { type: "all" }
    );

    skipToTopLevelDelimiter(new Set([")"]));

    if (currentChar() === ")") {
      advance();
    }
  };

  const parseImportStatement = (): void => {
    skipWhitespaceAndComments();

    if (currentChar() === "'" || currentChar() === '"' || currentChar() === "`") {
      const parsed = consumeLiteral();
      if (parsed !== null) {
        emitImport(parsed.specifier, "import", parsed.loc, { type: "all" });
      }
      finishStatement();
      return;
    }

    if (startsWithWord("type")) {
      advance(4);
      skipWhitespaceAndComments();
    }

    if (currentChar() === "*") {
      advance();
      skipWhitespaceAndComments();

      if (startsWithWord("as")) {
        advance(2);
        skipWhitespaceAndComments();
        if (readIdentifier() === null) {
          finishStatement();
          return;
        }
      }

      skipWhitespaceAndComments();

      if (!startsWithWord("from")) {
        finishStatement();
        return;
      }

      advance(4);
      skipWhitespaceAndComments();
      const parsed = consumeLiteral();

      if (parsed !== null) {
        emitImport(parsed.specifier, "import", parsed.loc, { type: "all" });
      }

      finishStatement();
      return;
    }

      if (currentChar() === "{") {
        const named = parseNamedBindings();

        if (named === null) {
          finishStatement();
          return;
        }

        const afterNamed = snapshotState();
        skipWhitespaceAndComments();

        if (!startsWithWord("from")) {
          restoreState(afterNamed);
          finishStatement();
          return;
        }

      advance(4);
      skipWhitespaceAndComments();
      const parsed = consumeLiteral();

      if (parsed !== null) {
        emitImport(parsed.specifier, "import", parsed.loc, createNamedSelection(named));
      }

      finishStatement();
      return;
    }

    if (isIdentifierStart(currentChar())) {
      const defaultLocal = readIdentifier();

      if (defaultLocal === null) {
        finishStatement();
        return;
      }

      const namedBindings: NamedBinding[] = [{ imported: "default", local: defaultLocal }];
      skipWhitespaceAndComments();

      if (currentChar() === ",") {
        advance();
        skipWhitespaceAndComments();

        if (currentChar() === "{") {
          const named = parseNamedBindings();

          if (named === null) {
            finishStatement();
            return;
          }

          namedBindings.push(...named);
        } else {
          finishStatement();
          return;
        }
      }

      const afterSelection = snapshotState();
      skipWhitespaceAndComments();

      if (!startsWithWord("from")) {
        restoreState(afterSelection);
        finishStatement();
        return;
      }

      advance(4);
      skipWhitespaceAndComments();
      const parsed = consumeLiteral();

      if (parsed !== null) {
        emitImport(parsed.specifier, "import", parsed.loc, createNamedSelection(namedBindings));
      }

      finishStatement();
    }
  };

  const parseExportNamedList = (keywordLoc: SourceLocation): void => {
    const named = parseNamedBindings();

    if (named === null) {
      finishStatement();
      return;
    }

    const afterNamed = snapshotState();
    skipWhitespaceAndComments();

    if (startsWithWord("from")) {
      advance(4);
      skipWhitespaceAndComments();
      const parsed = consumeLiteral();

      if (parsed !== null) {
        for (const binding of named) {
          emitReExport(
            parsed.specifier,
            binding.imported,
            binding.local ?? binding.imported,
            parsed.loc
          );
        }
      }

      finishStatement();
      return;
    }

    restoreState(afterNamed);

    for (const binding of named) {
      emitLocalExport(binding.local ?? binding.imported, binding.imported === (binding.local ?? binding.imported) ? undefined : binding.imported, keywordLoc);
    }

    finishStatement();
  };

  const parseVariableExport = (keywordLoc: SourceLocation): void => {
    while (state.index < text.length) {
      skipWhitespaceAndComments();

      if (currentChar() === "{" || currentChar() === "[") {
        finishStatement();
        return;
      }

      if (currentChar() === "," || currentChar() === ";") {
        advance();
        if (currentChar() === ";") {
          advance();
        }
        continue;
      }

      const name = readIdentifier();

      if (name === null) {
        if (currentChar() === "=") {
          advance();
          skipToTopLevelDelimiter(new Set([",", ";", "\n"]));
          continue;
        }

        if (currentChar() === "\n") {
          advance();
          return;
        }

        if (state.index >= text.length) {
          return;
        }

        advance();
        continue;
      }

      emitLocalExport(name, undefined, keywordLoc);
      skipWhitespaceAndComments();

      if (currentChar() === "=") {
        advance();
        skipToTopLevelDelimiter(new Set([",", ";", "\n"]));
      }

      if (currentChar() === ",") {
        advance();
        continue;
      }

      if (currentChar() === "\n" || currentChar() === ";") {
        if (currentChar() === ";") {
          advance();
        }
        return;
      }
    }
  };

  const parseNamedDeclarationExport = (keywordLoc: SourceLocation, keyword: string): void => {
    if (keyword === "type") {
      skipWhitespaceAndComments();
    }

    const name = readIdentifier();

    if (name !== null) {
      emitLocalExport(name, undefined, keywordLoc);
    }

    finishStatement();
  };

  const parseExportStatement = (keywordLoc: SourceLocation): void => {
    skipWhitespaceAndComments();

    if (currentChar() === "*") {
      advance();
      skipWhitespaceAndComments();

      let exportedNamespace: string | undefined;

      if (startsWithWord("as")) {
        advance(2);
        skipWhitespaceAndComments();
        exportedNamespace = readIdentifier() ?? undefined;
        skipWhitespaceAndComments();
      }

      if (!startsWithWord("from")) {
        finishStatement();
        return;
      }

      advance(4);
      skipWhitespaceAndComments();
      const parsed = consumeLiteral();

      if (parsed !== null) {
        emitReExportAll(parsed.specifier, parsed.loc, exportedNamespace);
      }

      finishStatement();
      return;
    }

    if (currentChar() === "{") {
      parseExportNamedList(keywordLoc);
      return;
    }

    if (startsWithWord("default")) {
      emitLocalExport("default", undefined, keywordLoc);
      advance(7);
      finishStatement();
      return;
    }

    if (startsWithWord("type")) {
      const saved = {
        index: state.index,
        line: state.line,
        column: state.column
      };

      advance(4);
      skipWhitespaceAndComments();

      if (currentChar() === "{") {
        parseExportNamedList(keywordLoc);
        return;
      }

      state.index = saved.index;
      state.line = saved.line;
      state.column = saved.column;
    }

    while (startsWithWord("declare") || startsWithWord("async") || startsWithWord("abstract")) {
      if (startsWithWord("declare")) {
        advance(7);
      } else if (startsWithWord("async")) {
        advance(5);
      } else {
        advance(8);
      }
      skipWhitespaceAndComments();
    }

    if (startsWithWord("const") || startsWithWord("let") || startsWithWord("var")) {
      if (startsWithWord("const")) {
        advance(5);
      } else if (startsWithWord("let")) {
        advance(3);
      } else {
        advance(3);
      }

      parseVariableExport(keywordLoc);
      return;
    }

    if (
      startsWithWord("function") ||
      startsWithWord("class") ||
      startsWithWord("enum") ||
      startsWithWord("interface") ||
      startsWithWord("type")
    ) {
      if (startsWithWord("function")) {
        advance(8);
      } else if (startsWithWord("class")) {
        advance(5);
      } else if (startsWithWord("enum")) {
        advance(4);
      } else if (startsWithWord("interface")) {
        advance(9);
      } else {
        advance(4);
      }

      parseNamedDeclarationExport(keywordLoc, "type");
      return;
    }

    finishStatement();
  };

  while (state.index < text.length) {
    skipWhitespaceAndComments();

    if (state.index >= text.length) {
      break;
    }

    const char = currentChar();

    if (char === "'" || char === '"' || char === "`") {
      const parsed = consumeLiteral();
      if (parsed === null) {
        continue;
      }
      continue;
    }

    if (startsWithWord("import")) {
      const afterKeyword = text[state.index + "import".length];

      if (afterKeyword === ".") {
        advance("import".length);
        continue;
      }

      const keywordLoc = location();
      advance("import".length);
      skipWhitespaceAndComments();

      if (currentChar() === "(") {
        parseDynamicImportOrRequire("import");
        continue;
      }

      parseImportStatement();
      continue;
    }

    if (startsWithWord("export")) {
      const keywordLoc = location();
      advance("export".length);
      parseExportStatement(keywordLoc);
      continue;
    }

    if (startsWithWord("require")) {
      advance("require".length);
      parseDynamicImportOrRequire("require");
      continue;
    }

    if (isIdentifierStart(char)) {
      while (state.index < text.length && isIdentifierChar(currentChar())) {
        advance();
      }
      continue;
    }

    advance();
  }

  return {
    imports,
    exports,
    warnings
  };
};
