/**
 * vite-rooms-plugin.ts — Vite plugin that serves .agent/rooms/ YAML files.
 *
 * At dev time, this plugin:
 *   1. Reads all YAML files from the project's .agent/rooms/ directory
 *   2. Serves a manifest at /__rooms__/manifest.json
 *   3. Serves individual YAML files at /__rooms__/<filename>
 *
 * At build time, it injects the room configs as a virtual module
 * `virtual:room-configs` that exports the parsed BuildingDef.
 */
import { readFileSync, readdirSync, existsSync, watchFile, unwatchFile } from "node:fs";
import { join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import type { Plugin } from "vite";

const VIRTUAL_MODULE_ID = "virtual:room-configs";
const RESOLVED_VIRTUAL_ID = "\0" + VIRTUAL_MODULE_ID;

export function roomsPlugin(projectRoot?: string): Plugin {
  const root = projectRoot ?? resolve(process.cwd(), "../..");
  const roomsDir = join(root, ".agent", "rooms");

  function readRoomFiles(): { building: string | null; rooms: Record<string, string> } {
    if (!existsSync(roomsDir)) {
      console.warn(`[rooms-plugin] Room directory not found: ${roomsDir}`);
      return { building: null, rooms: {} };
    }

    const files = readdirSync(roomsDir).filter((f) => f.endsWith(".yaml"));
    let building: string | null = null;
    const rooms: Record<string, string> = {};

    for (const file of files) {
      const content = readFileSync(join(roomsDir, file), "utf-8");
      if (file === "_building.yaml") {
        building = content;
      } else if (!file.startsWith("_")) {
        rooms[file] = content;
      }
    }

    return { building, rooms };
  }

  return {
    name: "conitens-rooms",

    resolveId(id) {
      if (id === VIRTUAL_MODULE_ID) return RESOLVED_VIRTUAL_ID;
    },

    load(id) {
      if (id !== RESOLVED_VIRTUAL_ID) return;

      const { building, rooms } = readRoomFiles();

      // Emit as a module that exports raw YAML strings
      return `
        export const buildingYaml = ${JSON.stringify(building)};
        export const roomYamls = ${JSON.stringify(rooms)};
      `;
    },

    configureServer(server) {
      // Serve room YAML files via dev server middleware
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith("/__rooms__/")) return next();

        const path = req.url.replace("/__rooms__/", "");

        if (path === "manifest.json") {
          const { building, rooms } = readRoomFiles();
          const manifest = {
            building: building ? "_building.yaml" : null,
            rooms: Object.keys(rooms),
          };
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify(manifest));
          return;
        }

        const filePath = join(roomsDir, path);
        if (existsSync(filePath)) {
          res.setHeader("Content-Type", "text/yaml");
          res.end(readFileSync(filePath, "utf-8"));
          return;
        }

        res.statusCode = 404;
        res.end("Not found");
      });

      // Watch room directory for changes and trigger HMR
      if (existsSync(roomsDir)) {
        const files = readdirSync(roomsDir).filter((f) => f.endsWith(".yaml"));
        for (const file of files) {
          const filePath = join(roomsDir, file);
          watchFile(filePath, { interval: 1000 }, () => {
            // Invalidate virtual module on any room YAML change
            const mod = server.moduleGraph.getModuleById(RESOLVED_VIRTUAL_ID);
            if (mod) {
              server.moduleGraph.invalidateModule(mod);
              server.ws.send({ type: "full-reload" });
            }
          });
        }

        // Cleanup watchers on server close
        server.httpServer?.on("close", () => {
          for (const file of files) {
            unwatchFile(join(roomsDir, file));
          }
        });
      }
    },
  };
}
