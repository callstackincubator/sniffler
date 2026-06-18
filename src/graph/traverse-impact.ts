import { normalizePath } from "../filesystem/path-utils.js";
import type { DependencyGraph } from "./build-graph.js";
import type { ResolvedEdge } from "../cache/cache-types.js";
import { ALL_ENTITY_SELECTION } from "../scanner/scanner-types.js";
import type { EntitySelection } from "../scanner/scanner-types.js";

export type ImpactPath = {
  module: string;
  path: ReadonlyArray<string>;
};

export type ImpactResult = {
  affectedModules: ReadonlyArray<string>;
  paths: ReadonlyArray<ImpactPath>;
};

type EntitySet =
  | {
      type: "all";
    }
  | {
      type: "named";
      entities: Set<string>;
    };

type ModuleState = {
  selection: EntitySet;
  propagated: EntitySet;
  path: ReadonlyArray<string>;
};

type ReverseEdge = {
  importer: string;
  edge: ResolvedEdge;
};

const createAllSelection = (): EntitySet => {
  return ALL_ENTITY_SELECTION;
};

const createNamedSelection = (entities: Iterable<string>): EntitySet => {
  return {
    type: "named",
    entities: new Set(entities)
  };
};

const cloneEntitySet = (selection: EntitySet): EntitySet => {
  if (selection.type === "all") {
    return selection;
  }

  return {
    type: "named",
    entities: new Set(selection.entities)
  };
};

const mergeEntitySets = (left: EntitySet, right: EntitySet): EntitySet => {
  if (left.type === "all" || right.type === "all") {
    return createAllSelection();
  }

  return createNamedSelection(new Set([...left.entities, ...right.entities]));
};

const subtractEntitySets = (current: EntitySet, previous: EntitySet): EntitySet => {
  if (current.type === "all") {
    return previous.type === "all" ? createNamedSelection([]) : createAllSelection();
  }

  if (previous.type === "all") {
    return createNamedSelection([]);
  }

  return createNamedSelection([...current.entities].filter((entity) => !previous.entities.has(entity)));
};

const isEmptyEntitySet = (selection: EntitySet): boolean => {
  return selection.type === "named" && selection.entities.size === 0;
};

const intersectsEntitySets = (left: EntitySet, right: EntitySet): boolean => {
  if (left.type === "all" || right.type === "all") {
    return true;
  }

  const smaller = left.entities.size <= right.entities.size ? left.entities : right.entities;
  const larger = smaller === left.entities ? right.entities : left.entities;

  for (const entity of smaller) {
    if (larger.has(entity)) {
      return true;
    }
  }

  return false;
};

const entitySetEquals = (left: EntitySet, right: EntitySet): boolean => {
  if (left.type !== right.type) {
    return false;
  }

  if (left.type === "all") {
    return true;
  }

  if (right.type === "all") {
    return false;
  }

  if (left.entities.size !== right.entities.size) {
    return false;
  }

  for (const entity of left.entities) {
    if (!right.entities.has(entity)) {
      return false;
    }
  }

  return true;
};

const edgeSelectionToEntitySet = (selection: EntitySelection): EntitySet => {
  if (selection.type === "all") {
    return createAllSelection();
  }

  return createNamedSelection(selection.entities.map((entity) => entity.imported));
};

const translateThroughReExports = (selection: EntitySet, edge: ResolvedEdge["reExports"]): EntitySet => {
  if (selection.type === "all") {
    return createAllSelection();
  }

  if (edge === null) {
    return createAllSelection();
  }

  if (!Array.isArray(edge)) {
    return createAllSelection();
  }

  const mapping = new Map<string, string>();

  for (const entry of edge) {
    mapping.set(entry.imported, entry.exported);
  }

  const exported = new Set<string>();

  for (const entity of selection.entities) {
    const mapped = mapping.get(entity);
    if (mapped !== undefined) {
      exported.add(mapped);
    }
  }

  return createNamedSelection(exported);
};

