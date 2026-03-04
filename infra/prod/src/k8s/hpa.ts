import * as k8s from "@pulumi/kubernetes";
import {
  namespace,
  appName,
  appMinReplicas,
  appMaxReplicas,
  cpuTargetUtilization,
  memoryTargetUtilization,
} from "../config";

interface HpaArgs {
  k8sProvider: k8s.Provider;
  ns: k8s.core.v1.Namespace;
  deployment: k8s.apps.v1.Deployment;
}

export function createHpa(args: HpaArgs) {
  const hpa = new k8s.autoscaling.v2.HorizontalPodAutoscaler(
    "kortix-api-hpa",
    {
      metadata: {
        name: `${appName}-hpa`,
        namespace: namespace,
      },
      spec: {
        scaleTargetRef: {
          apiVersion: "apps/v1",
          kind: "Deployment",
          name: appName,
        },
        minReplicas: appMinReplicas,
        maxReplicas: appMaxReplicas,
        metrics: [
          {
            type: "Resource",
            resource: {
              name: "cpu",
              target: {
                type: "Utilization",
                averageUtilization: cpuTargetUtilization,
              },
            },
          },
          {
            type: "Resource",
            resource: {
              name: "memory",
              target: {
                type: "Utilization",
                averageUtilization: memoryTargetUtilization,
              },
            },
          },
        ],
        behavior: {
          scaleUp: {
            stabilizationWindowSeconds: 60,
            policies: [
              {
                type: "Pods",
                value: 2,
                periodSeconds: 60,
              },
            ],
          },
          scaleDown: {
            stabilizationWindowSeconds: 300,
            policies: [
              {
                type: "Pods",
                value: 1,
                periodSeconds: 60,
              },
            ],
          },
        },
      },
    },
    { provider: args.k8sProvider, dependsOn: [args.deployment] },
  );

  return { hpa };
}
