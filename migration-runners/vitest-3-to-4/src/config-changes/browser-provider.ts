import { readMigrationFileSync, transformer } from "migration-kit";
import { arrayValue, object, objectValue, property } from "comorph";
import type { ObjectEntry } from "comorph";
import type { BlockCheckResult, ConfigChange } from "migration-kit";
import { vitestConfigCodemod } from "../utils/comorph.js";
import {
  hasObjectPropertyPath,
  hasObjectPropertyPathWhere,
  isStringLiteralNode,
} from "../utils/comorph-query.js";

const browserProviderChange: ConfigChange = {
  title: "Update browser provider config",
  description:
    "Moves browser.name/providerOptions into browser.instances and flags provider strings that need provider factories.",
  policy: "blocking",
  transform: transformer.comorph(
    vitestConfigCodemod("vitest-4-browser-provider", (config) => {
      if (config.has("test.browser.instances").kind === "yes") {
        return;
      }

      const name = config.get("test.browser.name");

      if (name.kind !== "value") {
        return;
      }

      const providerOptions = config.get("test.browser.providerOptions");
      let providerOptionEntries: readonly ObjectEntry[] = [];

      if (providerOptions.kind === "value") {
        if (providerOptions.value().kind() !== "ObjectExpression") {
          return;
        }

        const entries = object(providerOptions.value()).entries();

        if (
          entries.kind !== "value" ||
          entries.valueOrFail().some((entry) => entry.key === "browser")
        ) {
          return;
        }

        providerOptionEntries = entries.valueOrFail();
      }

      const browserName = config.take("test.browser.name").valueOrFail();

      if (providerOptions.kind === "value") {
        providerOptionEntries = config.takeEntries("test.browser.providerOptions").valueOrFail();
      }

      config.set(
        "test.browser.instances",
        arrayValue([
          objectValue([
            property("browser", browserName),
            ...providerOptionEntries.map((entry) => property(entry.key, entry.value)),
          ]),
        ]),
      );
    }),
  ),
  shouldBlock: browserProviderReviewBlocker,
};

function browserProviderReviewBlocker(filePath: string): BlockCheckResult {
  const source = readMigrationFileSync(filePath);

  if (hasBrowserProviderFindings(filePath, source)) {
    return {
      reason: "browser provider config changed; use provider factories and browser.instances.",
    };
  }

  return false;
}

function hasBrowserProviderFindings(filePath: string, source: string): boolean {
  return (
    hasObjectPropertyPath(source, filePath, ["test", "browser", "provider"], isStringLiteralNode) ||
    hasObjectPropertyPathWhere(
      source,
      filePath,
      (path) =>
        path.length === 3 &&
        path[0] === "test" &&
        path[1] === "browser" &&
        (path[2] === "name" || path[2] === "providerOptions"),
    )
  );
}

export { browserProviderChange };
