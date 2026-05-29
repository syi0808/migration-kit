import { astGrep } from "./ast-grep.js";
import { jscodeshift } from "./jscodeshift.js";

const transformer = {
  astGrep,
  jscodeshift,
};

export { transformer };