const selectionFromExports = (graph: DependencyGraph, modulePath: string): EntitySet => {
  const node = graph.nodes.find((entry) => entry.path === modulePath);

  if (node === undefined) {
    return createAllSelection();
  }

  const exportedNames = new Set<string>();
  let hasAllExport = false;

  for (const exported of node.scan.exports) {
    if (exported.kind === "local") {
      exportedNames.add(exported.exported);
      continue;
    }

    if (exported.kind === "re-export") {
      exportedNames.add(exported.exported);
      continue;
    }

    hasAllExport = true;
  }

  if (hasAllExport || exportedNames.size === 0) {
    return createAllSelection();
  }

  return createNamedSelection(exportedNames);
};

export const traverseImpact = async (
  graph: DependencyGraph,
  changedFiles: ReadonlyArray<string>
): Promise<ImpactResult> => {
  const reverseEdges = new Map<string, Array<ReverseEdge>>();
  const moduleStates = new Map<string, ModuleState>();
  const queue: Array<string> = [];
  const queued = new Set<string>();

  for (const edge of graph.edges) {
    const importer = normalizePath(edge.from);
    const imported = normalizePath(edge.to);
    const bucket = reverseEdges.get(imported);

    if (bucket === undefined) {
      reverseEdges.set(imported, [{ importer, edge }]);
      continue;
    }

    bucket.push({ importer, edge });
  }

  for (const bucket of reverseEdges.values()) {
    bucket.sort((left, right) => {
      const importerComparison = left.importer.localeCompare(right.importer);
      if (importerComparison !== 0) {
        return importerComparison;
      }

      return JSON.stringify(left.edge).localeCompare(JSON.stringify(right.edge));
    });
  }

  const enqueue = (module: string): void => {
    if (!queued.has(module)) {
      queue.push(module);
      queued.add(module);
    }
  };

  const setState = (module: string, selection: EntitySet, path: ReadonlyArray<string>): void => {
    const current = moduleStates.get(module);

    if (current === undefined) {
      moduleStates.set(module, {
        selection: cloneEntitySet(selection),
        propagated: createNamedSelection([]),
        path
      });
      enqueue(module);
      return;
    }

    const mergedSelection = mergeEntitySets(current.selection, selection);
    const nextPath =
      current.path.length <= path.length
        ? current.path
        : path;

    if (mergedSelection.type === current.selection.type) {
      if (entitySetEquals(mergedSelection, current.selection) && nextPath === current.path) {
        return;
      }
    }

    moduleStates.set(module, {
      selection: mergedSelection,
      propagated: current.propagated,
      path: nextPath
    });
    enqueue(module);
  };

  const startingModules = Array.from(new Set(changedFiles.map((file) => normalizePath(file)))).sort((left, right) =>
    left.localeCompare(right)
  );

  for (const changedFile of startingModules) {
    setState(changedFile, selectionFromExports(graph, changedFile), [changedFile]);
  }

  for (let index = 0; index < queue.length; index += 1) {
    const currentModule = queue[index];
    const currentState = moduleStates.get(currentModule);

    if (currentState === undefined) {
      continue;
    }

    const delta = subtractEntitySets(currentState.selection, currentState.propagated);

    if (isEmptyEntitySet(delta)) {
      continue;
    }

    moduleStates.set(currentModule, {
      selection: currentState.selection,
      propagated: cloneEntitySet(currentState.selection),
      path: currentState.path
    });

    const importers = reverseEdges.get(currentModule) ?? [];

    for (const { importer, edge } of importers) {
      if (!intersectsEntitySets(delta, edgeSelectionToEntitySet(edge.entities))) {
        continue;
      }

      const nextSelection = edge.reExports === null ? createAllSelection() : translateThroughReExports(delta, edge.reExports);
      const nextPath = [...currentState.path, importer];
      setState(importer, nextSelection, nextPath);
    }
  }

  const selectedModules = queue.filter((module) => moduleStates.has(module));

  return {
    affectedModules: selectedModules,
    paths: selectedModules.map((module) => ({
      module,
      path: moduleStates.get(module)?.path ?? [module]
    }))
  };
};
