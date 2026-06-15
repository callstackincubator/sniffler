import type { ScanInput, ScanResult } from "./scanner-types.js";

export const scanFileText = (_input: ScanInput): ScanResult => {
  return {
    imports: [],
    warnings: []
  };
};
