import { defineConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
  manifest: () => {
    const baseManifest = {
      name: "Floatplane Queue",
      version: "1.0.0",
      description: "Advanced video player and queue management for Floatplane",
      permissions: ["storage"],
      host_permissions: ["*://*.floatplane.com/*"],
      action: {
        default_title: "Floatplane Queue",
      },
      icons: {
        16: "/icons/icon16.png",
        48: "/icons/icon48.png",
        128: "/icons/icon128.png",
      },
      browser_specific_settings: {
        gecko: {
          id: "floatplane-queue@example.com",
          data_collection_permissions: {
            required: ["none"],
          },
        },
      },
      content_security_policy: {
        extension_pages: "script-src 'self'; object-src 'self'",
      },
    };

    return baseManifest;
  },
});
