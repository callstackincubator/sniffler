import type { ResolvedEdge } from "../cache/cache-types.js";
import { ALL_ENTITY_SELECTION, type EntitySelection } from "../scanner/scanner-types.js";
import type { SnifflerGraphConfig } from "../config/config-schema.js";
import { createGlobMatcher, normalizePath } from "../filesystem/path-utils.js";

const isGlobTarget = (target: string): boolean => {
  return /[*?]/.test(target);
};

const getResolvedEdgeKey = (edge: ResolvedEdge): string => {
  return JSON.stringify({
    from: edge.from,
    to: edge.to,
    resolver: edge.resolver,
    entities: edge.entities,
    reExports: edge.reExports,
    synthetic: edge.synthetic ?? null
  });
};

export const normalizeResolvedEdge = (edge: ResolvedEdge, fromPath: string): ResolvedEdge => {
  return {
    ...edge,
    from: normalizePath(fromPath),
    to: normalizePath(edge.to),
    ...(edge.synthetic === undefined
      ? {}
      : {
          synthetic: {
            kind: edge.synthetic.kind,
            from: normalizePath(edge.synthetic.from),
            to: normalizePath(edge.synthetic.to)
          }
        })
  };
};

export const createImportResolvedEdge = (
  from: string,
  to: string,
  resolver: string,
  entities: EntitySelection
): ResolvedEdge => {
  return {
    from,
    to,
    resolver,
    entities,
    reExports: null
  };
};

export const createReExportResolvedEdge = (
  from: string,
  to: string,
  resolver: string,
  imported: string,
  exported: string
): ResolvedEdge => {
  return {
    from,
    to,
    resolver,
    entities: {
      type: "named",
      entities: [
        {
          imported,
          local: exported === imported ? undefined : exported
        }
      ]
    },
    reExports: [
      {
        imported,
        exported
      }
    ]
  };
};

export const createExportAllResolvedEdge = (
  from: string,
  to: string,
  resolver: string
): ResolvedEdge => {
  return {
    from,
    to,
    resolver,
    entities: ALL_ENTITY_SELECTION,
    reExports: ALL_ENTITY_SELECTION
  };
};

export const isSyntheticContainmentEdge = (edge: ResolvedEdge): boolean => {
  return edge.synthetic?.kind === "containment";
};

export const edgeParticipatesInImpact = (edge: ResolvedEdge): boolean => {
  return !isSyntheticContainmentEdge(edge);
};

export const edgeParticipatesInContainment = (_edge: ResolvedEdge): boolean => {
  return true;
};

export const expandSyntheticContainmentEdges = (
  graphVisiblePaths: ReadonlyArray<string>,
  graphConfig: SnifflerGraphConfig | undefined,
  existingEdges: ReadonlyArray<ResolvedEdge>
): Array<ResolvedEdge> => {
  const rules = graphConfig?.contains ?? [];

  if (rules.length === 0 || graphVisiblePaths.length === 0) {
    return [];
  }

  const visibleSet = new Set(graphVisiblePaths.map((path) => normalizePath(path)));
  const syntheticEdges: ResolvedEdge[] = [];
  const syntheticEdgeKeys = new Set(existingEdges.map((edge) => getResolvedEdgeKey(edge)));

  const matchPaths = (pattern: string): Array<string> => {
    const normalizedPattern = normalizePath(pattern);

    if (!isGlobTarget(pattern)) {
      return visibleSet.has(normalizedPattern) ? [normalizedPattern] : [];
    }

    const matcher = createGlobMatcher(pattern);
    return [...visibleSet].filter((path) => matcher(path)).sort((left, right) => left.localeCompare(right));
  };

  for (const rule of rules) {
    const fromPaths = matchPaths(rule.from);
    const toPaths = matchPaths(rule.to);

    for (const from of fromPaths) {
      for (const to of toPaths) {
        if (from === to) {
          continue;
        }

        const edge: ResolvedEdge = {
          from,
          to,
          resolver: "synthetic:containment",
          entities: ALL_ENTITY_SELECTION,
          reExports: null,
          synthetic: {
            kind: "containment",
            from,
            to
          }
        };
        const key = getResolvedEdgeKey(edge);

        if (syntheticEdgeKeys.has(key)) {
          continue;
        }

        syntheticEdgeKeys.add(key);
        syntheticEdges.push(edge);
      }
    }
  }

  return syntheticEdges;
};

export const compareResolvedEdges = (left: ResolvedEdge, right: ResolvedEdge): number => {
  const fromComparison = left.from.localeCompare(right.from);
  if (fromComparison !== 0) {
    return fromComparison;
  }

  const toComparison = left.to.localeCompare(right.to);
  if (toComparison !== 0) {
    return toComparison;
  }

  const resolverComparison = left.resolver.localeCompare(right.resolver);
  if (resolverComparison !== 0) {
    return resolverComparison;
  }

  const entityComparison = JSON.stringify(left.entities).localeCompare(JSON.stringify(right.entities));
  if (entityComparison !== 0) {
    return entityComparison;
  }

  return JSON.stringify(left.reExports).localeCompare(JSON.stringify(right.reExports));
};

export const sortResolvedEdges = (
  edges: ReadonlyArray<ResolvedEdge>
): Array<ResolvedEdge> => {
  return edges
    .map((edge) => ({
      edge,
      entityKey: JSON.stringify(edge.entities),
      reExportKey: JSON.stringify(edge.reExports)
    }))
    .sort((left, right) => {
      const fromComparison = left.edge.from.localeCompare(right.edge.from);
      if (fromComparison !== 0) {
        return fromComparison;
      }

      const toComparison = left.edge.to.localeCompare(right.edge.to);
      if (toComparison !== 0) {
        return toComparison;
      }

      const resolverComparison = left.edge.resolver.localeCompare(right.edge.resolver);
      if (resolverComparison !== 0) {
        return resolverComparison;
      }

      const entityComparison = left.entityKey.localeCompare(right.entityKey);
      if (entityComparison !== 0) {
        return entityComparison;
      }

      return left.reExportKey.localeCompare(right.reExportKey);
    })
    .map(({ edge }) => edge);
};
