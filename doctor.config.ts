import type { ReactDoctorConfig } from "react-doctor/api";

export default {
  ignore: {
    overrides: [
      {
        files: [
          "convex/**",
          "convex/_generated/**"
        ],
        rules: [
          "deslop/unused-file",
          "deslop/unused-export"
        ]
      },
      {
        files: [
          "scripts/**"
        ],
        rules: [
          "deslop/unused-export"
        ]
      }
    ]
  }
} satisfies ReactDoctorConfig;
