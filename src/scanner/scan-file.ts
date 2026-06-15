import type {
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

export const scanFileText = (input: ScanInput): ScanResult => {
  const text = input.text;
  const state: ScannerState = { index: 0, line: 1, column: 1 };
  const imports: RawImport[] = [];
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

        if (char === "/" && nextChar() === "/") {
          skipWhitespaceAndComments();
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

  const skipToStatementEnd = (): void => {
    while (state.index < text.length) {
      const char = currentChar();

      if (char === ";") {
        advance();
        return;
      }

      if (char === "\n") {
        advance();
        return;
      }

      if (char === "'" || char === '"' || char === "`") {
        const parsed = consumeLiteral();
        if (parsed === null) {
          continue;
        }
        continue;
      }

      if (char === "/" && (nextChar() === "/" || nextChar() === "*")) {
        skipWhitespaceAndComments();
        continue;
      }

      advance();
    }
  };

  const skipToClosingParen = (): void => {
    let depth = 1;

    while (state.index < text.length && depth > 0) {
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

      if (char === "(") {
        depth += 1;
        advance();
        continue;
      }

      if (char === ")") {
        depth -= 1;
        advance();
        continue;
      }

      if (char === "/" && (nextChar() === "/" || nextChar() === "*")) {
        skipWhitespaceAndComments();
        continue;
      }

      advance();
    }
  };

  const emitImport = (specifier: string, kind: RawImport["kind"], loc: SourceLocation): void => {
    imports.push({
      specifier,
      kind,
      loc
    });
  };

  const emitWarning = (
    kind: "import" | "require",
    loc: SourceLocation
  ): void => {
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
      skipToClosingParen();
      return;
    }

    emitImport(parsed.specifier, kind === "import" ? "dynamic-import" : "require", parsed.loc);
    skipToClosingParen();
  };

  const parseStaticImportOrExport = (kind: "import" | "export"): void => {
    skipWhitespaceAndComments();

    if (currentChar() === "'" || currentChar() === '"' || currentChar() === "`") {
      const parsed = consumeLiteral();
      if (parsed !== null) {
        emitImport(parsed.specifier, kind, parsed.loc);
      }
      skipToStatementEnd();
      return;
    }

    let parenDepth = 0;
    let braceDepth = 0;
    let bracketDepth = 0;

    while (state.index < text.length) {
      skipWhitespaceAndComments();

      if (state.index >= text.length) {
        return;
      }

      const char = currentChar();

      if (char === "'" || char === '"' || char === "`") {
        const parsed = consumeLiteral();
        if (parsed === null) {
          continue;
        }
        continue;
      }

      if (startsWithWord("from") && parenDepth === 0 && braceDepth === 0 && bracketDepth === 0) {
        advance(4);
        skipWhitespaceAndComments();

        const parsed = consumeLiteral();
        if (parsed !== null) {
          emitImport(parsed.specifier, kind, parsed.loc);
        }

        skipToStatementEnd();
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

      if (char === ";") {
        advance();
        return;
      }

      advance();
    }
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

      advance("import".length);
      skipWhitespaceAndComments();

      if (currentChar() === "(") {
        parseDynamicImportOrRequire("import");
        continue;
      }

      parseStaticImportOrExport("import");
      continue;
    }

    if (startsWithWord("export")) {
      advance("export".length);
      parseStaticImportOrExport("export");
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
    warnings
  };
};
