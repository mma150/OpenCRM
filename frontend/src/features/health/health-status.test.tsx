import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiError } from "@/lib/api/http";
import { makeStore } from "@/store";

import { getHealth } from "./health.api";
import type { Health } from "./health.types";
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

  it("explains that the database is down for SERVICE_UNAVAILABLE", async () => {
    const apiError: ApiError = {
      code: "SERVICE_UNAVAILABLE",
      message: "Database is unavailable",
      details: null,
    };
    vi.mocked(getHealth).mockRejectedValue(apiError);

    renderStatus();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("The API is running but the database is unavailable");
    // The message is chosen by the code, so the server text is not shown (D-12).
    expect(alert).not.toHaveTextContent("Database is unavailable");
  });

  it("explains that the API cannot be reached for NETWORK_ERROR", async () => {
    const apiError: ApiError = {
      code: "NETWORK_ERROR",
      message: "Could not reach the server",
      details: null,
    };
    vi.mocked(getHealth).mockRejectedValue(apiError);

    renderStatus();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("The API cannot be reached");
    expect(alert).not.toHaveTextContent("Could not reach the server");
  });

  it("shows the code and the server message for any other code", async () => {
    const apiError: ApiError = {
      code: "INTERNAL_ERROR",
      message: "Internal server error",
      details: null,
    };
    vi.mocked(getHealth).mockRejectedValue(apiError);

    renderStatus();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("INTERNAL_ERROR: Internal server error");
  });

  it("shows the request id when the error carries one", async () => {
    const apiError: ApiError = {
      code: "SERVICE_UNAVAILABLE",
      message: "Database is unavailable",
      details: null,
      requestId: "req-1234-abcd",
    };
    vi.mocked(getHealth).mockRejectedValue(apiError);

    renderStatus();

    await screen.findByRole("alert");
    expect(screen.getByText("Request id: req-1234-abcd")).toBeInTheDocument();
  });

  it("shows no request id line when the error has none", async () => {
    const apiError: ApiError = {
      code: "NETWORK_ERROR",
      message: "Could not reach the server",
      details: null,
    };
    vi.mocked(getHealth).mockRejectedValue(apiError);

    renderStatus();

    await screen.findByRole("alert");
    expect(screen.queryByText(/Request id/)).not.toBeInTheDocument();
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
