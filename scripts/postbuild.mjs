// Make the CLI entry executable and ensure it carries a shebang.
import { chmodSync, readFileSync, writeFileSync } from "node:fs";
const cli = new URL("../dist/cli.js", import.meta.url);
let src = readFileSync(cli, "utf8");
if (!src.startsWith("#!")) src = `#!/usr/bin/env node\n${src}`;
writeFileSync(cli, src);
chmodSync(cli, 0o755);
