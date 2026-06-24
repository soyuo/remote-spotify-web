import { spawn, spawnSync, type ChildProcess } from "node:child_process";

type DevProcess = {
  name: string;
  process: ChildProcess;
};

const children: DevProcess[] = [];
let isShuttingDown = false;

function run(name: string, command: string) {
  const child = spawn(command, {
    shell: true,
    stdio: "inherit",
  });

  children.push({ name, process: child });

  child.on("exit", (code, signal) => {
    if (isShuttingDown) {
      return;
    }

    const reason = signal ? `signal ${signal}` : `code ${code ?? 0}`;
    console.log(`[dev] ${name} stopped with ${reason}`);
    shutdown(code ?? 1);
  });
}

function shutdown(exitCode = 0) {
  isShuttingDown = true;

  for (const child of children) {
    if (process.platform === "win32" && child.process.pid) {
      spawnSync("taskkill", ["/pid", String(child.process.pid), "/t", "/f"], { stdio: "ignore" });
    } else if (!child.process.killed) {
      child.process.kill();
    }
  }

  process.exit(exitCode);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

run("api", `"${process.execPath}" --experimental-strip-types api/server.ts`);
run("web", "vite --host 127.0.0.1");
