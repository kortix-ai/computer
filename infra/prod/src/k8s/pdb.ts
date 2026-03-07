import * as k8s from "@pulumi/kubernetes";
import { namespace, appName } from "../config";

interface PdbArgs {
  k8sProvider: k8s.Provider;
  ns: k8s.core.v1.Namespace;
}

export function createPdb(args: PdbArgs) {
  const pdb = new k8s.policy.v1.PodDisruptionBudget(
    "kortix-api-pdb",
    {
      metadata: {
        name: `${appName}-pdb`,
        namespace: namespace,
      },
      spec: {
        minAvailable: 2,
        selector: {
          matchLabels: { app: appName },
        },
      },
    },
    { provider: args.k8sProvider, dependsOn: [args.ns] },
  );

  return { pdb };
}
