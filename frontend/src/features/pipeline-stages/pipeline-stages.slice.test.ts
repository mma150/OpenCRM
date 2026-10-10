import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ApiError } from "@/lib/api/http";
import { makeStore } from "@/store";

import * as stagesApi from "./pipeline-stages.api";
import { newStage, pipeline, qualifiedStage } from "./pipeline-stages.fixtures";
import {
  createPipelineStage,
  deletePipelineStage,
  fetchPipelineStages,
  renamePipelineStage,
  reorderPipelineStages,
} from "./pipeline-stages.slice";
import type { PipelineStage } from "./pipeline-stages.types";

vi.mock("./pipeline-stages.api");

const forbidden: ApiError = { code: "FORBIDDEN", message: "Server text", details: null };

// A promise the test resolves by hand, so a request can stay "in flight".
function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function loadedStore() {
  vi.mocked(stagesApi.listPipelineStages).mockResolvedValue(pipeline);
  const store = makeStore();
  await store.dispatch(fetchPipelineStages());
  return store;
}

describe("pipeline stages slice", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("starts idle with no data and no error", () => {
    expect(makeStore().getState().pipelineStages).toEqual({
      data: null,
      status: "idle",
      error: null,
    });
  });

  it("goes loading, then succeeded with the pipeline in order", async () => {
    const request = deferred<PipelineStage[]>();
    vi.mocked(stagesApi.listPipelineStages).mockReturnValue(request.promise);
    const store = makeStore();

    const pending = store.dispatch(fetchPipelineStages());
    expect(store.getState().pipelineStages.status).toBe("loading");

    request.resolve(pipeline);
    await pending;
    expect(store.getState().pipelineStages).toEqual({
      data: pipeline,
      status: "succeeded",
      error: null,
    });
  });

  it("goes failed and keeps the ApiError code and message", async () => {
    vi.mocked(stagesApi.listPipelineStages).mockRejectedValue(forbidden);
    const store = makeStore();

    await store.dispatch(fetchPipelineStages());

    expect(store.getState().pipelineStages).toEqual({
      data: null,
      status: "failed",
      error: forbidden,
    });
  });

  it("starts no second request while one is loading", async () => {
    const request = deferred<PipelineStage[]>();
    vi.mocked(stagesApi.listPipelineStages).mockReturnValue(request.promise);
    const store = makeStore();

    const first = store.dispatch(fetchPipelineStages());
    const second = store.dispatch(fetchPipelineStages());
    request.resolve(pipeline);
    await Promise.all([first, second]);

    expect(stagesApi.listPipelineStages).toHaveBeenCalledTimes(1);
  });

  it("replaces the pipeline with the answer to every change", async () => {
    const store = await loadedStore();
    const renamed = pipeline.map((stage) =>
      stage.id === newStage.id ? { ...stage, name: "Fresh" } : stage,
    );
    const reordered = [qualifiedStage, newStage, ...pipeline.slice(2)];
    const without = pipeline.filter((stage) => stage.id !== newStage.id);
    vi.mocked(stagesApi.createPipelineStage).mockResolvedValue(pipeline);
    vi.mocked(stagesApi.renamePipelineStage).mockResolvedValue(renamed);
    vi.mocked(stagesApi.reorderPipelineStages).mockResolvedValue(reordered);
    vi.mocked(stagesApi.deletePipelineStage).mockResolvedValue(without);

    await store.dispatch(createPipelineStage("Demo"));
    expect(stagesApi.createPipelineStage).toHaveBeenCalledWith("Demo");

    await store.dispatch(renamePipelineStage({ id: newStage.id, name: "Fresh" }));
    expect(stagesApi.renamePipelineStage).toHaveBeenCalledWith(newStage.id, "Fresh");
    expect(store.getState().pipelineStages.data).toEqual(renamed);

    await store.dispatch(reorderPipelineStages([qualifiedStage.id, newStage.id]));
    expect(stagesApi.reorderPipelineStages).toHaveBeenCalledWith([qualifiedStage.id, newStage.id]);
    expect(store.getState().pipelineStages.data).toEqual(reordered);

    await store.dispatch(
      deletePipelineStage({ id: newStage.id, moveToStageId: qualifiedStage.id }),
    );
    expect(stagesApi.deletePipelineStage).toHaveBeenCalledWith(newStage.id, qualifiedStage.id);
    expect(store.getState().pipelineStages.data).toEqual(without);
  });

  it("leaves the loaded pipeline alone when a change is refused, and hands over the error", async () => {
    const store = await loadedStore();
    vi.mocked(stagesApi.renamePipelineStage).mockRejectedValue(forbidden);

    const result = await store.dispatch(renamePipelineStage({ id: newStage.id, name: "Fresh" }));

    expect(result.payload).toEqual(forbidden);
    expect(store.getState().pipelineStages).toEqual({
      data: pipeline,
      status: "succeeded",
      error: null,
    });
  });
});
