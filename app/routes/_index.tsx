import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  return redirect("/app");
};

export default function Index() {
  return null;
}