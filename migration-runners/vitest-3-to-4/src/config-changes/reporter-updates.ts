import { arrayElements, arrayValue, literal, object, objectValue, property } from "comorph";
import type { NodeCapture, NodeInput } from "comorph";
import { transformer } from "migration-kit";
import type { ConfigChange } from "migration-kit";
import { vitestConfigCodemod } from "../utils/comorph.js";

const reporterUpdatesChange: ConfigChange = {
  title: "Update Vitest 4 reporter config",
  description:
    "Rewrites the removed basic reporter to the equivalent default reporter with summary disabled.",
  transform: transformer.comorph(
    vitestConfigCodemod("vitest-4-reporter-updates", (config) => {
      const reporters = config.get("test.reporters");

      if (reporters.kind !== "value") {
        return;
      }

      const value = reporters.value();

      if (isBasicString(value)) {
        config.set("test.reporters", arrayValue([createDefaultReporter()]), { overwrite: true });
        return;
      }

      if (value.kind() !== "ArrayExpression") {
        return;
      }

      const elements = arrayElements(value);
      let changed = false;

      const nextReporters = elements.items.map((element) => {
        const reporter = rewriteReporterElement(element);
        changed ||= reporter !== element;
        return reporter;
      });

      if (changed) {
        elements.replaceAll(nextReporters);
      }
    }),
  ),
};

function isBasicString(node: NodeCapture): boolean {
  return /^['"]basic['"]$/.test(node.text().trim());
}

function createDefaultReporter() {
  return arrayValue([literal("default"), objectValue({ summary: false })]);
}

function rewriteReporterElement(element: NodeCapture): NodeInput {
  if (isBasicString(element)) {
    return createDefaultReporter();
  }

  if (element.kind() !== "ArrayExpression") {
    return element;
  }

  const reporter = arrayElements(element);
  const name = reporter.get(0);

  if (!name || !isBasicString(name)) {
    return element;
  }

  return arrayValue([literal("default"), reporterOptionsWithSummaryFalse(reporter)]);
}

function reporterOptionsWithSummaryFalse(reporter: ReturnType<typeof arrayElements>): NodeInput {
  const options = reporter.get(1);

  if (!options) {
    return objectValue({ summary: false });
  }

  if (options.kind() !== "ObjectExpression") {
    return objectValue({ summary: false });
  }

  const entries = object(options).entries();

  if (entries.kind !== "value" || object(options).has("summary").kind === "yes") {
    return options;
  }

  return objectValue([
    property("summary", false),
    ...entries.valueOrFail().map((entry) => property(entry.key, entry.value)),
  ]);
}

export { reporterUpdatesChange };
