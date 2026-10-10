"use client";

import { useEffect } from "react";

import { useAppDispatch, useAppSelector } from "@/store/hooks";

import { fetchPipelineStages, selectPipelineStages } from "./pipeline-stages.slice";

// Loads the pipeline for a component that needs the stages (a stage select, the stepper of
// an opportunity, the convert dialog) and returns the slice: { data, status, error }.
export function usePipelineStages() {
  const dispatch = useAppDispatch();
  const stages = useAppSelector(selectPipelineStages);

  useEffect(() => {
    void dispatch(fetchPipelineStages());
  }, [dispatch]);

  return stages;
}
