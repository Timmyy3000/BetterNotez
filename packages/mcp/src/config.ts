import { resolve, join } from "node:path";

const FLAG = "--library";
const ENV_VAR = "BETTERNOTEZ_LIBRARY";
const DEFAULT_FOLDER = "BetterNotez Library";

/** Picks the library folder from the `--library` flag, then the environment, then the home folder. */
export function resolveLibraryPath(
  argv: readonly string[],
  env: Readonly<Record<string, string | undefined>>,
  home: string,
): string {
  const flagIndex = argv.indexOf(FLAG);
  if (flagIndex !== -1) {
    const value = argv[flagIndex + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`${FLAG} needs a folder path.`);
    }
    return resolve(value);
  }
  const fromEnv = env[ENV_VAR];
  if (fromEnv !== undefined && fromEnv !== "") {
    return resolve(fromEnv);
  }
  return join(home, DEFAULT_FOLDER);
}
