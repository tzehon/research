export const minimumCodexVersion = '0.155.1';

export function requireCodexVersion(output: string) {
  const match = /^codex-cli (\d+)\.(\d+)\.(\d+)(-[\w.-]+)?(?:\+[\w.-]+)?(?:\s|$)/.exec(
    output.trim()
  );
  const minimum = minimumCodexVersion.split('.').map(Number);
  const installed = match?.slice(1, 4).map(Number);
  const difference =
    installed?.map((part, index) => part - minimum[index]).find((part) => part !== 0) ?? 0;
  if (!match || difference < 0 || (difference === 0 && match[4]))
    throw new Error(`Codex CLI ${minimumCodexVersion} or newer is required, found ${output}.`);
}
