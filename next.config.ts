import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  allowedDevOrigins: [
    "*.space-z.ai",
    "*.chatglm.cn",
    "localhost",
    "127.0.0.1",
  ],
  // Ensure standalone build includes all server-side dependencies that
  // Next.js file tracing might miss (bcryptjs, googleapis, etc.)
  outputFileTracingIncludes: {
    "/api/auth/login": ["./node_modules/bcryptjs/**/*"],
    "/api/auth/me": ["./node_modules/bcryptjs/**/*"],
    "/api/communications": ["./node_modules/googleapis/**/*", "./node_modules/bcryptjs/**/*"],
    "/api/communications/[id]": ["./node_modules/googleapis/**/*", "./node_modules/bcryptjs/**/*"],
    "/api/settings": ["./node_modules/googleapis/**/*"],
    "/api/users": ["./node_modules/bcryptjs/**/*"],
    "/api/users/[id]": ["./node_modules/bcryptjs/**/*"],
    "/api/extract": ["./node_modules/z-ai-web-dev-sdk/**/*"],
    "/api/upload": ["./node_modules/bcryptjs/**/*"],
    "/api/dashboard": ["./node_modules/bcryptjs/**/*"],
    "/api/calendar": ["./node_modules/bcryptjs/**/*"],
  },
};

export default nextConfig;
