import * as aws from "@pulumi/aws";
import { commonTags } from "./config";

export function createEcrRepository() {
  const repo = new aws.ecr.Repository("kortix-api", {
    name: "kortix/kortix-api",
    imageTagMutability: "MUTABLE",
    imageScanningConfiguration: { scanOnPush: true },
    tags: commonTags,
  });

  new aws.ecr.LifecyclePolicy("kortix-api-lifecycle", {
    repository: repo.name,
    policy: JSON.stringify({
      rules: [
        {
          rulePriority: 1,
          description: "Expire untagged images after 7 days",
          selection: {
            tagStatus: "untagged",
            countType: "sinceImagePushed",
            countUnit: "days",
            countNumber: 7,
          },
          action: { type: "expire" },
        },
        {
          rulePriority: 2,
          description: "Keep only last 10 tagged images",
          selection: {
            tagStatus: "tagged",
            tagPrefixList: ["sha-"],
            countType: "imageCountMoreThan",
            countNumber: 10,
          },
          action: { type: "expire" },
        },
      ],
    }),
  });

  return { repo };
}
