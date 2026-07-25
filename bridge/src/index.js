import { createBridgeServer } from "./server.js";
import { createFileStore } from "./state.js";

const requestedPort = readPort(process.argv.slice(2));
const bridge = createBridgeServer({ port: requestedPort, store: createFileStore() });

bridge.start().then(({ port, pairCode, alreadyPaired }) => {
  console.log("MarketFit Local AI Bridge is ready.");
  console.log(`Port: ${port}`);
  if (alreadyPaired) {
    console.log("Already paired with MarketFit — nothing to do. The panel should show it as connected.");
    console.log(`If you need to pair again, the code is: ${pairCode}`);
  } else {
    console.log(`Pairing code: ${pairCode}`);
    console.log("In MarketFit, choose Codex CLI or Claude Code as the provider, then paste this port and code.");
  }
}).catch((error) => {
  console.error(`Bridge failed to start: ${error.message}`);
  process.exitCode = 1;
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => bridge.stop().finally(() => process.exit(0)));
}

function readPort(args) {
  const index = args.indexOf("--port");
  if (index < 0) return 0;
  const port = Number(args[index + 1]);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("--port must be between 1024 and 65535.");
  return port;
}
