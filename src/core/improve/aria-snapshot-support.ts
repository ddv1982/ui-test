type AriaSnapshotMode = "ai" | "default";

interface AriaSnapshotReader {
  ariaSnapshot(options?: {
    timeout?: number;
    depth?: number;
    mode?: AriaSnapshotMode;
  }): Promise<string>;
}

export interface AriaSnapshotCaptureOptions {
  timeout: number;
  depth?: number;
  mode?: AriaSnapshotMode;
}

export async function captureAriaSnapshot(
  reader: AriaSnapshotReader,
  options: AriaSnapshotCaptureOptions
): Promise<string> {
  if (options.depth === undefined && options.mode === undefined) {
    return reader.ariaSnapshot({ timeout: options.timeout });
  }

  try {
    return await reader.ariaSnapshot(options);
  } catch {
    return reader.ariaSnapshot({ timeout: options.timeout });
  }
}
