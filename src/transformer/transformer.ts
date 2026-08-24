import { astGrep } from "./ast-grep.js";
import { comorph } from "./comorph.js";
import { jscodeshift } from "./jscodeshift.js";

const transformer = {
  astGrep,
  comorph,
  jscodeshift,
};

export { transformer };
