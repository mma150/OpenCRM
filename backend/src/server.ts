import { env } from "./env"; // must stay first: invalid configuration exits before anything else starts
import { createApp } from "./app";

const app = createApp();

app.listen(env.PORT, (error?: Error) => {
  // Express 5 passes listen failures (for example EADDRINUSE) to this callback.
  if (error) {
    console.error(`Failed to listen on port ${String(env.PORT)}:`, error);
    process.exit(1);
  }
  console.log(`API listening on port ${String(env.PORT)}`);
});
