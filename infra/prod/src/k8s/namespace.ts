import * as k8s from "@pulumi/kubernetes";
import { namespace, commonTags } from "../config";

interface NamespaceArgs {
  k8sProvider: k8s.Provider;
}

export function createNamespace(args: NamespaceArgs) {
  const ns = new k8s.core.v1.Namespace(
    "kortix-ns",
    {
      metadata: {
        name: namespace,
        labels: {
          ...commonTags,
          name: namespace,
        },
      },
    },
    { provider: args.k8sProvider },
  );

  return { ns };
}
