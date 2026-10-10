import { createApp } from "./app";
import { env } from "./env"; // validated on first import (app.ts imports it too): bad config exits before listen
import { startReminderLoop } from "./lib/reminders";

const app = createApp();

app.listen(env.PORT, (error?: Error) => {
  // Express 5 passes listen failures (for example EADDRINUSE) to this callback.
  if (error) {
    console.error(`Failed to listen on port ${String(env.PORT)}:`, error);
    process.exit(1);
  }
  console.log(`API listening on port ${String(env.PORT)}`);
  // Due reminders are looked for once a minute, in this process (lib/reminders.ts).
  startReminderLoop();
});
