import { call, capture, codemod, object } from "comorph";
import type { CodemodModule, ObjectEditor } from "comorph";

function vitestConfigCodemod(
  name: string,
  editConfig: (config: ObjectEditor) => void,
): CodemodModule {
  return codemod(name, ({ files }) => {
    files
      .jsLike()
      .find(
        call`${capture.reference("factory", { kind: "call-callee" })}(${capture.objectLike("config")})`,
      )
      .where(({ factory }) => factory.name() === "defineConfig")
      .edit(({ config }) => editConfig(object(config)));

    files
      .jsLike()
      .findNode({ kind: "ExportDefaultDeclaration" })
      .where(({ node }) => node.children().some((child) => child.kind() === "ObjectExpression"))
      .edit(({ node, skip }) => {
        const config = node.children().find((child) => child.kind() === "ObjectExpression");

        if (!config) {
          skip({
            code: "vitest-config.missing-object",
            message: "The default export does not contain an object config.",
          });
        }

        if (config) {
          editConfig(object(config));
        }
      });
  });
}

export { vitestConfigCodemod };
