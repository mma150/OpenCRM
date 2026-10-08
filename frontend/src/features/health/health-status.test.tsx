import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { makeStore } from "@/store";

import { getHealth, type Health } from "./health.api";
import { HealthStatus } from "./health-status";

vi.mock("./health.api");

const health: Health = {
  status: "ok",
  database: { connected: true, serverTime: "2026-10-08T10:00:00.000Z" },
};

function renderStatus() {
  return render(
    <Provider store={makeStore()}>
      <HealthStatus />
    </Provider>,
  );
}

describe("HealthStatus", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("shows a loading line, then the status and server time", async () => {
    let resolve: (value: Health) => void = () => undefined;
    vi.mocked(getHealth).mockReturnValue(
      new Promise<Health>((done) => {
        resolve = done;
      }),
    );

    renderStatus();
    expect(screen.getByText("Loading status...")).toBeInTheDocument();

    resolve(health);

    expect(await screen.findByText("ok")).toBeInTheDocument();
    expect(screen.getByText("2026-10-08T10:00:00.000Z")).toBeInTheDocument();
    expect(screen.queryByText("Loading status...")).not.toBeInTheDocument();
  });

  it("shows the error code and message when the request fails", async () => {
    vi.mocked(getHealth).mockRejectedValue({
      code: "NETWORK_ERROR",
      message: "Could not reach the server",
      details: null,
    });

    renderStatus();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("NETWORK_ERROR: Could not reach the server");
  });

  it("asks for the status again when Refresh is clicked", async () => {
    vi.mocked(getHealth).mockResolvedValue(health);
    const user = userEvent.setup();

    renderStatus();
    await screen.findByText("ok");
    expect(getHealth).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Refresh" }));

    await waitFor(() => {
      expect(getHealth).toHaveBeenCalledTimes(2);
    });
  });
});
