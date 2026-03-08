import * as k8s from "@pulumi/kubernetes";
import { namespace, appName, appPort } from "../config";

interface ServiceArgs {
  k8sProvider: k8s.Provider;
  ns: k8s.core.v1.Namespace;
}

export function createService(args: ServiceArgs) {
  const service = new k8s.core.v1.Service(
    "kortix-api-svc",
    {
      metadata: {
        name: appName,
        namespace: namespace,
        labels: { app: appName },
      },
      spec: {
        type: "ClusterIP",
        selector: { app: appName },
        ports: [
          {
            port: 80,
            targetPort: appPort,
            protocol: "TCP",
            name: "http",
          },
        ],
      },
    },
    { provider: args.k8sProvider, dependsOn: [args.ns] },
  );

  return { service };
}
