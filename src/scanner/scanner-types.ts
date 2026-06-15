export type SourceLocation = {
  line: number;
  column: number;
};

export type RawImportKind = "import" | "export" | "require" | "dynamic-import";

export type RawImport = {
  specifier: string;
  kind: RawImportKind;
  loc?: SourceLocation;
};

export type ScanWarning =
  | {
      type: "unresolved-dynamic-import";
      message: string;
      loc?: SourceLocation;
    }
  | {
      type: "unresolved-dynamic-require";
      message: string;
      loc?: SourceLocation;
    };

export type ScanResult = {
  imports: ReadonlyArray<RawImport>;
  warnings: ReadonlyArray<ScanWarning>;
};

export type ScanInput = {
  text: string;
  filePath?: string;
};
