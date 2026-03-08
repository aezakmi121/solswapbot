const { spawnSync } = require("child_process");

const out = spawnSync("npx", ["vitest", "run"], { 
    encoding: "utf-8", 
    stdio: "pipe",
    shell: true,
    env: { ...process.env, CI: "true" } // Forces non-TTY outputs
});

const fs = require("fs");
fs.writeFileSync("vitest-debug.txt", "STDOUT:\n" + out.stdout + "\nSTDERR:\n" + out.stderr);
console.log("Trace written to vitest-debug.txt");
