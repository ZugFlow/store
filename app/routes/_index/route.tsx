import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { isMockMode } from "../../lib/config";

export const loader = async (_args: LoaderFunctionArgs) => {
  // In mock/demo mode jump straight into the admin dashboard.
  if (isMockMode()) {
    return redirect("/app");
  }
  return redirect("/app");
};
