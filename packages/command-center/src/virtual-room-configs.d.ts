/**
 * Type declaration for the virtual:room-configs module
 * provided by the Vite rooms plugin.
 */
declare module "virtual:room-configs" {
  export const buildingYaml: string | null;
  export const roomYamls: Record<string, string>;
}
