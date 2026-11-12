import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  // Managed Better Auth; signups remain disabled until security testing passes.
  auth: true,

  // Do not deploy the generated Hello World example to a public endpoint.
  functions: {
    members: {
      name: "Private member profiles",
      source: "./api/member-profile.ts",
    },
  },

  // This bucket already exists in Neon, and is private.
  buckets: {
    uploads: { access: "private" },
  },

  // Preserve Neon CLI's generated branch lifecycle policy.
  branch: (branch) => {
    if (branch.isDefault) return {};
    if (!branch.exists) return { ttl: "7d" };
    return {};
  },
});
