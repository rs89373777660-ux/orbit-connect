import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "ru.orbitmarketing.connect",
  appName: "Orbit Connect",
  webDir: "public",
  server: {
    url: "https://tvoy-krug-messenger.rs89373777660.chatgpt.site",
    cleartext: false,
    allowNavigation: ["tvoy-krug-messenger.rs89373777660.chatgpt.site"],
  },
  android: {
    allowMixedContent: false,
    backgroundColor: "#10120e",
  },
};

export default config;
