import pc from "picocolors";

const unicode = process.platform !== "win32" || Boolean(process.env.WT_SESSION) || process.env.TERM_PROGRAM === "vscode";

export const sym = {
  ok: unicode ? "✓" : "√",
  err: unicode ? "✗" : "×",
  warn: unicode ? "⚠" : "!",
  info: unicode ? "ℹ" : "i",
  dot: unicode ? "·" : "-",
  arrow: unicode ? "→" : "->",
  bar: unicode ? "█" : "#",
  barLight: unicode ? "░" : ".",
};

export const c = pc;

export function bar(value: number, max: number, width = 16): string {
  const n = max > 0 ? Math.round((value / max) * width) : 0;
  return pc.green(sym.bar.repeat(n)) + pc.dim(sym.barLight.repeat(Math.max(0, width - n)));
}

export function header(title: string): string {
  return `\n${pc.bold(title)}\n`;
}

export function kv(label: string, value: string): string {
  return `  ${pc.dim(label.padEnd(12))} ${value}`;
}

let quiet = false;
export function setQuiet(q: boolean): void {
  quiet = q;
}

export function log(...args: unknown[]): void {
  if (!quiet) console.error(...args);
}

export function out(text: string): void {
  process.stdout.write(text.endsWith("\n") ? text : `${text}\n`);
}

export function spinner(label: string): { update: (text: string) => void; stop: (final?: string) => void } {
  const frames = unicode ? ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] : ["-", "\\", "|", "/"];
  const tty = process.stderr.isTTY && !quiet;
  let text = label;
  let i = 0;
  const timer = tty
    ? setInterval(() => {
        process.stderr.write(`\r${pc.cyan(frames[i++ % frames.length]!)} ${text}\x1b[K`);
      }, 80)
    : undefined;
  return {
    update(t: string) {
      text = t;
    },
    stop(final?: string) {
      if (timer) clearInterval(timer);
      if (tty) process.stderr.write("\r\x1b[K");
      if (final) log(final);
    },
  };
}
