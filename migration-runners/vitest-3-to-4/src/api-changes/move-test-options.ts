import { transformer } from "migration-kit";
import type { ApiChange } from "migration-kit";
import { sourceFilePatterns } from "../patterns.js";
import { isObjectExpression, isVitestTestCall, type NodePath } from "../utils/jscodeshift.js";

const moveTestOptions: ApiChange = {
  title: "Move test and describe option objects",
  description:
    "Rewrites test(name, fn, options) and describe(name, fn, options) to the Vitest 4 argument order.",
  files: sourceFilePatterns,
  transform: createVitestTestOptionsTransform(),
};

function createVitestTestOptionsTransform() {
  return transformer.jscodeshift((fileInfo, api) => {
    const j = api.jscodeshift;
    const root = j(fileInfo.source);
    let changed = false;

    root.find(j.CallExpression).forEach((path: NodePath) => {
      const call = path.node;

      if (!isVitestTestCall(call.callee)) {
        return;
      }

      const secondArgument = call.arguments?.[1];
      const thirdArgument = call.arguments?.[2];

      if (
        !secondArgument ||
        !isObjectExpression(thirdArgument) ||
        isObjectExpression(secondArgument)
      ) {
        return;
      }

      call.arguments.splice(1, 2, thirdArgument, secondArgument);
      changed = true;
    });

    return changed ? root.toSource({ quote: "single" }) : fileInfo.source;
  });
}

export { createVitestTestOptionsTransform, moveTestOptions };
