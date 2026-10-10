import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DownloadedFile } from "@/lib/api/download";
import type { ApiError } from "@/lib/api/http";
import { saveFile } from "@/lib/save-file";

import { ListActions } from "./list-actions";

vi.mock("sonner");
vi.mock("@/lib/save-file");

const file = (truncated = false): DownloadedFile => ({
  blob: new Blob(["Name\r\nAda\r\n"], { type: "text/csv" }),
  filename: "leads-2026-10-10.csv",
  truncated,
});

function deferred<Value>() {
  let resolve: (value: Value) => void = () => undefined;
  const promise = new Promise<Value>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("ListActions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("exports the list and saves the file under the name the API gave it", async () => {
    const downloaded = file();
    const onExport = vi.fn(() => Promise.resolve(downloaded));
    const user = userEvent.setup();
    render(<ListActions onExport={onExport} />);

    await user.click(screen.getByRole("button", { name: "Export CSV" }));

    await waitFor(() => {
      expect(saveFile).toHaveBeenCalledWith(downloaded.blob, "leads-2026-10-10.csv");
    });
    expect(onExport).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledWith("leads-2026-10-10.csv was downloaded.");
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it("warns when the list was longer than an export holds, and still saves the file", async () => {
    const user = userEvent.setup();
    render(<ListActions onExport={() => Promise.resolve(file(true))} />);

    await user.click(screen.getByRole("button", { name: "Export CSV" }));

    await waitFor(() => {
      expect(toast.warning).toHaveBeenCalledWith(
        expect.stringMatching(/Only the first 10,000 rows were exported/),
      );
    });
    expect(saveFile).toHaveBeenCalledTimes(1);
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("shows progress and starts no second export while one is running", async () => {
    const pending = deferred<DownloadedFile>();
    const onExport = vi.fn(() => pending.promise);
    const user = userEvent.setup();
    render(<ListActions onExport={onExport} />);

    await user.click(screen.getByRole("button", { name: "Export CSV" }));

    const busy = await screen.findByRole("button", { name: /Exporting.../ });
    expect(busy).toBeDisabled();
    await user.click(busy);
    expect(onExport).toHaveBeenCalledTimes(1);

    pending.resolve(file());
    expect(await screen.findByRole("button", { name: "Export CSV" })).toBeEnabled();
  });

  it("says why an export failed, and saves nothing", async () => {
    const refused: ApiError = { code: "NETWORK_ERROR", message: "x", details: null };
    const user = userEvent.setup();
    render(<ListActions onExport={vi.fn().mockRejectedValue(refused)} />);

    await user.click(screen.getByRole("button", { name: "Export CSV" }));

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "The export failed. The server cannot be reached. Check your connection and try again.",
      );
    });
    expect(saveFile).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Export CSV" })).toBeEnabled();
  });

  it("links to the import only when it is given one", () => {
    const { rerender } = render(<ListActions onExport={() => Promise.resolve(file())} />);
    expect(screen.queryByRole("link", { name: "Import" })).not.toBeInTheDocument();

    rerender(
      <ListActions importHref="/import?type=leads" onExport={() => Promise.resolve(file())} />,
    );
    expect(screen.getByRole("link", { name: "Import" })).toHaveAttribute(
      "href",
      "/import?type=leads",
    );
  });

  it("offers the same actions in one menu, for phones", async () => {
    const onExport = vi.fn(() => Promise.resolve(file()));
    const user = userEvent.setup();
    render(<ListActions importHref="/import?type=leads" onExport={onExport} />);

    await user.click(screen.getByRole("button", { name: "More actions" }));
    const menu = await screen.findByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: "Import" })).toHaveAttribute(
      "href",
      "/import?type=leads",
    );
    await user.click(within(menu).getByRole("menuitem", { name: "Export CSV" }));

    await waitFor(() => {
      expect(saveFile).toHaveBeenCalledTimes(1);
    });
    expect(onExport).toHaveBeenCalledTimes(1);
  });
});
