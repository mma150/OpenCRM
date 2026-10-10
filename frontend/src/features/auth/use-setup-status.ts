import { useEffect, useState } from "react";

import { getSetupStatus } from "./auth.api";

// Whether the first-run "create the Admin account" step is still open (D-07).
// null while the answer is loading. If the API cannot be reached the answer is false,
// so the user lands on the login form, which reports the real problem when it is used.
export function useSetupRequired(): boolean | null {
  const [setupRequired, setSetupRequired] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    getSetupStatus()
      .then((result) => {
        if (active) {
          setSetupRequired(result.setupRequired);
        }
      })
      .catch(() => {
        if (active) {
          setSetupRequired(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  return setupRequired;
}
