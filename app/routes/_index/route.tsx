import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Preserve shop/host/id_token (etc.) — dropping them blanks the embedded iframe.
  const url = new URL(request.url);
  const qs = url.searchParams.toString();
  return redirect(qs ? `/app?${qs}` : "/app");
};
