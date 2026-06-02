type KeyInputStream = {
  isTTY?: boolean;
  isRaw?: boolean;
  setRawMode?: (mode: boolean) => unknown;
  resume: () => unknown;
  on: (event: "data", listener: (chunk: Buffer | string) => void) => unknown;
  off: (event: "data", listener: (chunk: Buffer | string) => void) => unknown;
};

type WaitForCwdChangeOptions = {
  cwd?: string;
  input?: KeyInputStream;
  onKeyPress?: (key: string) => void;
};

type Cleanup = () => void;

export type { Cleanup, KeyInputStream, WaitForCwdChangeOptions };
