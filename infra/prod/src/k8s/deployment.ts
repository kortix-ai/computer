import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";
import {
  namespace,
  appName,
  appPort,
  k8sSecretName,
  cpuRequest,
  memoryRequest,
  cpuLimit,
  memoryLimit,
  appMinReplicas,
} from "../config";

interface DeploymentArgs {
  k8sProvider: k8s.Provider;
  ns: k8s.core.v1.Namespace;
  externalSecret: k8s.apiextensions.CustomResource;
  imageUri: pulumi.Output<string>;
  podRoleArn: pulumi.Output<string>;
}

export function createDeployment(args: DeploymentArgs) {
  const labels = { app: appName };

  const serviceAccount = new k8s.core.v1.ServiceAccount(
    "kortix-api-sa",
    {
      metadata: {
        name: appName,
        namespace: namespace,
        annotations: {
          "eks.amazonaws.com/role-arn": args.podRoleArn,
        },
      },
    },
    { provider: args.k8sProvider, dependsOn: [args.ns] },
  );

  const deployment = new k8s.apps.v1.Deployment(
    "kortix-api",
    {
      metadata: {
        name: appName,
        namespace: namespace,
        labels,
      },
      spec: {
        replicas: appMinReplicas,
        selector: { matchLabels: labels },
        strategy: {
          type: "RollingUpdate",
          rollingUpdate: {
            maxSurge: 1,
            maxUnavailable: 0,
          },
        },
        template: {
          metadata: { labels },
          spec: {
            serviceAccountName: appName,
            terminationGracePeriodSeconds: 60,
            securityContext: {
              runAsNonRoot: true,
              runAsUser: 1000,
            },
            topologySpreadConstraints: [
              {
                maxSkew: 1,
                topologyKey: "topology.kubernetes.io/zone",
                whenUnsatisfiable: "DoNotSchedule",
                labelSelector: { matchLabels: labels },
              },
            ],
            containers: [
              {
                name: appName,
                image: args.imageUri,
                ports: [{ containerPort: appPort, name: "http" }],
                env: [
                  { name: "PORT", value: String(appPort) },
                  { name: "ENV_MODE", value: "cloud" },
                  { name: "INTERNAL_KORTIX_ENV", value: "prod" },
                  { name: "ALLOWED_SANDBOX_PROVIDERS", value: "daytona" },
                  { name: "KORTIX_ROUTER_INTERNAL_ENABLED", value: "true" },
                  { name: "KORTIX_BILLING_INTERNAL_ENABLED", value: "true" },
                  { name: "KORTIX_DEPLOYMENTS_ENABLED", value: "false" },
                  { name: "SCHEDULER_ENABLED", value: "true" },
                  { name: "CHANNELS_ENABLED", value: "true" },
                  { name: "TUNNEL_ENABLED", value: "true" },
                ],
                envFrom: [{ secretRef: { name: k8sSecretName } }],
                resources: {
                  requests: { cpu: cpuRequest, memory: memoryRequest },
                  limits: { cpu: cpuLimit, memory: memoryLimit },
                },
                startupProbe: {
                  httpGet: { path: "/v1/health", port: appPort },
                  periodSeconds: 5,
                  failureThreshold: 30,
                },
                readinessProbe: {
                  httpGet: { path: "/v1/health", port: appPort },
                  periodSeconds: 10,
                  failureThreshold: 3,
                },
                livenessProbe: {
                  httpGet: { path: "/health", port: appPort },
                  periodSeconds: 15,
                  failureThreshold: 3,
                },
                lifecycle: {
                  preStop: {
                    exec: { command: ["sh", "-c", "sleep 10"] },
                  },
                },
                securityContext: {
                  allowPrivilegeEscalation: false,
                  capabilities: { drop: ["ALL"] },
                  readOnlyRootFilesystem: false,
                },
              },
            ],
          },
        },
      },
    },
    {
      provider: args.k8sProvider,
      dependsOn: [args.ns, args.externalSecret, serviceAccount],
    },
  );

  return { deployment, serviceAccount };
}
