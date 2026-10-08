import { useDispatch, useSelector } from "react-redux";

import type { AppDispatch, RootState } from "./index";

// Components use these typed hooks only, never useDispatch or useSelector directly.
export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
