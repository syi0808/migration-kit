export function add(left: number, right: number): number {
  return left + right;
}

export function ignoredBranch(value: string | null): string {
  /* istanbul ignore next */
  if (value === null) {
    return "missing";
  }

  return value;
}
