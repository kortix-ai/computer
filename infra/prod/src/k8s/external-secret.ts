import * as k8s from "@pulumi/kubernetes";
import * as pulumi from "@pulumi/pulumi";
import { namespace, secretName, k8sSecretName } from "../config";

interface ExternalSecretArgs {
  k8sProvider: k8s.Provider;
  clusterSecretStore: k8s.apiextensions.CustomResource;
  ns: k8s.core.v1.Namespace;
}

export function createExternalSecret(args: ExternalSecretArgs) {
  const externalSecret = new k8s.apiextensions.CustomResource(
    "kortix-api-external-secret",
    {
      apiVersion: "external-secrets.io/v1beta1",
      kind: "ExternalSecret",
      metadata: {
        name: "kortix-api-secrets",
        namespace: namespace,
      },
      spec: {
        refreshInterval: "5m",
        secretStoreRef: {
          name: "aws-secrets-manager",
          kind: "ClusterSecretStore",
        },
        target: {
          name: k8sSecretName,
          creationPolicy: "Owner",
        },
        dataFrom: [
          {
            extract: {
              key: secretName,
            },
          },
        ],
      },
    },
    {
      provider: args.k8sProvider,
      dependsOn: [args.clusterSecretStore, args.ns],
    },
  );

  return { externalSecret };
}
