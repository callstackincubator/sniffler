import { describe, expect, it } from "vitest";
import { ALL_ENTITY_SELECTION } from "../src/scanner/scanner-types.js";
import {
  createExportAllResolvedEdge,
  createImportResolvedEdge,
  createReExportResolvedEdge,
  expandSyntheticContainmentEdges,
  edgeParticipatesInContainment,
  edgeParticipatesInImpact,
  normalizeResolvedEdge,
  sortResolvedEdges
} from "../src/graph/edge-semantics.js";

describe("graph edge semantics", () => {
  it("normalizes cached edges before reuse", () => {
    expect(
      normalizeResolvedEdge(
        {
          from: "./src/cached.ts",
          to: "./src/dep.ts",
          resolver: "relative",
          entities: ALL_ENTITY_SELECTION,
          reExports: null,
          synthetic: {
            kind: "containment",
            from: "./src/layout.tsx",
            to: "./src/home.tsx"
          }
        },
        "src/./cached.ts"
      )
    ).toEqual({
      from: "src/cached.ts",
      to: "src/dep.ts",
      resolver: "relative",
      entities: ALL_ENTITY_SELECTION,
      reExports: null,
      synthetic: {
        kind: "containment",
        from: "src/layout.tsx",
        to: "src/home.tsx"
      }
    });
  });

  it("builds import, re-export, and export-all edges with distinct semantics", () => {
    expect(createImportResolvedEdge("src/app.ts", "src/dep.ts", "relative", ALL_ENTITY_SELECTION)).toEqual({
      from: "src/app.ts",
      to: "src/dep.ts",
      resolver: "relative",
      entities: ALL_ENTITY_SELECTION,
      reExports: null
    });

    expect(createReExportResolvedEdge("src/app.ts", "src/button.ts", "relative", "Button", "Button")).toEqual({
      from: "src/app.ts",
      to: "src/button.ts",
      resolver: "relative",
      entities: {
        type: "named",
        entities: [
          {
            imported: "Button"
          }
        ]
      },
      reExports: [
        {
          imported: "Button",
          exported: "Button"
        }
      ]
    });

    expect(createReExportResolvedEdge("src/app.ts", "src/button.ts", "relative", "Button", "AppButton")).toEqual({
      from: "src/app.ts",
      to: "src/button.ts",
      resolver: "relative",
      entities: {
        type: "named",
        entities: [
          {
            imported: "Button",
            local: "AppButton"
          }
        ]
      },
      reExports: [
        {
          imported: "Button",
          exported: "AppButton"
        }
      ]
    });

    expect(createExportAllResolvedEdge("src/app.ts", "src/shared.ts", "relative")).toEqual({
      from: "src/app.ts",
      to: "src/shared.ts",
      resolver: "relative",
      entities: ALL_ENTITY_SELECTION,
      reExports: ALL_ENTITY_SELECTION
    });
  });

  it("classifies traversal participation and de-duplicates synthetic containment edges", () => {
    expect(edgeParticipatesInImpact(createImportResolvedEdge("src/a.ts", "src/b.ts", "relative", ALL_ENTITY_SELECTION))).toBe(true);
    expect(edgeParticipatesInContainment(createImportResolvedEdge("src/a.ts", "src/b.ts", "relative", ALL_ENTITY_SELECTION))).toBe(true);
    expect(
      edgeParticipatesInImpact({
        from: "app/_layout.tsx",
        to: "app/home.tsx",
        resolver: "synthetic:containment",
        entities: ALL_ENTITY_SELECTION,
        reExports: null,
        synthetic: {
          kind: "containment",
          from: "app/_layout.tsx",
          to: "app/home.tsx"
        }
      })
    ).toBe(false);
    expect(
      edgeParticipatesInContainment({
        from: "app/_layout.tsx",
        to: "app/home.tsx",
        resolver: "synthetic:containment",
        entities: ALL_ENTITY_SELECTION,
        reExports: null,
        synthetic: {
          kind: "containment",
          from: "app/_layout.tsx",
          to: "app/home.tsx"
        }
      })
    ).toBe(true);

    expect(
      expandSyntheticContainmentEdges(
        ["app/_layout.tsx", "app/home.tsx", "app/settings.tsx"],
        {
          contains: [
            {
              from: "app/_layout.tsx",
              to: "app/**/*.tsx"
            },
            {
              from: "app/_layout.tsx",
              to: "app/home.tsx"
            }
          ]
        },
        [
          {
            from: "app/_layout.tsx",
            to: "app/home.tsx",
            resolver: "synthetic:containment",
            entities: ALL_ENTITY_SELECTION,
            reExports: null,
            synthetic: {
              kind: "containment",
              from: "app/_layout.tsx",
              to: "app/home.tsx"
            }
          }
        ]
      )
    ).toEqual([
      {
        from: "app/_layout.tsx",
        to: "app/settings.tsx",
        resolver: "synthetic:containment",
        entities: ALL_ENTITY_SELECTION,
        reExports: null,
        synthetic: {
          kind: "containment",
          from: "app/_layout.tsx",
          to: "app/settings.tsx"
        }
      }
    ]);

    expect(
      sortResolvedEdges([
        createImportResolvedEdge("src/b.ts", "src/a.ts", "relative", ALL_ENTITY_SELECTION),
        createImportResolvedEdge("src/a.ts", "src/c.ts", "relative", ALL_ENTITY_SELECTION)
      ])
    ).toEqual([
      createImportResolvedEdge("src/a.ts", "src/c.ts", "relative", ALL_ENTITY_SELECTION),
      createImportResolvedEdge("src/b.ts", "src/a.ts", "relative", ALL_ENTITY_SELECTION)
    ]);
  });
});
