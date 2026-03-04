import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";
import { awsRegion } from "./config";

interface ExternalSecretsArgs {
  k8sProvider: k8s.Provider;
  esoRoleArn: pulumi.Output<string>;
}

export function createExternalSecrets(args: ExternalSecretsArgs) {
  const ns = new k8s.core.v1.Namespace(
    "external-secrets-ns",
    {
      metadata: { name: "external-secrets" },
    },
    { provider: args.k8sProvider },
  );

  const chart = new k8s.helm.v3.Chart(
    "external-secrets",
    {
      chart: "external-secrets",
      version: "0.10.7",
      namespace: "external-secrets",
      fetchOpts: {
        repo: "https://charts.external-secrets.io",
      },
      values: {
        serviceAccount: {
          create: true,
          name: "external-secrets",
          annotations: {
            "eks.amazonaws.com/role-arn": args.esoRoleArn,
          },
        },
        installCRDs: true,
      },
    },
    { provider: args.k8sProvider, dependsOn: [ns] },
  );

  const clusterSecretStore = new k8s.apiextensions.CustomResource(
    "cluster-secret-store",
    {
      apiVersion: "external-secrets.io/v1beta1",
      kind: "ClusterSecretStore",
      metadata: { name: "aws-secrets-manager" },
      spec: {
        provider: {
          aws: {
            service: "SecretsManager",
            region: awsRegion,
            auth: {
              jwt: {
                serviceAccountRef: {
                  name: "external-secrets",
                  namespace: "external-secrets",
                },
              },
            },
          },
        },
      },
    },
    { provider: args.k8sProvider, dependsOn: [chart] },
  );

  return { chart, clusterSecretStore };
}
