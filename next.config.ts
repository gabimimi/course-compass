import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Make sure the generated JSON data files are included in the server build
  // tracing output, so server routes that read from data/build/* keep working
  // in production deployments.
  outputFileTracingIncludes: {
    "/api/**/*": ["./data/build/**/*.json"],
  },
  // The transformers.js library uses ONNX Runtime which ships native bindings
  // we don't want bundled into edge code. Keep them external.
  serverExternalPackages: ["@huggingface/transformers", "onnxruntime-node"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "frame-src 'self' https://hydrant.mit.edu https://www.hydrant.mit.edu;",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
