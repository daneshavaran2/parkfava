import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listCompanies from "./tools/list-companies";
import getCompany from "./tools/get-company";
import listParks from "./tools/list-parks";

// The OAuth issuer MUST be the direct Supabase host, not the .lovable.cloud proxy.
// Read the project ref from Vite's inlined env; the fallback keeps the issuer
// well-formed during the throwaway manifest-extract eval when the literal is unset.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "fava-network-mcp",
  title: "Fava Network MCP",
  version: "0.1.0",
  instructions:
    "Tools for the Fava network app. Use list_companies and get_company to explore exhibition companies (name, contact, location, park, category). Use list_parks to enumerate parks. All reads act as the signed-in user and respect the app's access rules.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listCompanies, getCompany, listParks],
});
