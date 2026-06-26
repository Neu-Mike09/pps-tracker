import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: { ignoreBuildErrors: true },
  reactStrictMode: false,
  allowedDevOrigins: ["*.space-z.ai", "*.chatglm.cn", "localhost", "127.0.0.1"],
  outputFileTracingIncludes: {
    "/api/extract": ["./node_modules/@google/generative-ai/**/*"],
    "/api/settings": ["./node_modules/googleapis/**/*", "./node_modules/google-auth-library/**/*", "./node_modules/bcryptjs/**/*"],
    "/api/calendar-test": ["./node_modules/googleapis/**/*", "./node_modules/google-auth-library/**/*", "./node_modules/bcryptjs/**/*"],
    "/api/calendar-resync": ["./node_modules/googleapis/**/*", "./node_modules/google-auth-library/**/*", "./node_modules/bcryptjs/**/*"],
    "/api/communications": ["./node_modules/googleapis/**/*", "./node_modules/google-auth-library/**/*", "./node_modules/bcryptjs/**/*"],
    "/api/communications/[id]": ["./node_modules/googleapis/**/*", "./node_modules/google-auth-library/**/*", "./node_modules/bcryptjs/**/*"],
    "/api/auth/login": ["./node_modules/bcryptjs/**/*"],
    "/api/auth/me": ["./node_modules/bcryptjs/**/*"],
    "/api/users": ["./node_modules/bcryptjs/**/*"],
    "/api/users/[id]": ["./node_modules/bcryptjs/**/*"],
    "/api/upload": ["./node_modules/bcryptjs/**/*"],
    "/api/dashboard": ["./node_modules/bcryptjs/**/*"],
  },
};

export default nextConfig;
