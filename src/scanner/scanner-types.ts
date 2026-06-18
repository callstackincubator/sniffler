export type SourceLocation = {
  line: number;
  column: number;
};

export type EntityName = string;

export type EntitySelection =
  | {
      type: "all";
    }
  | {
      type: "named";
      entities: ReadonlyArray<{
        imported: EntityName;
        local?: EntityName;
      }>;
    };

export type RawImportKind = "import" | "export" | "require" | "dynamic-import";

export type RawImport = {
  specifier: string;
  kind: RawImportKind;
  loc?: SourceLocation;
  entities: EntitySelection;
};

export type RawLocalExport = {
  kind: "local";
  exported: EntityName;
  local?: EntityName;
  loc?: SourceLocation;
};

export type RawReExport = {
  kind: "re-export";
  specifier: string;
  imported: EntityName;
  exported: EntityName;
  loc?: SourceLocation;
};

export type RawReExportAll = {
  kind: "re-export-all";
  specifier: string;
  exportedNamespace?: EntityName;
  loc?: SourceLocation;
};

export type RawExport = RawLocalExport | RawReExport | RawReExportAll;

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
  exports: ReadonlyArray<RawExport>;
  warnings: ReadonlyArray<ScanWarning>;
};

export type ScanInput = {
  text: string;
  filePath?: string;
};
