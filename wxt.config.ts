import { defineConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
  manifest: {
    name: "Floatplane Queue",
    version: "1.0.0",
    description: "Add video queueing functionality to Floatplane",
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
  },
});
