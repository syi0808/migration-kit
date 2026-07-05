import { call, callArgs, capture, codemod } from "comorph";
import { transformer } from "migration-kit";
import type { ApiChange } from "migration-kit";
import { sourceFilePatterns } from "../patterns.js";

const moveTestOptions: ApiChange = {
  title: "Move test and describe option objects",
  description:
    "Rewrites test(name, fn, options) and describe(name, fn, options) to the Vitest 4 argument order.",
  files: sourceFilePatterns,
  transform: transformer.comorph(
    codemod("vitest-4-test-options-order", ({ files }) => {
      files
        .jsLike()
        .find(
          call`${capture.reference("testApi", { kind: "call-callee" })}(${capture.args("args")})`,
        )
        .where(({ testApi, args }) => {
          const name = testApi.text();
          const handler = args.at(1);
          const options = args.at(2);

          return (
            (name === "test" ||
              name === "it" ||
              name === "describe" ||
              name.startsWith("test.") ||
              name.startsWith("it.") ||
              name.startsWith("describe.")) &&
            args.items.length === 3 &&
            handler?.kind() !== "ObjectExpression" &&
            options?.kind() === "ObjectExpression"
          );
        })
        .edit(({ args, skip }) => {
          const handler = args.at(1);
          const options = args.at(2);

          if (!handler || !options) {
            skip({
              code: "vitest-test-options.missing-argument",
              message: "The test call does not have the expected arguments.",
            });
            return;
          }

          const editor = callArgs(args);
          editor.set(1, options);
          editor.set(2, handler);
        });
    }),
  ),
};

export { moveTestOptions };
